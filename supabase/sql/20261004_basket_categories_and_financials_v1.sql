create table if not exists public.basket_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint basket_categories_name_chk check (char_length(trim(name)) between 1 and 80),
  constraint basket_categories_slug_chk check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index if not exists basket_categories_name_lower_uq
  on public.basket_categories (lower(trim(name)));
create unique index if not exists basket_categories_slug_uq
  on public.basket_categories (slug);

alter table public.basket_templates
  add column if not exists category_id uuid references public.basket_categories(id) on delete set null;

create index if not exists basket_templates_category_idx
  on public.basket_templates(category_id);

alter table public.basket_categories enable row level security;
revoke all on public.basket_categories from anon, authenticated;
grant select, insert, update, delete on public.basket_categories to service_role;
