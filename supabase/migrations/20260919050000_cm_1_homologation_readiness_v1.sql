-- CM-1 Homologation Readiness v1
-- Read-only readiness snapshot. It never authorizes external activation.

create or replace function public.cm1_homologation_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $fn$
declare
  v_channel public.channel_accounts%rowtype;
  v_marketing public.marketing_runtime_config%rowtype;
  v_direct public.whatsapp_direct_config%rowtype;
  v_legacy public.automation_config%rowtype;
  v_adapter public.channel_provider_adapters%rowtype;
  v_enabled_templates integer:=0;
  v_meta_errors integer:=0;
  v_identity_conflicts integer:=0;
  v_marketing_external_7d integer:=0;
  v_ai_side_effect_7d integer:=0;
  v_positive_consent integer:=0;
  v_warnings text[]:='{}'::text[];
  v_blockers text[]:='{}'::text[];
  v_safe_internal boolean:=false;
begin
  select * into v_channel
  from public.channel_accounts
  where channel='whatsapp' and status='active'
  order by updated_at desc limit 1;

  select * into v_marketing from public.marketing_runtime_config where id=1;
  select * into v_direct from public.whatsapp_direct_config where id=1;
  select * into v_legacy from public.automation_config where id=1;

  select * into v_adapter
  from public.channel_provider_adapters
  where provider_key='papoai' and channel='whatsapp'
  order by updated_at desc limit 1;

  select count(*) into v_enabled_templates
  from public.whatsapp_direct_templates
  where enabled=true;

  select count(*) into v_meta_errors
  from public.meta_control_plane_errors
  where resolved_at is null;

  select count(*) into v_identity_conflicts
  from public.customer_identity_resolution_evaluations
  where decision='conflict' and review_status='pending';

  select count(*) into v_marketing_external_7d
  from public.marketing_events
  where external_side_effect=true and created_at>=now()-interval '7 days';

  select count(*) into v_ai_side_effect_7d
  from public.ai_action_executions
  where side_effect_performed=true and created_at>=now()-interval '7 days';

  select count(distinct customer_id) into v_positive_consent
  from public.customer_consent_current_v1
  where channel='whatsapp' and purpose='marketing' and status='granted';

  if v_channel.id is null then v_blockers:=array_append(v_blockers,'canonical_whatsapp_account_missing'); end if;
  if coalesce(v_channel.outbound_enabled,false) then v_blockers:=array_append(v_blockers,'canonical_whatsapp_outbound_enabled'); end if;
  if coalesce(v_channel.ai_enabled,false) then v_blockers:=array_append(v_blockers,'canonical_whatsapp_ai_enabled'); end if;
  if coalesce(v_channel.auto_reply_enabled,false) then v_blockers:=array_append(v_blockers,'canonical_whatsapp_auto_reply_enabled'); end if;
  if coalesce(v_channel.canary_percent,0)>0 then v_blockers:=array_append(v_blockers,'canonical_whatsapp_canary_above_zero'); end if;

  if coalesce(v_marketing.enabled,false) then v_blockers:=array_append(v_blockers,'marketing_runtime_enabled'); end if;
  if coalesce(v_marketing.execution_mode,'off')<>'off' then v_blockers:=array_append(v_blockers,'marketing_execution_mode_not_off'); end if;
  if coalesce(v_marketing.publishing_enabled,false) then v_blockers:=array_append(v_blockers,'marketing_publishing_enabled'); end if;
  if coalesce(v_marketing.max_daily_publications,0)>0 then v_blockers:=array_append(v_blockers,'marketing_publication_budget_open'); end if;
  if coalesce(v_marketing.max_daily_ai_cost_cents,0)>0 then v_warnings:=array_append(v_warnings,'marketing_ai_cost_budget_open'); end if;
  if not coalesce(v_marketing.kill_switch,true) then v_blockers:=array_append(v_blockers,'marketing_kill_switch_off'); end if;

  if coalesce(v_direct.enabled,false) then v_blockers:=array_append(v_blockers,'whatsapp_direct_enabled'); end if;
  if coalesce(v_direct.release_mode,'off')<>'off' then v_blockers:=array_append(v_blockers,'whatsapp_direct_release_not_off'); end if;

  if v_adapter.id is null then
    v_blockers:=array_append(v_blockers,'papoai_adapter_missing');
  elsif coalesce(v_adapter.outbound_mode,'disabled')<>'disabled' then
    v_blockers:=array_append(v_blockers,'papoai_adapter_outbound_enabled');
  end if;

  if v_enabled_templates>0 then v_blockers:=array_append(v_blockers,'runtime_templates_enabled'); end if;
  if v_meta_errors>0 then v_warnings:=array_append(v_warnings,'unresolved_meta_errors'); end if;
  if v_identity_conflicts>0 then v_warnings:=array_append(v_warnings,'identity_conflicts_pending'); end if;
  if v_marketing_external_7d>0 then v_warnings:=array_append(v_warnings,'recent_marketing_external_side_effects'); end if;
  if v_ai_side_effect_7d>0 then v_warnings:=array_append(v_warnings,'recent_ai_side_effects'); end if;
  if v_positive_consent=0 then v_warnings:=array_append(v_warnings,'no_positive_marketing_consent'); end if;

  -- Legacy automation flags are informational because canonical channel gates are authoritative for CM-1.
  if coalesce(v_legacy.outbound_enabled,false) and coalesce(v_legacy.whatsapp_release_mode,'off')='live' then
    v_warnings:=array_append(v_warnings,'legacy_automation_outbound_live_but_canonical_gate_closed');
  end if;

  v_safe_internal:=cardinality(v_blockers)=0;

  return jsonb_build_object(
    'version','cm1-homologation-v1',
    'generated_at',now(),
    'phase','internal_homologation',
    'safe_for_internal_homologation',v_safe_internal,
    'external_activation_authorized',false,
    'blockers',to_jsonb(v_blockers),
    'warnings',to_jsonb(v_warnings),
    'manual_gates',jsonb_build_object(
      'customer_os_pin_browser_validation','pending',
      'relationship_center_pin_browser_validation','pending',
      'meta_policy_registry_verification','pending',
      'meta_direct_homologation','pending',
      'external_activation','not_authorized'
    ),
    'canonical_channel',jsonb_build_object(
      'present',v_channel.id is not null,
      'inbound_enabled',coalesce(v_channel.inbound_enabled,false),
      'outbound_enabled',coalesce(v_channel.outbound_enabled,false),
      'ai_enabled',coalesce(v_channel.ai_enabled,false),
      'auto_reply_enabled',coalesce(v_channel.auto_reply_enabled,false),
      'canary_percent',coalesce(v_channel.canary_percent,0),
      'provider_current',v_channel.capabilities->>'provider_current',
      'meta_direct_ready',coalesce((v_channel.capabilities->>'meta_direct_ready')::boolean,false)
    ),
    'marketing',jsonb_build_object(
      'enabled',coalesce(v_marketing.enabled,false),
      'execution_mode',coalesce(v_marketing.execution_mode,'off'),
      'kill_switch',coalesce(v_marketing.kill_switch,true),
      'publishing_enabled',coalesce(v_marketing.publishing_enabled,false),
      'max_daily_publications',coalesce(v_marketing.max_daily_publications,0),
      'max_daily_ai_cost_cents',coalesce(v_marketing.max_daily_ai_cost_cents,0)
    ),
    'whatsapp_direct',jsonb_build_object(
      'enabled',coalesce(v_direct.enabled,false),
      'release_mode',coalesce(v_direct.release_mode,'off')
    ),
    'provider_adapter',jsonb_build_object(
      'provider_key',v_adapter.provider_key,
      'status',v_adapter.status,
      'inbound_mode',v_adapter.inbound_mode,
      'outbound_mode',v_adapter.outbound_mode,
      'tag_read_state',v_adapter.tag_read_state,
      'tag_write_state',v_adapter.tag_write_state
    ),
    'counters',jsonb_build_object(
      'enabled_runtime_templates',v_enabled_templates,
      'unresolved_meta_errors',v_meta_errors,
      'identity_conflicts_pending',v_identity_conflicts,
      'positive_marketing_consent_customers',v_positive_consent,
      'marketing_external_side_effects_7d',v_marketing_external_7d,
      'ai_side_effects_7d',v_ai_side_effect_7d
    ),
    'legacy_observation',jsonb_build_object(
      'automation_enabled',coalesce(v_legacy.automation_enabled,false),
      'outbound_enabled',coalesce(v_legacy.outbound_enabled,false),
      'release_mode',coalesce(v_legacy.whatsapp_release_mode,'off'),
      'auto_reply_enabled',coalesce(v_legacy.whatsapp_auto_reply_enabled,false),
      'ai_enabled',coalesce(v_legacy.ai_enabled,false)
    ),
    'external_side_effect',false
  );
end;
$fn$;

revoke all on function public.cm1_homologation_readiness_v1() from public,anon,authenticated;
grant execute on function public.cm1_homologation_readiness_v1() to service_role;

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
  'homologation',public.cm1_homologation_readiness_v1(),
  'external_side_effect',false
)
$fn$;

revoke all on function public.relationship_command_summary_v1() from public,anon,authenticated;
grant execute on function public.relationship_command_summary_v1() to service_role;
