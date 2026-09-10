begin;

-- Rodada 2/6 — execução OpenAI em shadow, sem outbound e sem side effects comerciais.
alter table public.agent_core_runtime_config
  add column if not exists shadow_openai_enabled boolean not null default true,
  add column if not exists shadow_max_runs_per_hour integer not null default 30,
  add column if not exists escalation_enabled boolean not null default true,
  add column if not exists escalation_confidence_threshold numeric(4,3) not null default 0.680,
  add column if not exists max_output_tokens integer not null default 450;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='agent_core_shadow_hourly_cap_check') then
    alter table public.agent_core_runtime_config add constraint agent_core_shadow_hourly_cap_check check(shadow_max_runs_per_hour between 1 and 500);
  end if;
  if not exists(select 1 from pg_constraint where conname='agent_core_escalation_threshold_check') then
    alter table public.agent_core_runtime_config add constraint agent_core_escalation_threshold_check check(escalation_confidence_threshold between 0 and 1);
  end if;
  if not exists(select 1 from pg_constraint where conname='agent_core_max_output_tokens_check') then
    alter table public.agent_core_runtime_config add constraint agent_core_max_output_tokens_check check(max_output_tokens between 150 and 2000);
  end if;
end $$;

alter table public.agent_core_turns
  add column if not exists ai_job_id uuid references public.ai_jobs(id) on delete set null,
  add column if not exists provider_response_id text,
  add column if not exists baseline_intent text,
  add column if not exists baseline_action text,
  add column if not exists decision_intent text,
  add column if not exists decision_confidence numeric(5,4),
  add column if not exists escalated boolean not null default false;

create index if not exists agent_core_turns_job_idx on public.agent_core_turns(ai_job_id) where ai_job_id is not null;
create index if not exists agent_core_turns_compare_idx on public.agent_core_turns(created_at desc,baseline_intent,decision_intent) where model is not null;

create table if not exists public.agent_core_tool_calls(
  id bigserial primary key,
  turn_id uuid not null references public.agent_core_turns(id) on delete cascade,
  call_index smallint not null check(call_index between 1 and 12),
  model text not null,
  tool_key text not null references public.ai_action_registry(action_key),
  risk_class text not null,
  policy_decision text,
  executed boolean not null default false,
  success boolean not null default false,
  latency_ms integer,
  input_digest text,
  output_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(turn_id,call_index)
);
create index if not exists agent_core_tool_calls_tool_created_idx on public.agent_core_tool_calls(tool_key,created_at desc);

alter table public.agent_core_tool_calls enable row level security;
revoke all on public.agent_core_tool_calls from public,anon,authenticated;
grant select,insert,update on public.agent_core_tool_calls to service_role;
grant usage,select on sequence public.agent_core_tool_calls_id_seq to service_role;

-- Chave interna exclusiva do shadow Agent Core. O segredo bruto fica apenas no Vault.
do $$
declare v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name='agent_core_webhook_key_v1'
   order by created_at desc limit 1;
  if v_secret is null then
    v_secret:=encode(gen_random_bytes(32),'hex');
    perform vault.create_secret(v_secret,'agent_core_webhook_key_v1','Internal key for Dona Antonia Agent Core shadow v1');
  end if;
  insert into public.system_secrets(key_name,key_hash,is_active,rotated_at)
  values('agent_core_webhook_v1',encode(digest(v_secret,'sha256'),'hex'),true,now())
  on conflict(key_name) do update set key_hash=excluded.key_hash,is_active=true,rotated_at=excluded.rotated_at;
end $$;

create or replace function public.is_whatsapp_agent_core_shadow_eligible_v1(p_job_id uuid,p_replay boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg public.agent_core_runtime_config%rowtype; j public.ai_jobs%rowtype; c public.conversations%rowtype; v_open_handoff boolean; v_hour integer;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode<>'observe' or not cfg.shadow_openai_enabled then
    return jsonb_build_object('eligible',false,'reason','agent_core_shadow_disabled');
  end if;
  select * into j from public.ai_jobs where id=p_job_id;
  if not found then return jsonb_build_object('eligible',false,'reason','job_not_found'); end if;
  if j.status<>'done' or j.job_type<>'conversation' then
    return jsonb_build_object('eligible',false,'reason','job_not_shadowable','status',j.status,'job_type',j.job_type);
  end if;
  select * into c from public.conversations where id=j.conversation_id;
  if not found then return jsonb_build_object('eligible',false,'reason','conversation_not_found'); end if;
  select exists(select 1 from public.human_handoffs h where h.conversation_id=c.id and h.status in ('open','claimed')) into v_open_handoff;
  if v_open_handoff then return jsonb_build_object('eligible',false,'reason','human_handoff_precedence'); end if;
  if c.mode<>'ai' then return jsonb_build_object('eligible',false,'reason','conversation_not_ai'); end if;
  if not p_replay and coalesce(c.automation_cohort,'') not in ('ai_canary','homologation') then
    return jsonb_build_object('eligible',false,'reason','cohort_not_shadow_enabled','cohort',c.automation_cohort);
  end if;
  if exists(select 1 from public.agent_core_turns t where t.message_id=j.message_id and t.agent_version=cfg.agent_version and t.execution_mode=cfg.execution_mode and t.model is not null) then
    return jsonb_build_object('eligible',false,'reason','already_shadow_planned');
  end if;
  if not p_replay then
    select count(*) into v_hour from public.agent_core_turns t where t.created_at>=now()-interval '1 hour' and t.model is not null;
    if v_hour>=cfg.shadow_max_runs_per_hour then return jsonb_build_object('eligible',false,'reason','shadow_hourly_cap','count',v_hour); end if;
  end if;
  return jsonb_build_object('eligible',true,'reason',case when p_replay then 'authorized_replay' else 'eligible_shadow' end,'conversation_id',j.conversation_id,'message_id',j.message_id,'agent_version',cfg.agent_version);
end $$;
revoke all on function public.is_whatsapp_agent_core_shadow_eligible_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.is_whatsapp_agent_core_shadow_eligible_v1(uuid,boolean) to service_role;

create or replace function public.dispatch_whatsapp_agent_core_shadow_v1(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg public.agent_core_runtime_config%rowtype; j public.ai_jobs%rowtype; v_check jsonb; v_secret text; v_request bigint;
begin
  v_check:=public.is_whatsapp_agent_core_shadow_eligible_v1(p_job_id,false);
  if coalesce((v_check->>'eligible')::boolean,false) is not true then return v_check||jsonb_build_object('dispatched',false); end if;
  select * into cfg from public.agent_core_runtime_config where id=1;
  select * into j from public.ai_jobs where id=p_job_id;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='agent_core_webhook_key_v1' order by created_at desc limit 1;
  if v_secret is null then return jsonb_build_object('eligible',false,'dispatched',false,'reason','agent_core_secret_missing'); end if;
  begin
    v_request:=net.http_post(
      url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/dona-antonia-agent-core-v1',
      headers:=jsonb_build_object('Content-Type','application/json','x-da-agent-key',v_secret),
      body:=jsonb_build_object('event','shadow','job_id',p_job_id,'replay',false),
      timeout_milliseconds:=120000
    );
    insert into public.agent_core_turns(conversation_id,message_id,ai_job_id,agent_version,execution_mode,status,metadata)
    values(j.conversation_id,j.message_id,j.id,cfg.agent_version,cfg.execution_mode,'observed',jsonb_build_object('openai_shadow',true,'dispatch_request_id',v_request,'dispatch_at',now()))
    on conflict(message_id,agent_version,execution_mode) do update
      set ai_job_id=excluded.ai_job_id,metadata=public.agent_core_turns.metadata||excluded.metadata;
    insert into public.whatsapp_ops_events(event_type,severity,conversation_id,ai_job_id,details)
    values('agent_core_shadow_dispatched','info',j.conversation_id,j.id,jsonb_build_object('request_id',v_request,'agent_version',cfg.agent_version));
    return jsonb_build_object('eligible',true,'dispatched',true,'request_id',v_request,'job_id',p_job_id);
  exception when others then
    insert into public.whatsapp_ops_events(event_type,severity,conversation_id,ai_job_id,details)
    values('agent_core_shadow_dispatch_failed','warning',j.conversation_id,j.id,jsonb_build_object('agent_version',cfg.agent_version));
    return jsonb_build_object('eligible',true,'dispatched',false,'reason','shadow_dispatch_failed');
  end;
end $$;
revoke all on function public.dispatch_whatsapp_agent_core_shadow_v1(uuid) from public,anon,authenticated;
grant execute on function public.dispatch_whatsapp_agent_core_shadow_v1(uuid) to service_role;

create or replace function public.agent_core_shadow_dispatch_trigger_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='done' and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform public.dispatch_whatsapp_agent_core_shadow_v1(new.id);
  end if;
  return new;
exception when others then
  insert into public.whatsapp_ops_events(event_type,severity,conversation_id,ai_job_id,details)
  values('agent_core_shadow_trigger_error','warning',new.conversation_id,new.id,jsonb_build_object('non_blocking',true));
  return new;
end $$;
revoke all on function public.agent_core_shadow_dispatch_trigger_v1() from public,anon,authenticated;
grant execute on function public.agent_core_shadow_dispatch_trigger_v1() to service_role;

drop trigger if exists trg_agent_core_shadow_dispatch_ai_job_v1 on public.ai_jobs;
create trigger trg_agent_core_shadow_dispatch_ai_job_v1
after insert or update of status on public.ai_jobs
for each row when (new.status='done') execute function public.agent_core_shadow_dispatch_trigger_v1();

create or replace function public.get_agent_core_round2_readiness_v1()
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'enabled',c.enabled,'execution_mode',c.execution_mode,'shadow_openai_enabled',c.shadow_openai_enabled,
 'planner_model',c.planner_model,'escalation_model',c.escalation_model,'max_tool_calls',c.max_tool_calls,
 'shadow_max_runs_per_hour',c.shadow_max_runs_per_hour,'prompt_cache_ttl',c.prompt_cache_ttl,
 'tool_count',(select count(*) from public.ai_action_registry a where a.enabled and a.execution_mode<>'off' and a.metadata->>'agent_core'='v1' and coalesce((a.metadata->>'tool')::boolean,false)),
 'planned_last_hour',(select count(*) from public.agent_core_turns t where t.created_at>=now()-interval '1 hour' and t.model is not null),
 'stale_dispatches',(select count(*) from public.agent_core_turns t where t.metadata ? 'dispatch_request_id' and t.model is null and t.created_at<now()-interval '2 minutes'),
 'legacy_before_insert_router_count',(select count(*) from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname='ai_jobs' and not t.tgisinternal and (t.tgtype & 2)=2)
) from public.agent_core_runtime_config c where c.id=1;
$$;
revoke all on function public.get_agent_core_round2_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round2_readiness_v1() to service_role;

comment on table public.agent_core_tool_calls is 'Round 2 shadow trace. Stores tool/policy telemetry, never full prompts or delivery addresses.';
comment on function public.dispatch_whatsapp_agent_core_shadow_v1(uuid) is 'Non-blocking shadow dispatcher. Never creates outbound and only automatic for AI canary/homologation conversations.';

commit;