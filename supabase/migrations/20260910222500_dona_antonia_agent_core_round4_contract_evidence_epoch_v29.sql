begin;

alter table public.agent_core_router_action_contracts
  add column if not exists evidence_valid_since timestamptz;

update public.agent_core_router_action_contracts
set evidence_valid_since=coalesce(
  (select to_timestamp(version,'YYYYMMDDHH24MISS')
   from supabase_migrations.schema_migrations
   where name='dona_antonia_agent_core_round4_address_change_alignment_v28'
   order by version desc limit 1),
  now()
), updated_at=now()
where trigger_name='aaa_whatsapp_basket_payment_checkout_v1'
  and legacy_action in ('change_basket_delivery_address_flow','address_flow_reopened','address_flow_from_legacy_state');

create or replace function public.get_agent_core_round4_action_tool_parity_v2(p_hours integer default 168)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_hours integer:=greatest(1,least(coalesce(p_hours,168),720));
  v_v20_start timestamptz;
  v_rows jsonb:='[]'::jsonb;
  v_total integer:=0;
  v_runtime_complete integer:=0;
  v_evidence_ready integer:=0;
  v_unmapped integer:=0;
begin
  select to_timestamp(version,'YYYYMMDDHH24MISS') into v_v20_start
  from supabase_migrations.schema_migrations
  where name='dona_antonia_agent_core_round4_pre_router_shadow_packet_v20'
  order by version desc limit 1;
  v_v20_start:=coalesce(v_v20_start,now());

  with contracts as (
    select c.*,
      greatest(v_v20_start,coalesce(c.evidence_valid_since,v_v20_start)) as effective_valid_since,
      case
        when cardinality(c.expected_tools)=0 then true
        when c.tool_match_mode='all' then not exists(
          select 1 from unnest(c.expected_tools) x(tool_key)
          where not exists(
            select 1 from public.ai_action_registry a
            where a.action_key=x.tool_key and a.enabled and a.execution_mode='observe'
              and coalesce((a.metadata->>'edge_allowlist_pending')::boolean,false)=false
              and coalesce((a.metadata->>'executor_mapping_pending')::boolean,false)=false
          )
        )
        else exists(
          select 1 from unnest(c.expected_tools) x(tool_key)
          join public.ai_action_registry a on a.action_key=x.tool_key
          where a.enabled and a.execution_mode='observe'
            and coalesce((a.metadata->>'edge_allowlist_pending')::boolean,false)=false
            and coalesce((a.metadata->>'executor_mapping_pending')::boolean,false)=false
        )
      end as runtime_contract_complete,
      coalesce((select jsonb_agg(x.tool_key order by x.tool_key)
        from unnest(c.expected_tools) x(tool_key)
        where not exists(select 1 from public.ai_action_registry a where a.action_key=x.tool_key and a.enabled and a.execution_mode='observe'
          and coalesce((a.metadata->>'edge_allowlist_pending')::boolean,false)=false
          and coalesce((a.metadata->>'executor_mapping_pending')::boolean,false)=false)),'[]'::jsonb) as runtime_pending_tools
    from public.agent_core_router_action_contracts c
  ), samples as (
    select c.id,o.ai_job_id,t.id turn_id,t.decision_intent,coalesce(t.metadata->>'next_action','') next_action,
      coalesce(array_agg(distinct tc.tool_key) filter(where tc.tool_key is not null),'{}'::text[]) chosen_tools
    from contracts c
    join public.agent_core_legacy_router_observations o on o.action=c.legacy_action
    join public.agent_core_pre_router_snapshots s on s.ai_job_id=o.ai_job_id and s.observed_at>=c.effective_valid_since
    left join lateral (
      select at.* from public.agent_core_turns at
      where at.ai_job_id=o.ai_job_id and at.status='planned' and at.model is not null
      order by at.created_at desc limit 1
    ) t on true
    left join public.agent_core_tool_calls tc on tc.turn_id=t.id
    where o.observed_at>=now()-make_interval(hours=>v_hours)
    group by c.id,o.ai_job_id,t.id,t.decision_intent,t.metadata
  ), scored as (
    select c.*,
      count(s.ai_job_id) filter(where s.turn_id is not null)::integer sample_count,
      count(s.ai_job_id) filter(where s.turn_id is not null and
        (case when c.tool_match_mode='none' then true
              when c.tool_match_mode='all' then c.expected_tools <@ s.chosen_tools
              else c.expected_tools && s.chosen_tools end)
        and (cardinality(c.expected_intents)=0 or s.decision_intent=any(c.expected_intents))
        and (cardinality(c.expected_next_actions)=0 or s.next_action=any(c.expected_next_actions))
      )::integer aligned_count
    from contracts c
    left join samples s on s.id=c.id
    group by c.id,c.trigger_name,c.router_function,c.legacy_action,c.expected_tools,c.tool_match_mode,c.expected_intents,c.expected_next_actions,c.minimum_samples,c.requires_pre_router_snapshot,c.notes,c.updated_at,c.evidence_valid_since,c.effective_valid_since,c.runtime_contract_complete,c.runtime_pending_tools
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'trigger',trigger_name,'legacy_action',legacy_action,'expected_tools',to_jsonb(expected_tools),
      'tool_match_mode',tool_match_mode,'expected_intents',to_jsonb(expected_intents),'expected_next_actions',to_jsonb(expected_next_actions),
      'runtime_contract_complete',runtime_contract_complete,'runtime_pending_tools',runtime_pending_tools,
      'sample_count',sample_count,'aligned_count',aligned_count,
      'alignment_rate',case when sample_count>0 then round(aligned_count::numeric/sample_count,4) else null end,
      'minimum_samples',minimum_samples,
      'evidence_valid_since',evidence_valid_since,
      'effective_valid_since',effective_valid_since,
      'evidence_ready',runtime_contract_complete and sample_count>=minimum_samples and aligned_count::numeric/sample_count>=0.95,
      'notes',notes
    ) order by trigger_name,legacy_action),'[]'::jsonb),
    count(*)::integer,
    count(*) filter(where runtime_contract_complete)::integer,
    count(*) filter(where runtime_contract_complete and sample_count>=minimum_samples and aligned_count::numeric/sample_count>=0.95)::integer
  into v_rows,v_total,v_runtime_complete,v_evidence_ready
  from scored;

  with target(trigger_name,router_function) as (values
    ('aaa_whatsapp_basket_payment_checkout_v1'::text,'route_whatsapp_basket_payment_checkout_v1'::text),
    ('ab_whatsapp_checkout_flow_v1','whatsapp_checkout_flow_router_v1'),
    ('trg_001_whatsapp_basket_fallback_v1','route_whatsapp_basket_fallback_v1'),
    ('trg_00_route_whatsapp_basket_swap_v1','route_whatsapp_basket_swap_ai_job_v1'),
    ('trg_01_whatsapp_basket_personalization_choice_v1','route_whatsapp_basket_personalization_choice_v1'),
    ('trg_route_whatsapp_basic_sales_ai_job_v1','route_whatsapp_basic_sales_ai_job_v1')
  ), defs as (
    select t.trigger_name,t.router_function,pg_get_functiondef(p.oid) d
    from target t join pg_proc p on p.proname=t.router_function
    join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
  ), literals as (
    select d.trigger_name,d.router_function,m[1] legacy_action
    from defs d cross join lateral regexp_matches(d.d,'''action''\s*,\s*''([^'']+)''','g') m
  )
  select count(*)::integer into v_unmapped
  from literals l
  where not exists(select 1 from public.agent_core_router_action_contracts c where c.trigger_name=l.trigger_name and c.legacy_action=l.legacy_action);

  return jsonb_build_object(
    'version',2,
    'window_hours',v_hours,
    'valid_snapshot_since',v_v20_start,
    'contract_count',v_total,
    'runtime_complete_count',v_runtime_complete,
    'runtime_pending_count',v_total-v_runtime_complete,
    'evidence_ready_count',v_evidence_ready,
    'unmapped_static_action_count',v_unmapped,
    'all_static_actions_mapped',v_unmapped=0,
    'all_runtime_contracts_complete',v_runtime_complete=v_total,
    'all_evidence_ready',v_evidence_ready=v_total,
    'minimum_alignment_rate',0.95,
    'per_contract_evidence_epoch',true,
    'historical_failures_preserved',true,
    'historical_backfill_allowed',false,
    'pre_router_snapshot_required',true,
    'execution_authorized',false,
    'retirement_authorized',false,
    'pii_payload_returned',false,
    'contracts',v_rows,
    'reason',case
      when v_unmapped>0 then 'legacy_action_contracts_missing'
      when v_runtime_complete<v_total then 'runtime_tool_surface_pending'
      when v_evidence_ready<v_total then 'awaiting_pre_router_shadow_alignment_samples'
      else 'action_tool_parity_thresholds_met' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_action_tool_parity_v2(integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_action_tool_parity_v2(integer) to service_role;

create or replace function public.get_agent_core_round4_action_tool_parity_v1(p_hours integer default 168)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select public.get_agent_core_round4_action_tool_parity_v2(p_hours);
$$;

revoke all on function public.get_agent_core_round4_action_tool_parity_v1(integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_action_tool_parity_v1(integer) to service_role;

commit;