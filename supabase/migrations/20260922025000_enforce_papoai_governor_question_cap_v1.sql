begin;

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
  v_reason text:=p_reason;
  v_question_key text:=p_question_key;
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

  if v_action='ASK' and v_before>=2 then
    v_action:='RECOMMEND';
    v_reason:='clarification_limit_enforced';
    v_question_key:=null;
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
    case when v_action='ASK' then v_question_key else null end,
    v_action,v_reason,coalesce(p_delegated,false),
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
    p_conversation_id,v_topic,p_intent,v_action,v_reason,
    v_before,v_after,p_candidate_count,
    coalesce(p_delegated,false),
    case when v_action='ASK' then v_question_key else null end,
    coalesce(p_metadata,'{}'::jsonb)
  );

  return jsonb_build_object(
    'topic_key',v_topic,
    'action',v_action,
    'reason',v_reason,
    'clarification_before',v_before,
    'clarification_count',v_after,
    'question_key',case when v_action='ASK' then v_question_key else null end,
    'delegated',coalesce(p_delegated,false)
  );
end;
$$;

revoke all on function public.record_papoai_conversation_governor_decision_v1(uuid,text,text,text,text,integer,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_papoai_conversation_governor_decision_v1(uuid,text,text,text,text,integer,boolean,text,jsonb) to service_role;

commit;
