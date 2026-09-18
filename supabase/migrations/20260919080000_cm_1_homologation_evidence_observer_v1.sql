-- CM-1 homologation evidence observer.
-- Read-only snapshot for the Relationship Center. No outbound, AI, Meta writes or customer mutations.

create or replace function public.cm1_homologation_evidence_summary_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $fn$
declare
  v_channel_account_id uuid;
  v_catalog_search integer:=0;
  v_catalog_search_last timestamptz;
  v_product_view integer:=0;
  v_product_view_last timestamptz;
  v_catalog_open integer:=0;
  v_catalog_open_last timestamptz;
  v_opp_suggested integer:=0;
  v_opp_suppressed integer:=0;
  v_opp_dismissed integer:=0;
  v_opp_converted integer:=0;
  v_opp_expired integer:=0;
  v_opp_clock_expired_open integer:=0;
  v_opp_next_expiry timestamptz;
  v_identity_pending integer:=0;
  v_identity_oldest timestamptz;
  v_briefs integer:=0;
  v_briefs_ai integer:=0;
  v_ai_exec integer:=0;
  v_ai_cost_recorded integer:=0;
  v_ai_cost numeric:=0;
  v_required_permissions integer:=0;
  v_granted_permissions integer:=0;
  v_missing_permissions integer:=0;
  v_permissions_checked_at timestamptz;
  v_health_checked_at timestamptz;
  v_graph_api_version text;
  v_webhook_state text;
  v_direct_callback_verified boolean:=false;
  v_vault_token_configured boolean:=false;
  v_marketing_external_7d integer:=0;
  v_ai_external_7d integer:=0;
  v_homologation jsonb:=public.cm1_homologation_readiness_v1();
begin
  select id into v_channel_account_id
  from public.channel_accounts
  where channel='whatsapp'
  order by created_at asc
  limit 1;

  select
    count(*) filter(where event_type='catalog_search'),
    max(occurred_at) filter(where event_type='catalog_search'),
    count(*) filter(where event_type='product_view'),
    max(occurred_at) filter(where event_type='product_view'),
    count(*) filter(where event_type='catalog_open'),
    max(occurred_at) filter(where event_type='catalog_open')
  into
    v_catalog_search,v_catalog_search_last,
    v_product_view,v_product_view_last,
    v_catalog_open,v_catalog_open_last
  from public.catalog_events;

  select
    count(*) filter(where status='suggested'),
    count(*) filter(where status='suppressed'),
    count(*) filter(where status='dismissed'),
    count(*) filter(where status='converted'),
    count(*) filter(where status='expired'),
    count(*) filter(
      where status in ('suggested','suppressed')
        and expires_at is not null
        and expires_at<=now()
    ),
    min(expires_at) filter(
      where status in ('suggested','suppressed')
        and expires_at is not null
        and expires_at>now()
    )
  into
    v_opp_suggested,v_opp_suppressed,v_opp_dismissed,v_opp_converted,
    v_opp_expired,v_opp_clock_expired_open,v_opp_next_expiry
  from public.customer_marketing_opportunities;

  select
    count(*),
    min(created_at)
  into v_identity_pending,v_identity_oldest
  from public.customer_identity_resolution_evaluations
  where decision='conflict' and review_status='pending';

  select
    count(*),
    count(*) filter(where ai_used=true)
  into v_briefs,v_briefs_ai
  from public.marketing_strategy_briefs
  where status<>'archived';

  select
    count(*),
    count(*) filter(where estimated_cost_brl is not null or actual_cost_brl is not null),
    coalesce(sum(coalesce(actual_cost_brl,estimated_cost_brl,0)),0)
  into v_ai_exec,v_ai_cost_recorded,v_ai_cost
  from public.ai_action_executions;

  if v_channel_account_id is not null then
    select
      count(*) filter(where permission_key in ('whatsapp_business_management','whatsapp_business_messaging')),
      count(*) filter(where permission_key in ('whatsapp_business_management','whatsapp_business_messaging') and status='granted'),
      count(*) filter(where permission_key in ('whatsapp_business_management','whatsapp_business_messaging') and status<>'granted'),
      max(checked_at)
    into v_required_permissions,v_granted_permissions,v_missing_permissions,v_permissions_checked_at
    from public.meta_account_permissions
    where channel_account_id=v_channel_account_id;

    select
      checked_at,
      graph_api_version,
      webhook_state,
      coalesce((capabilities->>'meta_direct_callback_verified')::boolean,false)
    into v_health_checked_at,v_graph_api_version,v_webhook_state,v_direct_callback_verified
    from public.meta_provider_health_snapshots
    where channel_account_id=v_channel_account_id
    order by checked_at desc
    limit 1;
  end if;

  select exists(
    select 1
    from vault.secrets s
    where s.name='dona_antonia_whatsapp_access_token_v1'
  ) into v_vault_token_configured;

  select count(*) into v_marketing_external_7d
  from public.marketing_events
  where external_side_effect=true
    and created_at>=now()-interval '7 days';

  select count(*) into v_ai_external_7d
  from public.ai_action_executions
  where side_effect_performed=true
    and created_at>=now()-interval '7 days';

  return jsonb_build_object(
    'version','cm1-homologation-evidence-v1',
    'generated_at',now(),
    'catalog',jsonb_build_object(
      'catalog_open',v_catalog_open,
      'catalog_open_last_at',v_catalog_open_last,
      'catalog_search',v_catalog_search,
      'catalog_search_last_at',v_catalog_search_last,
      'product_view',v_product_view,
      'product_view_last_at',v_product_view_last
    ),
    'opportunity_lifecycle',jsonb_build_object(
      'suggested',v_opp_suggested,
      'suppressed',v_opp_suppressed,
      'dismissed',v_opp_dismissed,
      'converted',v_opp_converted,
      'expired',v_opp_expired,
      'clock_expired_still_open',v_opp_clock_expired_open,
      'next_expiry_at',v_opp_next_expiry,
      'lifecycle_closed_observed',(v_opp_dismissed+v_opp_converted+v_opp_expired)>0
    ),
    'identity',jsonb_build_object(
      'pending_conflicts',v_identity_pending,
      'oldest_pending_at',v_identity_oldest,
      'human_review_required',v_identity_pending>0
    ),
    'marketing_brain',jsonb_build_object(
      'briefs',v_briefs,
      'ai_briefs',v_briefs_ai
    ),
    'ai_cost',jsonb_build_object(
      'executions',v_ai_exec,
      'executions_with_cost_record',v_ai_cost_recorded,
      'observed_cost_brl',v_ai_cost
    ),
    'meta',jsonb_build_object(
      'channel_account_id',v_channel_account_id,
      'vault_readonly_token_configured',v_vault_token_configured,
      'required_permission_rows',v_required_permissions,
      'granted_required_permissions',v_granted_permissions,
      'missing_required_permissions',v_missing_permissions,
      'permissions_checked_at',v_permissions_checked_at,
      'health_checked_at',v_health_checked_at,
      'graph_api_version',v_graph_api_version,
      'webhook_state',v_webhook_state,
      'direct_callback_verified',v_direct_callback_verified
    ),
    'safety',jsonb_build_object(
      'marketing_external_side_effects_7d',v_marketing_external_7d,
      'ai_side_effects_7d',v_ai_external_7d,
      'external_activation_authorized',coalesce((v_homologation->>'external_activation_authorized')::boolean,false),
      'safe_for_internal_homologation',coalesce((v_homologation->>'safe_for_internal_homologation')::boolean,false)
    ),
    'manual_gates',coalesce(v_homologation->'manual_gates','{}'::jsonb),
    'external_side_effect',false
  );
end;
$fn$;

revoke all on function public.cm1_homologation_evidence_summary_v1()
from public,anon,authenticated;
grant execute on function public.cm1_homologation_evidence_summary_v1()
to service_role;

create or replace function public.relationship_command_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $fn$
select jsonb_build_object(
  'version','cm1.15-v3',
  'customer_profile',public.customer_commercial_profile_summary_v1(),
  'segments',public.segment_engine_summary_v1(),
  'opportunities',public.opportunity_engine_summary_v1(),
  'products',public.product_marketing_readiness_summary_v1(),
  'product_graph',public.product_relation_graph_summary_v1(),
  'marketing_brain',public.marketing_strategy_brief_summary_v1(),
  'templates',public.whatsapp_template_draft_summary_v1(),
  'meta',public.get_meta_control_plane_snapshot_v1(),
  'meta_policy_registry',public.meta_policy_registry_readiness_v1(),
  'meta_direct_readiness',coalesce((
    select public.evaluate_meta_direct_readiness_v1(c.id)
    from public.channel_accounts c
    where c.channel='whatsapp'
    order by c.created_at asc
    limit 1
  ),'{}'::jsonb),
  'provider_adapters',public.channel_provider_adapter_summary_v1(),
  'transport_evidence',public.cm1_transport_evidence_v1(),
  'brands',public.relationship_brand_summary_v1(30),
  'quality',public.relationship_quality_summary_v1(),
  'homologation',public.cm1_homologation_readiness_v1(),
  'acceptance',public.cm1_acceptance_checklist_v1(),
  'homologation_evidence',public.cm1_homologation_evidence_summary_v1(),
  'external_side_effect',false
)
$fn$;

revoke all on function public.relationship_command_summary_v1()
from public,anon,authenticated;
grant execute on function public.relationship_command_summary_v1()
to service_role;
