begin;

create or replace function public.dispatch_whatsapp_agent_core_historical_replay_v1(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_check jsonb;
  v_secret text;
  v_request bigint;
  v_job public.ai_jobs%rowtype;
  v_cfg public.agent_core_runtime_config%rowtype;
begin
  if p_job_id is null then
    return jsonb_build_object('eligible',false,'dispatched',false,'reason','job_id_required');
  end if;

  select * into v_job from public.ai_jobs where id=p_job_id;
  if not found then
    return jsonb_build_object('eligible',false,'dispatched',false,'reason','job_not_found');
  end if;

  select * into v_cfg from public.agent_core_runtime_config where id=1;
  if not found or v_cfg.execution_mode<>'observe' then
    return jsonb_build_object('eligible',false,'dispatched',false,'reason','observe_mode_required');
  end if;

  v_check:=public.is_whatsapp_agent_core_shadow_eligible_v2(p_job_id,true);
  if coalesce((v_check->>'eligible')::boolean,false) is not true
     or coalesce(v_check->>'reason','')<>'authorized_homologation_historical_replay_v3'
     or coalesce((v_check->>'historical_context')::boolean,false) is not true then
    return v_check||jsonb_build_object('dispatched',false);
  end if;

  if exists(
    select 1 from public.agent_core_turns t
    where t.message_id=v_job.message_id
      and t.agent_version=v_cfg.agent_version
      and t.execution_mode='observe'
      and t.model is not null
  ) then
    return jsonb_build_object(
      'eligible',false,'dispatched',false,'reason','message_already_evaluated',
      'job_id',p_job_id,'historical_context',true
    );
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='agent_core_webhook_key_v1'
  order by created_at desc limit 1;
  if v_secret is null then
    return jsonb_build_object('eligible',false,'dispatched',false,'reason','agent_core_secret_missing');
  end if;

  begin
    v_request:=net.http_post(
      url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/dona-antonia-agent-core-v1',
      headers:=jsonb_build_object('Content-Type','application/json','x-da-agent-key',v_secret),
      body:=jsonb_build_object('event','shadow','job_id',p_job_id,'replay',true),
      timeout_milliseconds:=120000
    );

    insert into public.whatsapp_ops_events(event_type,severity,conversation_id,ai_job_id,details)
    values(
      'agent_core_historical_replay_dispatched','info',v_job.conversation_id,v_job.id,
      jsonb_build_object(
        'request_id',v_request,
        'agent_version',v_cfg.agent_version,
        'historical_context',true,
        'replay_policy','stateless_homologation_v3',
        'message_body_stored',false,
        'commercial_side_effects_permitted',false
      )
    );

    return jsonb_build_object(
      'eligible',true,'dispatched',true,'request_id',v_request,'job_id',p_job_id,
      'historical_context',true,'replay_policy','stateless_homologation_v3',
      'commercial_side_effects_permitted',false
    );
  exception when others then
    insert into public.whatsapp_ops_events(event_type,severity,conversation_id,ai_job_id,details)
    values('agent_core_historical_replay_dispatch_failed','warning',v_job.conversation_id,v_job.id,
      jsonb_build_object('agent_version',v_cfg.agent_version,'historical_context',true));
    return jsonb_build_object('eligible',true,'dispatched',false,'reason','historical_replay_dispatch_failed');
  end;
end
$$;

revoke all on function public.dispatch_whatsapp_agent_core_historical_replay_v1(uuid) from public,anon,authenticated;
grant execute on function public.dispatch_whatsapp_agent_core_historical_replay_v1(uuid) to service_role;

create or replace function public.get_agent_core_round4_safe_replay_dispatcher_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'version',1,
    'round','4/6',
    'dispatcher','dispatch_whatsapp_agent_core_historical_replay_v1',
    'eligibility','is_whatsapp_agent_core_shadow_eligible_v2',
    'required_reason','authorized_homologation_historical_replay_v3',
    'replay_flag',true,
    'observe_only',true,
    'duplicate_message_guard',true,
    'secret_source','vault_internal_only',
    'message_body_logged',false,
    'commercial_side_effects_permitted',false,
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false
  );
$$;

revoke all on function public.get_agent_core_round4_safe_replay_dispatcher_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_safe_replay_dispatcher_readiness_v1() to service_role;

commit;