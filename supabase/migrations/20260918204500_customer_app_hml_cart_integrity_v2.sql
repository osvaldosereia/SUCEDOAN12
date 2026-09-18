create or replace function public.customer_app_hml_cart_is_safe(p_cart jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  item jsonb;
  key_name text;
  kind text;
  ref_id text;
  item_name text;
  quantity_value numeric;
  unit_price_value numeric;
  promo_value numeric;
begin
  if jsonb_typeof(p_cart) <> 'array' then
    return false;
  end if;

  if jsonb_array_length(p_cart) < 1 or jsonb_array_length(p_cart) > 100 then
    return false;
  end if;

  for item in select value from jsonb_array_elements(p_cart) as entry(value)
  loop
    if jsonb_typeof(item) <> 'object' then
      return false;
    end if;

    if not (
      item ? 'kind'
      and item ? 'refId'
      and item ? 'name'
      and item ? 'quantity'
      and item ? 'unitPriceCents'
    ) then
      return false;
    end if;

    for key_name in select jsonb_object_keys(item)
    loop
      if key_name not in (
        'kind',
        'refId',
        'name',
        'quantity',
        'unitPriceCents',
        'promoUnitPriceCents'
      ) then
        return false;
      end if;
    end loop;

    if jsonb_typeof(item->'kind') <> 'string'
      or jsonb_typeof(item->'refId') <> 'string'
      or jsonb_typeof(item->'name') <> 'string'
      or jsonb_typeof(item->'quantity') <> 'number'
      or jsonb_typeof(item->'unitPriceCents') <> 'number'
    then
      return false;
    end if;

    kind := item->>'kind';
    ref_id := item->>'refId';
    item_name := btrim(item->>'name');
    quantity_value := (item->>'quantity')::numeric;
    unit_price_value := (item->>'unitPriceCents')::numeric;

    if kind not in ('product', 'basket') then
      return false;
    end if;

    if kind = 'product' and ref_id not like 'TEST-PROD-%' then
      return false;
    end if;

    if kind = 'basket' and ref_id not like 'TEST-BASKET-%' then
      return false;
    end if;

    if item_name = '' or length(item_name) > 200 then
      return false;
    end if;

    if quantity_value % 1 <> 0
      or quantity_value < 1
      or quantity_value > 999
    then
      return false;
    end if;

    if unit_price_value % 1 <> 0
      or unit_price_value < 1
      or unit_price_value > 100000000
    then
      return false;
    end if;

    if item ? 'promoUnitPriceCents' and item->'promoUnitPriceCents' <> 'null'::jsonb then
      if jsonb_typeof(item->'promoUnitPriceCents') <> 'number' then
        return false;
      end if;

      promo_value := (item->>'promoUnitPriceCents')::numeric;
      if promo_value % 1 <> 0
        or promo_value < 1
        or promo_value >= unit_price_value
      then
        return false;
      end if;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function public.customer_app_hml_cart_total_cents(p_cart jsonb)
returns bigint
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  item jsonb;
  quantity_value bigint;
  unit_price_value bigint;
  effective_price_value bigint;
  total_value bigint := 0;
begin
  if not public.customer_app_hml_cart_is_safe(p_cart) then
    return null;
  end if;

  for item in select value from jsonb_array_elements(p_cart) as entry(value)
  loop
    quantity_value := (item->>'quantity')::bigint;
    unit_price_value := (item->>'unitPriceCents')::bigint;
    effective_price_value := unit_price_value;

    if item ? 'promoUnitPriceCents' and item->'promoUnitPriceCents' <> 'null'::jsonb then
      effective_price_value := (item->>'promoUnitPriceCents')::bigint;
    end if;

    total_value := total_value + (quantity_value * effective_price_value);
    if total_value > 100000000 then
      return null;
    end if;
  end loop;

  return total_value;
exception
  when others then
    return null;
end;
$$;

revoke all on function public.customer_app_hml_cart_is_safe(jsonb)
  from public, anon, authenticated;
revoke all on function public.customer_app_hml_cart_total_cents(jsonb)
  from public, anon, authenticated;

grant execute on function public.customer_app_hml_cart_is_safe(jsonb)
  to service_role;
grant execute on function public.customer_app_hml_cart_total_cents(jsonb)
  to service_role;

alter table public.customer_app_hml_orders
  add constraint customer_app_hml_orders_cart_safe_v2
  check (public.customer_app_hml_cart_is_safe(cart));

alter table public.customer_app_hml_orders
  add constraint customer_app_hml_orders_total_matches_cart_v2
  check (
    total_cents = public.customer_app_hml_cart_total_cents(cart)
  );

alter table public.customer_app_hml_config
  add constraint customer_app_hml_config_hard_off_v2
  check (enabled = false);
