create or replace function public.marketing_product_shortlist_v1(
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
  offer_discount_percent numeric,
  recent_campaign_count bigint,
  score numeric,
  reasons text[]
)
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
with params as (
  select greatest(1,least(coalesce(p_limit,18),50)) as lim,
         greatest(0,least(coalesce(p_lookback_days,14),90)) as lookback_days
),
recent as (
  select x.product_id::uuid as product_id,count(*)::bigint as recent_campaign_count
  from public.marketing_campaigns mc
  cross join params pr
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(mc.product_selection->'product_ids')='array'
         then mc.product_selection->'product_ids' else '[]'::jsonb end
  ) as x(product_id)
  where mc.created_at >= now() - make_interval(days => pr.lookback_days)
    and x.product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  group by 1
),
eligible as (
  select
    p.id,p.name,p.brand,
    coalesce(nullif(p.customer_category,''),nullif(p.category,''),nullif(p.storefront_category,'')) as category,
    coalesce(nullif(p.customer_subcategory,''),nullif(p.subcategory,'')) as subcategory,
    p.price,p.cost,p.stock,p.min_stock,p.is_offer,p.offer_price,p.storefront_featured,p.description_short,
    coalesce(nullif(p.image_ai_url,''),nullif(p.image_url,''),nullif(p.image_original_url,''),nullif(p.image_source_url,'')) as best_image,
    case when p.is_offer and coalesce(p.offer_price,0)>0 and p.offer_price<p.price then p.offer_price else p.price end as effective_price
  from public.products p
  where p.is_active and coalesce(p.stock,0)>0 and coalesce(p.price,0)>0
    and coalesce(nullif(p.image_ai_url,''),nullif(p.image_url,''),nullif(p.image_original_url,''),nullif(p.image_source_url,'')) is not null
),
scored as (
  select
    e.*,coalesce(r.recent_campaign_count,0) as recent_campaign_count,
    case when coalesce(e.cost,0)>0 and e.effective_price>0
         then round(greatest(0,((e.effective_price-e.cost)/e.effective_price)*100)::numeric,2)
         else null end as margin_percent,
    case when e.is_offer and coalesce(e.offer_price,0)>0 and e.offer_price<e.price
         then round((((e.price-e.offer_price)/e.price)*100)::numeric,2)
         else 0::numeric end as offer_discount_percent
  from eligible e
  left join recent r on r.product_id=e.id
),
ranked as (
  select s.*,
    round((
      case when s.is_offer and coalesce(s.offer_price,0)>0 and s.offer_price<s.price then 20 else 0 end
      + least(15::numeric,coalesce(s.offer_discount_percent,0)/40*15)
      + case when s.margin_percent is not null then least(20::numeric,s.margin_percent/45*20) else 0 end
      + least(15::numeric,coalesce(s.stock,0)/30*15)
      + case when s.storefront_featured then 8 else 0 end
      + case when nullif(trim(coalesce(s.brand,'')),'') is not null then 3 else 0 end
      + case when nullif(trim(coalesce(s.category,'')),'') is not null then 3 else 0 end
      + case when nullif(trim(coalesce(s.description_short,'')),'') is not null then 2 else 0 end
      - case when coalesce(s.min_stock,0)>0 and s.stock<=s.min_stock then 20 else 0 end
      - least(60::numeric,coalesce(s.recent_campaign_count,0)::numeric*30)
    )::numeric,2) as score
  from scored s
)
select
  r.id,r.name,r.brand,r.category,r.subcategory,r.price,r.effective_price,r.cost,r.stock,r.is_offer,r.offer_price,r.best_image,
  r.margin_percent,r.offer_discount_percent,r.recent_campaign_count,r.score,
  array_remove(array[
    case when r.is_offer and coalesce(r.offer_price,0)>0 and r.offer_price<r.price then 'valid_offer' end,
    case when r.margin_percent is not null and r.margin_percent>=25 then 'healthy_margin' end,
    case when r.stock>=10 then 'good_stock' end,
    case when r.storefront_featured then 'storefront_featured' end,
    case when r.recent_campaign_count=0 then 'not_used_recently' end,
    case when nullif(trim(coalesce(r.brand,'')),'') is not null and nullif(trim(coalesce(r.category,'')),'') is not null then 'good_product_data' end
  ],null)::text[]
from ranked r
cross join params pr
order by r.score desc,r.stock desc,r.name asc
limit (select lim from params);
$$;

revoke all on function public.marketing_product_shortlist_v1(integer,integer) from public;
revoke execute on function public.marketing_product_shortlist_v1(integer,integer) from anon,authenticated;
grant execute on function public.marketing_product_shortlist_v1(integer,integer) to service_role;

comment on function public.marketing_product_shortlist_v1(integer,integer)
is 'Deterministic, low-cost product shortlist for Marketing Brain. Server-only; ranks eligible products before any AI call.';
