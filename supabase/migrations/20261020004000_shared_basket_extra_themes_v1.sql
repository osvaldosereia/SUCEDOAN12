-- Shared basket extras: the same ordered themes and products are offered on every basket.
begin;

create table if not exists public.basket_extra_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.basket_extra_theme_products (
  theme_id uuid not null references public.basket_extra_themes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (theme_id, product_id)
);
create index if not exists basket_extra_theme_products_product_idx
  on public.basket_extra_theme_products(product_id);

alter table public.basket_extra_themes enable row level security;
alter table public.basket_extra_theme_products enable row level security;
revoke all on public.basket_extra_themes, public.basket_extra_theme_products from public, anon, authenticated;
grant all on public.basket_extra_themes, public.basket_extra_theme_products to service_role;

create or replace function public.admin_basket_extra_themes_editor_v1()
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_themes jsonb;
begin
  if v_uid is null or not exists (
    select 1 from public.admin_users a
    where a.user_id = v_uid and a.is_active and a.role <> 'viewer'
  ) then raise exception 'admin_not_authorized'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'sort_order', t.sort_order,
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', p.id, 'name', p.name, 'sku', p.sku, 'gtin', p.gtin,
        'image_url', p.image_url, 'packaging', p.packaging, 'is_active', p.is_active
      ) order by tp.sort_order, p.name)
      from public.basket_extra_theme_products tp
      join public.products p on p.id = tp.product_id
      where tp.theme_id = t.id
    ), '[]'::jsonb)
  ) order by t.sort_order, t.created_at, t.id), '[]'::jsonb)
  into v_themes from public.basket_extra_themes t;

  return jsonb_build_object('themes', v_themes);
end;
$function$;

create or replace function public.admin_save_basket_extra_themes_v1(p_themes jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_theme jsonb;
  v_product jsonb;
  v_theme_id uuid;
  v_product_id uuid;
  v_name text;
  v_theme_order integer := 0;
  v_product_order integer;
  v_seen_themes uuid[] := array[]::uuid[];
  v_seen_products uuid[];
begin
  if v_uid is null or not exists (
    select 1 from public.admin_users a
    where a.user_id = v_uid and a.is_active and a.role <> 'viewer'
  ) then raise exception 'admin_not_authorized'; end if;
  if coalesce(jsonb_typeof(p_themes), 'null') <> 'array' then
    raise exception 'basket_extra_themes_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('basket_extra_themes_v1', 0));
  delete from public.basket_extra_themes;

  for v_theme in select value from jsonb_array_elements(p_themes) loop
    v_name := btrim(coalesce(v_theme->>'name', ''));
    if v_name = '' or char_length(v_name) > 80 then raise exception 'basket_extra_theme_name_invalid'; end if;
    if coalesce(v_theme->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'basket_extra_theme_id_invalid';
    end if;
    v_theme_id := (v_theme->>'id')::uuid;
    if v_theme_id = any(v_seen_themes) then raise exception 'basket_extra_theme_id_invalid'; end if;
    v_seen_themes := array_append(v_seen_themes, v_theme_id);
    if coalesce(jsonb_typeof(v_theme->'products'), 'array') <> 'array' then raise exception 'basket_extra_theme_products_invalid'; end if;

    insert into public.basket_extra_themes(id, name, sort_order, updated_at)
    values (v_theme_id, v_name, v_theme_order, now());
    v_seen_products := array[]::uuid[];
    v_product_order := 0;
    for v_product in select value from jsonb_array_elements(coalesce(v_theme->'products','[]'::jsonb)) loop
      if coalesce(v_product->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'basket_extra_theme_product_invalid';
      end if;
      v_product_id := (v_product->>'product_id')::uuid;
      if v_product_id = any(v_seen_products) then raise exception 'basket_extra_theme_product_duplicate'; end if;
      if not exists (select 1 from public.products p where p.id = v_product_id) then
        raise exception 'basket_extra_theme_product_not_found';
      end if;
      v_seen_products := array_append(v_seen_products, v_product_id);
      insert into public.basket_extra_theme_products(theme_id, product_id, sort_order)
      values (v_theme_id, v_product_id, v_product_order);
      v_product_order := v_product_order + 1;
    end loop;
    v_theme_order := v_theme_order + 1;
  end loop;

  return public.admin_basket_extra_themes_editor_v1();
end;
$function$;

revoke all on function public.admin_basket_extra_themes_editor_v1() from public, anon, authenticated;
grant execute on function public.admin_basket_extra_themes_editor_v1() to authenticated;
revoke all on function public.admin_save_basket_extra_themes_v1(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_basket_extra_themes_v1(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
