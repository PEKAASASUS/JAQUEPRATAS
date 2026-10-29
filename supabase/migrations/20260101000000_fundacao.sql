-- JackPratas — Migração 0001: fundação (Marco 1)
-- Categorias, produtos, imagens, administradores, histórico de estoque, RLS e Storage.
-- Rode com `supabase db push` ou cole no SQL Editor do Supabase.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------
-- Administradores autorizados
-- Só entra aqui quem for inserido manualmente (ver supabase/bootstrap_admin.sql).
-- ---------------------------------------------------------------
create table public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- O usuário logado só enxerga a própria linha (usado pelo front para saber se é admin).
create policy "admin_users: ler a própria linha"
  on public.admin_users for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name       text not null check (char_length(btrim(name)) > 0),
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;

create policy "categories: leitura pública"
  on public.categories for select to anon, authenticated using (true);
create policy "categories: admin insere"
  on public.categories for insert to authenticated with check (public.is_admin());
create policy "categories: admin altera"
  on public.categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.categories (slug, name, sort_order) values
  ('aneis','Anéis',1), ('correntes','Correntes',2), ('pulseiras','Pulseiras',3),
  ('colares','Colares',4), ('brincos','Brincos',5), ('pingentes','Pingentes',6)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------
-- Produtos (dinheiro em numeric, nunca float)
-- ---------------------------------------------------------------
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  sku            text,
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  category_id    uuid not null references public.categories(id),
  description    text not null default '' check (char_length(description) <= 2000),
  material       text not null default 'Prata 925' check (char_length(material) <= 120),
  price          numeric(12,2) not null check (price >= 0),
  promo_price    numeric(12,2) check (promo_price is null or (promo_price >= 0 and promo_price < price)),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_active      boolean not null default true,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index products_sku_unique on public.products (lower(sku)) where sku is not null and sku <> '';
create index products_category_idx on public.products (category_id);
create index products_catalog_idx  on public.products (is_active, archived_at);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;
-- Visitantes NÃO têm acesso à tabela; usam a view public.catalog_products.
create policy "products: admin lê"     on public.products for select to authenticated using (public.is_admin());
create policy "products: admin insere" on public.products for insert to authenticated with check (public.is_admin());
create policy "products: admin altera" on public.products for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Sem política de DELETE de propósito: produtos são desativados/arquivados, nunca apagados.

create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete restrict,
  storage_path text not null unique,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);
alter table public.product_images enable row level security;
create policy "product_images: admin lê"     on public.product_images for select to authenticated using (public.is_admin());
create policy "product_images: admin insere" on public.product_images for insert to authenticated with check (public.is_admin());
create policy "product_images: admin altera" on public.product_images for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "product_images: admin apaga"  on public.product_images for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------
-- Histórico de estoque
-- Toda alteração de products.stock_quantity gera uma linha aqui, automaticamente,
-- por trigger. Funções futuras (condicional, venda) podem informar o tipo e a origem via
--   set_config('app.movement_type', '...', true); set_config('app.movement_origin', '...', true);
-- ---------------------------------------------------------------
create table public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete restrict,
  movement_type  text not null check (movement_type in
                   ('cadastro_inicial','ajuste_manual','saida_condicional','devolucao_condicional','venda_direta')),
  quantity_delta integer not null check (quantity_delta <> 0),
  quantity_after integer not null check (quantity_after >= 0),
  origin         text not null,
  reference_id   uuid,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
alter table public.stock_movements enable row level security;
create policy "stock_movements: admin lê" on public.stock_movements for select to authenticated using (public.is_admin());
-- Sem política de INSERT/UPDATE/DELETE: só o trigger (security definer) escreve; histórico é imutável.

create or replace function public.log_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_delta int;
  v_type  text;
begin
  if tg_op = 'INSERT' then
    v_delta := new.stock_quantity;
    v_type  := 'cadastro_inicial';
  else
    v_delta := new.stock_quantity - old.stock_quantity;
    v_type  := 'ajuste_manual';
  end if;
  if v_delta = 0 then
    return new;
  end if;
  insert into public.stock_movements (product_id, movement_type, quantity_delta, quantity_after, origin, created_by)
  values (
    new.id,
    coalesce(nullif(current_setting('app.movement_type', true), ''), v_type),
    v_delta,
    new.stock_quantity,
    coalesce(nullif(current_setting('app.movement_origin', true), ''), 'painel_produtos'),
    auth.uid()
  );
  return new;
end $$;

create trigger products_stock_log_ins after insert on public.products
  for each row execute function public.log_stock_movement();
create trigger products_stock_log_upd after update of stock_quantity on public.products
  for each row execute function public.log_stock_movement();

-- ---------------------------------------------------------------
-- Vista pública do catálogo: só colunas seguras, só produtos ativos e não arquivados.
-- Roda com os privilégios do dono da view, de propósito, para que o visitante
-- nunca precise de acesso à tabela products. Não expõe SKU, custos nem notas internas.
-- ---------------------------------------------------------------
create view public.catalog_products as
select
  p.id,
  p.name,
  c.slug  as category_slug,
  c.name  as category_name,
  p.description,
  p.material,
  p.price,
  p.promo_price,
  coalesce(p.promo_price, p.price) as current_price,
  p.stock_quantity as available_quantity,
  (p.stock_quantity > 0) as is_available,
  p.created_at,
  coalesce((select array_agg(i.storage_path order by i.sort_order, i.created_at)
            from public.product_images i where i.product_id = p.id), '{}') as image_paths
from public.products p
join public.categories c on c.id = p.category_id
where p.is_active and p.archived_at is null;

-- ---------------------------------------------------------------
-- Permissões das tabelas (defesa em profundidade além do RLS)
-- ---------------------------------------------------------------
revoke all on public.products, public.product_images, public.stock_movements, public.admin_users from anon;
revoke all on public.catalog_products from anon, authenticated;
grant select on public.catalog_products to anon, authenticated;
revoke all on public.categories from anon;
grant select on public.categories to anon;
revoke insert, update, delete on public.stock_movements from authenticated;
revoke insert, update, delete, truncate on public.admin_users from authenticated;

-- ---------------------------------------------------------------
-- Storage: bucket público para leitura por URL; escrita só para administradores
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy "product-images: admin lê"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
create policy "product-images: admin envia"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product-images: admin substitui"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product-images: admin apaga"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
