-- Somente leitura; não retorna dados de clientes, tokens ou credenciais.
select jsonb_build_object(
 'tables',(select jsonb_agg(table_name order by table_name) from information_schema.tables where table_schema='public'),
 'management_columns',(select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type) order by table_name,ordinal_position)
 from information_schema.columns where table_schema='public' and table_name in ('customers','conditionals','sales','sale_items','payments')),
 'execute_rpc',to_regprocedure('public.admin_execute(uuid,text,jsonb)') is not null,
 'deletion_rpc',to_regprocedure('public.admin_deletion_info(text,uuid)') is not null,
 'audit_subjects',to_regclass('public.customer_audit_subjects') is not null,
 'snapshot_rpc',to_regprocedure('public.admin_snapshot()') is not null,
 'rls',(select jsonb_object_agg(c.relname,c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r')) as verificacao;
