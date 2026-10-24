-- R05: expose the limited fiscal/supplier profile only to private.read/manage roles.
-- Imported original payloads stay private and are deliberately absent from this RPC.

create or replace function public.admin_get_product_private_profile(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_sku text;
  v_profile da_next.bling_product_profiles%rowtype;
begin
  if auth.uid() is null or not da_next.has_permission('private.read') then
    raise exception using errcode = '42501', message = 'Acesso negado aos dados fiscais e de fornecedor.';
  end if;
  select product.sku into v_sku from da_next.products as product where product.id = p_product_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Produto não encontrado.';
  end if;
  select * into v_profile from da_next.bling_product_profiles where sku = v_sku;
  if not found then
    return jsonb_build_object('sku', v_sku, 'revision', null, 'unit', 'UN');
  end if;
  return jsonb_build_object(
    'sku', v_profile.sku,
    'unit', v_profile.unit,
    'origin_code', v_profile.origin_code,
    'ncm', v_profile.ncm,
    'cest', v_profile.cest,
    'packaging_gtin', v_profile.packaging_gtin,
    'units_per_case', v_profile.units_per_case,
    'supplier_name', v_profile.supplier_name,
    'supplier_code', v_profile.supplier_code,
    'purchase_cost_exact', v_profile.purchase_cost_exact::text,
    'revision', v_profile.revision,
    'updated_at', v_profile.updated_at
  );
end;
$function$;

create or replace function public.admin_save_product_private_profile(
  p_product_id uuid,
  p_expected_revision bigint,
  p_patch jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor uuid := auth.uid();
  v_sku text;
  v_before da_next.bling_product_profiles%rowtype;
  v_profile da_next.bling_product_profiles%rowtype;
  v_cost numeric(12,4);
  v_fields jsonb;
  v_key text;
begin
  if v_actor is null or not da_next.has_permission('private.manage') then
    raise exception using errcode = '42501', message = 'Apenas administradores podem editar dados fiscais e de fornecedor.';
  end if;
  if p_request_id is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Informe os campos privados do produto.';
  end if;
  for v_key in select jsonb_object_keys(p_patch)
  loop
    if v_key not in (
      'origin_code', 'ncm', 'cest', 'packaging_gtin', 'units_per_case',
      'supplier_name', 'supplier_code', 'purchase_cost_exact'
    ) then
      raise exception using errcode = '22023', message = 'Campo privado não permitido.';
    end if;
  end loop;
  select product.sku into v_sku from da_next.products as product where product.id = p_product_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Produto não encontrado.';
  end if;

  if p_patch ? 'purchase_cost_exact' then
    v_cost := nullif(p_patch->>'purchase_cost_exact', '')::numeric;
    if v_cost is null or v_cost < 0 or v_cost > 21474836.47 then
      raise exception using errcode = '22023', message = 'Custo de compra fora do limite permitido.';
    end if;
  end if;

  select * into v_before from da_next.bling_product_profiles where sku = v_sku for update;
  if found then
    if p_expected_revision is null or v_before.revision <> p_expected_revision then
      raise exception using errcode = '40001', message = 'PROFILE_CONFLICT: ficha privada alterada por outro administrador.';
    end if;
    update da_next.bling_product_profiles as profile set
      origin_code = case when p_patch ? 'origin_code' then nullif(p_patch->>'origin_code', '') else profile.origin_code end,
      ncm = case when p_patch ? 'ncm' then nullif(p_patch->>'ncm', '') else profile.ncm end,
      cest = case when p_patch ? 'cest' then nullif(p_patch->>'cest', '') else profile.cest end,
      packaging_gtin = case when p_patch ? 'packaging_gtin' then nullif(p_patch->>'packaging_gtin', '') else profile.packaging_gtin end,
      units_per_case = case when p_patch ? 'units_per_case' then nullif(p_patch->>'units_per_case', '')::integer else profile.units_per_case end,
      supplier_name = case when p_patch ? 'supplier_name' then nullif(btrim(p_patch->>'supplier_name'), '') else profile.supplier_name end,
      supplier_code = case when p_patch ? 'supplier_code' then nullif(btrim(p_patch->>'supplier_code'), '') else profile.supplier_code end,
      purchase_cost_exact = case when p_patch ? 'purchase_cost_exact' then v_cost else profile.purchase_cost_exact end,
      purchase_cost_cents = case when p_patch ? 'purchase_cost_exact' then round(v_cost * 100)::integer else profile.purchase_cost_cents end,
      revision = profile.revision + 1
    where profile.sku = v_sku returning * into v_profile;
  else
    if p_expected_revision is not null then
      raise exception using errcode = '40001', message = 'PROFILE_CONFLICT: ficha privada não existe.';
    end if;
    insert into da_next.bling_product_profiles (
      sku, unit, origin_code, ncm, cest, packaging_gtin, units_per_case,
      supplier_name, supplier_code, purchase_cost_cents, purchase_cost_exact
    ) values (
      v_sku, 'UN', nullif(p_patch->>'origin_code', ''), nullif(p_patch->>'ncm', ''),
      nullif(p_patch->>'cest', ''), nullif(p_patch->>'packaging_gtin', ''),
      nullif(p_patch->>'units_per_case', '')::integer,
      nullif(btrim(p_patch->>'supplier_name'), ''), nullif(btrim(p_patch->>'supplier_code'), ''),
      coalesce(round(v_cost * 100)::integer, 0), coalesce(v_cost, 0)
    ) returning * into v_profile;
  end if;

  select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
  into v_fields from jsonb_object_keys(p_patch) as keys(key);
  insert into da_next.audit_log (
    actor_id, action, entity_type, entity_id, request_id, changed_fields
  ) values (
    v_actor, 'PRODUCT_PRIVATE_PROFILE_UPDATED', 'PRODUCT_PRIVATE_PROFILE', v_sku,
    p_request_id, jsonb_build_object('fields', v_fields, 'revision', v_profile.revision)
  );

  return jsonb_build_object(
    'sku', v_profile.sku,
    'unit', v_profile.unit,
    'origin_code', v_profile.origin_code,
    'ncm', v_profile.ncm,
    'cest', v_profile.cest,
    'packaging_gtin', v_profile.packaging_gtin,
    'units_per_case', v_profile.units_per_case,
    'supplier_name', v_profile.supplier_name,
    'supplier_code', v_profile.supplier_code,
    'purchase_cost_exact', v_profile.purchase_cost_exact::text,
    'revision', v_profile.revision,
    'updated_at', v_profile.updated_at
  );
end;
$function$;

revoke all on function public.admin_get_product_private_profile(uuid) from public, anon, authenticated;
revoke all on function public.admin_save_product_private_profile(uuid, bigint, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_get_product_private_profile(uuid) to authenticated;
grant execute on function public.admin_save_product_private_profile(uuid, bigint, jsonb, uuid) to authenticated;
