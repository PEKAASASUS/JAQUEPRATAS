-- Apenas no Supabase exclusivo de testes, com V4.0 + V4.1 instaladas.
-- Executar inteiro: usuários/cadastros fictícios e todos os efeitos são desfeitos.
begin;
do $$
declare a uuid:=gen_random_uuid(); c uuid; d uuid; p uuid:=gen_random_uuid();
 k uuid:=gen_random_uuid(); payload jsonb; first_result jsonb; second_result jsonb; info jsonb; n integer;
begin
 insert into auth.users(id,email) values(a,a::text||'@example.invalid');
 insert into public.admin_users(user_id) values(a);
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 c:=(public.admin_execute(gen_random_uuid(),'customer_save','{"name":"Cliente fictício V4.1"}'::jsonb)->>'id')::uuid;
 info:=public.admin_deletion_info('customer',c);
 if not (info->>'allowed')::boolean then raise exception 'FALHA: cliente recém-criado não elegível';end if;
 payload:=jsonb_build_object('id',c,'confirm_name','Cliente fictício V4.1');
 first_result:=public.admin_execute(k,'customer_delete',payload);
 second_result:=public.admin_execute(k,'customer_delete',payload);
 if first_result<>second_result or not (first_result->>'deleted')::boolean then raise exception 'FALHA: exclusão/replay';end if;
 select count(*) into n from public.customer_audit where customer_id=c;
 if n<>1 then raise exception 'FALHA: auditoria de criação não preservada';end if;
 select count(*) into n from public.customers where id=c;
 if n<>0 then raise exception 'FALHA: cadastro não foi excluído';end if;
 insert into public.products(id,name,category_id,price,stock_quantity)
 select p,'Peça fictícia V4.1',id,100,0 from public.categories order by sort_order limit 1;
 perform public.admin_execute(gen_random_uuid(),'product_delete',jsonb_build_object('id',p,'confirm_name','Peça fictícia V4.1'));
 select count(*) into n from public.products where id=p;
 if n<>0 then raise exception 'FALHA: peça sem histórico não excluída';end if;
 c:=(public.admin_execute(gen_random_uuid(),'customer_save','{"name":"Cliente com condicional V4.1"}'::jsonb)->>'id')::uuid;
 p:=gen_random_uuid();
 insert into public.products(id,name,category_id,price,stock_quantity)
 select p,'Peça com histórico V4.1',id,100,1 from public.categories order by sort_order limit 1;
 perform public.admin_execute(gen_random_uuid(),'conditional_deliver',jsonb_build_object('customer_id',c,'items',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',1))));
 if (public.admin_deletion_info('customer',c)->>'allowed')::boolean then raise exception 'FALHA: cliente com condicional elegível';end if;
 if (public.admin_deletion_info('product',p)->>'allowed')::boolean then raise exception 'FALHA: peça em condicional elegível';end if;
 begin
  perform public.admin_execute(gen_random_uuid(),'product_delete',jsonb_build_object('id',p,'confirm_name','Peça com histórico V4.1'));
  raise exception 'FALHA: exclusão de histórico permitida' using errcode='XX000';
 exception when raise_exception then null;end;
 perform public.admin_execute(gen_random_uuid(),'customer_archive',jsonb_build_object('id',c,'archived',true));
 perform public.admin_execute(gen_random_uuid(),'customer_archive',jsonb_build_object('id',c,'archived',false));
 if exists(select 1 from public.customers where id=c and archived_at is not null) then raise exception 'FALHA: cliente não reativado';end if;
 reset role;
 set local role anon;
 begin
  perform public.admin_deletion_info('product',p);
  raise exception 'FALHA: visitante conseguiu inspecionar' using errcode='XX000';
 exception when insufficient_privilege then null;end;
 reset role;
end $$;
rollback;
select 'PASSOU: exclusão de cadastros fictícios sem histórico, auditoria preservada, replay, bloqueio de histórico, arquivar/reativar e visitante bloqueado. Fixtures desfeitas.' as resultado;
