begin;

create or replace function public.get_agent_core_round4_stateful_evidence_report_v1(p_hours integer default 168)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_hours integer:=greatest(1,least(coalesce(p_hours,168),720));
  v_rows integer:=0;
  v_joined integer:=0;
  v_stateful integer:=0;
  v_actions jsonb:='[]'::jsonb;
  v_awaiting jsonb:='[]'::jsonb;
  v_missing jsonb:='[]'::jsonb;
  v_ready boolean:=false;
begin
  select count(*)::integer into v_rows
  from public.agent_core_pre_router_snapshots s
  where s.observed_at>=now()-make_interval(hours=>v_hours);

  select count(*)::integer into v_joined
  from public.agent_core_pre_router_snapshots s
  join public.agent_core_legacy_router_observations o on o.ai_job_id=s.ai_job_id
  where s.observed_at>=now()-make_interval(hours=>v_hours);

  with joined as (
    select s.ai_job_id,s.awaiting,s.interactive_id,s.basket_session_active,s.cart_valid,
           s.customer_registered,s.address_known,s.open_handoff,s.service_window_open,
           o.router_family,o.action,o.match_source,o.observed_at
    from public.agent_core_pre_router_snapshots s
    join public.agent_core_legacy_router_observations o on o.ai_job_id=s.ai_job_id
    where s.observed_at>=now()-make_interval(hours=>v_hours)
  ), stateful as (
    select * from joined
    where action in (
      'basket_customer_data_processed','confirm_order','basket_ready_for_human',
      'change_basket_delivery_address','basket_swap_showcase','basket_swap_source_required',
      'basket_keep_and_checkout','basket_storefront_link','basket_payment_selected',
      'basket_payment_confirmation','request_customer_base_data'
    )
       or router_family in ('basket_payment_checkout','checkout_flow')
  )
  select count(*)::integer into v_stateful from stateful;

  with joined as (
    select s.ai_job_id,s.awaiting,s.interactive_id,s.basket_session_active,s.cart_valid,
           s.customer_registered,s.address_known,s.open_handoff,s.service_window_open,
           o.router_family,o.action,o.match_source
    from public.agent_core_pre_router_snapshots s
    join public.agent_core_legacy_router_observations o on o.ai_job_id=s.ai_job_id
    where s.observed_at>=now()-make_interval(hours=>v_hours)
  ), grouped as (
    select router_family,action,match_source,count(*)::integer sample_count,
           count(*) filter(where basket_session_active)::integer basket_session_count,
           count(*) filter(where cart_valid)::integer cart_valid_count,
           count(*) filter(where customer_registered)::integer customer_registered_count,
           count(*) filter(where address_known)::integer address_known_count,
           count(*) filter(where open_handoff)::integer open_handoff_count,
           count(*) filter(where service_window_open)::integer service_window_open_count
    from joined
    group by router_family,action,match_source
    order by router_family,action,match_source
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'router_family',router_family,'action',action,'match_source',match_source,
    'sample_count',sample_count,'basket_session_count',basket_session_count,
    'cart_valid_count',cart_valid_count,'customer_registered_count',customer_registered_count,
    'address_known_count',address_known_count,'open_handoff_count',open_handoff_count,
    'service_window_open_count',service_window_open_count
  )),'[]'::jsonb) into v_actions from grouped;

  with joined as (
    select coalesce(nullif(s.awaiting,''),'none') awaiting,o.router_family,o.action
    from public.agent_core_pre_router_snapshots s
    join public.agent_core_legacy_router_observations o on o.ai_job_id=s.ai_job_id
    where s.observed_at>=now()-make_interval(hours=>v_hours)
  ), grouped as (
    select awaiting,count(*)::integer sample_count,
           count(distinct router_family)::integer router_family_count,
           count(distinct action)::integer action_count
    from joined group by awaiting order by awaiting
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'awaiting',awaiting,'sample_count',sample_count,
    'router_family_count',router_family_count,'action_count',action_count
  )),'[]'::jsonb) into v_awaiting from grouped;

  with targets(action,min_samples) as (values
    ('basket_customer_data_processed'::text,3),
    ('confirm_order'::text,3),
    ('basket_ready_for_human'::text,3),
    ('change_basket_delivery_address'::text,3)
  ), counts as (
    select o.action,count(distinct s.ai_job_id)::integer n
    from public.agent_core_pre_router_snapshots s
    join public.agent_core_legacy_router_observations o on o.ai_job_id=s.ai_job_id
    where s.observed_at>=now()-make_interval(hours=>v_hours)
    group by o.action
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'action',t.action,'sample_count',coalesce(c.n,0),'minimum_required',t.min_samples
  ) order by t.action),'[]'::jsonb)
  into v_missing
  from targets t left join counts c using(action)
  where coalesce(c.n,0)<t.min_samples;

  v_ready:=jsonb_array_length(v_missing)=0;

  return jsonb_build_object(
    'version',1,
    'window_hours',v_hours,
    'snapshot_rows',v_rows,
    'joined_router_observations',v_joined,
    'stateful_observation_count',v_stateful,
    'actions',v_actions,
    'awaiting_coverage',v_awaiting,
    'minimum_stateful_samples_per_core_action',3,
    'missing_core_action_samples',v_missing,
    'evidence_ready',v_ready,
    'retirement_authorized',false,
    'execution_authorized',false,
    'historical_backfill_allowed',false,
    'pii_payload_in_report',false,
    'reason',case when v_rows=0 then 'awaiting_new_homologation_snapshots'
                  when not v_ready then 'insufficient_stateful_action_coverage'
                  else 'stateful_structural_evidence_threshold_met' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_stateful_evidence_report_v1(integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_stateful_evidence_report_v1(integer) to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v10()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb:=public.get_agent_core_round4_consolidated_readiness_v9();
  ev jsonb:=public.get_agent_core_round4_stateful_evidence_report_v1(168);
begin
  return base || jsonb_build_object(
    'version',10,
    'stateful_evidence',ev,
    'stateful_evidence_ready',coalesce((ev->>'evidence_ready')::boolean,false),
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false,
    'global_retirement_ready',false,
    'reason',case
      when not coalesce((base->>'pre_router_snapshot_ready')::boolean,false) then base->>'reason'
      when not coalesce((ev->>'evidence_ready')::boolean,false) then ev->>'reason'
      else base->>'reason' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v10() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v10() to service_role;

commit;
