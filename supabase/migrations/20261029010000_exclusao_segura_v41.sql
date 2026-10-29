-- V4.1: exclusão administrativa restrita; não apaga eventos, auditoria ou Storage.
begin;

-- A identidade auditada sobrevive ao cadastro operacional. Nenhuma linha de auditoria
-- é apagada/alterada: sua FK passa a apontar ao registro permanente da identidade.
create table public.customer_audit_subjects (id uuid primary key);
insert into public.customer_audit_subjects(id) select id from public.customers;
alter table public.customer_audit_subjects enable row level security;
revoke all on public.customer_audit_subjects from public,anon,authenticated;
grant select on public.customer_audit_subjects to authenticated;
create policy "customer_audit_subjects: admin lê" on public.customer_audit_subjects
 for select to authenticated using ((select public.is_admin()));
create trigger customer_subjects_immutable before update or delete on public.customer_audit_subjects
 for each row execute function public.reject_ledger_mutation();
create trigger customer_subjects_no_truncate before truncate on public.customer_audit_subjects
 for each statement execute function public.reject_ledger_mutation();
alter table public.customer_audit drop constraint customer_audit_customer_id_fkey;
alter table public.customer_audit add constraint customer_audit_customer_id_fkey
 foreign key(customer_id) references public.customer_audit_subjects(id) on delete restrict;
create or replace function public.audit_customer_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.customer_audit_subjects(id) values(new.id) on conflict(id) do nothing;
 insert into public.customer_audit(customer_id,action,before_data,after_data,actor_id)
 values(new.id,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid());
 return new;
end $$;
revoke all on function public.audit_customer_change() from public,anon,authenticated;

-- Verifica também FKs futuras/desconhecidas. Não contorna RESTRICT nem usa CASCADE.
create function public.deletion_dependencies(p_kind text,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target regclass; record_name text; archived boolean; stock integer;
 reasons text[]:=array[]::text[]; fk record; dependent boolean; friendly text;
begin
 if p_kind='customer' then
  target:='public.customers'::regclass;
  select name,archived_at is not null into strict record_name,archived from public.customers where id=p_id;
  -- INSERT de auditoria é inevitável no cadastro; UPDATE já é histórico relevante.
  if exists(select 1 from public.customer_audit where customer_id=p_id and action<>'INSERT') then
   reasons:=array_append(reasons,'Há alterações anteriores na auditoria do cliente.');
  end if;
 elsif p_kind='product' then
  target:='public.products'::regclass;
  select name,archived_at is not null,stock_quantity into strict record_name,archived,stock from public.products where id=p_id;
  if stock<>0 then reasons:=array_append(reasons,'A peça ainda tem unidades em estoque.');end if;
 else raise exception 'Tipo de cadastro inválido' using errcode='22023';end if;
 for fk in
  select c.oid,c.conrelid,c.confkey,n.nspname,t.relname,a.attname
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t on t.oid=c.conrelid
  join pg_catalog.pg_namespace n on n.oid=t.relnamespace
  left join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.confrelid=target order by n.nspname,t.relname,c.oid
 loop
  if cardinality(fk.confkey)<>1 then
   reasons:=array_append(reasons,'Uma referência composta exige revisão antes da exclusão: '||fk.relname||'.');
   continue;
  end if;
  execute format('select exists(select 1 from %I.%I where %I=$1)',fk.nspname,fk.relname,fk.attname) into dependent using p_id;
  if dependent then
   friendly:=case fk.relname when 'sales' then 'O cliente possui vendas registradas.'
    when 'conditionals' then 'O cliente possui condicionais registradas.'
    when 'sale_items' then 'A peça possui vendas registradas, inclusive vendas revertidas.'
    when 'conditional_items' then 'A peça possui condicionais registradas, inclusive encerradas.'
    when 'stock_movements' then 'A peça possui histórico de movimentação de estoque.'
    when 'product_images' then 'A peça possui fotos vinculadas. Resolva as referências de imagens antes de excluir; nenhum arquivo será apagado automaticamente.'
    else 'Há registros dependentes em '||fk.nspname||'.'||fk.relname||'.' end;
   reasons:=array_append(reasons,friendly);
  end if;
 end loop;
 return jsonb_build_object('id',p_id,'kind',p_kind,'name',record_name,'archived',archived,
  'allowed',cardinality(reasons)=0,'reasons',to_jsonb(reasons));
end $$;
revoke all on function public.deletion_dependencies(text,uuid) from public,anon,authenticated;

create function public.admin_deletion_info(p_kind text,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501';end if;
 return public.deletion_dependencies(p_kind,p_id);
end $$;
revoke all on function public.admin_deletion_info(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_deletion_info(text,uuid) to authenticated;

-- Nem a administradora recebe DELETE direto. Guardas também protegem DELETE
-- acidental feito no backend fora da operação transacional autorizada.
revoke delete,truncate on public.products from public,anon,authenticated;
create function public.guard_record_delete()
returns trigger language plpgsql set search_path='' as $$
declare kind text:=case when tg_table_name='customers' then 'customer' else 'product' end; info jsonb;
begin
 if current_user in ('anon','authenticated') or auth.uid() is null or not public.is_admin()
  or current_setting('app.deleting_entity',true) is distinct from kind||':'||old.id::text then
  raise exception 'Exclusão somente pela operação administrativa protegida' using errcode='55000';
 end if;
 info:=public.deletion_dependencies(kind,old.id);
 if not (info->>'allowed')::boolean then raise exception 'Exclusão bloqueada: %',info->'reasons' using errcode='23503';end if;
 return old;
end $$;
revoke all on function public.guard_record_delete() from public,anon,authenticated;
drop trigger customers_immutable on public.customers;
create trigger customers_delete_guard before delete on public.customers for each row execute function public.guard_record_delete();
create trigger products_delete_guard before delete on public.products for each row execute function public.guard_record_delete();

-- Mantém a implementação V4.0 intacta e delega os comandos existentes. A função
-- interna perde EXECUTE para a API; chamadas recursivas antigas passam pelo wrapper.
alter function public.admin_execute(uuid,text,jsonb) rename to admin_execute_v40;
revoke all on function public.admin_execute_v40(uuid,text,jsonb) from public,anon,authenticated;
create function public.admin_execute(p_request uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous public.operation_requests%rowtype;
 kind text; entity uuid; info jsonb; result jsonb; archived boolean;
begin
 if actor is null or not public.is_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501';end if;
 if p_action not in ('customer_delete','product_delete','customer_archive','product_archive') then
  -- Compra de condicional existente também não oferece uma peça arquivada como nova venda.
  if p_action='sale_create' and jsonb_typeof(p_data->'items')='array' then
   perform pg_advisory_xact_lock(741920261029::bigint);
   perform p.id from public.products p where p.id in (select (value->>'product_id')::uuid from jsonb_array_elements(p_data->'items')) order by p.id for update;
   if not exists(select 1 from public.operation_requests where id=p_request) and exists(select 1 from public.products p where p.archived_at is not null and p.id in (select (value->>'product_id')::uuid from jsonb_array_elements(p_data->'items'))) then raise exception 'Peça arquivada: reative o cadastro antes de registrar uma nova venda';end if;
  end if;
  return public.admin_execute_v40(p_request,p_action,p_data);
 end if;
 if p_request is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Comando inválido' using errcode='22023';end if;
 perform pg_advisory_xact_lock(741920261029::bigint);
 if not public.is_admin() then raise exception 'Autorização revogada' using errcode='42501';end if;
 select * into previous from public.operation_requests where id=p_request;
 if found then
  if previous.created_by<>actor or previous.operation<>p_action or previous.request_payload<>p_data then raise exception 'Chave reutilizada com outros dados' using errcode='22023';end if;
  return previous.result;
 end if;
 kind:=split_part(p_action,'_',1);entity:=(p_data->>'id')::uuid;
 if kind='customer' then perform 1 from public.customers where id=entity for update;
 else perform 1 from public.products where id=entity for update;end if;
 if not found then raise exception 'Cadastro não encontrado' using errcode='P0002';end if;
 info:=public.deletion_dependencies(kind,entity);
 if p_action like '%_delete' then
  if (info->>'name') is distinct from p_data->>'confirm_name' then raise exception 'O nome do cadastro mudou. Confira novamente antes de excluir.' using errcode='22023';end if;
  if not (info->>'allowed')::boolean then raise exception 'Exclusão bloqueada: %',info->'reasons';end if;
  perform set_config('app.deleting_entity',kind||':'||entity::text,true);
  if kind='customer' then delete from public.customers where id=entity;
  else delete from public.products where id=entity;end if;
  perform set_config('app.deleting_entity','',true);
  result:=jsonb_build_object('id',entity,'action',p_action,'name',info->>'name','deleted',true);
 else
  if jsonb_typeof(p_data->'archived') is distinct from 'boolean' then raise exception 'Informe arquivar ou reativar' using errcode='22023';end if;
  archived:=(p_data->>'archived')::boolean;
  if kind='customer' then
   update public.customers set archived_at=case when archived then now() else null end where id=entity;
  else
   update public.products set archived_at=case when archived then now() else null end,
    is_active=case when archived then false else is_active end where id=entity;
  end if;
  result:=jsonb_build_object('id',entity,'action',p_action,'name',info->>'name','archived',archived);
 end if;
 insert into public.operation_requests(id,operation,request_payload,result,created_by) values(p_request,p_action,p_data,result,actor);
 return result;
end $$;
revoke all on function public.admin_execute(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_execute(uuid,text,jsonb) to authenticated;
comment on table public.customer_audit_subjects is 'Identidades permanentes de auditoria; não são clientes ativos. Histórico não é removido com o cadastro.';
commit;
