-- Applies only when an admin explicitly links or creates from a Ler EAN capture.
-- In both cases, stock is set to the captured quantity; created products remain inactive.
CREATE OR REPLACE FUNCTION public.ean_capture_resolve_v2(p_capture_id uuid, p_mode text, p_product_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_ncm text DEFAULT NULL::text, p_attributes jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_capture public.ean_capture_records_v1%rowtype;
  v_product public.products%rowtype;
  v_owner uuid;
  v_ean text;
  v_ncm text;
  v_name text;
  v_attrs jsonb := coalesce(p_attributes,'{}'::jsonb);
  v_cest text;
  v_brand text;
  v_category text;
  v_description text;
  v_image text;
begin
  if p_mode not in ('link','create') then
    return jsonb_build_object('ok',false,'error','modo_invalido');
  end if;
  select * into v_capture from public.ean_capture_records_v1 where id=p_capture_id for update;
  if not found then return jsonb_build_object('ok',false,'error','leitura_nao_encontrada'); end if;
  if v_capture.sync_status <> 'not_found' then
    return jsonb_build_object('ok',false,'error','leitura_nao_esta_na_fila');
  end if;
  v_ean:=v_capture.ean;
  v_ncm:=nullif(regexp_replace(coalesce(p_ncm,''),'[^0-9]','','g'),'');
  if v_ncm is not null and v_ncm !~ '^[0-9]{8}$' then
    return jsonb_build_object('ok',false,'error','ncm_invalido');
  end if;
  if p_mode='link' then
    if p_product_id is null then return jsonb_build_object('ok',false,'error','produto_invalido'); end if;
    select * into v_product from public.products where id=p_product_id for update;
    if not found then return jsonb_build_object('ok',false,'error','produto_nao_encontrado'); end if;
    if v_product.is_active is not true then return jsonb_build_object('ok',false,'error','produto_inativo'); end if;
    select p.id into v_owner from public.products p
      where regexp_replace(coalesce(p.gtin,''),'[^0-9]','','g')=v_ean and p.id<>p_product_id limit 1;
    if v_owner is not null then return jsonb_build_object('ok',false,'error','ean_principal_de_outro_produto'); end if;
    select pi.product_id into v_owner from public.product_identifiers pi
      where pi.identifier_value=v_ean and pi.status='confirmed'
        and pi.identifier_kind in ('base_gtin','package_gtin','sku_alias') and pi.product_id<>p_product_id limit 1;
    if v_owner is not null then return jsonb_build_object('ok',false,'error','ean_vinculado_a_outro_produto'); end if;
    if regexp_replace(coalesce(v_product.gtin,''),'[^0-9]','','g')<>v_ean then
      insert into public.product_identifiers(product_id,identifier_value,identifier_kind,source,confidence,status,metadata)
      values(p_product_id,v_ean,'base_gtin','ean_capture_admin',1,'confirmed',
        jsonb_build_object('capture_id',p_capture_id,'captured_at',v_capture.created_at)) on conflict do nothing;
    end if;
    update public.products set stock=v_capture.quantity,
      ncm=coalesce(v_ncm,ncm),last_admin_edit_at=now(),last_admin_edit_by=v_capture.created_by
      where id=p_product_id returning * into v_product;
  else
    v_name:=nullif(btrim(coalesce(p_name,v_attrs->>'name','')),'');
    if v_name is null then return jsonb_build_object('ok',false,'error','nome_obrigatorio'); end if;
    if length(v_name)>180 then return jsonb_build_object('ok',false,'error','nome_invalido'); end if;
    select p.id into v_owner from public.products p
      where regexp_replace(coalesce(p.gtin,''),'[^0-9]','','g')=v_ean limit 1;
    if v_owner is not null then return jsonb_build_object('ok',false,'error','ean_ja_cadastrado'); end if;
    select pi.product_id into v_owner from public.product_identifiers pi
      where pi.identifier_value=v_ean and pi.status='confirmed'
        and pi.identifier_kind in ('base_gtin','package_gtin','sku_alias') limit 1;
    if v_owner is not null then return jsonb_build_object('ok',false,'error','ean_ja_vinculado'); end if;
    v_cest:=nullif(regexp_replace(coalesce(v_attrs->>'cest',''),'[^0-9]','','g'),'');
    if v_cest is not null and v_cest !~ '^[0-9]{7}$' then
      return jsonb_build_object('ok',false,'error','cest_invalido');
    end if;
    v_brand:=left(nullif(btrim(v_attrs->>'brand'),''),100);
    v_category:=left(nullif(btrim(v_attrs->>'category'),''),160);
    v_description:=left(nullif(btrim(v_attrs->>'description'),''),1000);
    v_image:=nullif(v_attrs->>'image_url','');
    if v_image !~ '^https://cdn-cosmos[.]bluesoft[.]com[.]br/' then v_image:=null; end if;
    insert into public.products(
      name,gtin,ncm,stock,is_active,source_system,sync_status,metadata,
      brand,category,description_short,description_long,image_url,image_original_url,
      image_source_url,image_source_origin
    ) values(
      v_name,v_ean,v_ncm,v_capture.quantity,false,'ean_capture_admin','local',
      jsonb_build_object(
        'created_from_ean_capture',p_capture_id,'requires_admin_review',true,
        'cest',v_cest,'cosmos_gpc',left(coalesce(v_attrs->>'gpc',''),40),
        'cosmos_net_weight_raw',v_attrs->'net_weight_raw',
        'cosmos_gross_weight_raw',v_attrs->'gross_weight_raw',
        'cosmos_researched_at',v_attrs->>'researched_at'
      ),
      v_brand,v_category,v_description,v_description,v_image,v_image,v_image,
      case when v_image is not null then 'cosmos' else null end
    ) returning * into v_product;
    insert into public.product_identifiers(product_id,identifier_value,identifier_kind,source,confidence,status,metadata)
      values(v_product.id,v_ean,'base_gtin','ean_capture_admin',1,'confirmed',
        jsonb_build_object('capture_id',p_capture_id,'captured_at',v_capture.created_at)) on conflict do nothing;
  end if;
  update public.ean_capture_records_v1 set matched_product_id=v_product.id,sync_status='found',synced_at=now(),updated_at=now()
    where id=p_capture_id returning * into v_capture;
  return jsonb_build_object('ok',true,
    'row',jsonb_build_object('id',v_capture.id,'ean',v_capture.ean,'quantity',v_capture.quantity,
      'expires_on',v_capture.expires_on,'sync_status',v_capture.sync_status,'matched_product_id',v_capture.matched_product_id,
      'photo_path',v_capture.photo_path,'photo_captured_at',v_capture.photo_captured_at,'created_at',v_capture.created_at,
      'updated_at',v_capture.updated_at,'synced_at',v_capture.synced_at),
    'summary',public.ean_capture_stats_v1(),
    'product',jsonb_build_object('id',v_product.id,'name',v_product.name,'stock',v_product.stock,'is_active',v_product.is_active));
end;
$function$
;
