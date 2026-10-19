-- Resolve EAN captures from the admin list without exposing direct product writes.
create or replace function public.ean_capture_resolve_v1(
  p_capture_id uuid,
  p_mode text,
  p_product_id uuid default null,
  p_name text default null,
  p_ncm text default null
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_capture public.ean_capture_records_v1%rowtype;
  v_product public.products%rowtype;
  v_owner uuid;
  v_ean text;
  v_ncm text;
  v_name text;
begin
  if p_mode not in ('link','create') then
    return jsonb_build_object('ok',false,'error','modo_invalido');
  end if;
  select * into v_capture
    from public.ean_capture_records_v1
   where id=p_capture_id
   for update;
  if not found then return jsonb_build_object('ok',false,'error','leitura_nao_encontrada'); end if;
  if v_capture.sync_status <> 'not_found' then
    return jsonb_build_object('ok',false,'error','leitura_nao_esta_na_fila');
  end if;
  v_ean:=v_capture.ean;
  v_ncm:=nullif(regexp_replace(coalesce(p_ncm,''),'\D','','g'),'');
  if v_ncm is not null and v_ncm !~ '^\d{8}$' then
    return jsonb_build_object('ok',false,'error','ncm_invalido');
  end if;

  if p_mode='link' then
    if p_product_id is null then return jsonb_build_object('ok',false,'error','produto_invalido'); end if;
    select * into v_product from public.products where id=p_product_id for update;
    if not found then return jsonb_build_object('ok',false,'error','produto_nao_encontrado'); end if;
    if v_product.is_active is not true then return jsonb_build_object('ok',false,'error','produto_inativo'); end if;

    select p.id into v_owner
      from public.products p
     where regexp_replace(coalesce(p.gtin,''),'\D','','g')=v_ean and p.id<>p_product_id
     limit 1;
    if v_owner is not null then return jsonb_build_object('ok',false,'error','ean_principal_de_outro_produto'); end if;
    select pi.product_id into v_owner
      from public.product_identifiers pi
     where pi.identifier_value=v_ean and pi.status='confirmed'
       and pi.identifier_kind in ('base_gtin','package_gtin','sku_alias')
       and pi.product_id<>p_product_id
     limit 1;
    if v_owner is not null then return jsonb_build_object('ok',false,'error','ean_vinculado_a_outro_produto'); end if;

    if regexp_replace(coalesce(v_product.gtin,''),'\D','','g')<>v_ean then
      insert into public.product_identifiers(
        product_id,identifier_value,identifier_kind,source,confidence,status,metadata
      ) values (
        p_product_id,v_ean,'base_gtin','ean_capture_admin',1,'confirmed',
        jsonb_build_object('capture_id',p_capture_id,'captured_at',v_capture.created_at)
      ) on conflict do nothing;
    end if;
    update public.products
       set stock=coalesce(stock,0)+v_capture.quantity,
           ncm=coalesce(v_ncm,ncm),
           last_admin_edit_at=now(),
           last_admin_edit_by=v_capture.created_by
     where id=p_product_id
     returning * into v_product;
  else
    v_name:=nullif(btrim(coalesce(p_name,'')),'');
    if v_name is null then return jsonb_build_object('ok',false,'error','nome_obrigatorio'); end if;
    select p.id into v_owner
      from public.products p
     where regexp_replace(coalesce(p.gtin,''),'\D','','g')=v_ean
     limit 1;
    if v_owner is not null then return jsonb_build_object('ok',false,'error','ean_ja_cadastrado'); end if;
    select pi.product_id into v_owner
      from public.product_identifiers pi
     where pi.identifier_value=v_ean and pi.status='confirmed'
       and pi.identifier_kind in ('base_gtin','package_gtin','sku_alias')
     limit 1;
    if v_owner is not null then return jsonb_build_object('ok',false,'error','ean_ja_vinculado'); end if;

    insert into public.products(name,gtin,ncm,stock,is_active,source_system,sync_status,metadata)
    values(v_name,v_ean,v_ncm,0,false,'ean_capture_admin','local',
      jsonb_build_object('created_from_ean_capture',p_capture_id,'requires_admin_review',true))
    returning * into v_product;
    insert into public.product_identifiers(
      product_id,identifier_value,identifier_kind,source,confidence,status,metadata
    ) values (
      v_product.id,v_ean,'base_gtin','ean_capture_admin',1,'confirmed',
      jsonb_build_object('capture_id',p_capture_id,'captured_at',v_capture.created_at)
    ) on conflict do nothing;
  end if;

  update public.ean_capture_records_v1
     set matched_product_id=v_product.id,sync_status='found',synced_at=now(),updated_at=now()
   where id=p_capture_id
   returning * into v_capture;

  return jsonb_build_object(
    'ok',true,
    'row',jsonb_build_object(
      'id',v_capture.id,'ean',v_capture.ean,'quantity',v_capture.quantity,
      'expires_on',v_capture.expires_on,'sync_status',v_capture.sync_status,
      'matched_product_id',v_capture.matched_product_id,'photo_path',v_capture.photo_path,
      'photo_captured_at',v_capture.photo_captured_at,'created_at',v_capture.created_at,
      'updated_at',v_capture.updated_at,'synced_at',v_capture.synced_at
    ),
    'summary',public.ean_capture_stats_v1(),
    'product',jsonb_build_object('id',v_product.id,'name',v_product.name,'stock',v_product.stock,'is_active',v_product.is_active)
  );
end;
$$;

revoke all on function public.ean_capture_resolve_v1(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ean_capture_resolve_v1(uuid,text,uuid,text,text) to service_role;
comment on function public.ean_capture_resolve_v1(uuid,text,uuid,text,text)
  is 'Links an unknown captured EAN to an active product and applies captured quantity once, or creates a zero-stock inactive product.';
