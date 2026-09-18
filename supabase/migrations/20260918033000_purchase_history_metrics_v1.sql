begin;

-- Etapa 10 — métricas objetivas de uso e conversão do histórico/personalização.

create or replace view public.purchase_history_product_metrics_v1
with (security_invoker=true)
as
with customer_counts as (
  select
    count(*)::int as total_customers,
    count(*) filter(where coalesce(is_active,true))::int as active_customers
  from public.customers
),
history_counts as (
  select
    count(*) filter(where order_count>0)::int as customers_with_history,
    count(*) filter(where order_count>0 and customer_id in (
      select id from public.customers where coalesce(is_active,true)
    ))::int as active_customers_with_history
  from public.customer_purchase_intelligence_v1
),
valid_orders as (
  select o.*
  from public.orders o
  where public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
),
local_orders as (
  select *
  from valid_orders
  where source is distinct from 'bling_import'
),
repeat_sessions as (
  select
    s.id,
    s.customer_id,
    s.conversation_id,
    s.created_at,
    s.metadata,
    nullif(s.metadata->>'repeated_from_order_id','') as source_order_id
  from public.catalog_sessions s
  where nullif(s.metadata->>'repeated_from_order_id','') is not null
),
repeat_orders as (
  select o.*,s.created_at as session_created_at
  from valid_orders o
  join repeat_sessions s on s.id=o.catalog_session_id
),
checkout_times as (
  select
    greatest(0,extract(epoch from (coalesce(o.confirmed_at,o.created_at)-s.created_at))/60.0) as minutes
  from local_orders o
  join public.catalog_sessions s on s.id=o.catalog_session_id
  where coalesce(o.confirmed_at,o.created_at)>=s.created_at
),
event_counts as (
  select
    count(*) filter(where event_type='repeat_purchase_open')::int as repeat_opens,
    count(distinct conversation_id) filter(where event_type='repeat_purchase_open' and conversation_id is not null)::int as repeat_open_conversations,
    count(*) filter(where event_type='repeat_last_purchase')::int as repeat_applies,
    count(distinct conversation_id) filter(where event_type='repeat_last_purchase' and conversation_id is not null)::int as repeat_apply_conversations,
    coalesce(sum((event_data->>'unavailable_count')::int) filter(
      where event_type='repeat_purchase_open'
        and coalesce(event_data->>'unavailable_count','') ~ '^[0-9]+$'
    ),0)::int as repeat_preview_unavailable_items,
    coalesce(sum((event_data->>'adjusted_count')::int) filter(
      where event_type='repeat_purchase_open'
        and coalesce(event_data->>'adjusted_count','') ~ '^[0-9]+$'
    ),0)::int as repeat_preview_adjusted_items,
    coalesce(sum((event_data->>'skipped_addons')::int) filter(
      where event_type='repeat_last_purchase'
        and coalesce(event_data->>'skipped_addons','') ~ '^[0-9]+$'
    ),0)::int as repeat_applied_skipped_addons,
    count(*) filter(where event_type='frequent_purchases_open')::int as frequent_opens,
    count(distinct conversation_id) filter(where event_type='frequent_purchases_open' and conversation_id is not null)::int as frequent_open_conversations,
    count(*) filter(where event_type='frequent_product_add')::int as frequent_product_adds,
    count(distinct conversation_id) filter(where event_type='frequent_product_add' and conversation_id is not null)::int as frequent_add_conversations,
    count(*) filter(where event_type='personalized_offers_view')::int as personalized_offer_views,
    count(distinct conversation_id) filter(where event_type='personalized_offers_view' and conversation_id is not null)::int as personalized_offer_view_conversations,
    count(*) filter(where event_type='personalized_offer_add')::int as personalized_offer_adds,
    count(distinct conversation_id) filter(where event_type='personalized_offer_add' and conversation_id is not null)::int as personalized_offer_add_conversations
  from public.customer_behavior_events
),
frequent_converted as (
  select count(distinct e.conversation_id)::int as conversations
  from public.customer_behavior_events e
  where e.event_type='frequent_purchases_open'
    and e.conversation_id is not null
    and exists(
      select 1
      from valid_orders o
      where o.conversation_id=e.conversation_id
        and coalesce(o.confirmed_at,o.created_at)>=e.occurred_at
    )
),
offer_converted as (
  select count(distinct e.conversation_id)::int as conversations
  from public.customer_behavior_events e
  where e.event_type='personalized_offer_add'
    and e.conversation_id is not null
    and exists(
      select 1
      from valid_orders o
      where o.conversation_id=e.conversation_id
        and coalesce(o.confirmed_at,o.created_at)>=e.occurred_at
    )
),
bling_stats as (
  select
    count(*)::int as imported_orders,
    count(distinct customer_id) filter(where customer_id is not null)::int as customers_with_imported_history
  from valid_orders
  where source='bling_import'
),
bling_only as (
  select count(*)::int as customers
  from (
    select customer_id
    from valid_orders
    where customer_id is not null
    group by customer_id
    having bool_or(source='bling_import')
       and not bool_or(source is distinct from 'bling_import')
  ) x
)
select
  cc.total_customers,
  cc.active_customers,
  hc.customers_with_history,
  hc.active_customers_with_history,
  round(100.0*hc.customers_with_history/nullif(cc.total_customers,0),2) as history_coverage_pct,
  round(100.0*hc.active_customers_with_history/nullif(cc.active_customers,0),2) as active_history_coverage_pct,

  (select count(*)::int from valid_orders) as valid_orders,
  (select count(*)::int from local_orders) as local_valid_orders,
  bs.imported_orders as bling_imported_orders,
  bs.customers_with_imported_history as bling_recovered_customers,
  bo.customers as bling_only_history_customers,

  ec.repeat_opens,
  ec.repeat_open_conversations,
  ec.repeat_applies,
  ec.repeat_apply_conversations,
  (select count(*)::int from repeat_sessions) as repeat_sessions,
  (select count(*)::int from repeat_orders) as repeat_orders,
  round(
    100.0*(select count(*) from repeat_orders)/
    nullif((select count(*) from repeat_sessions),0),
    2
  ) as repeat_session_conversion_pct,
  round(
    100.0*ec.repeat_apply_conversations/nullif(ec.repeat_open_conversations,0),
    2
  ) as repeat_open_to_apply_pct,
  round((select avg(total) from repeat_orders)::numeric,2) as repeat_average_ticket,
  round((
    select avg(greatest(0,extract(epoch from (coalesce(confirmed_at,created_at)-session_created_at))/60.0))
    from repeat_orders
    where coalesce(confirmed_at,created_at)>=session_created_at
  )::numeric,1) as repeat_average_checkout_minutes,
  ec.repeat_preview_unavailable_items,
  ec.repeat_preview_adjusted_items,
  ec.repeat_applied_skipped_addons,

  ec.frequent_opens,
  ec.frequent_open_conversations,
  ec.frequent_product_adds,
  ec.frequent_add_conversations,
  fc.conversations as frequent_purchase_converted_conversations,
  round(100.0*fc.conversations/nullif(ec.frequent_open_conversations,0),2) as frequent_to_order_conversion_pct,

  ec.personalized_offer_views,
  ec.personalized_offer_view_conversations,
  ec.personalized_offer_adds,
  ec.personalized_offer_add_conversations,
  round(100.0*ec.personalized_offer_add_conversations/nullif(ec.personalized_offer_view_conversations,0),2) as personalized_offer_add_rate_pct,
  oc.conversations as personalized_offer_converted_conversations,
  round(100.0*oc.conversations/nullif(ec.personalized_offer_add_conversations,0),2) as personalized_offer_add_to_order_pct,

  round((select avg(minutes) from checkout_times)::numeric,1) as average_checkout_minutes,
  round((select percentile_cont(0.5) within group(order by minutes) from checkout_times)::numeric,1) as median_checkout_minutes,
  now() as calculated_at
from customer_counts cc
cross join history_counts hc
cross join event_counts ec
cross join frequent_converted fc
cross join offer_converted oc
cross join bling_stats bs
cross join bling_only bo;

create or replace view public.purchase_history_metrics_daily_v1
with (security_invoker=true)
as
with order_daily as (
  select
    coalesce(confirmed_at,created_at)::date as metric_date,
    count(*)::int as orders,
    coalesce(sum(total),0)::numeric(14,2) as revenue,
    count(*) filter(where source='bling_import')::int as imported_orders,
    count(*) filter(where catalog_session_id in (
      select id from public.catalog_sessions
      where nullif(metadata->>'repeated_from_order_id','') is not null
    ))::int as repeat_orders
  from public.orders
  where public.is_customer_purchase_valid_v1(status,cancelled_at,returned_at)
  group by 1
),
event_daily as (
  select
    occurred_at::date as metric_date,
    count(*) filter(where event_type='repeat_purchase_open')::int as repeat_opens,
    count(*) filter(where event_type='repeat_last_purchase')::int as repeat_applies,
    count(*) filter(where event_type='frequent_purchases_open')::int as frequent_opens,
    count(*) filter(where event_type='frequent_product_add')::int as frequent_adds,
    count(*) filter(where event_type='personalized_offers_view')::int as offer_views,
    count(*) filter(where event_type='personalized_offer_add')::int as offer_adds
  from public.customer_behavior_events
  group by 1
)
select
  coalesce(o.metric_date,e.metric_date) as metric_date,
  coalesce(o.orders,0)::int as orders,
  coalesce(o.revenue,0)::numeric(14,2) as revenue,
  coalesce(o.imported_orders,0)::int as imported_orders,
  coalesce(o.repeat_orders,0)::int as repeat_orders,
  coalesce(e.repeat_opens,0)::int as repeat_opens,
  coalesce(e.repeat_applies,0)::int as repeat_applies,
  coalesce(e.frequent_opens,0)::int as frequent_opens,
  coalesce(e.frequent_adds,0)::int as frequent_adds,
  coalesce(e.offer_views,0)::int as personalized_offer_views,
  coalesce(e.offer_adds,0)::int as personalized_offer_adds
from order_daily o
full join event_daily e using(metric_date);

create or replace function public.get_purchase_history_product_metrics_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(to_jsonb(m),'{}'::jsonb)
  from public.purchase_history_product_metrics_v1 m
$$;

revoke all on public.purchase_history_product_metrics_v1 from public,anon,authenticated;
revoke all on public.purchase_history_metrics_daily_v1 from public,anon,authenticated;
revoke all on function public.get_purchase_history_product_metrics_v1() from public,anon,authenticated;

grant select on public.purchase_history_product_metrics_v1 to service_role;
grant select on public.purchase_history_metrics_daily_v1 to service_role;
grant execute on function public.get_purchase_history_product_metrics_v1() to service_role;

comment on view public.purchase_history_product_metrics_v1 is
  'Métricas agregadas da experiência de histórico, recompra, compras frequentes, ofertas personalizadas e importação Bling.';
comment on view public.purchase_history_metrics_daily_v1 is
  'Série diária das principais métricas do histórico e personalização do Chat Comprar.';

commit;
