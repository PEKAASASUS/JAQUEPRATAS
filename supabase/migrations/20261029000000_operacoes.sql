-- Evolução incremental após a migração B já aplicada em alguns ambientes de teste.
begin;
alter table public.conditionals add column customer_name text not null default '';
alter table public.sales add column customer_name text not null default '';
alter table public.sale_items add column product_description text not null default '';
alter table public.sale_items add column category_id uuid references public.categories(id) on delete restrict;
alter table public.sale_items add column category_name text not null default '';
-- Fotografias históricas só podem ser preenchidas para novas operações; não inventar passado.
alter table public.conditional_events drop constraint conditional_events_kind_check;
alter table public.conditional_events add constraint conditional_events_kind_check check (kind in ('return','sale','loss','reversal'));
alter table public.stock_movements drop constraint stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check (movement_type in
 ('cadastro_inicial','ajuste_manual','saida_condicional','devolucao_condicional','venda_direta','perda','reversao_venda','reversao_condicional','entrada'));

-- Reutiliza o trigger original: uma linha por mudança, agora com referência rastreável.
create or replace function public.log_stock_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d integer; t text;
begin
 d := case when tg_op='INSERT' then new.stock_quantity else new.stock_quantity-old.stock_quantity end;
 if d=0 then return new; end if;
 t := case when tg_op='INSERT' then 'cadastro_inicial' else 'ajuste_manual' end;
 insert into public.stock_movements(product_id,movement_type,quantity_delta,quantity_after,origin,reference_id,created_by)
 values(new.id,coalesce(nullif(current_setting('app.movement_type',true),''),t),d,new.stock_quantity,
 coalesce(nullif(current_setting('app.movement_origin',true),''),'painel_produtos'),
 nullif(current_setting('app.reference_id',true),'')::uuid,auth.uid());
 return new;
end $$;
revoke all on function public.log_stock_movement() from public,anon,authenticated;

create function public.guard_stock_edit() returns trigger language plpgsql set search_path='' as $$
begin
 if new.stock_quantity<>old.stock_quantity and current_user in ('anon','authenticated') then
  raise exception 'Use Estoque para ajustar com motivo e histórico' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.guard_stock_edit() from public,anon,authenticated;
create trigger products_guard_stock before update on public.products for each row execute function public.guard_stock_edit();

create function public.conditional_pending(p_id uuid) returns integer language sql stable set search_path='' as $$
 select i.quantity_out-coalesce((select sum(case when e.kind='reversal' then -e.quantity else e.quantity end)
 from public.conditional_events e where e.conditional_item_id=i.id),0)::integer
 from public.conditional_items i where i.id=p_id;
$$;
revoke all on function public.conditional_pending(uuid) from public,anon,authenticated;

create function public.sale_balance(p_id uuid) returns numeric language sql stable set search_path='' as $$
 select coalesce((select sum(l.subtotal-coalesce((select sum(r.quantity)*l.unit_price
 from public.sale_item_reversals r where r.sale_item_id=l.id),0)) from public.sale_items l where l.sale_id=p_id),0)
 -coalesce((select sum(p.amount-coalesce((select sum(r.amount) from public.payment_reversals r where r.payment_id=p.id),0))
 from public.payments p where p.sale_id=p_id),0);
$$;
revoke all on function public.sale_balance(uuid) from public,anon,authenticated;

-- Um único comando é uma transação. Lock global intencional para loja com uma proprietária:
-- serializa comandos concorrentes sem expor saldos intermediários; locks de produto protegem CRUD existente.
create function public.admin_execute(p_request uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare
 actor uuid:=auth.uid(); previous public.operation_requests%rowtype;
 customer public.customers%rowtype; product public.products%rowtype; conditional public.conditionals%rowtype;
 item public.conditional_items%rowtype; sale public.sales%rowtype; line public.sale_items%rowtype;
 payment public.payments%rowtype; event public.conditional_events%rowtype;
 rec jsonb; result jsonb; entity uuid; cid uuid; qty integer; amount numeric; pending integer;
 method text; terms text; reason text; total numeric; paid numeric; remaining integer;
begin
 if actor is null or not public.is_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 if p_request is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Comando inválido'; end if;
 perform pg_advisory_xact_lock(741920261029::bigint);
 if not public.is_admin() then raise exception 'Autorização revogada' using errcode='42501';end if;
 select * into previous from public.operation_requests where id=p_request;
 if found then
  if previous.created_by<>actor or previous.operation<>p_action or previous.request_payload<>p_data then
   raise exception 'Chave reutilizada com outros dados' using errcode='22023';
  end if;
  return previous.result;
 end if;
 reason:=btrim(coalesce(p_data->>'reason',''));
 entity:=gen_random_uuid();
 perform set_config('app.reference_id',p_request::text,true);
 perform set_config('app.movement_origin',coalesce(nullif(reason,''),p_action),true);

 if p_action='customer_save' then
  if nullif(p_data->>'id','') is null then
   insert into public.customers(id,name,phone,notes,created_by) values(entity,btrim(p_data->>'name'),
    coalesce(p_data->>'phone',''),coalesce(p_data->>'notes',''),actor);
  else
   entity:=(p_data->>'id')::uuid;
   update public.customers set name=btrim(p_data->>'name'),phone=coalesce(p_data->>'phone',''),notes=coalesce(p_data->>'notes',''),
    archived_at=case when coalesce((p_data->>'archived')::boolean,false) then now() else null end where id=entity;
   if not found then raise exception 'Cliente não encontrado'; end if;
  end if;
 elsif p_action='stock_adjust' then
  if length(reason)<3 then raise exception 'Informe o motivo do ajuste'; end if;
  qty:=(p_data->>'delta')::integer;
  if qty is null or qty=0 or abs(qty::bigint)>1000000 then raise exception 'Quantidade inválida'; end if;
  select * into strict product from public.products where id=(p_data->>'product_id')::uuid for update;
  if product.stock_quantity::bigint+qty<0 then raise exception 'Estoque insuficiente'; end if;
  method:=coalesce(p_data->>'kind','adjust');
  if method not in ('adjust','entry','loss') or (method='entry' and qty<0) or (method='loss' and qty>0) then raise exception 'Tipo de ajuste inválido'; end if;
  perform set_config('app.movement_type',case method when 'entry' then 'entrada' when 'loss' then 'perda' else 'ajuste_manual' end,true);
  update public.products set stock_quantity=stock_quantity+qty where id=product.id;
  entity:=product.id;
 elsif p_action in ('conditional_deliver','sale_create') then
  select * into strict customer from public.customers where id=(p_data->>'customer_id')::uuid and archived_at is null for update;
  if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'Selecione de 1 a 100 produtos'; end if;
  if (select count(*)<>count(distinct value->>'product_id') from jsonb_array_elements(p_data->'items')) then raise exception 'Produto repetido'; end if;
  cid:=nullif(p_data->>'conditional_id','')::uuid;
  if cid is not null then
   if p_action='conditional_deliver' then raise exception 'Entrega não pode ter origem em outra condicional'; end if;
   select * into strict conditional from public.conditionals where id=cid and customer_id=customer.id for update;
  end if;
  if p_action='conditional_deliver' then
   insert into public.conditionals(id,customer_id,customer_name,due_at,notes,created_by)
    values(entity,customer.id,customer.name,nullif(p_data->>'due_at','')::timestamptz,coalesce(p_data->>'notes',''),actor);
   perform set_config('app.movement_type','saida_condicional',true);
  else
   method:=p_data->>'pricing_method';terms:=p_data->>'collection_terms';
   insert into public.sales(id,customer_id,customer_name,conditional_id,pricing_method,collection_terms,due_at,notes,created_by)
    values(entity,customer.id,customer.name,cid,method,terms,nullif(p_data->>'due_at','')::timestamptz,coalesce(p_data->>'notes',''),actor);
   perform set_config('app.movement_type','venda_direta',true);
  end if;
  for rec in select value from jsonb_array_elements(p_data->'items') order by value->>'product_id' loop
   qty:=(rec->>'quantity')::integer;
   if qty is null or qty not between 1 and 1000000 then raise exception 'Quantidade inválida'; end if;
   select * into strict product from public.products where id=(rec->>'product_id')::uuid for update;
   if cid is null then
    if not product.is_active or product.archived_at is not null or product.stock_quantity<qty then raise exception 'Produto indisponível ou estoque insuficiente: %',product.name; end if;
    update public.products set stock_quantity=stock_quantity-qty where id=product.id;
   else
    select * into strict item from public.conditional_items where conditional_id=cid and product_id=product.id for update;
    if public.conditional_pending(item.id)<qty then raise exception 'Quantidade superior à pendência da condicional'; end if;
   end if;
   if p_action='conditional_deliver' then
    insert into public.conditional_items(conditional_id,product_id,product_name,quantity_out) values(entity,product.id,product.name,qty);
   else
    insert into public.sale_items(sale_id,product_id,conditional_id,conditional_item_id,product_name,product_description,category_id,category_name,quantity,pricing_method,list_price,promo_price)
    values(entity,product.id,cid,case when cid is null then null else item.id end,product.name,product.description,product.category_id,(select name from public.categories where id=product.category_id),qty,method,product.price,product.promo_price) returning * into line;
    if cid is not null then
     insert into public.conditional_events(conditional_item_id,kind,quantity,sale_item_id,reason,created_by) values(item.id,'sale',qty,line.id,'Compra confirmada',actor);
    end if;
   end if;
  end loop;
  if p_action='sale_create' then
   select sum(subtotal) into total from public.sale_items where sale_id=entity;
   if total>90071992547409.91 then raise exception 'Total excede limite monetário'; end if;
   amount:=coalesce((p_data->>'received')::numeric,0);
   if amount<0 or amount>total or amount<>round(amount,2) then raise exception 'Recebimento inválido'; end if;
   -- Sem crédito implícito: cartão/Pix/dinheiro à vista só confirmam com quitação.
   if terms='immediate' and amount<>total then raise exception 'Venda à vista exige recebimento integral; para parcial escolha crédito da loja'; end if;
   if amount>0 then
    if (method='pix') is distinct from ((p_data->>'payment_method')='pix') then raise exception 'Método de recebimento incompatível com desconto Pix';end if;
    insert into public.payments(sale_id,method,amount,created_by) values(entity,p_data->>'payment_method',amount,actor);
   end if;
  end if;
 elsif p_action='conditional_resolve' then
  if length(reason)<3 then raise exception 'Informe o motivo'; end if;
  select * into strict item from public.conditional_items where id=(p_data->>'item_id')::uuid for update;
  select * into strict conditional from public.conditionals where id=item.conditional_id for update;
  qty:=(p_data->>'quantity')::integer; method:=p_data->>'kind';
  pending:=public.conditional_pending(item.id);
  if qty is null or qty<=0 or qty>pending or method not in ('return','loss') or method is null then raise exception 'Destino ou quantidade inválida'; end if;
  insert into public.conditional_events(id,conditional_item_id,kind,quantity,reason,created_by) values(entity,item.id,method,qty,reason,actor);
  if method='return' then
   perform set_config('app.movement_type','devolucao_condicional',true);
   update public.products set stock_quantity=stock_quantity+qty where id=item.product_id;
  end if;
 elsif p_action='conditional_reverse' then
  if length(reason)<3 then raise exception 'Informe o motivo'; end if;
  select * into strict event from public.conditional_events where id=(p_data->>'event_id')::uuid;
  if event.kind not in ('return','loss') or exists(select 1 from public.conditional_events where reverses_event_id=event.id) then raise exception 'Evento não reversível'; end if;
  select * into strict item from public.conditional_items where id=event.conditional_item_id for update;
  if event.kind='return' then
   select * into strict product from public.products where id=item.product_id for update;
   if product.stock_quantity<event.quantity then raise exception 'Estoque insuficiente para desfazer retorno'; end if;
   perform set_config('app.movement_type','reversao_condicional',true);
   update public.products set stock_quantity=stock_quantity-event.quantity where id=item.product_id;
  end if;
  insert into public.conditional_events(id,conditional_item_id,kind,quantity,reverses_event_id,reason,created_by)
   values(entity,item.id,'reversal',event.quantity,event.id,reason,actor);
 elsif p_action='sale_cancel' then
  select * into strict sale from public.sales where id=(p_data->>'sale_id')::uuid for update;
  if length(reason)<3 or coalesce((p_data->>'restock')::boolean,false) is not true then raise exception 'Informe motivo e confirme retorno físico';end if;
  qty:=0;
  for line in select * from public.sale_items where sale_id=sale.id order by product_id for update loop
   select line.quantity-coalesce(sum(r.quantity),0) into remaining from public.sale_item_reversals r where sale_item_id=line.id;
   if remaining>0 then
    perform public.admin_execute(md5(p_request::text||line.id::text)::uuid,'sale_reverse',jsonb_build_object('item_id',line.id,'quantity',remaining,'reason',reason,'restock',true,'refund_confirmed',coalesce((p_data->>'refund_confirmed')::boolean,false)));qty:=qty+remaining;
   end if;
  end loop;
  if qty=0 then raise exception 'Venda já integralmente revertida';end if;
  entity:=sale.id;
 elsif p_action='sale_reverse' then
  if length(reason)<3 then raise exception 'Informe o motivo'; end if;
  select * into strict line from public.sale_items where id=(p_data->>'item_id')::uuid for update;
  select * into strict sale from public.sales where id=line.sale_id for update;
  select line.quantity-coalesce(sum(quantity),0) into remaining from public.sale_item_reversals where sale_item_id=line.id;
  qty:=(p_data->>'quantity')::integer;
  if qty is null or qty<=0 or qty>remaining then raise exception 'Quantidade superior à venda ainda válida'; end if;
  insert into public.sale_item_reversals(id,sale_item_id,quantity,reason,created_by) values(entity,line.id,qty,reason,actor);
  -- Reversão só se as peças retornaram fisicamente; a interface exige essa confirmação.
  if coalesce((p_data->>'restock')::boolean,false) is not true then raise exception 'Confirme o retorno físico das peças para cancelar/devolver'; end if;
  perform set_config('app.movement_type','reversao_venda',true);
  update public.products set stock_quantity=stock_quantity+qty where id=line.product_id;
  -- Se o recebimento agora excede a venda líquida, estorna atomicamente a diferença.
  amount:=greatest(-public.sale_balance(sale.id),0);
  if amount>0 and coalesce((p_data->>'refund_confirmed')::boolean,false) is not true then raise exception 'Confirme a devolução financeira do valor excedente';end if;
  for payment in select * from public.payments where sale_id=sale.id order by received_at desc,id for update loop
   exit when amount<=0;
   select payment.amount-coalesce(sum(r.amount),0) into paid from public.payment_reversals r where payment_id=payment.id;
   paid:=least(paid,amount);
   if paid>0 then insert into public.payment_reversals(payment_id,amount,reason,created_by) values(payment.id,paid,reason,actor);amount:=amount-paid;end if;
  end loop;
 elsif p_action='payment_add' then
  select * into strict sale from public.sales where id=(p_data->>'sale_id')::uuid for update;
  amount:=(p_data->>'amount')::numeric;
  if (sale.pricing_method='pix') is distinct from ((p_data->>'method')='pix') then raise exception 'Método de recebimento incompatível com o preço Pix confirmado';end if;
  if amount is null or not(amount>0 and amount<=public.sale_balance(sale.id)) or amount<>round(amount,2) then raise exception 'Valor acima do saldo ou inválido'; end if;
  if nullif(p_data->>'received_at','')::timestamptz>now() then raise exception 'Recebimento não pode ter data futura';end if;
  insert into public.payments(id,sale_id,method,amount,received_at,created_by) values(entity,sale.id,p_data->>'method',amount,coalesce(nullif(p_data->>'received_at','')::timestamptz,now()),actor);
 elsif p_action='payment_reverse' then
  if length(reason)<3 then raise exception 'Informe o motivo'; end if;
  select * into strict payment from public.payments where id=(p_data->>'payment_id')::uuid for update;
  perform 1 from public.sales where id=payment.sale_id for update;
  select payment.amount-coalesce(sum(amount),0) into paid from public.payment_reversals where payment_id=payment.id;
  amount:=(p_data->>'amount')::numeric;
  if amount is null or not(amount>0 and amount<=paid) or amount<>round(amount,2) then raise exception 'Estorno superior ao recebimento ou inválido'; end if;
  insert into public.payment_reversals(id,payment_id,amount,reason,created_by) values(entity,payment.id,amount,reason,actor);
 else raise exception 'Operação desconhecida';
 end if;
 result:=jsonb_build_object('id',entity,'action',p_action);
 insert into public.operation_requests(id,operation,request_payload,result,created_by) values(p_request,p_action,p_data,result,actor);
 perform set_config('app.movement_type','',true);perform set_config('app.reference_id','',true);perform set_config('app.movement_origin','',true);
 return result;
end $$;
revoke all on function public.admin_execute(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_execute(uuid,text,jsonb) to authenticated;

-- Snapshot privado coeso, sem views financeiras públicas. Dados reais, nenhum indicador fictício.
create function public.admin_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501';end if;
 return jsonb_build_object(
 'customers',(select coalesce(jsonb_agg(to_jsonb(c) order by c.name),'[]') from public.customers c),
 'products',(select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('category',c.name,'in_conditional',
  coalesce((select sum(public.conditional_pending(i.id)) from public.conditional_items i where i.product_id=p.id),0)) order by p.name),'[]') from public.products p join public.categories c on c.id=p.category_id),
 'conditionals',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('pending',coalesce((select sum(public.conditional_pending(i.id)) from public.conditional_items i where i.conditional_id=c.id),0)) order by c.created_at desc),'[]') from public.conditionals c),
 'conditional_items',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('pending',public.conditional_pending(i.id))),'[]') from public.conditional_items i),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]') from public.conditional_events e),
 'sales',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('balance',public.sale_balance(s.id),'remaining_units',coalesce((select sum(l.quantity-coalesce((select sum(r.quantity) from public.sale_item_reversals r where r.sale_item_id=l.id),0)) from public.sale_items l where l.sale_id=s.id),0),'net_total',
 coalesce((select sum(l.subtotal-coalesce((select sum(r.quantity)*l.unit_price from public.sale_item_reversals r where r.sale_item_id=l.id),0)) from public.sale_items l where l.sale_id=s.id),0)) order by s.created_at desc),'[]') from public.sales s),
 'sale_items',(select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('reversed',coalesce((select sum(r.quantity) from public.sale_item_reversals r where r.sale_item_id=l.id),0))),'[]') from public.sale_items l),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('reversed',coalesce((select sum(r.amount) from public.payment_reversals r where r.payment_id=p.id),0)) order by p.created_at desc),'[]') from public.payments p),
 'payment_reversals',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]') from public.payment_reversals r),
 'sale_reversals',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]') from public.sale_item_reversals r),
 'movements',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc),'[]') from public.stock_movements m),
 'customer_audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from public.customer_audit a));
end $$;
revoke all on function public.admin_snapshot() from public,anon,authenticated;
grant execute on function public.admin_snapshot() to authenticated;
commit;
