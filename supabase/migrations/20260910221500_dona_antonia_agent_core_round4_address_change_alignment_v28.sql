begin;

create or replace function public.is_whatsapp_address_change_request_v1(
  p_conversation_id uuid,
  p_message_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.messages m
    where m.id=p_message_id
      and m.conversation_id=p_conversation_id
      and m.direction='inbound'
      and (
        coalesce(m.ai_interpretation->>'id','')='da_basket_change_address'
        or public.service_norm_text_v1(coalesce(m.body_text,m.transcript,'')) ~ '(^| )(alterar|mudar|corrigir)( o)? endereco( |$)'
      )
  );
$$;

revoke all on function public.is_whatsapp_address_change_request_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.is_whatsapp_address_change_request_v1(uuid,uuid) to service_role;

create or replace function public.evaluate_whatsapp_agent_action_preconditions_v2(
  p_conversation_id uuid,
  p_message_id uuid,
  p_action_key text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb:=public.evaluate_whatsapp_agent_action_preconditions_v1(
    p_conversation_id,p_message_id,p_action_key,coalesce(p_input,'{}'::jsonb)
  );
  v_missing jsonb:=coalesce(v_base->'missing','[]'::jsonb);
  v_checks jsonb:=coalesce(v_base->'checks','{}'::jsonb);
  v_unsupported jsonb:=coalesce(v_base->'unsupported','[]'::jsonb);
  v_address_change boolean:=false;
begin
  if p_action_key='wa_request_address_flow'
     and v_missing ? 'address_change_requested' then
    v_address_change:=public.is_whatsapp_address_change_request_v1(p_conversation_id,p_message_id);
    if v_address_change then
      select coalesce(jsonb_agg(e.value),'[]'::jsonb)
        into v_missing
      from jsonb_array_elements(v_missing) e(value)
      where e.value <> to_jsonb('address_change_requested'::text);
      v_checks:=v_checks||jsonb_build_object('address_change_requested',true);
    end if;
  end if;

  return v_base||jsonb_build_object(
    'ready',jsonb_array_length(v_missing)=0 and jsonb_array_length(v_unsupported)=0,
    'missing',v_missing,
    'checks',v_checks,
    'precondition_semantics_version',2,
    'address_change_detector','router_parity_v1',
    'pii_returned',false
  );
end
$$;

revoke all on function public.evaluate_whatsapp_agent_action_preconditions_v2(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.evaluate_whatsapp_agent_action_preconditions_v2(uuid,uuid,text,jsonb) to service_role;

create or replace function public.preview_whatsapp_agent_action_v2(
  p_conversation_id uuid,
  p_message_id uuid,
  p_action_key text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb;
  pre jsonb;
  allowed boolean;
  decision text;
begin
  base:=public.preview_whatsapp_agent_action_v1(p_conversation_id,p_action_key,coalesce(p_input,'{}'::jsonb));
  if coalesce((base->>'allowed')::boolean,false) is not true then
    return base||jsonb_build_object('precondition_version',3,'state_preconditions',null);
  end if;

  pre:=public.evaluate_whatsapp_agent_action_preconditions_v2(p_conversation_id,p_message_id,p_action_key,coalesce(p_input,'{}'::jsonb));
  allowed:=coalesce((pre->>'ready')::boolean,false);
  decision:=case when not allowed then 'blocked' else coalesce(base->>'decision','blocked') end;

  return base||jsonb_build_object(
    'allowed',allowed,
    'decision',decision,
    'reasons',coalesce(base->'reasons','[]'::jsonb)||coalesce(pre->'missing','[]'::jsonb)||coalesce(pre->'unsupported','[]'::jsonb),
    'precondition_version',3,
    'state_preconditions',pre
  );
end
$$;

revoke all on function public.preview_whatsapp_agent_action_v2(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.preview_whatsapp_agent_action_v2(uuid,uuid,text,jsonb) to service_role;

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
           o.router_family,
           case o.action
             when 'change_basket_delivery_address' then 'change_basket_delivery_address_flow'
             when 'address_flow_reopened' then 'change_basket_delivery_address_flow'
             when 'address_flow_from_legacy_state' then 'change_basket_delivery_address_flow'
             when 'basket_payment_selected' then 'basket_payment_selection'
             when 'basket_payment_confirmation' then 'basket_final_confirmation'
             else o.action
           end as action,
           o.match_source,o.observed_at
    from public.agent_core_pre_router_snapshots s
    join public.agent_core_legacy_router_observations o on o.ai_job_id=s.ai_job_id
    where s.observed_at>=now()-make_interval(hours=>v_hours)
  ), stateful as (
    select * from joined
    where action in (
      'basket_customer_data_processed','confirm_order','basket_ready_for_human',
      'change_basket_delivery_address_flow','basket_swap_showcase','basket_swap_source_required',
      'basket_keep_and_checkout','basket_storefront_link','basket_payment_selection',
      'basket_final_confirmation','request_customer_base_data'
    )
       or router_family in ('basket_payment_checkout','checkout_flow')
  )
  select count(*)::integer into v_stateful from stateful;

  with joined as (
    select s.ai_job_id,s.awaiting,s.interactive_id,s.basket_session_active,s.cart_valid,
           s.customer_registered,s.address_known,s.open_handoff,s.service_window_open,
           o.router_family,
           case o.action
             when 'change_basket_delivery_address' then 'change_basket_delivery_address_flow'
             when 'address_flow_reopened' then 'change_basket_delivery_address_flow'
             when 'address_flow_from_legacy_state' then 'change_basket_delivery_address_flow'
             when 'basket_payment_selected' then 'basket_payment_selection'
             when 'basket_payment_confirmation' then 'basket_final_confirmation'
             else o.action
           end as action,
           o.match_source
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
    select coalesce(nullif(s.awaiting,''),'none') awaiting,o.router_family,
           case o.action
             when 'change_basket_delivery_address' then 'change_basket_delivery_address_flow'
             when 'address_flow_reopened' then 'change_basket_delivery_address_flow'
             when 'address_flow_from_legacy_state' then 'change_basket_delivery_address_flow'
             when 'basket_payment_selected' then 'basket_payment_selection'
             when 'basket_payment_confirmation' then 'basket_final_confirmation'
             else o.action
           end as action
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
    ('change_basket_delivery_address_flow'::text,3)
  ), normalized as (
    select s.ai_job_id,
           case o.action
             when 'change_basket_delivery_address' then 'change_basket_delivery_address_flow'
             when 'address_flow_reopened' then 'change_basket_delivery_address_flow'
             when 'address_flow_from_legacy_state' then 'change_basket_delivery_address_flow'
             when 'basket_payment_selected' then 'basket_payment_selection'
             when 'basket_payment_confirmation' then 'basket_final_confirmation'
             else o.action
           end as action
    from public.agent_core_pre_router_snapshots s
    join public.agent_core_legacy_router_observations o on o.ai_job_id=s.ai_job_id
    where s.observed_at>=now()-make_interval(hours=>v_hours)
  ), counts as (
    select action,count(distinct ai_job_id)::integer n
    from normalized
    group by action
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'action',t.action,'sample_count',coalesce(c.n,0),'minimum_required',t.min_samples
  ) order by t.action),'[]'::jsonb)
  into v_missing
  from targets t left join counts c using(action)
  where coalesce(c.n,0)<t.min_samples;

  v_ready:=jsonb_array_length(v_missing)=0;

  return jsonb_build_object(
    'version',3,
    'window_hours',v_hours,
    'snapshot_rows',v_rows,
    'joined_router_observations',v_joined,
    'stateful_observation_count',v_stateful,
    'actions',v_actions,
    'awaiting_coverage',v_awaiting,
    'minimum_stateful_samples_per_core_action',3,
    'missing_core_action_samples',v_missing,
    'canonical_action_aliases',jsonb_build_object(
      'change_basket_delivery_address','change_basket_delivery_address_flow',
      'address_flow_reopened','change_basket_delivery_address_flow',
      'address_flow_from_legacy_state','change_basket_delivery_address_flow',
      'basket_payment_selected','basket_payment_selection',
      'basket_payment_confirmation','basket_final_confirmation'
    ),
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

create or replace function public.get_agent_core_round4_address_change_alignment_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'version',1,
    'round','4/6',
    'precondition_preview_version',3,
    'detector','is_whatsapp_address_change_request_v1',
    'router_parity_regex',true,
    'reopened_alias_normalized',true,
    'legacy_state_alias_normalized',true,
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false,
    'synthetic_backfill_allowed',false,
    'pii_returned',false
  );
$$;

revoke all on function public.get_agent_core_round4_address_change_alignment_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_address_change_alignment_readiness_v1() to service_role;

commit;