-- Marco B: base privada de gestão. Aplicar uma única vez pelo histórico de migrations.
-- Nenhuma operação de estoque/venda/pagamento é exposta nesta etapa.
-- As próximas etapas devem escrever SOMENTE por RPCs transacionais autorizadas.
begin;

-- Mantém o contrato de autorização existente, com referências qualificadas.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone text not null default '' check (char_length(phone) <= 32),
  notes text not null default '' check (char_length(notes) <= 2000),
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_name_idx on public.customers (lower(name));
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- A linha representa entrega FÍSICA, nunca a seleção ou a mensagem WhatsApp.
create table public.conditionals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  delivered_at timestamptz not null default now(),
  due_at timestamptz check (due_at is null or due_at >= delivered_at),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, customer_id)
);
create index conditionals_customer_idx on public.conditionals (customer_id, delivered_at desc);

create table public.conditional_items (
  id uuid primary key default gen_random_uuid(),
  conditional_id uuid not null references public.conditionals(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null check (char_length(btrim(product_name)) between 1 and 120),
  quantity_out integer not null check (quantity_out > 0),
  created_at timestamptz not null default now(),
  unique (conditional_id, product_id),
  unique (id, conditional_id, product_id)
);
create index conditional_items_product_idx on public.conditional_items (product_id);

-- Snapshot histórico da venda. Método de preço e prazo de recebimento são distintos.
-- Parcelamento por operadora não cria por si só store_credit.
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  conditional_id uuid,
  pricing_method text not null check (pricing_method in ('pix', 'card', 'standard')),
  collection_terms text not null check (collection_terms in ('immediate', 'store_credit')),
  due_at timestamptz,
  sold_at timestamptz not null default now(),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (conditional_id, customer_id) references public.conditionals(id, customer_id) on delete restrict,
  check (collection_terms = 'store_credit' or due_at is null),
  unique (id, pricing_method),
  unique (id, conditional_id)
);
create index sales_customer_idx on public.sales (customer_id, sold_at desc);
create index sales_conditional_idx on public.sales (conditional_id) where conditional_id is not null;

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  conditional_id uuid,
  conditional_item_id uuid,
  product_name text not null check (char_length(btrim(product_name)) between 1 and 120),
  quantity integer not null check (quantity > 0),
  pricing_method text not null,
  list_price numeric(12,2) not null check (list_price between 0 and 9999999999.99),
  promo_price numeric(12,2) check (promo_price is null or (promo_price >= 0 and promo_price < list_price)),
  applicable_price numeric(12,2) generated always as (coalesce(promo_price, list_price)) stored,
  unit_discount numeric(12,2) generated always as
    (coalesce(promo_price, list_price) - case when pricing_method = 'pix'
      then round(coalesce(promo_price, list_price) * 0.9, 2) else coalesce(promo_price, list_price) end) stored,
  unit_price numeric(12,2) generated always as
    (case when pricing_method = 'pix' then round(coalesce(promo_price, list_price) * 0.9, 2)
      else coalesce(promo_price, list_price) end) stored,
  subtotal numeric(22,2) generated always as
    ((case when pricing_method = 'pix' then round(coalesce(promo_price, list_price) * 0.9, 2)
      else coalesce(promo_price, list_price) end) * quantity) stored,
  created_at timestamptz not null default now(),
  foreign key (sale_id, pricing_method) references public.sales(id, pricing_method) on delete restrict,
  foreign key (sale_id, conditional_id) references public.sales(id, conditional_id) on delete restrict,
  foreign key (conditional_item_id, conditional_id, product_id)
    references public.conditional_items(id, conditional_id, product_id) on delete restrict,
  check ((conditional_id is null) = (conditional_item_id is null)),
  unique (sale_id, product_id),
  unique (id, sale_id),
  unique (id, conditional_item_id)
);
create index sale_items_product_idx on public.sale_items (product_id);
create index sale_items_conditional_idx on public.sale_items (conditional_item_id) where conditional_item_id is not null;

-- MATCH SIMPLE não garante igualdade quando conditional_id é NULL: fecha essa lacuna.
create function public.validate_sale_item_origin()
returns trigger language plpgsql set search_path = '' as $$
declare v_conditional_id uuid;
begin
  select conditional_id into strict v_conditional_id from public.sales where id = new.sale_id;
  if new.conditional_id is distinct from v_conditional_id then
    raise exception 'Origem da peça difere da venda' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.validate_sale_item_origin() from public, anon, authenticated;
create trigger sale_item_origin before insert or update on public.sale_items
  for each row execute function public.validate_sale_item_origin();

-- Recebimentos positivos. Correções são novas linhas em payment_reversals.
-- Card representa recebimento reconhecido pela loja; taxas/repasse da operadora são futuros.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  method text not null check (method in ('pix', 'card', 'cash', 'bank_transfer')),
  amount numeric(12,2) not null check (amount > 0 and amount <= 9999999999.99),
  received_at timestamptz not null default now(),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index payments_sale_idx on public.payments (sale_id, received_at);

create table public.payment_reversals (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0 and amount <= 9999999999.99),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index payment_reversals_payment_idx on public.payment_reversals (payment_id);

-- Cancelamento/devolução parcial ou total por peça; não apaga a venda ou recebimentos.
-- Repor estoque e devolver dinheiro serão decisões transacionais explícitas nos marcos C/F/G.
create table public.sale_item_reversals (
  id uuid primary key default gen_random_uuid(),
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index sale_item_reversals_item_idx on public.sale_item_reversals (sale_item_id);

-- Retornos/compras parciais são eventos. Uma reversão aponta para evento anterior.
-- Limites agregados e estoque exigirão locks por peça nas RPCs dos marcos C/E/F.
create table public.conditional_events (
  id uuid primary key default gen_random_uuid(),
  conditional_item_id uuid not null references public.conditional_items(id) on delete restrict,
  kind text not null check (kind in ('return', 'sale', 'reversal')),
  quantity integer not null check (quantity > 0),
  sale_item_id uuid,
  reverses_event_id uuid unique,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, conditional_item_id),
  foreign key (sale_item_id, conditional_item_id) references public.sale_items(id, conditional_item_id) on delete restrict,
  foreign key (reverses_event_id, conditional_item_id) references public.conditional_events(id, conditional_item_id) on delete restrict,
  check ((kind = 'sale') = (sale_item_id is not null)),
  check ((kind = 'reversal') = (reverses_event_id is not null)),
  check (reverses_event_id is null or reverses_event_id <> id),
  unique (sale_item_id)
);
create index conditional_events_item_idx on public.conditional_events (conditional_item_id, created_at);

-- Chave global por comando, com payload original para detectar reuso com dados diferentes.
-- Não há RPC de negócio neste marco. Registro e efeito serão atômicos na mesma transação.
create table public.operation_requests (
  id uuid primary key,
  operation text not null check (char_length(btrim(operation)) between 1 and 80),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Auditoria de clientes: snapshots anteriores/posteriores, sem exclusão de histórico.
create table public.customer_audit (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  action text not null check (action in ('INSERT', 'UPDATE')),
  before_data jsonb,
  after_data jsonb not null,
  actor_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index customer_audit_customer_idx on public.customer_audit (customer_id, created_at);

create function public.audit_customer_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.customer_audit(customer_id, action, before_data, after_data, actor_id)
  values (new.id, tg_op, case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
          to_jsonb(new), auth.uid());
  return new;
end $$;
revoke all on function public.audit_customer_change() from public, anon, authenticated;
create trigger customers_audit after insert or update on public.customers
  for each row execute function public.audit_customer_change();

-- Defesa adicional de imutabilidade, inclusive contra UPDATE/DELETE acidentais do backend.
create function public.reject_ledger_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Registro histórico imutável: use reversão auditável' using errcode = '55000';
end $$;
revoke all on function public.reject_ledger_mutation() from public, anon, authenticated;

alter table public.customers enable row level security;
revoke all on public.customers from public, anon, authenticated;
grant select on public.customers to authenticated;
create policy "customers: admin lê" on public.customers
  for select to authenticated using ((select public.is_admin()));

alter table public.conditionals enable row level security;
revoke all on public.conditionals from public, anon, authenticated;
grant select on public.conditionals to authenticated;
create policy "conditionals: admin lê" on public.conditionals
  for select to authenticated using ((select public.is_admin()));

alter table public.conditional_items enable row level security;
revoke all on public.conditional_items from public, anon, authenticated;
grant select on public.conditional_items to authenticated;
create policy "conditional_items: admin lê" on public.conditional_items
  for select to authenticated using ((select public.is_admin()));

alter table public.sales enable row level security;
revoke all on public.sales from public, anon, authenticated;
grant select on public.sales to authenticated;
create policy "sales: admin lê" on public.sales
  for select to authenticated using ((select public.is_admin()));

alter table public.sale_items enable row level security;
revoke all on public.sale_items from public, anon, authenticated;
grant select on public.sale_items to authenticated;
create policy "sale_items: admin lê" on public.sale_items
  for select to authenticated using ((select public.is_admin()));

alter table public.payments enable row level security;
revoke all on public.payments from public, anon, authenticated;
grant select on public.payments to authenticated;
create policy "payments: admin lê" on public.payments
  for select to authenticated using ((select public.is_admin()));

alter table public.payment_reversals enable row level security;
revoke all on public.payment_reversals from public, anon, authenticated;
grant select on public.payment_reversals to authenticated;
create policy "payment_reversals: admin lê" on public.payment_reversals
  for select to authenticated using ((select public.is_admin()));

alter table public.sale_item_reversals enable row level security;
revoke all on public.sale_item_reversals from public, anon, authenticated;
grant select on public.sale_item_reversals to authenticated;
create policy "sale_item_reversals: admin lê" on public.sale_item_reversals
  for select to authenticated using ((select public.is_admin()));

alter table public.conditional_events enable row level security;
revoke all on public.conditional_events from public, anon, authenticated;
grant select on public.conditional_events to authenticated;
create policy "conditional_events: admin lê" on public.conditional_events
  for select to authenticated using ((select public.is_admin()));

alter table public.operation_requests enable row level security;
revoke all on public.operation_requests from public, anon, authenticated;
grant select on public.operation_requests to authenticated;
create policy "operation_requests: admin lê" on public.operation_requests
  for select to authenticated using ((select public.is_admin()));

alter table public.customer_audit enable row level security;
revoke all on public.customer_audit from public, anon, authenticated;
grant select on public.customer_audit to authenticated;
create policy "customer_audit: admin lê" on public.customer_audit
  for select to authenticated using ((select public.is_admin()));
create trigger customers_immutable before delete on public.customers
  for each row execute function public.reject_ledger_mutation();
create trigger customers_no_truncate before truncate on public.customers
  for each statement execute function public.reject_ledger_mutation();
create trigger conditionals_immutable before update or delete on public.conditionals
  for each row execute function public.reject_ledger_mutation();
create trigger conditionals_no_truncate before truncate on public.conditionals
  for each statement execute function public.reject_ledger_mutation();
create trigger conditional_items_immutable before update or delete on public.conditional_items
  for each row execute function public.reject_ledger_mutation();
create trigger conditional_items_no_truncate before truncate on public.conditional_items
  for each statement execute function public.reject_ledger_mutation();
create trigger sales_immutable before update or delete on public.sales
  for each row execute function public.reject_ledger_mutation();
create trigger sales_no_truncate before truncate on public.sales
  for each statement execute function public.reject_ledger_mutation();
create trigger sale_items_immutable before update or delete on public.sale_items
  for each row execute function public.reject_ledger_mutation();
create trigger sale_items_no_truncate before truncate on public.sale_items
  for each statement execute function public.reject_ledger_mutation();
create trigger payments_immutable before update or delete on public.payments
  for each row execute function public.reject_ledger_mutation();
create trigger payments_no_truncate before truncate on public.payments
  for each statement execute function public.reject_ledger_mutation();
create trigger payment_reversals_immutable before update or delete on public.payment_reversals
  for each row execute function public.reject_ledger_mutation();
create trigger payment_reversals_no_truncate before truncate on public.payment_reversals
  for each statement execute function public.reject_ledger_mutation();
create trigger sale_item_reversals_immutable before update or delete on public.sale_item_reversals
  for each row execute function public.reject_ledger_mutation();
create trigger sale_item_reversals_no_truncate before truncate on public.sale_item_reversals
  for each statement execute function public.reject_ledger_mutation();
create trigger conditional_events_immutable before update or delete on public.conditional_events
  for each row execute function public.reject_ledger_mutation();
create trigger conditional_events_no_truncate before truncate on public.conditional_events
  for each statement execute function public.reject_ledger_mutation();
create trigger operation_requests_immutable before update or delete on public.operation_requests
  for each row execute function public.reject_ledger_mutation();
create trigger operation_requests_no_truncate before truncate on public.operation_requests
  for each statement execute function public.reject_ledger_mutation();
create trigger customer_audit_immutable before update or delete on public.customer_audit
  for each row execute function public.reject_ledger_mutation();
create trigger customer_audit_no_truncate before truncate on public.customer_audit
  for each statement execute function public.reject_ledger_mutation();

comment on table public.sales is 'Marco B: leitura admin; escrita API fechada até RPCs transacionais do marco F';
comment on table public.payments is 'Marco B: recebimentos distintos de vendas; estornos em payment_reversals';
comment on table public.operation_requests is 'Idempotência futura: chave, operação, payload e resultado na mesma transação';
commit;
