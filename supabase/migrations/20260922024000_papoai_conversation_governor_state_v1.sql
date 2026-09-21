begin;

create table if not exists public.papoai_conversation_governor_state (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  topic_key text not null default '',
  clarification_count integer not null default 0 check(clarification_count between 0 and 2),
  last_question_key text,
  last_action text,
  last_reason text,
  delegated boolean not null default false,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.papoai_conversation_governor_state enable row level security;
revoke all on table public.papoai_conversation_governor_state from public,anon,authenticated;
grant all on table public.papoai_conversation_governor_state to service_role;

create table if not exists public.papoai_conversation_governor_audit (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  topic_key text not null default '',
  intent text,
  action text not null check(action in ('RESPOND','ASK','RECOMMEND','ACT')),
  reason text,
  clarification_before integer not null default 0,
  clarification_after integer not null default 0,
  candidate_count integer,
  delegated boolean not null default false,
  question_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.papoai_conversation_governor_audit enable row level security;
revoke all on table public.papoai_conversation_governor_audit from public,anon,authenticated;
grant all on table public.papoai_conversation_governor_audit to service_role;

create index if not exists papoai_conversation_governor_audit_conversation_idx
  on public.papoai_conversation_governor_audit(conversation_id,created_at desc);

create or replace function public.get_papoai_conversation_governor_state_v1(
  p_conversation_id uuid,
  p_topic_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_state public.papoai_conversation_governor_state%rowtype;
  v_topic text:=coalesce(p_topic_key,'');
begin
  select * into v_state
  from public.papoai_conversation_governor_state
  where conversation_id=p_conversation_id;

  if not found or v_state.topic_key is distinct from v_topic then
    return jsonb_build_object(
      'topic_key',v_topic,
      'clarification_count',0,
      'last_question_key',null,
      'last_action',null,
      'last_reason',null,
      'delegated',false,
      'context','{}'::jsonb
    );
  end if;

  return jsonb_build_object(
    'topic_key',v_state.topic_key,
    'clarification_count',v_state.clarification_count,
    'last_question_key',v_state.last_question_key,
    'last_action',v_state.last_action,
    'last_reason',v_state.last_reason,
    'delegated',v_state.delegated,
    'context',v_state.context
  );
end;
$$;

create or replace function public.record_papoai_conversation_governor_decision_v1(
  p_conversation_id uuid,
  p_topic_key text,
  p_intent text,
  p_action text,
  p_reason text,
  p_candidate_count integer default null,
  p_delegated boolean default false,
  p_question_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_existing public.papoai_conversation_governor_state%rowtype;
  v_before integer:=0;
  v_after integer:=0;
  v_topic text:=coalesce(p_topic_key,'');
  v_action text:=upper(trim(coalesce(p_action,'')));
begin
  if v_action not in ('RESPOND','ASK','RECOMMEND','ACT') then
    raise exception 'invalid_governor_action';
  end if;

  select * into v_existing
  from public.papoai_conversation_governor_state
  where conversation_id=p_conversation_id
  for update;

  if found and v_existing.topic_key=v_topic then
    v_before:=coalesce(v_existing.clarification_count,0);
  else
    v_before:=0;
  end if;

  v_after:=case
    when v_action='ASK' then least(2,v_before+1)
    else v_before
  end;

  insert into public.papoai_conversation_governor_state(
    conversation_id,topic_key,clarification_count,last_question_key,
    last_action,last_reason,delegated,context,updated_at
  ) values(
    p_conversation_id,v_topic,v_after,
    case when v_action='ASK' then p_question_key else null end,
    v_action,p_reason,coalesce(p_delegated,false),
    coalesce(p_metadata,'{}'::jsonb),now()
  )
  on conflict(conversation_id) do update set
    topic_key=excluded.topic_key,
    clarification_count=excluded.clarification_count,
    last_question_key=excluded.last_question_key,
    last_action=excluded.last_action,
    last_reason=excluded.last_reason,
    delegated=excluded.delegated,
    context=excluded.context,
    updated_at=now();

  insert into public.papoai_conversation_governor_audit(
    conversation_id,topic_key,intent,action,reason,
    clarification_before,clarification_after,candidate_count,
    delegated,question_key,metadata
  ) values(
    p_conversation_id,v_topic,p_intent,v_action,p_reason,
    v_before,v_after,p_candidate_count,
    coalesce(p_delegated,false),
    case when v_action='ASK' then p_question_key else null end,
    coalesce(p_metadata,'{}'::jsonb)
  );

  return jsonb_build_object(
    'topic_key',v_topic,
    'action',v_action,
    'reason',p_reason,
    'clarification_before',v_before,
    'clarification_count',v_after,
    'question_key',case when v_action='ASK' then p_question_key else null end,
    'delegated',coalesce(p_delegated,false)
  );
end;
$$;

revoke all on function public.get_papoai_conversation_governor_state_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.get_papoai_conversation_governor_state_v1(uuid,text) to service_role;

revoke all on function public.record_papoai_conversation_governor_decision_v1(uuid,text,text,text,text,integer,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_papoai_conversation_governor_decision_v1(uuid,text,text,text,text,integer,boolean,text,jsonb) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'conversation_governor_version','v1',
  'conversation_governor_enabled',false,
  'max_segmenting_questions',2,
  'manageable_result_count',10,
  'delegation_policy','recommend_instead_of_asking_again'
),
updated_at=now()
where id=1;

commit;
