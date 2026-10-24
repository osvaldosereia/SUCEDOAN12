-- R06 follow-up: public catalog projection and transactional CAS for admin saves.
-- The public RPC exposes only sellable fields and aggregate starting totals.
create table da_next.basket_configuration_state (
  id boolean primary key default true check (id),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
insert into da_next.basket_configuration_state (id, revision)
values (true, 1)
on conflict (id) do nothing;
alter table da_next.basket_configuration_state enable row level security;

alter function public.admin_get_basket_configuration()
  rename to admin_get_basket_configuration_legacy;

create or replace function public.admin_get_basket_configuration()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $function$
declare v_result jsonb;
begin
  select pg_catalog.jsonb_set(
    public.admin_get_basket_configuration_legacy(),
    '{revision}',
    pg_catalog.to_jsonb(state.revision),
    true
  )
  into v_result
  from da_next.basket_configuration_state state
  where state.id = true;
  return v_result;
end;
$function$;

create or replace function public.admin_save_basket_configuration(
  p_configuration jsonb,
  p_expected_revision bigint
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_current bigint;
begin
  if auth.uid() is null or not da_next.has_permission('catalog.manage') then
    raise exception using errcode = '42501', message = 'Acesso negado à configuração das cestas.';
  end if;
  select state.revision into v_current
  from da_next.basket_configuration_state state
  where state.id = true
  for update;
  if p_expected_revision is distinct from v_current then
    raise exception using errcode = '40001', message = 'BASKET_CONFIGURATION_CONFLICT';
  end if;
  -- The legacy writer remains private to this wrapper so its validated, audited
  -- write path is reused while the singleton row provides the CAS boundary.
  perform public.admin_save_basket_configuration(p_configuration);
  update da_next.basket_configuration_state
  set revision = v_current + 1, updated_at = pg_catalog.statement_timestamp()
  where id = true;
  return public.admin_get_basket_configuration();
end;
$function$;

create or replace function public.get_storefront_catalog()
returns jsonb language sql stable security definer set search_path = pg_catalog
as $function$
select pg_catalog.jsonb_build_object(
  'products', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'sku', p.sku, 'name', p.name, 'brand', p.brand, 'gtin', p.gtin,
      'category', p.category, 'priceCents', p.price_cents, 'stock', p.stock_units,
      'active', p.active, 'imageUrl', p.photo_url
    ) order by p.name, p.sku)
    from da_next.products p
    where p.active and p.stock_units > 0 and p.price_cents > 0
      and (p.valid_until is null or p.valid_until >= current_date)
  ), '[]'::jsonb),
  'types', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', t.id, 'name', t.name, 'order', t.sort_order, 'active', t.active,
      'productSkus', coalesce((
        select pg_catalog.jsonb_agg(p.sku order by link.sort_order, p.name)
        from da_next.product_type_products link
        join da_next.products p on p.id = link.product_id
        where link.product_type_id = t.id and p.active and p.stock_units > 0
          and p.price_cents > 0
          and (p.valid_until is null or p.valid_until >= current_date)
      ), '[]'::jsonb)
    ) order by t.sort_order, t.name)
    from da_next.product_types t where t.active
  ), '[]'::jsonb),
  'baskets', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', b.id, 'name', b.name, 'active', b.active, 'imageUrl', b.photo_url,
      'startingTotalCents', coalesce((
        select sum(coalesce((select min(p.price_cents)
          from da_next.product_type_products link
          join da_next.products p on p.id = link.product_id
          where link.product_type_id = line.product_type_id
            and p.active and p.stock_units > 0 and p.price_cents > 0
            and (p.valid_until is null or p.valid_until >= current_date)), 0)
          * line.default_quantity)
        from da_next.basket_size_types line
        join da_next.product_types t on t.id = line.product_type_id and t.active
        where line.basket_size_id = b.id
      ), 0) + coalesce(private.private_adjustment_cents, 0),
      'lines', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'typeId', line.product_type_id, 'defaultQuantity', line.default_quantity,
        'order', line.sort_order)
        order by line.sort_order)
        from da_next.basket_size_types line
        join da_next.product_types t on t.id = line.product_type_id and t.active
        where line.basket_size_id = b.id), '[]'::jsonb)
    ) order by b.sort_order, b.id)
    from da_next.basket_sizes b
    left join da_next.basket_size_private_pricing private
      on private.basket_size_id = b.id
    where b.active
  ), '[]'::jsonb),
  'extras', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'typeId', extra.product_type_id, 'order', extra.sort_order, 'active', extra.active)
      order by extra.sort_order)
    from da_next.basket_extra_types extra
    join da_next.product_types t on t.id = extra.product_type_id and t.active
    where extra.active
  ), '[]'::jsonb)
);
$function$;

revoke all on table da_next.basket_configuration_state from public, anon, authenticated;
revoke all on function public.admin_get_basket_configuration_legacy() from public, anon, authenticated;
revoke all on function public.admin_get_basket_configuration() from public, anon, authenticated;
revoke all on function public.admin_save_basket_configuration(jsonb) from public, anon, authenticated;
revoke all on function public.admin_save_basket_configuration(jsonb, bigint) from public, anon, authenticated;
revoke all on function public.get_storefront_catalog() from public, anon, authenticated;
grant execute on function public.admin_get_basket_configuration() to authenticated;
grant execute on function public.admin_save_basket_configuration(jsonb, bigint) to authenticated;
grant execute on function public.get_storefront_catalog() to anon, authenticated;

comment on function public.get_storefront_catalog() is
  'Safe V2 public projection: private composition and adjustments are never returned.';
