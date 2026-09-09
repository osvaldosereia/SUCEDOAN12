begin;

create or replace function public.normalize_product_identity_v1(p_text text)
returns text
language sql
immutable
security invoker
set search_path=''
as $$
  select regexp_replace(
    translate(lower(coalesce(p_text,'')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+','','g'
  );
$$;

create or replace function public.get_whatsapp_basket_reconciliation_candidates_v1(
  p_basket_id uuid default null,
  p_limit_per_item integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit_per_item,5),10));
  v_result jsonb;
begin
  with legacy_items as (
    select bti.id basket_item_id,bt.id basket_id,bt.name basket_name,p.id legacy_product_id,p.name legacy_name,p.brand legacy_brand,p.packaging legacy_packaging,p.sku legacy_sku,p.gtin legacy_gtin,p.bling_product_id legacy_bling_product_id,
      public.normalize_product_identity_v1(p.name) legacy_name_norm,
      public.normalize_product_identity_v1(p.brand) legacy_brand_norm,
      public.normalize_product_identity_v1(p.packaging) legacy_packaging_norm
    from public.basket_template_items bti
    join public.basket_templates bt on bt.id=bti.basket_id
    join public.products p on p.id=bti.product_id
    where bt.is_active and bt.is_whatsapp_active
      and (p_basket_id is null or bt.id=p_basket_id)
      and not (coalesce(p.is_active,false) and coalesce(p.physically_verified,false))
  ), active_candidates as (
    select p.id,p.name,p.brand,p.packaging,p.sku,p.gtin,p.bling_product_id,p.stock,p.is_whatsapp_active,
      public.normalize_product_identity_v1(p.name) name_norm,
      public.normalize_product_identity_v1(p.brand) brand_norm,
      public.normalize_product_identity_v1(p.packaging) packaging_norm
    from public.products p
    where p.is_active and p.physically_verified
  ), scored as (
    select l.*,a.id candidate_product_id,a.name candidate_name,a.brand candidate_brand,a.packaging candidate_packaging,a.sku candidate_sku,a.gtin candidate_gtin,a.bling_product_id candidate_bling_product_id,a.stock candidate_stock,a.is_whatsapp_active candidate_whatsapp_active,
      case
        when nullif(trim(l.legacy_gtin),'') is not null and l.legacy_gtin=a.gtin then 100
        when nullif(trim(l.legacy_sku),'') is not null and l.legacy_sku=a.sku then 98
        when l.legacy_bling_product_id is not null and l.legacy_bling_product_id=a.bling_product_id then 97
        when l.legacy_name_norm=a.name_norm and l.legacy_brand_norm<>'' and l.legacy_brand_norm=a.brand_norm and l.legacy_packaging_norm<>'' and l.legacy_packaging_norm=a.packaging_norm then 95
        when l.legacy_name_norm=a.name_norm and l.legacy_brand_norm<>'' and l.legacy_brand_norm=a.brand_norm then 90
        when l.legacy_name_norm=a.name_norm then 85
        when l.legacy_brand_norm<>'' and l.legacy_brand_norm=a.brand_norm and l.legacy_packaging_norm<>'' and l.legacy_packaging_norm=a.packaging_norm and (a.name_norm like '%'||l.legacy_brand_norm||'%' or l.legacy_name_norm like '%'||a.brand_norm||'%') then 70
        else 0 end confidence,
      case
        when nullif(trim(l.legacy_gtin),'') is not null and l.legacy_gtin=a.gtin then 'gtin_exact'
        when nullif(trim(l.legacy_sku),'') is not null and l.legacy_sku=a.sku then 'sku_exact'
        when l.legacy_bling_product_id is not null and l.legacy_bling_product_id=a.bling_product_id then 'bling_product_id_exact'
        when l.legacy_name_norm=a.name_norm and l.legacy_brand_norm<>'' and l.legacy_brand_norm=a.brand_norm and l.legacy_packaging_norm<>'' and l.legacy_packaging_norm=a.packaging_norm then 'name_brand_packaging_exact_normalized'
        when l.legacy_name_norm=a.name_norm and l.legacy_brand_norm<>'' and l.legacy_brand_norm=a.brand_norm then 'name_brand_exact_normalized'
        when l.legacy_name_norm=a.name_norm then 'name_exact_normalized'
        when l.legacy_brand_norm<>'' and l.legacy_brand_norm=a.brand_norm and l.legacy_packaging_norm<>'' and l.legacy_packaging_norm=a.packaging_norm and (a.name_norm like '%'||l.legacy_brand_norm||'%' or l.legacy_name_norm like '%'||a.brand_norm||'%') then 'brand_packaging_candidate'
        else null end match_reason
    from legacy_items l cross join active_candidates a
  ), ranked as (
    select *,row_number() over(partition by basket_item_id order by confidence desc,candidate_whatsapp_active desc,candidate_stock desc nulls last,candidate_name) rn,
      count(*) filter(where confidence>=85) over(partition by basket_item_id) high_confidence_count
    from scored where confidence>0
  ), grouped as (
    select l.basket_item_id,l.basket_id,l.basket_name,l.legacy_product_id,l.legacy_name,l.legacy_brand,l.legacy_packaging,l.legacy_sku,l.legacy_gtin,l.legacy_bling_product_id,
      coalesce(jsonb_agg(jsonb_build_object('product_id',r.candidate_product_id,'name',r.candidate_name,'brand',r.candidate_brand,'packaging',r.candidate_packaging,'sku',r.candidate_sku,'gtin',r.candidate_gtin,'bling_product_id',r.candidate_bling_product_id,'stock',r.candidate_stock,'is_whatsapp_active',r.candidate_whatsapp_active,'confidence',r.confidence,'match_reason',r.match_reason,'auto_apply_allowed',false) order by r.rn) filter(where r.rn<=v_limit),'[]'::jsonb) candidates,
      coalesce(max(r.confidence),0) best_confidence,coalesce(max(r.high_confidence_count),0) high_confidence_count
    from legacy_items l left join ranked r on r.basket_item_id=l.basket_item_id and r.rn<=v_limit
    group by l.basket_item_id,l.basket_id,l.basket_name,l.legacy_product_id,l.legacy_name,l.legacy_brand,l.legacy_packaging,l.legacy_sku,l.legacy_gtin,l.legacy_bling_product_id
  )
  select jsonb_build_object(
    'policy',jsonb_build_object('read_only',true,'auto_apply_allowed',false,'stable_identifier_required_for_automatic_reconciliation',true,'normalized_name_candidates_require_review',true),
    'summary',jsonb_build_object('legacy_items',count(*),'items_with_candidates',count(*) filter(where jsonb_array_length(candidates)>0),'items_without_candidates',count(*) filter(where jsonb_array_length(candidates)=0),'items_with_unique_high_confidence_candidate',count(*) filter(where best_confidence>=85 and high_confidence_count=1)),
    'items',coalesce(jsonb_agg(jsonb_build_object('basket_item_id',basket_item_id,'basket_id',basket_id,'basket_name',basket_name,'legacy_product_id',legacy_product_id,'legacy_name',legacy_name,'legacy_brand',legacy_brand,'legacy_packaging',legacy_packaging,'legacy_sku',legacy_sku,'legacy_gtin',legacy_gtin,'legacy_bling_product_id',legacy_bling_product_id,'best_confidence',best_confidence,'high_confidence_count',high_confidence_count,'candidates',candidates) order by basket_name,legacy_name),'[]'::jsonb)
  ) into v_result from grouped;
  return coalesce(v_result,jsonb_build_object('policy',jsonb_build_object('read_only',true),'summary',jsonb_build_object('legacy_items',0),'items','[]'::jsonb));
end;
$$;

revoke all on function public.normalize_product_identity_v1(text) from public,anon,authenticated;
revoke all on function public.get_whatsapp_basket_reconciliation_candidates_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.normalize_product_identity_v1(text) to service_role;
grant execute on function public.get_whatsapp_basket_reconciliation_candidates_v1(uuid,integer) to service_role;

commit;
