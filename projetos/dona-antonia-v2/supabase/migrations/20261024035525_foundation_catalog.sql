-- R02: catalog and basket composition foundation.
-- This is a fresh, isolated schema. Never run against the production projects.
create schema da_next;

create or replace function da_next.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create or replace function da_next.touch_catalog_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := statement_timestamp();
  new.revision := old.revision + 1;
  return new;
end;
$$;

create table da_next.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (sku = btrim(sku) and length(sku) > 0),
  name text not null check (name = btrim(name) and length(name) > 0),
  brand text not null default '',
  category text not null check (category in (
    'MERCEARIA BÁSICA', 'LIMPEZA', 'LAVANDERIA', 'HIGIÊNE',
    'BELEZA', 'UTILIDADES', 'PET'
  )),
  gtin text,
  price_cents integer not null default 0 check (price_cents between 0 and 2000000000),
  stock_units integer not null default 0 check (stock_units >= 0),
  active boolean not null default false,
  photo_url text,
  valid_until date,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_gtin_format check (
    gtin is null or gtin ~ '^(?:[0-9]{8}|[0-9]{12,14})$'
  )
);

create unique index products_gtin_unique
  on da_next.products (gtin)
  where gtin is not null;
create index products_active_category_name
  on da_next.products (category, name)
  where active;

create trigger products_touch_updated_at
before update on da_next.products
for each row execute function da_next.touch_catalog_revision();

create table da_next.product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and length(name) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_types_name_casefold_unique
  on da_next.product_types (lower(name));
create index product_types_active_order
  on da_next.product_types (sort_order, name)
  where active;

create trigger product_types_touch_updated_at
before update on da_next.product_types
for each row execute function da_next.touch_catalog_revision();

create table da_next.product_type_products (
  product_type_id uuid not null references da_next.product_types(id) on delete restrict,
  product_id uuid not null references da_next.products(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (product_type_id, product_id)
);
create index product_type_products_order
  on da_next.product_type_products (product_type_id, sort_order, product_id);

create table da_next.basket_sizes (
  id text primary key check (id = btrim(id) and length(id) > 0),
  code text not null unique check (code = btrim(code) and length(code) > 0),
  name text not null check (name = btrim(name) and length(name) > 0),
  active boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  private_adjustment_cents integer not null default 0
    check (private_adjustment_cents between 0 and 2000000000),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index basket_sizes_active_order
  on da_next.basket_sizes (sort_order, id)
  where active;

create trigger basket_sizes_touch_updated_at
before update on da_next.basket_sizes
for each row execute function da_next.touch_catalog_revision();

create table da_next.basket_size_types (
  basket_size_id text not null references da_next.basket_sizes(id) on delete restrict,
  product_type_id uuid not null references da_next.product_types(id) on delete restrict,
  default_quantity integer not null check (default_quantity between 0 and 999),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (basket_size_id, product_type_id),
  unique (basket_size_id, sort_order)
);
create index basket_size_types_type
  on da_next.basket_size_types (product_type_id, basket_size_id);

insert into da_next.basket_sizes (id, code, name, active, sort_order)
values
  ('economica', 'ECONOMICA', 'Econômica', false, 1),
  ('mini', 'MINI', 'Mini', false, 2),
  ('pequena', 'PEQUENA', 'Pequena', false, 3),
  ('media', 'MEDIA', 'Média', false, 4),
  ('grande', 'GRANDE', 'Grande', false, 5);

comment on schema da_next is
  'Persistência isolada Dona Antônia V2; não adicionar à lista de schemas expostos do Data API.';
comment on column da_next.products.price_cents is
  'Preço operacional por unidade em centavos; nunca usar ponto flutuante.';
comment on column da_next.basket_sizes.private_adjustment_cents is
  'Ajuste interno não público; somente a cotação do servidor pode incorporá-lo ao total da cesta.';
