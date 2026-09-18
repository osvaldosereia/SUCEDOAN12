-- CM-1.6 Product Marketing Profile v1
-- Deterministic readiness first; enrichment-only fields live separately from operational product data.

create table if not exists public.product_marketing_profiles (
  product_id uuid primary key references public.products(id) on delete cascade,
  product_line text,
  attributes jsonb not null default '{}'::jsonb,
  benefits text[] not null default '{}'::text[],
  commercial_role text,
  replenishment_type text,
  creative_angles text[] not null default '{}'::text[],
  relation_candidates jsonb not null default '[]'::jsonb,
  enrichment_status text not null default 'pending'
    check (enrichment_status in ('pending','deterministic','enriched','review_required','approved')),
  enrichment_source text not null default 'deterministic',
  enrichment_confidence numeric(5,4) not null default 0
    check (enrichment_confidence between 0 and 1),
  profile_version text not null default 'cm1.6-v1',
  evidence jsonb not null default '{}'::jsonb,
  updated_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(attributes)='object'),
  check (jsonb_typeof(relation_candidates)='array'),
  check (jsonb_typeof(evidence)='object')
);

alter table public.product_marketing_profiles enable row level security;
revoke all on table public.product_marketing_profiles from public,anon,authenticated;
grant select,insert,update,delete on table public.product_marketing_profiles to service_role;

create or replace view public.product_marketing_readiness_v1
with (security_invoker=true)
as
with repurchase as (
  select
    s.product_id,
    round(avg(
      case
        when s.purchase_count>1
         and s.first_purchase_at is not null
         and s.last_purchase_at is not null
        then extract(epoch from (s.last_purchase_at-s.first_purchase_at))/86400/nullif(s.purchase_count-1,0)
        else null
      end
    )::numeric,2) as avg_repurchase_days,
    sum(s.purchase_count)::bigint as known_purchase_count
  from public.customer_product_stats s
  group by s.product_id
),
base as (
  select
    p.id as product_id,
    p.name,
    p.brand,
    coalesce(
      nullif(trim(p.customer_category),''),
      nullif(trim(p.storefront_category),''),
      nullif(trim(p.category),''),
      nullif(trim(p.sales_category),'')
    ) as marketing_category,
    coalesce(nullif(trim(p.customer_subcategory),''),nullif(trim(p.subcategory),'')) as marketing_subcategory,
    coalesce(nullif(trim(p.customer_subsubcategory),''),nullif(trim(p.subsubcategory),'')) as marketing_subsubcategory,
    p.sales_category,
    p.packaging,
    p.tags,
    p.price,
    p.cost,
    p.stock,
    p.min_stock,
    p.is_offer,
    p.offer_price,
    p.storefront_featured,
    p.is_upsell,
    p.is_active,
    p.desired_bling_status,
    coalesce(nullif(p.image_ai_url,''),nullif(p.image_url,''),nullif(p.image_original_url,''),nullif(p.image_source_url,'')) as best_image,
    case
      when p.is_offer and coalesce(p.offer_price,0)>0 and p.offer_price<p.price then p.offer_price
      else p.price
    end as effective_price,
    mp.product_line,
    mp.attributes,
    mp.benefits,
    mp.commercial_role as commercial_role_override,
    mp.replenishment_type as replenishment_type_override,
    mp.creative_angles as creative_angles_override,
    mp.relation_candidates,
    mp.enrichment_status,
    mp.enrichment_source,
    mp.enrichment_confidence,
    mp.profile_version,
    mp.evidence as profile_evidence,
    r.avg_repurchase_days,
    coalesce(r.known_purchase_count,0) as known_purchase_count
  from public.products p
  left join public.product_marketing_profiles mp on mp.product_id=p.id
  left join repurchase r on r.product_id=p.id
),
scored as (
  select
    b.*,
    case
      when coalesce(b.cost,0)>0 and coalesce(b.effective_price,0)>0
      then round((((b.effective_price-b.cost)/b.effective_price)*100)::numeric,2)
      else null
    end as margin_percent,
    percent_rank() over(
      partition by coalesce(b.marketing_category,'__uncategorized__')
      order by b.effective_price nulls last
    ) as category_price_percentile
  from base b
),
ready as (
  select
    s.*,
    (s.is_active=true) as check_active,
    (s.desired_bling_status='A') as check_commercial_status,
    (coalesce(s.stock,0)>0) as check_stock,
    (coalesce(s.effective_price,0)>0) as check_price,
    (coalesce(s.cost,0)>0) as check_cost,
    (s.margin_percent is not null and s.margin_percent>0) as check_margin,
    (s.best_image is not null) as check_image,
    (s.marketing_category is not null) as check_taxonomy,
    (nullif(trim(coalesce(s.sales_category,'')),'') is not null) as check_sales_policy
  from scored s
)
select
  r.product_id,
  r.name,
  r.brand,
  r.marketing_category as category,
  r.marketing_subcategory as subcategory,
  r.marketing_subsubcategory as subsubcategory,
  r.product_line,
  coalesce(r.attributes,'{}'::jsonb) as attributes,
  coalesce(r.benefits,'{}'::text[]) as benefits,
  r.packaging,
  r.tags,
  r.price,
  r.effective_price,
  r.cost,
  r.stock,
  r.min_stock,
  r.margin_percent,
  r.is_offer,
  r.offer_price,
  r.best_image as image_url,
  case
    when r.category_price_percentile<=0.25 then 'entry'
    when r.category_price_percentile<=0.60 then 'value'
    when r.category_price_percentile<=0.90 then 'premium'
    else 'top'
  end as price_tier,
  coalesce(
    nullif(r.commercial_role_override,''),
    case
      when r.is_offer and coalesce(r.offer_price,0)>0 and r.offer_price<r.price then 'traffic_builder'
      when r.storefront_featured then 'hero'
      when r.is_upsell then 'upsell'
      when coalesce(r.margin_percent,0)>=35 then 'margin_builder'
      else 'core'
    end
  ) as commercial_role,
  coalesce(
    nullif(r.replenishment_type_override,''),
    case
      when r.avg_repurchase_days is null then 'unknown'
      when r.avg_repurchase_days<=14 then 'frequent'
      when r.avg_repurchase_days<=35 then 'monthly'
      when r.avg_repurchase_days<=90 then 'periodic'
      else 'occasional'
    end
  ) as replenishment_type,
  coalesce(
    nullif(r.creative_angles_override,'{}'::text[]),
    array_remove(array[
      case when r.is_offer and coalesce(r.offer_price,0)>0 and r.offer_price<r.price then 'oferta' end,
      case when r.storefront_featured then 'destaque' end,
      case when nullif(trim(coalesce(r.brand,'')),'') is not null then 'marca' end,
      case when r.marketing_category is not null then 'categoria' end
    ],null)::text[]
  ) as creative_angles,
  coalesce(r.relation_candidates,'[]'::jsonb) as relation_candidates,
  r.avg_repurchase_days,
  r.known_purchase_count,
  (
    r.check_active and r.check_commercial_status and r.check_stock and r.check_price and
    r.check_cost and r.check_margin and r.check_image and r.check_taxonomy and r.check_sales_policy
  ) as marketing_eligible,
  array_remove(array[
    case when not r.check_active then 'inactive' end,
    case when not r.check_commercial_status then 'commercial_status_blocked' end,
    case when not r.check_stock then 'out_of_stock' end,
    case when not r.check_price then 'missing_or_invalid_price' end,
    case when not r.check_cost then 'missing_cost' end,
    case when not r.check_margin then 'non_positive_or_unknown_margin' end,
    case when not r.check_image then 'missing_image' end,
    case when not r.check_taxonomy then 'missing_taxonomy' end,
    case when not r.check_sales_policy then 'missing_sales_category' end
  ],null)::text[] as exclusion_reasons,
  round((
    (
      r.check_active::int+r.check_commercial_status::int+r.check_stock::int+r.check_price::int+
      r.check_cost::int+r.check_margin::int+r.check_image::int+r.check_taxonomy::int+r.check_sales_policy::int
    )::numeric/9*100
  ),2) as readiness_score,
  coalesce(r.enrichment_status,'pending') as enrichment_status,
  coalesce(r.enrichment_source,'deterministic') as enrichment_source,
  coalesce(r.enrichment_confidence,0) as enrichment_confidence,
  coalesce(r.profile_version,'cm1.6-v1') as profile_version,
  coalesce(r.profile_evidence,'{}'::jsonb) as profile_evidence
from ready r;

create or replace function public.product_marketing_readiness_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with base as (
  select * from public.product_marketing_readiness_v1
),
reasons as (
  select reason,count(*)::bigint count
  from base b
  cross join lateral unnest(b.exclusion_reasons) reason
  group by reason
)
select jsonb_build_object(
  'total_products',(select count(*) from base),
  'marketing_ready',(select count(*) from base where marketing_eligible),
  'blocked',(select count(*) from base where not marketing_eligible),
  'avg_readiness_score',coalesce((select round(avg(readiness_score),2) from base),0),
  'pending_enrichment',(select count(*) from base where enrichment_status='pending'),
  'exclusion_reasons',coalesce((select jsonb_object_agg(reason,count order by reason) from reasons),'{}'::jsonb),
  'version','cm1.6-v1'
)
$function$;

revoke all on function public.product_marketing_readiness_summary_v1() from public,anon,authenticated;
grant execute on function public.product_marketing_readiness_summary_v1() to service_role;

create or replace function public.upsert_product_marketing_profile_v1(
  p_product_id uuid,
  p_product_line text default null,
  p_attributes jsonb default '{}'::jsonb,
  p_benefits text[] default '{}'::text[],
  p_commercial_role text default null,
  p_replenishment_type text default null,
  p_creative_angles text[] default '{}'::text[],
  p_relation_candidates jsonb default '[]'::jsonb,
  p_enrichment_status text default 'enriched',
  p_enrichment_source text default 'admin',
  p_enrichment_confidence numeric default 0.5,
  p_profile_version text default 'cm1.6-v1',
  p_evidence jsonb default '{}'::jsonb,
  p_updated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_status text:=lower(btrim(coalesce(p_enrichment_status,'')));
  v_source text:=lower(btrim(coalesce(p_enrichment_source,'')));
  v_row public.product_marketing_profiles%rowtype;
begin
  if p_product_id is null or not exists(select 1 from public.products where id=p_product_id) then
    raise exception 'product_not_found';
  end if;
  if jsonb_typeof(coalesce(p_attributes,'{}'::jsonb))<>'object' then raise exception 'attributes_object_required'; end if;
  if jsonb_typeof(coalesce(p_relation_candidates,'[]'::jsonb))<>'array' then raise exception 'relation_candidates_array_required'; end if;
  if jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object' then raise exception 'evidence_object_required'; end if;
  if v_status not in ('pending','deterministic','enriched','review_required','approved') then raise exception 'invalid_enrichment_status'; end if;
  if v_source='' then raise exception 'enrichment_source_required'; end if;
  if coalesce(p_enrichment_confidence,0)<0 or coalesce(p_enrichment_confidence,0)>1 then raise exception 'invalid_confidence'; end if;
  if p_updated_by is not null and not exists(select 1 from public.admin_users where user_id=p_updated_by and is_active=true) then
    raise exception 'admin_not_authorized';
  end if;

  insert into public.product_marketing_profiles(
    product_id,product_line,attributes,benefits,commercial_role,replenishment_type,creative_angles,
    relation_candidates,enrichment_status,enrichment_source,enrichment_confidence,profile_version,evidence,
    updated_by,created_at,updated_at
  )
  values(
    p_product_id,nullif(btrim(coalesce(p_product_line,'')),''),
    coalesce(p_attributes,'{}'::jsonb),coalesce(p_benefits,'{}'::text[]),
    nullif(btrim(coalesce(p_commercial_role,'')),''),
    nullif(btrim(coalesce(p_replenishment_type,'')),''),
    coalesce(p_creative_angles,'{}'::text[]),coalesce(p_relation_candidates,'[]'::jsonb),
    v_status,v_source,coalesce(p_enrichment_confidence,0),coalesce(nullif(p_profile_version,''),'cm1.6-v1'),
    coalesce(p_evidence,'{}'::jsonb),p_updated_by,now(),now()
  )
  on conflict(product_id) do update set
    product_line=excluded.product_line,
    attributes=excluded.attributes,
    benefits=excluded.benefits,
    commercial_role=excluded.commercial_role,
    replenishment_type=excluded.replenishment_type,
    creative_angles=excluded.creative_angles,
    relation_candidates=excluded.relation_candidates,
    enrichment_status=excluded.enrichment_status,
    enrichment_source=excluded.enrichment_source,
    enrichment_confidence=excluded.enrichment_confidence,
    profile_version=excluded.profile_version,
    evidence=excluded.evidence,
    updated_by=excluded.updated_by,
    updated_at=now()
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,'product_id',v_row.product_id,'enrichment_status',v_row.enrichment_status,
    'enrichment_source',v_row.enrichment_source,'enrichment_confidence',v_row.enrichment_confidence,
    'profile_version',v_row.profile_version,'updated_at',v_row.updated_at
  );
end;
$function$;

revoke all on function public.upsert_product_marketing_profile_v1(uuid,text,jsonb,text[],text,text,text[],jsonb,text,text,numeric,text,jsonb,uuid)
from public,anon,authenticated;
grant execute on function public.upsert_product_marketing_profile_v1(uuid,text,jsonb,text[],text,text,text[],jsonb,text,text,numeric,text,jsonb,uuid)
to service_role;

create or replace function public.marketing_product_shortlist_v2(
  p_limit integer default 18,
  p_lookback_days integer default 14
)
returns table(
  product_id uuid,
  name text,
  brand text,
  category text,
  subcategory text,
  price numeric,
  effective_price numeric,
  cost numeric,
  stock numeric,
  is_offer boolean,
  offer_price numeric,
  image_url text,
  margin_percent numeric,
  price_tier text,
  commercial_role text,
  replenishment_type text,
  readiness_score numeric,
  recent_campaign_count bigint,
  score numeric,
  reasons text[]
)
language sql
stable
security definer
set search_path=''
as $function$
with params as (
  select greatest(1,least(coalesce(p_limit,18),50)) lim,
         greatest(0,least(coalesce(p_lookback_days,14),90)) lookback_days
),
recent as (
  select x.product_id::uuid product_id,count(*)::bigint recent_campaign_count
  from public.marketing_campaigns mc
  cross join params pr
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(mc.product_selection->'product_ids')='array'
      then mc.product_selection->'product_ids' else '[]'::jsonb end
  ) x(product_id)
  where mc.created_at>=now()-make_interval(days=>pr.lookback_days)
    and x.product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  group by 1
),
eligible as (
  select r.*,coalesce(c.recent_campaign_count,0) recent_campaign_count
  from public.product_marketing_readiness_v1 r
  left join recent c on c.product_id=r.product_id
  where r.marketing_eligible
),
ranked as (
  select e.*,
    round((
      least(28::numeric,coalesce(e.margin_percent,0)/45*28)
      + least(18::numeric,coalesce(e.stock,0)/30*18)
      + case when e.is_offer and coalesce(e.offer_price,0)>0 and e.offer_price<e.price then 18 else 0 end
      + coalesce(e.readiness_score,0)/100*12
      + case when e.commercial_role='hero' then 8 when e.commercial_role='traffic_builder' then 6 when e.commercial_role='margin_builder' then 5 else 2 end
      + case when e.enrichment_status in ('approved','enriched') then 4 else 0 end
      - least(60::numeric,e.recent_campaign_count::numeric*30)
      - case when coalesce(e.min_stock,0)>0 and e.stock<=e.min_stock then 25 when e.stock<3 then 12 when e.stock<6 then 5 else 0 end
    )::numeric,2) score
  from eligible e
)
select
  r.product_id,r.name,r.brand,r.category,r.subcategory,r.price,r.effective_price,r.cost,r.stock,
  r.is_offer,r.offer_price,r.image_url,r.margin_percent,r.price_tier,r.commercial_role,
  r.replenishment_type,r.readiness_score,r.recent_campaign_count,r.score,
  array_remove(array[
    'marketing_ready',
    case when r.is_offer then 'valid_offer' end,
    case when coalesce(r.margin_percent,0)>=25 then 'healthy_margin' end,
    case when r.stock>=10 then 'good_stock' end,
    case when r.known_purchase_count>0 then 'purchase_history_available' end,
    case when r.enrichment_status in ('approved','enriched') then 'enriched_profile' end,
    case when r.recent_campaign_count=0 then 'not_used_recently' end
  ],null)::text[] reasons
from ranked r
order by r.score desc,r.stock desc,r.name asc
limit (select lim from params);
$function$;

revoke all on function public.marketing_product_shortlist_v2(integer,integer) from public,anon,authenticated;
grant execute on function public.marketing_product_shortlist_v2(integer,integer) to service_role;
