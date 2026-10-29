-- Torna um usuário JÁ CRIADO no Supabase Auth em administrador.
-- 1) Crie o usuário em Authentication > Users > Add user (e-mail + senha definidos pela proprietária).
-- 2) Troque o e-mail abaixo e rode no SQL Editor.
insert into public.admin_users (user_id)
select id from auth.users where email = 'proprietaria@exemplo.com.br'
on conflict do nothing;
