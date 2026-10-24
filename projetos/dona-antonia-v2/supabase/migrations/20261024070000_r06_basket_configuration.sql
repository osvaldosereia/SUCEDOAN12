-- R06: persistent basket sizes, product types, membership and extras.
-- Private adjustments remain in the existing private pricing table.
create table da_next.basket_extra_types (
  product_type_id uuid primary key references da_next.product_types(id) on delete restrict,
  sort_order integer not null check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table da_next.basket_sizes add column photo_url text;
alter table da_next.basket_sizes add constraint basket_sizes_photo_https
  check (photo_url is null or photo_url ~ '^https://[^[:space:]]+$');
alter table da_next.basket_extra_types enable row level security;

create or replace function public.admin_get_basket_configuration()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not da_next.has_permission('catalog.read') then
    raise exception using errcode = '42501', message = 'Acesso negado à configuração das cestas.';
  end if;
  select jsonb_build_object(
    'types', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'order', t.sort_order, 'active', t.active,
      'productSkus', coalesce((select jsonb_agg(p.sku order by link.sort_order, p.name)
        from da_next.product_type_products link join da_next.products p on p.id = link.product_id
        where link.product_type_id = t.id), '[]'::jsonb)) order by t.sort_order, t.name)
      from da_next.product_types t), '[]'::jsonb),
    'baskets', coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'code', b.code, 'name', b.name, 'order', b.sort_order, 'active', b.active,
      'revision', b.revision, 'imageUrl', b.photo_url,
      'privateAdjustmentCents', case when da_next.has_permission('admin.all') then private.private_adjustment_cents else null end,
      'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'typeId', line.product_type_id, 'defaultQuantity', line.default_quantity, 'order', line.sort_order)
        order by line.sort_order)
        from da_next.basket_size_types line where line.basket_size_id = b.id), '[]'::jsonb))
      order by b.sort_order, b.id)
      from da_next.basket_sizes b left join da_next.basket_size_private_pricing private on private.basket_size_id = b.id), '[]'::jsonb),
    'extras', coalesce((select jsonb_agg(jsonb_build_object(
      'typeId', extra.product_type_id, 'order', extra.sort_order, 'active', extra.active)
      order by extra.sort_order) from da_next.basket_extra_types extra), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.admin_save_basket_configuration(p_configuration jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_actor uuid := auth.uid();
  v_type jsonb;
  v_basket jsonb;
  v_line jsonb;
  v_ordinal bigint;
  v_extra jsonb;
  v_id uuid;
  v_basket_id text;
  v_private integer;
begin
  if v_actor is null or not da_next.has_permission('catalog.manage') then
    raise exception using errcode = '42501', message = 'Acesso negado à configuração das cestas.';
  end if;
  if jsonb_typeof(p_configuration->'types') <> 'array'
    or jsonb_typeof(p_configuration->'baskets') <> 'array'
    or jsonb_typeof(p_configuration->'extras') <> 'array' then
    raise exception using errcode = '22023', message = 'Configuração inválida.';
  end if;

  for v_type in select value from jsonb_array_elements(p_configuration->'types') loop
    v_id := (v_type->>'id')::uuid;
    if length(btrim(v_type->>'name')) not between 1 and 120 then
      raise exception using errcode = '22023', message = 'Nome de tipo inválido.';
    end if;
    insert into da_next.product_types(id, name, sort_order, active)
    values (v_id, btrim(v_type->>'name'), greatest(0, (v_type->>'order')::integer), coalesce((v_type->>'active')::boolean, true))
    on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order, active = excluded.active;
    if jsonb_typeof(v_type->'productSkus') <> 'array' then
      raise exception using errcode = '22023', message = 'Vínculos de produtos inválidos.';
    end if;
    for v_line, v_ordinal in select value, ordinality from jsonb_array_elements(v_type->'productSkus') with ordinality loop
      if not exists (select 1 from da_next.products p where p.sku = v_line#>>'{}') then
        raise exception using errcode = '22023', message = 'SKU de produto não encontrado.';
      end if;
      insert into da_next.product_type_products(product_type_id, product_id, sort_order)
      select v_id, p.id, v_ordinal::integer - 1
      from da_next.products p where p.sku = v_line#>>'{}'
      on conflict (product_type_id, product_id) do update set sort_order = excluded.sort_order;
    end loop;
    delete from da_next.product_type_products link where link.product_type_id = v_id
      and not exists (select 1 from da_next.products p where p.id = link.product_id and p.sku in
        (select value#>>'{}' from jsonb_array_elements(v_type->'productSkus')));
  end loop;

  for v_basket in select value from jsonb_array_elements(p_configuration->'baskets') loop
    v_basket_id := btrim(v_basket->>'id');
    insert into da_next.basket_sizes(id, code, name, sort_order, active, photo_url)
    values (v_basket_id, btrim(v_basket->>'code'), btrim(v_basket->>'name'), greatest(0, (v_basket->>'order')::integer), coalesce((v_basket->>'active')::boolean, false), nullif(v_basket->>'imageUrl', ''))
    on conflict (id) do update set code = excluded.code, name = excluded.name, sort_order = excluded.sort_order, active = excluded.active, photo_url = excluded.photo_url;
    if da_next.has_permission('admin.all') and v_basket ? 'privateAdjustmentCents' then
      v_private := (v_basket->>'privateAdjustmentCents')::integer;
      if v_private not between 0 and 2000000000 then raise exception using errcode = '22023', message = 'Valor interno inválido.'; end if;
      insert into da_next.basket_size_private_pricing(basket_size_id, private_adjustment_cents)
      values (v_basket_id, v_private)
      on conflict (basket_size_id) do update set private_adjustment_cents = excluded.private_adjustment_cents;
    end if;
    for v_line in select value from jsonb_array_elements(coalesce(v_basket->'lines', '[]'::jsonb)) loop
      if (v_line->>'defaultQuantity')::integer not between 0 and 999 then
        raise exception using errcode = '22023', message = 'Quantidade do tipo fora do limite.';
      end if;
      insert into da_next.basket_size_types(basket_size_id, product_type_id, default_quantity, sort_order)
      values (v_basket_id, (v_line->>'typeId')::uuid, (v_line->>'defaultQuantity')::integer, greatest(0, (v_line->>'order')::integer))
      on conflict (basket_size_id, product_type_id) do update
        set default_quantity = excluded.default_quantity, sort_order = excluded.sort_order;
    end loop;
    delete from da_next.basket_size_types line where line.basket_size_id = v_basket_id
      and not exists (select 1 from jsonb_array_elements(coalesce(v_basket->'lines', '[]'::jsonb)) x
        where (x.value->>'typeId')::uuid = line.product_type_id);
  end loop;

  for v_extra in select value from jsonb_array_elements(p_configuration->'extras') loop
    insert into da_next.basket_extra_types(product_type_id, sort_order, active)
    values ((v_extra->>'typeId')::uuid, greatest(0, (v_extra->>'order')::integer), coalesce((v_extra->>'active')::boolean, true))
    on conflict (product_type_id) do update set sort_order = excluded.sort_order, active = excluded.active;
  end loop;
  delete from da_next.basket_extra_types extra where not exists (
    select 1 from jsonb_array_elements(p_configuration->'extras') x
    where (x.value->>'typeId')::uuid = extra.product_type_id);

  update da_next.product_types set active = false
  where id not in (select (value->>'id')::uuid from jsonb_array_elements(p_configuration->'types'));
  update da_next.basket_sizes set active = false
  where id not in (select value->>'id' from jsonb_array_elements(p_configuration->'baskets'));

  insert into da_next.audit_log(actor_id, action, entity_type, entity_id, request_id, changed_fields)
  values (v_actor, 'BASKET_CONFIGURATION_UPDATED', 'BASKET_CONFIGURATION', 'catalog', gen_random_uuid(),
    jsonb_build_object('types', jsonb_array_length(p_configuration->'types'), 'baskets', jsonb_array_length(p_configuration->'baskets'), 'extras', jsonb_array_length(p_configuration->'extras')));
  return public.admin_get_basket_configuration();
end;
$function$;

revoke all on function public.admin_get_basket_configuration() from public, anon, authenticated;
revoke all on function public.admin_save_basket_configuration(jsonb) from public, anon, authenticated;
grant execute on function public.admin_get_basket_configuration() to authenticated;
grant execute on function public.admin_save_basket_configuration(jsonb) to authenticated;
