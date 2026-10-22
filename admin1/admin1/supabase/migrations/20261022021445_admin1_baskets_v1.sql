create table if not exists public.admin1_baskets (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (length(btrim(sku)) between 1 and 80),
  name text not null check (length(btrim(name)) between 1 and 180),
  description text,
  image_url text,
  price_cents bigint not null default 0 check (price_cents >= 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin1_basket_items (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid not null references public.admin1_baskets(id) on delete cascade,
  product_id uuid not null references public.admin1_products(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (basket_id, product_id)
);

create index if not exists admin1_baskets_active_name_idx
  on public.admin1_baskets (is_active, name);
create index if not exists admin1_basket_items_basket_order_idx
  on public.admin1_basket_items (basket_id, sort_order, id);
create index if not exists admin1_basket_items_product_idx
  on public.admin1_basket_items (product_id);

alter table public.admin1_baskets enable row level security;
alter table public.admin1_basket_items enable row level security;

drop policy if exists "Admin1 baskets development access" on public.admin1_baskets;
create policy "Admin1 baskets development access" on public.admin1_baskets
  for all to anon, authenticated using (true) with check (true);
drop policy if exists "Admin1 basket items development access" on public.admin1_basket_items;
create policy "Admin1 basket items development access" on public.admin1_basket_items
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.admin1_baskets, public.admin1_basket_items to anon, authenticated;

create or replace function public.admin1_deactivate_baskets_for_unavailable_product_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.is_active is distinct from old.is_active
    or new.stock_quantity is distinct from old.stock_quantity then
    if new.is_active is not true or new.stock_quantity <= 0 then
      update public.admin1_baskets b
      set is_active = false, updated_at = now()
      where b.is_active and exists (
        select 1 from public.admin1_basket_items bi
        where bi.basket_id = b.id and bi.product_id = new.id
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists admin1_deactivate_baskets_for_unavailable_product_v1 on public.admin1_products;
create trigger admin1_deactivate_baskets_for_unavailable_product_v1
after update of is_active, stock_quantity on public.admin1_products
for each row execute function public.admin1_deactivate_baskets_for_unavailable_product_v1();
