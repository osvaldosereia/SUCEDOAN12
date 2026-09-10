begin;

create or replace function public.preview_whatsapp_agent_action_v1(
  p_conversation_id uuid,
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
  open_handoff boolean;
  v_risk_class text;
  v_homologation boolean:=false;
  v_active_historical_replay boolean:=false;
begin
  select a.risk_class into v_risk_class
  from public.ai_action_registry a
  where a.action_key=p_action_key and a.enabled=true;

  select coalesce(c.automation_cohort,'')='homologation'
  into v_homologation
  from public.conversations c
  where c.id=p_conversation_id;

  if v_homologation and v_risk_class='read_only' then
    select exists(
      select 1
      from public.agent_core_turns t
      where t.conversation_id=p_conversation_id
        and t.execution_mode='observe'
        and t.status='observed'
        and coalesce((t.metadata->>'replay')::boolean,false)=true
        and t.created_at>=now()-interval '5 minutes'
    ) into v_active_historical_replay;
  end if;

  if v_active_historical_replay then
    -- Exclusivamente para replay historico stateless de homologacao:
    -- consultas read-only podem ignorar o handoff ATUAL, pois nao alteram estado.
    open_handoff:=false;
  else
    select exists(
      select 1 from public.human_handoffs h
      where h.conversation_id=p_conversation_id and h.status='open'
    ) into open_handoff;
  end if;

  return public.simulate_ai_action_v1(
    p_action_key,
    coalesce(p_input,'{}'::jsonb),
    'whatsapp',
    'system',
    null,
    open_handoff
  );
end
$$;

revoke all on function public.preview_whatsapp_agent_action_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.preview_whatsapp_agent_action_v1(uuid,text,jsonb) to service_role;

create or replace function public.get_agent_core_round4_replay_policy_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'version',1,
  'homologation_only',true,
  'read_only_only',true,
  'active_replay_required',true,
  'active_window_minutes',5,
  'write_bypass_allowed',false,
  'handoff_live_precedence_preserved',true
);
$$;

revoke all on function public.get_agent_core_round4_replay_policy_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_replay_policy_readiness_v1() to service_role;

commit;