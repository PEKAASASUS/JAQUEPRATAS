-- SOMENTE em Supabase EXCLUSIVO DE TESTES com as três migrações aplicadas.
-- Executar arquivo inteiro, sem selecionar trechos. Não usa tabelas temporárias/pgTAP.
-- Qualquer falha lança erro; todas as fixtures e operações são desfeitas pelo ROLLBACK.
begin;
do $$
declare
 admin_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
 cust uuid; prod uuid:=gen_random_uuid(); sale_id uuid; request_id uuid:=gen_random_uuid();
 payload jsonb; a jsonb; b jsonb; snap jsonb; n integer; balance numeric;
begin
 insert into auth.users(id,email) values(admin_id,admin_id::text||'@example.invalid'),(other_id,other_id::text||'@example.invalid');
 insert into public.admin_users(user_id) values(admin_id);
 perform set_config('request.jwt.claim.sub',other_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true);
 set local role authenticated;
 begin
  perform public.admin_execute(gen_random_uuid(),'customer_save','{"name":"Não autorizado"}'::jsonb);
  raise exception 'FALHA: usuário comum conseguiu escrever';
 exception when insufficient_privilege then null;end;
 begin
  perform public.admin_snapshot();raise exception 'FALHA: usuário comum conseguiu ler gestão';
 exception when insufficient_privilege then null;end;
 reset role;
 set local role anon;
 begin
  perform public.admin_snapshot();raise exception 'FALHA: visitante chamou snapshot';
 exception when insufficient_privilege then null;end;
 perform 1 from public.catalog_products limit 1;
 reset role;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 set local role authenticated;
 a:=public.admin_execute(gen_random_uuid(),'customer_save','{"name":"Cliente fictícia integração"}'::jsonb);cust:=(a->>'id')::uuid;
 insert into public.products(id,name,category_id,price,stock_quantity)
 select prod,'Produto fictício integração',id,100,2 from public.categories order by sort_order limit 1;
 payload:=jsonb_build_object('customer_id',cust,'items',jsonb_build_array(jsonb_build_object('product_id',prod,'quantity',1)),
 'pricing_method','pix','collection_terms','store_credit','received',0);
 a:=public.admin_execute(request_id,'sale_create',payload);b:=public.admin_execute(request_id,'sale_create',payload);
 if a<>b then raise exception 'FALHA: replay não retornou a mesma venda';end if;
 sale_id:=(a->>'id')::uuid;
 select stock_quantity into n from public.products where id=prod;
 if n<>1 then raise exception 'FALHA: estoque baixou mais de uma vez';end if;
 snap:=public.admin_snapshot();
 select (value->>'balance')::numeric into balance from jsonb_array_elements(snap->'sales') where value->>'id'=sale_id::text;
 if balance<>90 then raise exception 'FALHA: desconto Pix incorreto';end if;
 a:=public.admin_execute(gen_random_uuid(),'payment_add',jsonb_build_object('sale_id',sale_id,'amount',30,'method','pix'));
 snap:=public.admin_snapshot();
 select (value->>'balance')::numeric into balance from jsonb_array_elements(snap->'sales') where value->>'id'=sale_id::text;
 if balance<>60 then raise exception 'FALHA: pagamento parcial';end if;
 perform public.admin_execute(gen_random_uuid(),'payment_reverse',jsonb_build_object('payment_id',a->>'id','amount',10,'reason','Correção fictícia'));
 snap:=public.admin_snapshot();
 select (value->>'balance')::numeric into balance from jsonb_array_elements(snap->'sales') where value->>'id'=sale_id::text;
 if balance<>70 then raise exception 'FALHA: estorno parcial';end if;
 perform public.admin_execute(gen_random_uuid(),'sale_cancel',jsonb_build_object('sale_id',sale_id,'reason','Cancelamento fictício','restock',true,'refund_confirmed',true));
 snap:=public.admin_snapshot();
 select (value->>'balance')::numeric into balance from jsonb_array_elements(snap->'sales') where value->>'id'=sale_id::text;
 if balance<>0 then raise exception 'FALHA: saldo depois do cancelamento';end if;
 select stock_quantity into n from public.products where id=prod;
 if n<>2 then raise exception 'FALHA: cancelamento não devolveu estoque';end if;
 begin
  update public.products set stock_quantity=3 where id=prod;
  raise exception 'FALHA: edição direta de estoque permitida' using errcode='XX000';
 exception when insufficient_privilege then null;end;
 reset role;
end $$;
rollback;

select 'PASSOU: autorização, catálogo, replay idempotente, Pix, estoque, pagamento parcial, estorno e cancelamento. Fixtures desfeitas.' as resultado;
