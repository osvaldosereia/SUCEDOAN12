-- R05: authenticated product catalog operations remain behind narrow public RPCs.
-- da_next stays private and is never added to Supabase's exposed schemas.

create or replace function public.admin_list_products(
  p_search text default null,
  p_category text default null,
  p_status text default 'todos',
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_status text := coalesce(p_status, 'todos');
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_items jsonb;
begin
  if auth.uid() is null or not da_next.has_permission('catalog.read') then
    raise exception using errcode = '42501', message = 'Acesso negado ao catálogo.';
  end if;
  if v_status not in ('todos', 'ativos', 'inativos', 'zerados') then
    raise exception using errcode = '22023', message = 'Filtro de situação inválido.';
  end if;
  if p_category is not null and p_category not in (
    'MERCEARIA BÁSICA', 'LIMPEZA', 'LAVANDERIA', 'HIGIÊNE', 'BELEZA', 'UTILIDADES', 'PET'
  ) then
    raise exception using errcode = '22023', message = 'Categoria inválida.';
  end if;

  select count(*)
  into v_total
  from da_next.products as product
  where (p_category is null or product.category = p_category)
    and case v_status
      when 'ativos' then product.active
      when 'inativos' then not product.active
      when 'zerados' then product.stock_units = 0
      else true
    end
    and (v_search = '' or strpos(
      lower(concat_ws(' ', product.sku, product.name, product.brand, product.gtin)), v_search
    ) > 0);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'sku', page.sku,
        'name', page.name,
        'brand', page.brand,
        'category', page.category,
        'gtin', page.gtin,
        'price_cents', page.price_cents,
        'stock_units', page.stock_units,
        'active', page.active,
        'photo_url', page.photo_url,
        'valid_until', page.valid_until,
        'revision', page.revision,
        'updated_at', page.updated_at
      ) order by page.name, page.sku
    ), '[]'::jsonb
  )
  into v_items
  from (
    select product.id, product.sku, product.name, product.brand, product.category,
      product.gtin, product.price_cents, product.stock_units, product.active,
      product.photo_url, product.valid_until, product.revision, product.updated_at
    from da_next.products as product
    where (p_category is null or product.category = p_category)
      and case v_status
        when 'ativos' then product.active
        when 'inativos' then not product.active
        when 'zerados' then product.stock_units = 0
        else true
      end
      and (v_search = '' or strpos(
        lower(concat_ws(' ', product.sku, product.name, product.brand, product.gtin)), v_search
      ) > 0)
    order by product.name, product.sku
    limit v_limit offset v_offset
  ) as page;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$function$;

create or replace function public.admin_save_product(
  p_product_id uuid,
  p_expected_revision bigint,
  p_patch jsonb,
  p_request_id uuid,
  p_stock_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor uuid := auth.uid();
  v_before da_next.products%rowtype;
  v_product da_next.products%rowtype;
  v_existing_movement da_next.product_stock_movements%rowtype;
  v_stock_delta integer;
  v_fields jsonb;
  v_result jsonb;
  v_key text;
begin
  if v_actor is null or not da_next.has_permission('catalog.manage') then
    raise exception using errcode = '42501', message = 'Acesso negado para editar produtos.';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Informe os campos do produto.';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Identificador da operação ausente.';
  end if;
  for v_key in select jsonb_object_keys(p_patch)
  loop
    if v_key not in (
      'sku', 'name', 'brand', 'category', 'gtin', 'price_cents', 'stock_units',
      'active', 'photo_url', 'valid_until'
    ) then
      raise exception using errcode = '22023', message = 'Campo de produto não permitido.';
    end if;
  end loop;
  if p_product_id is null then
    if p_expected_revision is not null or not (p_patch ? 'sku' and p_patch ? 'name' and p_patch ? 'category') then
      raise exception using errcode = '22023', message = 'Cadastro inicial incompleto.';
    end if;
    insert into da_next.products (
      sku, name, brand, category, gtin, price_cents, stock_units, active, photo_url, valid_until
    ) values (
      p_patch->>'sku', p_patch->>'name', coalesce(p_patch->>'brand', ''), p_patch->>'category',
      nullif(p_patch->>'gtin', ''), coalesce((p_patch->>'price_cents')::integer, 0),
      coalesce((p_patch->>'stock_units')::integer, 0), coalesce((p_patch->>'active')::boolean, false),
      nullif(p_patch->>'photo_url', ''), nullif(p_patch->>'valid_until', '')::date
    ) returning * into v_product;

    if v_product.stock_units > 0 then
      if length(btrim(coalesce(p_stock_note, ''))) < 3 then
        raise exception using errcode = '22023', message = 'Informe o motivo do estoque inicial.';
      end if;
      insert into da_next.product_stock_movements (
        product_id, delta_units, reason, idempotency_key, actor_id, note
      ) values (
        v_product.id, v_product.stock_units, 'AJUSTE_MANUAL', p_request_id::text,
        v_actor, btrim(p_stock_note)
      );
    end if;
    v_fields := jsonb_build_object('fields', jsonb_build_array(
      'sku', 'name', 'brand', 'category', 'gtin', 'price_cents', 'stock_units',
      'active', 'photo_url', 'valid_until'
    ));
  else
    if p_patch ? 'stock_units' then
      select * into v_existing_movement
      from da_next.product_stock_movements
      where idempotency_key = p_request_id::text;
      if found then
        if v_existing_movement.product_id <> p_product_id then
          raise exception using errcode = '23505', message = 'Chave de ajuste já utilizada.';
        end if;
        select * into v_product from da_next.products where id = p_product_id;
        return jsonb_build_object(
          'id', v_product.id, 'sku', v_product.sku, 'name', v_product.name, 'brand', v_product.brand,
          'category', v_product.category, 'gtin', v_product.gtin, 'price_cents', v_product.price_cents,
          'stock_units', v_product.stock_units, 'active', v_product.active, 'photo_url', v_product.photo_url,
          'valid_until', v_product.valid_until, 'revision', v_product.revision, 'updated_at', v_product.updated_at
        );
      end if;
    end if;

    select * into v_before from da_next.products where id = p_product_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Produto não encontrado.';
    end if;
    if p_expected_revision is null or v_before.revision <> p_expected_revision then
      raise exception using errcode = '40001', message = 'CATALOG_CONFLICT: produto alterado por outro operador.';
    end if;
    if p_patch ? 'stock_units'
      and (p_patch->>'stock_units')::integer <> v_before.stock_units
      and length(btrim(coalesce(p_stock_note, ''))) < 3 then
      raise exception using errcode = '22023', message = 'Informe o motivo do ajuste de estoque.';
    end if;

    update da_next.products as product set
      sku = case when p_patch ? 'sku' then p_patch->>'sku' else product.sku end,
      name = case when p_patch ? 'name' then p_patch->>'name' else product.name end,
      brand = case when p_patch ? 'brand' then p_patch->>'brand' else product.brand end,
      category = case when p_patch ? 'category' then p_patch->>'category' else product.category end,
      gtin = case when p_patch ? 'gtin' then nullif(p_patch->>'gtin', '') else product.gtin end,
      price_cents = case when p_patch ? 'price_cents' then (p_patch->>'price_cents')::integer else product.price_cents end,
      stock_units = case when p_patch ? 'stock_units' then (p_patch->>'stock_units')::integer else product.stock_units end,
      active = case when p_patch ? 'active' then (p_patch->>'active')::boolean else product.active end,
      photo_url = case when p_patch ? 'photo_url' then nullif(p_patch->>'photo_url', '') else product.photo_url end,
      valid_until = case when p_patch ? 'valid_until' then nullif(p_patch->>'valid_until', '')::date else product.valid_until end
    where product.id = p_product_id
    returning * into v_product;

    v_stock_delta := v_product.stock_units - v_before.stock_units;
    if v_stock_delta <> 0 then
      insert into da_next.product_stock_movements (
        product_id, delta_units, reason, idempotency_key, actor_id, note
      ) values (
        v_product.id, v_stock_delta, 'AJUSTE_MANUAL', p_request_id::text,
        v_actor, btrim(p_stock_note)
      );
    end if;
    select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
    into v_fields from jsonb_object_keys(p_patch) as keys(key);
    v_fields := jsonb_build_object(
      'fields', v_fields, 'revision_before', v_before.revision,
      'revision_after', v_product.revision,
      'stock_delta', case when v_stock_delta = 0 then null else v_stock_delta end
    );
  end if;

  insert into da_next.audit_log (
    actor_id, action, entity_type, entity_id, request_id, changed_fields
  ) values (
    v_actor, case when p_product_id is null then 'PRODUCT_CREATED' else 'PRODUCT_UPDATED' end,
    'PRODUCT', v_product.id::text, p_request_id, v_fields
  );

  v_result := jsonb_build_object(
    'id', v_product.id, 'sku', v_product.sku, 'name', v_product.name, 'brand', v_product.brand,
    'category', v_product.category, 'gtin', v_product.gtin, 'price_cents', v_product.price_cents,
    'stock_units', v_product.stock_units, 'active', v_product.active, 'photo_url', v_product.photo_url,
    'valid_until', v_product.valid_until, 'revision', v_product.revision, 'updated_at', v_product.updated_at
  );
  return v_result;
end;
$function$;

create or replace function public.admin_list_product_stock_movements(
  p_product_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_items jsonb;
begin
  if auth.uid() is null or not da_next.has_permission('inventory.read') then
    raise exception using errcode = '42501', message = 'Acesso negado ao histórico de estoque.';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', movement.id, 'delta_units', movement.delta_units,
      'reason', movement.reason, 'note', movement.note, 'created_at', movement.created_at
    ) order by movement.created_at desc, movement.id desc
  ), '[]'::jsonb)
  into v_items
  from (
    select id, delta_units, reason, note, created_at
    from da_next.product_stock_movements
    where product_id = p_product_id
    order by created_at desc, id desc
    limit v_limit
  ) as movement;
  return v_items;
end;
$function$;

revoke all on function public.admin_list_products(text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_save_product(uuid, bigint, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_list_product_stock_movements(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_list_products(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_save_product(uuid, bigint, jsonb, uuid, text) to authenticated;
grant execute on function public.admin_list_product_stock_movements(uuid, integer) to authenticated;
