-- CM-1.10 v2 precision pass.
-- Avoids false repurchase cycles from same-day orders, deduplicates graph candidates,
-- limits abandoned-cart recovery to seven days and prevents broad categories from driving offer affinity alone.

create or replace function public.evaluate_customer_opportunities_v1(
  p_customer_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with cp as (
  select *
  from public.customer_commercial_profile_v1
  where customer_id=p_customer_id
),
sf as (
  select *
  from public.customer_segment_facts_v1
  where customer_id=p_customer_id
),
protection as (
  select public.evaluate_customer_contact_eligibility_v1(
    p_customer_id,'whatsapp','marketing',now()
  ) data
),
purchased as (
  select s.product_id
  from public.customer_product_stats s
  where s.customer_id=p_customer_id and s.purchase_count>0
),
top_sources as (
  select s.product_id,s.purchase_count,s.total_spent,s.last_purchase_at
  from public.customer_product_stats s
  where s.customer_id=p_customer_id and s.purchase_count>0
  order by s.purchase_count desc,s.total_spent desc,s.last_purchase_at desc
  limit 5
),
relation_candidates as (
  select distinct on (r.target_product_id)
    r.target_product_id,
    p.name,
    p.brand,
    pr.category,
    pr.subcategory,
    pr.effective_price,
    pr.is_offer,
    pr.offer_price,
    pr.margin_percent,
    r.relation_type,
    r.confidence,
    r.source_kind,
    r.evidence
  from top_sources ts
  cross join lateral public.get_product_relations_v1(ts.product_id,true,0.65,30) r
  join public.products p on p.id=r.target_product_id
  join public.product_marketing_readiness_v1 pr on pr.product_id=r.target_product_id
  where pr.marketing_eligible
    and not exists(select 1 from purchased x where x.product_id=r.target_product_id)
  order by r.target_product_id,r.confidence desc,case r.source_kind when 'purchase' then 0 else 1 end,r.relation_type
),
cross_sell_products as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',x.target_product_id,
    'name',x.name,
    'brand',x.brand,
    'category',x.category,
    'relation_type',x.relation_type,
    'confidence',x.confidence,
    'effective_price',x.effective_price,
    'is_offer',x.is_offer,
    'offer_price',x.offer_price
  ) order by x.confidence desc,x.name),'[]'::jsonb) data,
  coalesce(max(x.confidence),0)::numeric max_confidence
  from (
    select *
    from relation_candidates
    where relation_type in ('COMPLEMENTARY','BOUGHT_TOGETHER')
    order by confidence desc,name
    limit 6
  ) x
),
brand_extension_products as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',x.target_product_id,
    'name',x.name,
    'brand',x.brand,
    'category',x.category,
    'relation_type',x.relation_type,
    'confidence',x.confidence,
    'effective_price',x.effective_price,
    'is_offer',x.is_offer,
    'offer_price',x.offer_price
  ) order by x.confidence desc,x.name),'[]'::jsonb) data,
  coalesce(max(x.confidence),0)::numeric max_confidence
  from (
    select *
    from relation_candidates
    where relation_type in ('SAME_LINE','COMPATIBLE_BRAND','UPSELL')
    order by confidence desc,name
    limit 6
  ) x
),
offer_products as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',x.product_id,
    'name',x.name,
    'brand',x.brand,
    'category',x.category,
    'effective_price',x.effective_price,
    'offer_price',x.offer_price,
    'margin_percent',x.margin_percent,
    'match_reason',x.match_reason
  ) order by x.affinity_score desc,x.margin_percent desc nulls last,x.name),'[]'::jsonb) data,
  coalesce(max(x.affinity_score),0)::numeric max_affinity
  from (
    select
      pr.product_id,pr.name,pr.brand,pr.category,pr.effective_price,pr.offer_price,pr.margin_percent,
      case
        when pr.brand is not null and lower(pr.brand)=any(
          select lower(x) from unnest(coalesce(sf.purchased_brands,'{}'::text[])) x
        ) then 'brand_affinity'
        when pr.subcategory is not null and lower(pr.subcategory)=any(
          select lower(x) from unnest(coalesce(sf.purchased_categories,'{}'::text[])) x
        ) then 'subcategory_affinity'
        when pr.category is not null
          and lower(pr.category) not in ('para casa','para você','para voce','outros')
          and lower(pr.category)=any(
            select lower(x) from unnest(coalesce(sf.purchased_categories,'{}'::text[])) x
          ) then 'category_affinity'
        else 'commercial_fit'
      end match_reason,
      case
        when pr.brand is not null and lower(pr.brand)=any(
          select lower(x) from unnest(coalesce(sf.purchased_brands,'{}'::text[])) x
        ) then 0.90
        when pr.subcategory is not null and lower(pr.subcategory)=any(
          select lower(x) from unnest(coalesce(sf.purchased_categories,'{}'::text[])) x
        ) then 0.82
        when pr.category is not null
          and lower(pr.category) not in ('para casa','para você','para voce','outros')
          and lower(pr.category)=any(
            select lower(x) from unnest(coalesce(sf.purchased_categories,'{}'::text[])) x
          ) then 0.72
        else 0.55
      end::numeric affinity_score
    from public.product_marketing_readiness_v1 pr
    cross join sf
    where pr.marketing_eligible
      and pr.is_offer
      and coalesce(pr.offer_price,0)>0
      and pr.offer_price<pr.price
      and not exists(select 1 from purchased x where x.product_id=pr.product_id)
      and (
        (pr.brand is not null and lower(pr.brand)=any(
          select lower(x) from unnest(coalesce(sf.purchased_brands,'{}'::text[])) x
        ))
        or
        (pr.subcategory is not null and lower(pr.subcategory)=any(
          select lower(x) from unnest(coalesce(sf.purchased_categories,'{}'::text[])) x
        ))
        or
        (
          pr.category is not null
          and lower(pr.category) not in ('para casa','para você','para voce','outros')
          and lower(pr.category)=any(
            select lower(x) from unnest(coalesce(sf.purchased_categories,'{}'::text[])) x
          )
        )
      )
    order by affinity_score desc,pr.margin_percent desc nulls last,pr.name
    limit 6
  ) x
),
cart_context as (
  select
    c.id cart_id,c.status,c.total,c.updated_at,
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id',ci.product_id,
      'name',p.name,
      'quantity',ci.quantity,
      'unit_price',ci.unit_price,
      'line_total',ci.line_total
    ) order by ci.created_at) filter(where ci.id is not null),'[]'::jsonb) items
  from public.carts c
  left join public.cart_items ci on ci.cart_id=c.id
  left join public.products p on p.id=ci.product_id
  where c.customer_id=p_customer_id
    and (c.status='abandoned' or (c.status='draft' and c.updated_at<now()-interval '2 hours'))
    and c.updated_at>=now()-interval '7 days'
  group by c.id
  order by c.updated_at desc
  limit 1
),
base as (
  select
    cp.*,
    sf.has_incomplete_cart,
    sf.last_incomplete_cart_at,
    protection.data protection,
    coalesce((protection.data->>'allowed')::boolean,false) marketing_allowed,
    coalesce(protection.data->'reasons','[]'::jsonb) protection_reasons,
    coalesce((select data from cross_sell_products),'[]'::jsonb) cross_sell_products,
    coalesce((select max_confidence from cross_sell_products),0)::numeric cross_sell_confidence,
    coalesce((select data from brand_extension_products),'[]'::jsonb) brand_extension_products,
    coalesce((select max_confidence from brand_extension_products),0)::numeric brand_extension_confidence,
    coalesce((select data from offer_products),'[]'::jsonb) offer_products,
    coalesce((select max_affinity from offer_products),0)::numeric offer_affinity
  from cp cross join sf cross join protection
),
opportunities as (
  select
    'repurchase_due'::text strategy_key,
    'Recompra no período esperado'::text title,
    least(0.95::numeric,
      0.55
      + least(0.25::numeric,coalesce(b.repurchase_interval_samples,0)::numeric*0.08)
      + case when b.history_confidence='high' then 0.15 when b.history_confidence='medium' then 0.10 else 0.03 end
    ) confidence,
    jsonb_build_object(
      'order_count',b.order_count,
      'days_since_last_order',b.days_since_last_order,
      'average_repurchase_interval_days',b.average_repurchase_interval_days,
      'estimated_next_repurchase_at',b.estimated_next_repurchase_at
    ) evidence,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',s.product_id,
        'purchase_count',s.purchase_count,
        'total_quantity',s.total_quantity,
        'last_purchase_at',s.last_purchase_at
      ) order by s.purchase_count desc,s.last_purchase_at desc)
      from (
        select * from public.customer_product_stats
        where customer_id=p_customer_id
        order by purchase_count desc,total_spent desc,last_purchase_at desc
        limit 6
      ) s
    ),'[]'::jsonb) product_candidates,
    jsonb_build_object(
      'type','customer_rule',
      'conditions',jsonb_build_array(
        'order_count >= 2',
        'days_since_last_order between 80% and 130% of average_repurchase_interval'
      )
    ) audience_rule,
    now()+interval '7 days' expires_at
  from base b
  where b.order_count>=2
    and b.average_repurchase_interval_days is not null
    and b.average_repurchase_interval_days>=3
    and b.days_since_last_order>=floor(b.average_repurchase_interval_days*0.80)
    and b.days_since_last_order<=ceil(b.average_repurchase_interval_days*1.30)

  union all

  select
    'repurchase_overdue',
    'Recompra atrasada',
    least(0.96::numeric,
      0.60
      + least(0.20::numeric,coalesce(b.repurchase_interval_samples,0)::numeric*0.07)
      + case when b.history_confidence='high' then 0.15 when b.history_confidence='medium' then 0.10 else 0.03 end
    ),
    jsonb_build_object(
      'order_count',b.order_count,
      'days_since_last_order',b.days_since_last_order,
      'average_repurchase_interval_days',b.average_repurchase_interval_days,
      'estimated_next_repurchase_at',b.estimated_next_repurchase_at
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',s.product_id,
        'purchase_count',s.purchase_count,
        'last_purchase_at',s.last_purchase_at
      ) order by s.purchase_count desc,s.last_purchase_at desc)
      from (
        select * from public.customer_product_stats
        where customer_id=p_customer_id
        order by purchase_count desc,total_spent desc,last_purchase_at desc
        limit 6
      ) s
    ),'[]'::jsonb),
    jsonb_build_object(
      'type','customer_rule',
      'conditions',jsonb_build_array(
        'order_count >= 2',
        'days_since_last_order > 130% of average interval',
        'not yet in reactivation window'
      )
    ),
    now()+interval '7 days'
  from base b
  where b.order_count>=2
    and b.average_repurchase_interval_days is not null
    and b.average_repurchase_interval_days>=3
    and b.days_since_last_order>ceil(b.average_repurchase_interval_days*1.30)
    and b.days_since_last_order<greatest(60,ceil(b.average_repurchase_interval_days*2.00))

  union all

  select
    'first_to_second_purchase',
    'Primeira para segunda compra',
    case
      when b.days_since_last_order between 7 and 30 then 0.82
      when b.days_since_last_order between 3 and 45 then 0.72
      else 0.62
    end::numeric,
    jsonb_build_object(
      'order_count',b.order_count,
      'days_since_last_order',b.days_since_last_order,
      'last_order_at',b.last_order_at,
      'recent_engagement',b.recent_engagement
    ),
    case
      when jsonb_array_length(b.cross_sell_products)>0 then b.cross_sell_products
      when jsonb_array_length(b.brand_extension_products)>0 then b.brand_extension_products
      else b.offer_products
    end,
    jsonb_build_object(
      'type','customer_rule',
      'conditions',jsonb_build_array('order_count = 1','days_since_last_order between 3 and 45')
    ),
    now()+interval '10 days'
  from base b
  where b.order_count=1 and b.days_since_last_order between 3 and 45

  union all

  select
    'cart_abandoned',
    'Carrinho não concluído',
    case
      when cc.updated_at>=now()-interval '24 hours' then 0.92
      when cc.updated_at>=now()-interval '3 days' then 0.82
      else 0.70
    end::numeric,
    jsonb_build_object(
      'cart_id',cc.cart_id,
      'cart_status',cc.status,
      'cart_total',cc.total,
      'cart_updated_at',cc.updated_at
    ),
    cc.items,
    jsonb_build_object(
      'type','customer_rule',
      'conditions',jsonb_build_array('cart abandoned or draft older than 2h')
    ),
    least(coalesce(cc.updated_at+interval '7 days',now()+interval '2 days'),now()+interval '7 days')
  from base b cross join cart_context cc
  where b.has_incomplete_cart

  union all

  select
    'cross_sell',
    'Produto complementar',
    greatest(0.65::numeric,b.cross_sell_confidence),
    jsonb_build_object(
      'relation_source','product_brand_graph',
      'candidate_count',jsonb_array_length(b.cross_sell_products),
      'max_relation_confidence',b.cross_sell_confidence
    ),
    b.cross_sell_products,
    jsonb_build_object(
      'type','graph_rule',
      'relations',jsonb_build_array('COMPLEMENTARY','BOUGHT_TOGETHER')
    ),
    now()+interval '14 days'
  from base b
  where b.order_count>0 and jsonb_array_length(b.cross_sell_products)>0

  union all

  select
    'brand_extension',
    'Extensão de marca ou linha',
    greatest(0.65::numeric,b.brand_extension_confidence),
    jsonb_build_object(
      'relation_source','product_brand_graph',
      'candidate_count',jsonb_array_length(b.brand_extension_products),
      'max_relation_confidence',b.brand_extension_confidence
    ),
    b.brand_extension_products,
    jsonb_build_object(
      'type','graph_rule',
      'relations',jsonb_build_array('SAME_LINE','COMPATIBLE_BRAND','UPSELL')
    ),
    now()+interval '14 days'
  from base b
  where b.order_count>0 and jsonb_array_length(b.brand_extension_products)>0

  union all

  select
    'offer_affinity',
    'Oferta compatível com o histórico',
    greatest(0.60::numeric,b.offer_affinity),
    jsonb_build_object(
      'source','product_marketing_readiness',
      'candidate_count',jsonb_array_length(b.offer_products),
      'max_affinity',b.offer_affinity
    ),
    b.offer_products,
    jsonb_build_object(
      'type','affinity_rule',
      'conditions',jsonb_build_array('valid offer','marketing eligible product','brand or category affinity')
    ),
    now()+interval '5 days'
  from base b
  where jsonb_array_length(b.offer_products)>0

  union all

  select
    'reactivation',
    'Reativação de cliente',
    case
      when b.order_count>=3 then 0.86
      when b.order_count=2 then 0.78
      else 0.68
    end::numeric,
    jsonb_build_object(
      'order_count',b.order_count,
      'lifetime_value',b.lifetime_value,
      'days_since_last_order',b.days_since_last_order,
      'average_repurchase_interval_days',b.average_repurchase_interval_days,
      'recent_engagement',b.recent_engagement
    ),
    case
      when jsonb_array_length(b.offer_products)>0 then b.offer_products
      when jsonb_array_length(b.cross_sell_products)>0 then b.cross_sell_products
      else '[]'::jsonb
    end,
    jsonb_build_object(
      'type','customer_rule',
      'conditions',jsonb_build_array('has purchase history','beyond reactivation threshold')
    ),
    now()+interval '14 days'
  from base b
  where b.order_count>0
    and b.days_since_last_order>=greatest(
      60,
      ceil(coalesce(b.average_repurchase_interval_days,45)*2.00)
    )
),
final as (
  select
    o.*,
    b.marketing_allowed,
    b.protection_reasons,
    array_remove(array[
      case when not b.marketing_allowed then 'marketing_not_allowed' end,
      case when b.marketing_pressure='high' then 'high_marketing_pressure' end,
      case when b.profile_completeness<40 then 'very_low_profile_completeness' end
    ],null)::text[] exclusions
  from opportunities o cross join base b
)
select jsonb_build_object(
  'customer_id',p_customer_id,
  'engine_version','cm1.10-v1',
  'opportunities',coalesce(jsonb_agg(jsonb_build_object(
    'strategy_key',f.strategy_key,
    'title',f.title,
    'confidence',round(f.confidence,4),
    'audience_rule',f.audience_rule,
    'evidence',f.evidence,
    'product_candidates',f.product_candidates,
    'exclusions',to_jsonb(f.exclusions),
    'status',case when cardinality(f.exclusions)>0 then 'suppressed' else 'suggested' end,
    'estimated_audience',1,
    'expires_at',f.expires_at
  ) order by cardinality(f.exclusions),f.confidence desc,f.strategy_key),'[]'::jsonb)
)
from final f
$function$;

revoke all on function public.evaluate_customer_opportunities_v1(uuid)
from public,anon,authenticated;
grant execute on function public.evaluate_customer_opportunities_v1(uuid)
to service_role;
