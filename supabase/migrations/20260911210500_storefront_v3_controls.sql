create table if not exists public.storefront_v3_categories (
  name text primary key,
  is_visible boolean not null default true,
  show_home boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefront_v3_categories_name_not_blank check (btrim(name) <> '')
);

alter table public.storefront_v3_categories enable row level security;

alter table public.products
  add column if not exists storefront_featured boolean not null default false;

create index if not exists products_storefront_featured_idx
  on public.products (sort_order, name)
  where storefront_featured = true and is_active = true and physically_verified = true;

with categories as (
  select distinct btrim(category) as name
  from public.products
  where category is not null and btrim(category) <> ''
), ranked as (
  select name, row_number() over (order by name) as rn
  from categories
)
insert into public.storefront_v3_categories(name,is_visible,show_home,sort_order)
select name,true,(rn <= 8),(rn * 10)::integer
from ranked
on conflict (name) do nothing;

create or replace function public.rename_storefront_v3_category(p_old text,p_new text)
returns void
language plpgsql
set search_path=''
as $$
declare
  v_old text:=btrim(coalesce(p_old,''));
  v_new text:=btrim(coalesce(p_new,''));
  v_cfg public.storefront_v3_categories%rowtype;
begin
  if v_old='' or v_new='' then raise exception 'category_name_required'; end if;
  if v_old=v_new then return; end if;
  if exists(select 1 from public.storefront_v3_categories where name=v_new) then raise exception 'category_already_exists'; end if;

  select * into v_cfg from public.storefront_v3_categories where name=v_old;
  if not found then raise exception 'category_not_found'; end if;

  insert into public.storefront_v3_categories(name,is_visible,show_home,sort_order,created_at,updated_at)
  values(v_new,v_cfg.is_visible,v_cfg.show_home,v_cfg.sort_order,v_cfg.created_at,now());

  update public.products set category=v_new,updated_at=now() where category=v_old;
  delete from public.storefront_v3_categories where name=v_old;
end;
$$;

revoke all on function public.rename_storefront_v3_category(text,text) from public,anon,authenticated;
grant execute on function public.rename_storefront_v3_category(text,text) to service_role;
