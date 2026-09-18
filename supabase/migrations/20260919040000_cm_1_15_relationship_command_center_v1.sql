-- CM-1.15 Central de Relacionamento v1
-- Unified read models only. No external side effects.

create or replace function public.relationship_brand_summary_v1(p_limit integer default 30)
returns jsonb
language sql
stable
security definer
set search_path=''
as $fn$
with b as (
  select
    coalesce(nullif(btrim(p.brand),''),'Sem marca') brand,
    count(*)::int product_count,
    count(*) filter(where p.marketing_eligible)::int marketing_ready,
    count(*) filter(where not p.marketing_eligible)::int blocked,
    count(*) filter(where p.is_offer and p.marketing_eligible)::int offers_ready,
    coalesce(sum(p.stock),0)::numeric stock_units,
    coalesce(sum(p.known_purchase_count),0)::bigint known_purchase_count,
    round(avg(p.readiness_score),2) avg_readiness
  from public.product_marketing_readiness_v1 p
  group by coalesce(nullif(btrim(p.brand),''),'Sem marca')
),
ranked as (
  select * from b
  order by known_purchase_count desc,marketing_ready desc,product_count desc,brand
  limit greatest(1,least(coalesce(p_limit,30),100))
)
select jsonb_build_object(
  'version','cm1.15-v1',
  'items',coalesce(jsonb_agg(to_jsonb(r) order by r.known_purchase_count desc,r.marketing_ready desc,r.brand),'[]'::jsonb),
  'brand_count',(select count(*) from b),
  'external_side_effect',false
)
from ranked r
$fn$;

revoke all on function public.relationship_brand_summary_v1(integer) from public,anon,authenticated;
grant execute on function public.relationship_brand_summary_v1(integer) to service_role;

create or replace function public.relationship_quality_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $fn$
select jsonb_build_object(
  'version','cm1.15-v1',
  'customers',jsonb_build_object(
    'total',(select count(*) from public.customers),
    'active',(select count(*) from public.customers where is_active),
    'profile_below_50',(select count(*) from public.customer_commercial_profile_v1 where profile_completeness<50),
    'data_quality_below_50',(select count(*) from public.customer_commercial_profile_v1 where data_quality_score<50),
    'without_purchase_history',(select count(*) from public.customer_commercial_profile_v1 where order_count=0)
  ),
  'identity',jsonb_build_object(
    'pending_reviews',(select count(*) from public.customer_identity_resolution_evaluations where review_status='pending'),
    'conflicts',(select count(*) from public.customer_identity_resolution_evaluations where decision='conflict' and review_status='pending'),
    'unmatched_30d',(select count(*) from public.customer_identity_resolution_evaluations where decision='unmatched' and created_at>=now()-interval '30 days')
  ),
  'consent',jsonb_build_object(
    'marketing_granted',(select count(distinct customer_id) from public.customer_consent_current_v1 where channel='whatsapp' and purpose='marketing' and status='granted'),
    'marketing_denied',(select count(distinct customer_id) from public.customer_consent_current_v1 where channel='whatsapp' and purpose='marketing' and status in ('denied','revoked')),
    'suppressed_customers',(select count(distinct customer_id) from public.customer_contact_suppressions where active and revoked_at is null and (expires_at is null or expires_at>now()))
  ),
  'products',jsonb_build_object(
    'ready',(select count(*) from public.product_marketing_readiness_v1 where marketing_eligible),
    'blocked',(select count(*) from public.product_marketing_readiness_v1 where not marketing_eligible),
    'missing_image',(select count(*) from public.product_marketing_readiness_v1 where 'missing_image'=any(exclusion_reasons)),
    'out_of_stock',(select count(*) from public.product_marketing_readiness_v1 where 'out_of_stock'=any(exclusion_reasons)),
    'missing_cost',(select count(*) from public.product_marketing_readiness_v1 where 'missing_cost'=any(exclusion_reasons))
  ),
  'integration',jsonb_build_object(
    'unresolved_meta_errors',(select count(*) from public.meta_control_plane_errors where resolved_at is null),
    'provider_adapter_errors',(select count(*) from public.channel_provider_event_receipts where processing_status='error' and received_at>=now()-interval '7 days'),
    'provider_events_24h',(select count(*) from public.channel_provider_event_receipts where received_at>=now()-interval '24 hours')
  ),
  'external_side_effect',false
)
$fn$;

revoke all on function public.relationship_quality_summary_v1() from public,anon,authenticated;
grant execute on function public.relationship_quality_summary_v1() to service_role;

create or replace function public.relationship_command_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $fn$
select jsonb_build_object(
  'version','cm1.15-v1',
  'customer_profile',public.customer_commercial_profile_summary_v1(),
  'segments',public.segment_engine_summary_v1(),
  'opportunities',public.opportunity_engine_summary_v1(),
  'products',public.product_marketing_readiness_summary_v1(),
  'product_graph',public.product_relation_graph_summary_v1(),
  'marketing_brain',public.marketing_strategy_brief_summary_v1(),
  'templates',public.whatsapp_template_draft_summary_v1(),
  'meta',public.get_meta_control_plane_snapshot_v1(),
  'provider_adapters',public.channel_provider_adapter_summary_v1(),
  'brands',public.relationship_brand_summary_v1(30),
  'quality',public.relationship_quality_summary_v1(),
  'external_side_effect',false
)
$fn$;

revoke all on function public.relationship_command_summary_v1() from public,anon,authenticated;
grant execute on function public.relationship_command_summary_v1() to service_role;
