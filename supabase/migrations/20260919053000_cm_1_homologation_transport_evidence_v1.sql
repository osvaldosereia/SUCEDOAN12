-- CM-1 Homologation Transport Evidence v1
-- Read-only evidence that the canonical provider adapter is receiving real traffic.

create or replace function public.cm1_transport_evidence_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $fn$
with provider as (
  select
    count(*)::int receipts,
    count(*) filter(where normalized_event_id is not null)::int normalized_linked,
    count(*) filter(where conversation_id is not null)::int conversation_linked,
    count(*) filter(where customer_id is not null)::int customer_linked,
    count(distinct customer_id) filter(where customer_id is not null)::int distinct_customers,
    count(*) filter(where processing_status='normalized')::int normalized_status,
    count(*) filter(where processing_status='duplicate')::int duplicates,
    count(*) filter(where processing_status='error')::int errors,
    max(received_at) last_event_at
  from public.channel_provider_event_receipts
  where provider_key='papoai'
),
sessions as (
  select count(distinct s.id)::int shopping_sessions
  from public.catalog_sessions s
  join public.channel_provider_event_receipts r on r.conversation_id=s.conversation_id
  where r.provider_key='papoai'
    and s.metadata->>'entry_source'='channel_adapter'
    and s.metadata->>'provider_key'='papoai'
),
identities as (
  select count(*)::int provider_identities
  from public.customer_channel_identities i
  where i.channel='whatsapp'
    and i.evidence->>'provider_key'='papoai'
),
conversations as (
  select count(distinct c.id)::int provider_conversations
  from public.conversations c
  join public.channel_provider_event_receipts r on r.conversation_id=c.id
  where r.provider_key='papoai'
    and c.referral->>'provider_adapter'='papoai'
),
legacy as (
  select
    count(*) filter(where processed_at>=now()-interval '7 days')::int events_7d,
    max(processed_at) last_event_at
  from public.processed_events
  where source='meta_whatsapp'
),
canonical as (
  select
    count(*) filter(where created_at>=now()-interval '24 hours')::int events_24h,
    max(created_at) last_event_at
  from public.normalized_channel_events
  where source='channel_adapter'
)
select jsonb_build_object(
  'version','cm1-transport-evidence-v1',
  'provider','papoai',
  'receipts',p.receipts,
  'normalized_linked',p.normalized_linked,
  'conversation_linked',p.conversation_linked,
  'customer_linked',p.customer_linked,
  'distinct_customers',p.distinct_customers,
  'normalized_status',p.normalized_status,
  'duplicates',p.duplicates,
  'errors',p.errors,
  'provider_last_event_at',p.last_event_at,
  'shopping_sessions',s.shopping_sessions,
  'provider_identities',i.provider_identities,
  'provider_conversations',c.provider_conversations,
  'canonical_events_24h',n.events_24h,
  'canonical_last_event_at',n.last_event_at,
  'legacy_meta_events_7d',l.events_7d,
  'legacy_meta_last_event_at',l.last_event_at,
  'adapter_receiving_real_traffic',(p.receipts>0 and p.normalized_linked=p.receipts and p.errors=0),
  'legacy_transport_recently_active',(l.events_7d>0),
  'external_side_effect',false
)
from provider p cross join sessions s cross join identities i cross join conversations c cross join legacy l cross join canonical n
$fn$;

revoke all on function public.cm1_transport_evidence_v1() from public,anon,authenticated;
grant execute on function public.cm1_transport_evidence_v1() to service_role;

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
  'transport_evidence',public.cm1_transport_evidence_v1(),
  'brands',public.relationship_brand_summary_v1(30),
  'quality',public.relationship_quality_summary_v1(),
  'homologation',public.cm1_homologation_readiness_v1(),
  'external_side_effect',false
)
$fn$;

revoke all on function public.relationship_command_summary_v1() from public,anon,authenticated;
grant execute on function public.relationship_command_summary_v1() to service_role;
