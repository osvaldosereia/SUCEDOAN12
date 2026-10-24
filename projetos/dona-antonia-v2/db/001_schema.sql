-- ESQUEMA NOVO, NÃO APLICAR EM PRODUÇÃO SEM HOMOLOGAÇÃO.
-- Isolado da base legada. Sem políticas RLS: nenhuma sessão anon/auth terá acesso.
create schema if not exists da_next;

create table if not exists da_next.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  bling_id bigint unique,
  name text not null,
  brand text not null default '',
  category text not null check (category in (
    'MERCEARIA BÁSICA','LIMPEZA','LAVANDERIA','HIGIÊNE','BELEZA','UTILIDADES','PET'
  )),
  gtin text,
  package_gtin text,
  items_per_case integer check (items_per_case > 0),
  ncm text,
  cest text,
  cost_cents integer not null default 0 check (cost_cents >= 0),
  price_cents integer not null default 0 check (price_cents >= 0),
  stock_units integer not null default 0 check (stock_units >= 0),
  active boolean not null default false,
  photo_url text,
  updated_at timestamptz not null default now(),
  constraint gtin_digits check (gtin is null or gtin ~ '^[0-9]{8,14}$')
);
create unique index if not exists products_gtin_unique
  on da_next.products (gtin) where gtin is not null and gtin <> '';

create table if not exists da_next.product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true
);
create table if not exists da_next.product_type_products (
  product_type_id uuid not null references da_next.product_types(id) on delete cascade,
  product_id uuid not null references da_next.products(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_type_id, product_id)
);
create table if not exists da_next.basket_sizes (
  id text primary key check (id in ('economica','mini','pequena','media','grande')),
  name text not null,
  active boolean not null default false,
  sort_order integer not null default 0
);
create table if not exists da_next.basket_size_types (
  basket_id text not null references da_next.basket_sizes(id) on delete cascade,
  product_type_id uuid not null references da_next.product_types(id) on delete restrict,
  default_quantity integer not null check (default_quantity between 0 and 999),
  sort_order integer not null default 0,
  primary key (basket_id, product_type_id)
);

-- Pedidos: preços e descrições são snapshots imutáveis após confirmação.
create table if not exists da_next.orders (
  id uuid primary key default gen_random_uuid(),
  external_number text unique,
  customer_name text not null,
  customer_phone text not null,
  address_snapshot jsonb not null,
  status text not null default 'NOVO' check (status in (
    'NOVO','SEPARAR AGORA','PRONTO PRA ENTREGA','ENTREGUE','CANCELADO'
  )),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  delivery_cents integer not null default 0 check (delivery_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists da_next.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references da_next.orders(id) on delete restrict,
  product_id uuid not null references da_next.products(id) on delete restrict,
  sku_snapshot text not null,
  name_snapshot text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  total_cents integer not null check (total_cents >= 0)
);
create table if not exists da_next.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  next_retry_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

insert into da_next.basket_sizes(id,name,active,sort_order) values
  ('economica','Econômica',false,1),
  ('mini','Mini',false,2),
  ('pequena','Pequena',false,3),
  ('media','Média',false,4),
  ('grande','Grande',false,5)
on conflict (id) do nothing;

alter table da_next.products enable row level security;
alter table da_next.product_types enable row level security;
alter table da_next.product_type_products enable row level security;
alter table da_next.basket_sizes enable row level security;
alter table da_next.basket_size_types enable row level security;
alter table da_next.orders enable row level security;
alter table da_next.order_lines enable row level security;
alter table da_next.integration_outbox enable row level security;

-- Acesso apenas via backend seguro futuro. Sem políticas de leitura/escrita públicas.
