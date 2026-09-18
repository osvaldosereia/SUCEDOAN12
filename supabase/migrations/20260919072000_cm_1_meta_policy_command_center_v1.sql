-- CM-1 homologation: expose Meta policy/direct read-only readiness in Relationship Command Center.
-- No external side effects and no activation changes.

create or replace function public.relationship_command_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $fn$
select jsonb_build_object(
  'version','cm1.15-v2',
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
  'external_side_effect',false
)
$fn$;

revoke all on function public.relationship_command_summary_v1()
from public,anon,authenticated;
grant execute on function public.relationship_command_summary_v1()
to service_role;
