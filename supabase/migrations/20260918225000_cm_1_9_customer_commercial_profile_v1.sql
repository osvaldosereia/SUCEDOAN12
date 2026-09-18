-- CM-1.9 Customer Commercial Profile v1
-- Deterministic commercial profile. SQL computes facts; AI is intentionally absent.

create or replace view public.customer_commercial_profile_v1
with (security_invoker=true)
as
with channel_activity as (
  select
    n.customer_id,
    max(n.occurred_at) as last_channel_event_at,
    max(n.occurred_at) filter(where n.direction='inbound') as last_inbound_at,
    max(n.occurred_at) filter(where n.direction='outbound') as last_outbound_at,
    count(*) filter(where n.direction='inbound' and n.occurred_at>=now()-interval '7 days')::int as inbound_7d,
    count(*) filter(where n.direction='inbound' and n.occurred_at>=now()-interval '30 days')::int as inbound_30d,
    count(*) filter(where n.direction='outbound' and n.occurred_at>=now()-interval '30 days')::int as outbound_30d,
    count(*) filter(
      where n.direction='outbound'
        and n.occurred_at>=now()-interval '7 days'
        and lower(coalesce(n.source,'')) in ('marketing','campaign','marketing_brain')
    )::int as marketing_outbound_7d,
    count(*) filter(
      where n.direction='outbound'
        and n.occurred_at>=now()-interval '30 days'
        and lower(coalesce(n.source,'')) in ('marketing','campaign','marketing_brain')
    )::int as marketing_outbound_30d
  from public.normalized_channel_events n
  where n.customer_id is not null
  group by n.customer_id
),
conversation_activity as (
  select
    c.customer_id,
    max(c.updated_at) as last_conversation_at,
    max(c.sales_pressure_level)::int as max_sales_pressure_level,
    coalesce(sum(c.proactive_offer_count) filter(where c.updated_at>=now()-interval '30 days'),0)::int as proactive_offers_30d,
    count(*) filter(where c.updated_at>=now()-interval '30 days')::int as conversations_30d
  from public.conversations c
  where c.customer_id is not null
  group by c.customer_id
),
marketing_activity as (
  select
    mat.subject_ref::uuid as customer_id,
    count(*) filter(where mat.occurred_at>=now()-interval '7 days')::int as touchpoints_7d,
    count(*) filter(where mat.occurred_at>=now()-interval '30 days')::int as touchpoints_30d,
    max(mat.occurred_at) as last_marketing_touch_at
  from public.marketing_attribution_touchpoints mat
  where mat.subject_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  group by mat.subject_ref::uuid
),
brand_stats as (
  select
    s.customer_id,
    count(distinct nullif(trim(p.brand),''))::int as distinct_brand_count,
    max(s.last_purchase_at) as last_product_purchase_at
  from public.customer_product_stats s
  join public.products p on p.id=s.product_id
  where s.purchase_count>0
  group by s.customer_id
),
identity_quality as (
  select
    c.id as customer_id,
    exists(
      select 1 from public.customer_channel_identities i
      where i.customer_id=c.id
        and i.channel='whatsapp'
        and i.verification_status<>'revoked'
    ) as has_channel_identity
  from public.customers c
)
select
  c.id as customer_id,
  c.name,
  c.primary_whatsapp_e164,
  c.cpf_cnpj,
  c.bling_contact_id,
  c.is_active,
  coalesce(i.order_count,0) as order_count,
  coalesce(i.lifetime_value,0)::numeric(14,2) as lifetime_value,
  coalesce(i.average_ticket,0)::numeric(14,2) as average_ticket,
  i.first_order_at,
  i.last_order_at,
  i.days_since_last_order,
  i.average_repurchase_interval_days,
  i.repurchase_interval_samples,
  i.repurchase_frequency_label,
  i.estimated_next_repurchase_at,
  i.history_confidence,
  i.favorite_basket_id,
  i.favorite_basket_name,
  i.favorite_basket_purchase_count,
  i.favorite_payment_method,
  i.favorite_payment_use_count,
  coalesce(sf.data_quality_score,0)::numeric(6,2) as data_quality_score,
  coalesce(bs.distinct_brand_count,0) as distinct_brand_count,
  coalesce(sf.conversation_count,0) as conversation_count,
  coalesce(ca.conversations_30d,0) as conversations_30d,
  ch.last_channel_event_at,
  ch.last_inbound_at,
  ch.last_outbound_at,
  coalesce(ch.inbound_7d,0) as inbound_7d,
  coalesce(ch.inbound_30d,0) as inbound_30d,
  coalesce(ch.outbound_30d,0) as outbound_30d,
  coalesce(ma.touchpoints_7d,0) as marketing_touchpoints_7d,
  coalesce(ma.touchpoints_30d,0) as marketing_touchpoints_30d,
  coalesce(ch.marketing_outbound_7d,0) as marketing_outbound_7d,
  coalesce(ch.marketing_outbound_30d,0) as marketing_outbound_30d,
  ma.last_marketing_touch_at,
  coalesce(ca.proactive_offers_30d,0) as proactive_offers_30d,
  coalesce(ca.max_sales_pressure_level,0) as max_sales_pressure_level,
  case
    when coalesce(ch.inbound_7d,0)>=3
      or ch.last_inbound_at>=now()-interval '2 days' then 'high'
    when coalesce(ch.inbound_30d,0)>=2
      or ch.last_inbound_at>=now()-interval '14 days' then 'medium'
    when coalesce(ch.inbound_30d,0)>=1
      or ca.last_conversation_at>=now()-interval '30 days' then 'low'
    else 'dormant'
  end as recent_engagement,
  least(
    100,
    coalesce(ma.touchpoints_7d,0)*20
    + coalesce(ma.touchpoints_30d,0)*5
    + coalesce(ch.marketing_outbound_7d,0)*20
    + coalesce(ch.marketing_outbound_30d,0)*5
    + coalesce(ca.proactive_offers_30d,0)*8
    + coalesce(ca.max_sales_pressure_level,0)*8
  )::int as marketing_pressure_score,
  case
    when (
      coalesce(ma.touchpoints_7d,0)*20
      + coalesce(ma.touchpoints_30d,0)*5
      + coalesce(ch.marketing_outbound_7d,0)*20
      + coalesce(ch.marketing_outbound_30d,0)*5
      + coalesce(ca.proactive_offers_30d,0)*8
      + coalesce(ca.max_sales_pressure_level,0)*8
    )>=70 then 'high'
    when (
      coalesce(ma.touchpoints_7d,0)*20
      + coalesce(ma.touchpoints_30d,0)*5
      + coalesce(ch.marketing_outbound_7d,0)*20
      + coalesce(ch.marketing_outbound_30d,0)*5
      + coalesce(ca.proactive_offers_30d,0)*8
      + coalesce(ca.max_sales_pressure_level,0)*8
    )>=35 then 'medium'
    when (
      coalesce(ma.touchpoints_7d,0)
      + coalesce(ma.touchpoints_30d,0)
      + coalesce(ch.marketing_outbound_7d,0)
      + coalesce(ch.marketing_outbound_30d,0)
      + coalesce(ca.proactive_offers_30d,0)
      + coalesce(ca.max_sales_pressure_level,0)
    )>0 then 'low'
    else 'none'
  end as marketing_pressure,
  (
    (case when nullif(trim(coalesce(c.name,'')),'') is not null then 15 else 0 end)
    +(case when public.canonical_phone_br(c.primary_whatsapp_e164) is not null then 20 else 0 end)
    +(case when nullif(regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'),'') is not null then 15 else 0 end)
    +(case when coalesce(sf.has_address,false) then 15 else 0 end)
    +(case when coalesce(iq.has_channel_identity,false) then 15 else 0 end)
    +(case when coalesce(sf.conversation_count,0)>0 or c.catalog_open_count>0 then 10 else 0 end)
    +(case when coalesce(i.order_count,0)>0 then 10 else 0 end)
  )::int as profile_completeness,
  array_remove(array[
    case when nullif(trim(coalesce(c.name,'')),'') is null then 'missing_name' end,
    case when public.canonical_phone_br(c.primary_whatsapp_e164) is null then 'missing_or_invalid_phone' end,
    case when nullif(regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'),'') is null then 'missing_cpf_cnpj' end,
    case when not coalesce(sf.has_address,false) then 'missing_address' end,
    case when not coalesce(iq.has_channel_identity,false) then 'missing_channel_identity' end,
    case when coalesce(sf.conversation_count,0)=0 and coalesce(c.catalog_open_count,0)=0 then 'missing_behavior_history' end,
    case when coalesce(i.order_count,0)=0 then 'no_purchase_history' end
  ],null)::text[] as profile_gaps
from public.customers c
left join public.customer_purchase_intelligence_v1 i on i.customer_id=c.id
left join public.customer_segment_facts_v1 sf on sf.customer_id=c.id
left join channel_activity ch on ch.customer_id=c.id
left join conversation_activity ca on ca.customer_id=c.id
left join marketing_activity ma on ma.customer_id=c.id
left join brand_stats bs on bs.customer_id=c.id
left join identity_quality iq on iq.customer_id=c.id;

create or replace function public.get_customer_commercial_profile_v1(
  p_customer_id uuid,
  p_product_limit integer default 10,
  p_category_limit integer default 8,
  p_brand_limit integer default 8
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with profile as (
  select *
  from public.customer_commercial_profile_v1
  where customer_id=p_customer_id
),
products as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',x.product_id,
    'name',x.name,
    'brand',x.brand,
    'category',x.category,
    'subcategory',x.subcategory,
    'purchase_count',x.purchase_count,
    'total_quantity',x.total_quantity,
    'total_spent',x.total_spent,
    'last_purchase_at',x.last_purchase_at,
    'share_of_customer_spend_percent',x.spend_share
  ) order by x.purchase_count desc,x.total_spent desc,x.last_purchase_at desc,x.name),'[]'::jsonb) data
  from (
    select
      s.product_id,
      coalesce(p.name,'Produto') name,
      p.brand,
      coalesce(nullif(p.customer_category,''),nullif(p.category,''),'Outros') category,
      coalesce(nullif(p.customer_subcategory,''),nullif(p.subcategory,'')) subcategory,
      s.purchase_count,
      s.total_quantity,
      s.total_spent,
      s.last_purchase_at,
      round(
        case when pr.lifetime_value>0 then s.total_spent/pr.lifetime_value*100 else 0 end,
        2
      ) spend_share
    from public.customer_product_stats s
    join profile pr on pr.customer_id=s.customer_id
    left join public.products p on p.id=s.product_id
    where s.customer_id=p_customer_id and s.purchase_count>0
    order by s.purchase_count desc,s.total_spent desc,s.last_purchase_at desc,coalesce(p.name,'Produto')
    limit greatest(1,least(coalesce(p_product_limit,10),30))
  ) x
),
category_raw as (
  select
    coalesce(nullif(p.customer_category,''),nullif(p.category,''),'Outros') category,
    count(distinct o.id)::int order_count,
    count(distinct oi.product_id)::int distinct_products,
    coalesce(sum(oi.quantity),0) total_quantity,
    coalesce(sum(oi.line_total),0) total_spent,
    max(coalesce(o.confirmed_at,o.created_at)) last_purchase_at
  from public.orders o
  join public.order_items oi on oi.order_id=o.id
  left join public.products p on p.id=oi.product_id
  where o.customer_id=p_customer_id
    and public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
  group by coalesce(nullif(p.customer_category,''),nullif(p.category,''),'Outros')
),
categories as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'category',x.category,
    'order_count',x.order_count,
    'distinct_products',x.distinct_products,
    'total_quantity',x.total_quantity,
    'total_spent',x.total_spent,
    'last_purchase_at',x.last_purchase_at,
    'share_of_customer_spend_percent',x.spend_share
  ) order by x.total_spent desc,x.order_count desc,x.last_purchase_at desc,x.category),'[]'::jsonb) data
  from (
    select
      cr.*,
      round(case when pr.lifetime_value>0 then cr.total_spent/pr.lifetime_value*100 else 0 end,2) spend_share
    from category_raw cr cross join profile pr
    order by cr.total_spent desc,cr.order_count desc,cr.last_purchase_at desc,cr.category
    limit greatest(1,least(coalesce(p_category_limit,8),20))
  ) x
),
brand_raw as (
  select
    coalesce(nullif(trim(p.brand),''),'Sem marca') brand,
    count(distinct o.id)::int order_count,
    count(distinct oi.product_id)::int distinct_products,
    coalesce(sum(oi.quantity),0) total_quantity,
    coalesce(sum(oi.line_total),0) total_spent,
    max(coalesce(o.confirmed_at,o.created_at)) last_purchase_at
  from public.orders o
  join public.order_items oi on oi.order_id=o.id
  left join public.products p on p.id=oi.product_id
  where o.customer_id=p_customer_id
    and public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
  group by coalesce(nullif(trim(p.brand),''),'Sem marca')
),
brands as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'brand',x.brand,
    'order_count',x.order_count,
    'distinct_products',x.distinct_products,
    'total_quantity',x.total_quantity,
    'total_spent',x.total_spent,
    'last_purchase_at',x.last_purchase_at,
    'share_of_customer_spend_percent',x.spend_share
  ) order by x.total_spent desc,x.order_count desc,x.last_purchase_at desc,x.brand),'[]'::jsonb) data
  from (
    select
      br.*,
      round(case when pr.lifetime_value>0 then br.total_spent/pr.lifetime_value*100 else 0 end,2) spend_share
    from brand_raw br cross join profile pr
    order by br.total_spent desc,br.order_count desc,br.last_purchase_at desc,br.brand
    limit greatest(1,least(coalesce(p_brand_limit,8),20))
  ) x
),
brand_distribution as (
  select coalesce(jsonb_object_agg(brand,spend_share order by spend_share desc),'{}'::jsonb) data
  from (
    select
      br.brand,
      round(case when pr.lifetime_value>0 then br.total_spent/pr.lifetime_value*100 else 0 end,2) spend_share
    from brand_raw br cross join profile pr
  ) x
)
select coalesce((
  select jsonb_build_object(
    'customer_id',p.customer_id,
    'order_count',p.order_count,
    'lifetime_value',p.lifetime_value,
    'average_ticket',p.average_ticket,
    'first_order_at',p.first_order_at,
    'last_order_at',p.last_order_at,
    'days_since_last_order',p.days_since_last_order,
    'average_repurchase_interval_days',p.average_repurchase_interval_days,
    'repurchase_interval_samples',p.repurchase_interval_samples,
    'repurchase_frequency_label',p.repurchase_frequency_label,
    'estimated_next_repurchase_at',p.estimated_next_repurchase_at,
    'history_confidence',p.history_confidence,
    'favorite_basket',case when p.favorite_basket_id is null and p.favorite_basket_name is null then null else jsonb_build_object(
      'basket_id',p.favorite_basket_id,
      'name',p.favorite_basket_name,
      'purchase_count',p.favorite_basket_purchase_count
    ) end,
    'favorite_payment_method',p.favorite_payment_method,
    'favorite_payment_use_count',p.favorite_payment_use_count,
    'top_products',(select data from products),
    'top_categories',(select data from categories),
    'top_brands',(select data from brands),
    'brand_distribution',(select data from brand_distribution),
    'recent_engagement',jsonb_build_object(
      'level',p.recent_engagement,
      'last_event_at',p.last_channel_event_at,
      'last_inbound_at',p.last_inbound_at,
      'last_outbound_at',p.last_outbound_at,
      'inbound_7d',p.inbound_7d,
      'inbound_30d',p.inbound_30d,
      'outbound_30d',p.outbound_30d,
      'conversations_30d',p.conversations_30d
    ),
    'marketing_pressure',jsonb_build_object(
      'level',p.marketing_pressure,
      'score',p.marketing_pressure_score,
      'touchpoints_7d',p.marketing_touchpoints_7d,
      'touchpoints_30d',p.marketing_touchpoints_30d,
      'marketing_outbound_7d',p.marketing_outbound_7d,
      'marketing_outbound_30d',p.marketing_outbound_30d,
      'proactive_offers_30d',p.proactive_offers_30d,
      'max_sales_pressure_level',p.max_sales_pressure_level,
      'last_marketing_touch_at',p.last_marketing_touch_at
    ),
    'profile_completeness',p.profile_completeness,
    'profile_gaps',to_jsonb(coalesce(p.profile_gaps,'{}'::text[])),
    'data_quality_score',p.data_quality_score,
    'version','cm1.9-v1'
  )
  from profile p
),'{}'::jsonb)
$function$;

revoke all on function public.get_customer_commercial_profile_v1(uuid,integer,integer,integer)
from public,anon,authenticated;
grant execute on function public.get_customer_commercial_profile_v1(uuid,integer,integer,integer)
to service_role;

create or replace function public.customer_commercial_profile_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with b as (select * from public.customer_commercial_profile_v1)
select jsonb_build_object(
  'customer_count',(select count(*) from b),
  'with_purchase_history',(select count(*) from b where order_count>0),
  'recurring',(select count(*) from b where order_count>=2),
  'high_engagement',(select count(*) from b where recent_engagement='high'),
  'dormant',(select count(*) from b where recent_engagement='dormant'),
  'high_marketing_pressure',(select count(*) from b where marketing_pressure='high'),
  'profiles_75_plus',(select count(*) from b where profile_completeness>=75),
  'average_profile_completeness',coalesce((select round(avg(profile_completeness),2) from b),0),
  'average_data_quality_score',coalesce((select round(avg(data_quality_score),2) from b),0),
  'version','cm1.9-v1'
)
$function$;

revoke all on function public.customer_commercial_profile_summary_v1()
from public,anon,authenticated;
grant execute on function public.customer_commercial_profile_summary_v1()
to service_role;
