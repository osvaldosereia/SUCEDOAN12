create table if not exists public.basket_subcategories (
 id uuid primary key default gen_random_uuid(),
 category_id uuid not null references public.basket_categories(id) on delete cascade,
 name text not null,
 sort_order integer not null default 0,
 is_active boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint basket_subcategories_name_nonempty check (length(btrim(name)) between 1 and 80),
 constraint basket_subcategories_category_name_key unique (category_id, name)
);
alter table public.basket_subcategories enable row level security;
revoke all on public.basket_subcategories from public, anon, authenticated;
grant select, insert, update, delete on public.basket_subcategories to service_role;