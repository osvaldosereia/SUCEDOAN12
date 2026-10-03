begin;

create table if not exists public.whatsapp_ana_jobs_v1 (
  id uuid primary key default gen_random_uuid(),
  inbound_message_id uuid not null unique references public.whatsapp_messages_v1(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  dry_run boolean not null default true,
  status text not null default 'queued' check (status in ('queued','claimed','completed','skipped','failed')),
  decision text null check (decision is null or decision in ('suggest','handoff','no_reply')),
  suggestion_text text null,
  confidence numeric(5,4) null check (confidence is null or (confidence>=0 and confidence<=1)),
  reason text null,
  model text null,
  provider_response_id text null,
  attempt_count integer not null default 0 check (attempt_count>=0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz null,
  completed_at timestamptz null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_ana_jobs_v1_status_available_idx
  on public.whatsapp_ana_jobs_v1(status,available_at,created_at);
create index if not exists whatsapp_ana_jobs_v1_conversation_created_idx
  on public.whatsapp_ana_jobs_v1(conversation_id,created_at desc);

alter table public.whatsapp_ana_jobs_v1 enable row level security;
revoke all on public.whatsapp_ana_jobs_v1 from public,anon,authenticated;
grant select,insert,update on public.whatsapp_ana_jobs_v1 to service_role;

create or replace function public.ops2_ana_enqueue_dry_run_v1(p_inbound_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_message public.whatsapp_messages_v1%rowtype;
  v_gate jsonb;
  v_existing public.whatsapp_ana_jobs_v1%rowtype;
  v_job_id uuid;
begin
  if p_inbound_message_id is null then
    return jsonb_build_object('ok',false,'error','inbound_message_required');
  end if;

  select m.* into v_message
  from public.whatsapp_messages_v1 m
  where m.id=p_inbound_message_id;
  if not found then
    return jsonb_build_object('ok',false,'error','inbound_message_not_found');
  end if;
  if v_message.direction<>'inbound' then
    return jsonb_build_object('ok',false,'error','message_not_inbound');
  end if;
  if v_message.message_type<>'text' or nullif(btrim(coalesce(v_message.text_body,'')),'') is null then
    return jsonb_build_object('ok',false,'error','message_type_not_supported');
  end if;

  select j.* into v_existing from public.whatsapp_ana_jobs_v1 j where j.inbound_message_id=p_inbound_message_id;
  if found then
    return jsonb_build_object('ok',true,'duplicate',true,'job_id',v_existing.id,'status',v_existing.status,'dry_run',v_existing.dry_run);
  end if;

  v_gate:=public.ops2_attendance_ai_gate_v1(v_message.conversation_id);
  if coalesce((v_gate->>'ok')::boolean,false) is not true
     or coalesce((v_gate->>'allowed')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error','ai_gate_closed','gate',v_gate);
  end if;

  insert into public.whatsapp_ana_jobs_v1(
    inbound_message_id,conversation_id,whatsapp_account_id,dry_run,status,metadata
  ) values (
    v_message.id,v_message.conversation_id,v_message.whatsapp_account_id,true,'queued',
    jsonb_build_object('source','explicit_dry_run_enqueue','provider',v_message.provider,'provider_message_id',v_message.provider_message_id)
  ) returning id into v_job_id;

  return jsonb_build_object('ok',true,'duplicate',false,'job_id',v_job_id,'status','queued','dry_run',true);
exception when unique_violation then
  select j.* into v_existing from public.whatsapp_ana_jobs_v1 j where j.inbound_message_id=p_inbound_message_id;
  return jsonb_build_object('ok',true,'duplicate',true,'job_id',v_existing.id,'status',v_existing.status,'dry_run',v_existing.dry_run);
end;
$function$;

create or replace function public.ops2_ana_claim_dry_run_v1(p_limit integer default 1)
returns setof public.whatsapp_ana_jobs_v1
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,1),5));
begin
  return query
  with picked as (
    select j.id
    from public.whatsapp_ana_jobs_v1 j
    where j.status='queued'
      and j.dry_run=true
      and j.available_at<=now()
    order by j.created_at,j.id
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.whatsapp_ana_jobs_v1 j
    set status='claimed',claimed_at=now(),attempt_count=j.attempt_count+1,updated_at=now(),last_error=null
    from picked p
    where j.id=p.id
    returning j.*
  )
  select * from claimed;
end;
$function$;

create or replace function public.ops2_ana_finish_dry_run_v1(
  p_job_id uuid,
  p_status text,
  p_decision text default null,
  p_suggestion_text text default null,
  p_confidence numeric default null,
  p_reason text default null,
  p_model text default null,
  p_provider_response_id text default null,
  p_last_error text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_job public.whatsapp_ana_jobs_v1%rowtype;
  v_status text:=lower(btrim(coalesce(p_status,'')));
  v_decision text:=nullif(lower(btrim(coalesce(p_decision,''))),'');
begin
  if p_job_id is null then return jsonb_build_object('ok',false,'error','job_required'); end if;
  if v_status not in ('completed','skipped','failed') then return jsonb_build_object('ok',false,'error','status_invalid'); end if;
  if v_decision is not null and v_decision not in ('suggest','handoff','no_reply') then return jsonb_build_object('ok',false,'error','decision_invalid'); end if;
  select j.* into v_job from public.whatsapp_ana_jobs_v1 j where j.id=p_job_id for update;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found'); end if;
  if v_job.status not in ('claimed','queued') then
    return jsonb_build_object('ok',true,'duplicate',true,'job_id',v_job.id,'status',v_job.status);
  end if;
  update public.whatsapp_ana_jobs_v1
  set status=v_status,
      decision=case when v_status='completed' then v_decision else null end,
      suggestion_text=case when v_status='completed' then nullif(btrim(coalesce(p_suggestion_text,'')),'') else null end,
      confidence=case when v_status='completed' then greatest(0,least(coalesce(p_confidence,0),1)) else null end,
      reason=nullif(btrim(coalesce(p_reason,'')),''),
      model=nullif(btrim(coalesce(p_model,'')),''),
      provider_response_id=nullif(btrim(coalesce(p_provider_response_id,'')),''),
      completed_at=now(),
      last_error=case when v_status='failed' then left(coalesce(p_last_error,'ana_dry_run_failed'),500) else null end,
      metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('dry_run_not_sendable',true),
      updated_at=now()
  where id=p_job_id
  returning * into v_job;
  return jsonb_build_object('ok',true,'duplicate',false,'job_id',v_job.id,'status',v_job.status,'decision',v_job.decision,'dry_run',v_job.dry_run);
end;
$function$;

revoke all on function public.ops2_ana_enqueue_dry_run_v1(uuid) from public,anon,authenticated;
revoke all on function public.ops2_ana_claim_dry_run_v1(integer) from public,anon,authenticated;
revoke all on function public.ops2_ana_finish_dry_run_v1(uuid,text,text,text,numeric,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ops2_ana_enqueue_dry_run_v1(uuid) to service_role;
grant execute on function public.ops2_ana_claim_dry_run_v1(integer) to service_role;
grant execute on function public.ops2_ana_finish_dry_run_v1(uuid,text,text,text,numeric,text,text,text,text,jsonb) to service_role;

commit;
