create table if not exists public.storefront_builder_categories_v1 (
 id uuid primary key default gen_random_uuid(),
 category_key text not null unique check (category_key in ('mercearia','limpeza_lavanderia','higiene_beleza','casa_pet')),
 label text not null check (char_length(btrim(label)) between 2 and 80),
 sort_order integer not null default 10,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.storefront_builder_categories_v1 enable row level security;
revoke all on table public.storefront_builder_categories_v1 from public, anon, authenticated;
grant select, insert, update, delete on table public.storefront_builder_categories_v1 to service_role;
insert into public.storefront_builder_categories_v1(category_key,label,sort_order,is_active) values
('mercearia','Mercearia',10,true),('limpeza_lavanderia','Limpeza e lavanderia',20,true),
('higiene_beleza','Higiene e beleza',30,true),('casa_pet','Casa e pet',40,true)
on conflict(category_key) do nothing;
