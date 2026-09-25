-- Supabase-only R3: transactional persistence for Admin baskets and kits.
-- SECURITY INVOKER: Edge Function calls as service_role; direct client calls remain blocked by RLS.

create or replace function public.admin_save_basket_template_v1(
  p_payload jsonb,
  p_user_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_sku text := nullif(btrim(coalesce(p_payload->>'codigo',p_payload->>'sku')),'');
  v_name text := nullif(btrim(coalesce(p_payload->>'nome',p_payload->>'name')),'');
  v_item jsonb;
  v_product uuid;
  v_code text;
  v_seen uuid[] := '{}'::uuid[];
begin
  if v_sku is null or v_name is null then raise exception 'basket_identity_required'; end if;

  insert into public.basket_templates(
    sku,name,description,image_url,base_price,is_active,sort_order,rules,updated_by,updated_at
  ) values (
    v_sku,v_name,nullif(btrim(coalesce(p_payload->>'descricao',p_payload->>'description')),''),
    nullif(btrim(coalesce(p_payload->>'imagem',p_payload->>'image_url')),''),
    greatest(0,coalesce(nullif(p_payload->>'preco','')::numeric,nullif(p_payload->>'base_price','')::numeric,0)),
    coalesce((p_payload->>'ativo')::boolean,(p_payload->>'is_active')::boolean,true),
    coalesce(nullif(p_payload->>'ordem','')::integer,0),
    jsonb_build_object(
      'legacy_id',coalesce(p_payload->>'id',v_sku),
      'admin_payload',p_payload,
      'source','supabase_admin'
    ),
    p_user_id,now()
  )
  on conflict (sku) do update set
    name=excluded.name,description=excluded.description,image_url=excluded.image_url,
    base_price=excluded.base_price,is_active=excluded.is_active,sort_order=excluded.sort_order,
    rules=excluded.rules,updated_by=excluded.updated_by,updated_at=now()
  returning id into v_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'produtos','[]'::jsonb))
  loop
    v_code := nullif(btrim(coalesce(v_item->>'codigo',v_item->>'sku',v_item->>'gtin')),'');
    if v_code is null then raise exception 'basket_item_code_required'; end if;
    select id into v_product from public.products
      where sku=v_code or gtin=v_code
      order by (sku=v_code) desc
      limit 1;
    if v_product is null then raise exception 'basket_product_not_found:%',v_code; end if;
    v_seen := array_append(v_seen,v_product);
    insert into public.basket_template_items(
      basket_id,product_id,quantity,removable,quantity_editable,min_quantity,max_quantity,
      substitution_group,pricing_rule,sort_order,updated_at
    ) values (
      v_id,v_product,greatest(0.001,coalesce(nullif(v_item->>'qtd','')::numeric,nullif(v_item->>'quantity','')::numeric,1)),
      coalesce((v_item->>'removable')::boolean,true),
      coalesce((v_item->>'quantity_editable')::boolean,true),
      greatest(0,coalesce(nullif(v_item->>'min_quantity','')::numeric,0)),
      nullif(v_item->>'max_quantity','')::numeric,
      nullif(btrim(v_item->>'substitution_group'),''),
      v_item,
      coalesce(nullif(v_item->>'ordem','')::integer,array_length(v_seen,1)-1),
      now()
    )
    on conflict (basket_id,product_id) do update set
      quantity=excluded.quantity,removable=excluded.removable,quantity_editable=excluded.quantity_editable,
      min_quantity=excluded.min_quantity,max_quantity=excluded.max_quantity,
      substitution_group=excluded.substitution_group,pricing_rule=excluded.pricing_rule,
      sort_order=excluded.sort_order,updated_at=now();
  end loop;

  delete from public.basket_template_items
   where basket_id=v_id and not(product_id=any(v_seen));
  return v_id;
end $$;

create or replace function public.admin_save_kit_template_v1(
  p_payload jsonb,
  p_user_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_legacy text := nullif(btrim(coalesce(p_payload->>'id',p_payload->>'legacy_id')),'');
  v_sku text := nullif(btrim(coalesce(p_payload->>'codigo',p_payload->>'sku',v_legacy)),'');
  v_name text := nullif(btrim(coalesce(p_payload->>'nome',p_payload->>'name')),'');
  v_item jsonb;
  v_product uuid;
  v_code text;
  v_seen uuid[] := '{}'::uuid[];
begin
  if v_legacy is null then v_legacy := coalesce(v_sku,gen_random_uuid()::text); end if;
  if v_sku is null or v_name is null then raise exception 'kit_identity_required'; end if;

  insert into public.kit_templates(
    legacy_id,sku,name,description,image_url,price,previous_price,discount_percent,
    stock_limit,stock_available,starts_on,ends_on,is_active,active_until_stock_zero,
    metadata,updated_by,updated_at
  ) values (
    v_legacy,v_sku,v_name,nullif(btrim(coalesce(p_payload->>'descricao',p_payload->>'description')),''),
    nullif(btrim(coalesce(p_payload->>'imagem',p_payload->>'image_url')),''),
    greatest(0,coalesce(nullif(p_payload->>'preco_novo','')::numeric,nullif(p_payload->>'preco','')::numeric,0)),
    nullif(p_payload->>'preco_anterior','')::numeric,
    nullif(p_payload->>'desconto_percentual','')::numeric,
    nullif(p_payload->>'limite_kits','')::integer,
    nullif(p_payload->>'estoque_disponivel','')::integer,
    nullif(p_payload->>'data_inicio','')::date,
    nullif(p_payload->>'data_fim','')::date,
    coalesce((p_payload->>'ativo')::boolean,false),
    coalesce((p_payload->>'ativo_ate_estoque_zero')::boolean,false),
    jsonb_build_object('admin_payload',p_payload,'source','supabase_admin'),
    p_user_id,now()
  )
  on conflict (legacy_id) do update set
    sku=excluded.sku,name=excluded.name,description=excluded.description,image_url=excluded.image_url,
    price=excluded.price,previous_price=excluded.previous_price,discount_percent=excluded.discount_percent,
    stock_limit=excluded.stock_limit,stock_available=excluded.stock_available,starts_on=excluded.starts_on,
    ends_on=excluded.ends_on,is_active=excluded.is_active,
    active_until_stock_zero=excluded.active_until_stock_zero,metadata=excluded.metadata,
    updated_by=excluded.updated_by,updated_at=now()
  returning id into v_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'produtos','[]'::jsonb))
  loop
    v_code := nullif(btrim(coalesce(v_item->>'codigo',v_item->>'sku',v_item->>'gtin')),'');
    if v_code is null then raise exception 'kit_item_code_required'; end if;
    select id into v_product from public.products
      where sku=v_code or gtin=v_code
      order by (sku=v_code) desc
      limit 1;
    if v_product is null then raise exception 'kit_product_not_found:%',v_code; end if;
    v_seen := array_append(v_seen,v_product);
    insert into public.kit_template_items(
      kit_id,product_id,quantity,substitute_product_codes,pricing_snapshot,sort_order,updated_at
    ) values (
      v_id,v_product,greatest(0.001,coalesce(nullif(v_item->>'qtd','')::numeric,nullif(v_item->>'quantity','')::numeric,1)),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_item->'substitutos','[]'::jsonb))),'{}'::text[]),
      v_item,array_length(v_seen,1)-1,now()
    )
    on conflict (kit_id,product_id) do update set
      quantity=excluded.quantity,substitute_product_codes=excluded.substitute_product_codes,
      pricing_snapshot=excluded.pricing_snapshot,sort_order=excluded.sort_order,updated_at=now();
  end loop;

  delete from public.kit_template_items
   where kit_id=v_id and not(product_id=any(v_seen));
  return v_id;
end $$;
