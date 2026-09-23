create table if not exists public.warehouse_gondolas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number integer not null check (number > 0 and number <= 9999),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number)
);

create table if not exists public.product_gondola_assignments (
  product_id uuid primary key references public.products(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  gondola_id uuid not null references public.warehouse_gondolas(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_balance_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  gtin text,
  previous_quantity numeric not null default 0,
  counted_quantity numeric not null check (counted_quantity >= 0),
  created_at timestamptz not null default now()
);

create index if not exists products_org_gtin_idx
  on public.products (organization_id, gtin)
  where gtin is not null;

create index if not exists product_gondola_assignments_org_gondola_idx
  on public.product_gondola_assignments (organization_id, gondola_id);

create index if not exists inventory_balance_entries_org_created_idx
  on public.inventory_balance_entries (organization_id, created_at desc);

alter table public.warehouse_gondolas enable row level security;
alter table public.product_gondola_assignments enable row level security;
alter table public.inventory_balance_entries enable row level security;

revoke all on table public.warehouse_gondolas from public, anon, authenticated;
revoke all on table public.product_gondola_assignments from public, anon, authenticated;
revoke all on table public.inventory_balance_entries from public, anon, authenticated;
grant select, insert, update, delete on table public.warehouse_gondolas to service_role;
grant select, insert, update, delete on table public.product_gondola_assignments to service_role;
grant select, insert, update, delete on table public.inventory_balance_entries to service_role;

create or replace function public.apply_inventory_count(
  p_organization_id uuid,
  p_product_id uuid,
  p_counted_quantity numeric,
  p_gtin text default null
)
returns table (
  product_id uuid,
  product_name text,
  previous_quantity numeric,
  counted_quantity numeric
)
language plpgsql
set search_path = public
as $$
declare
  v_previous numeric;
  v_name text;
begin
  if p_counted_quantity is null or p_counted_quantity < 0 then
    raise exception 'invalid_quantity';
  end if;

  select p.stock_quantity, p.name
    into v_previous, v_name
  from public.products p
  where p.organization_id = p_organization_id
    and p.id = p_product_id
  for update;

  if not found then
    raise exception 'product_not_found';
  end if;

  update public.products
  set stock_quantity = p_counted_quantity,
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_product_id;

  insert into public.inventory_balance_entries(
    organization_id, product_id, gtin, previous_quantity, counted_quantity
  ) values (
    p_organization_id, p_product_id, nullif(trim(p_gtin), ''), coalesce(v_previous,0), p_counted_quantity
  );

  return query
  select p_product_id, v_name, coalesce(v_previous,0), p_counted_quantity;
end;
$$;

revoke all on function public.apply_inventory_count(uuid,uuid,numeric,text) from public, anon, authenticated;
grant execute on function public.apply_inventory_count(uuid,uuid,numeric,text) to service_role;
