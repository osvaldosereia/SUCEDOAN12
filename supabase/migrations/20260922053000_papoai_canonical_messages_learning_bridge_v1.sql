begin;

alter table public.papoai_commerce_brain_config
  add column if not exists canonical_message_persistence_enabled boolean not null default true,
  add column if not exists learning_enqueue_enabled boolean not null default false;

create or replace function public.persist_papoai_commerce_message_v1(
  p_conversation_id uuid,
  p_direction text,
  p_message_type text,
  p_body_text text,
  p_external_message_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_direction text:=lower(trim(coalesce(p_direction,'')));
  v_type text:=lower(trim(coalesce(p_message_type,'text')));
  v_key text:=left('papoai-commerce:'||coalesce(nullif(trim(p_external_message_key),''),gen_random_uuid()::text),255);
  v_message public.messages%rowtype;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;

  if not coalesce(v_cfg.canonical_message_persistence_enabled,true) then
    return jsonb_build_object('ok',true,'persisted',false,'reason','message_persistence_disabled');
  end if;

  if not exists(select 1 from public.conversations where id=p_conversation_id) then
    return jsonb_build_object('ok',false,'persisted',false,'reason','conversation_not_found');
  end if;

  if v_direction not in ('inbound','outbound','system') then
    return jsonb_build_object('ok',false,'persisted',false,'reason','direction_invalid');
  end if;

  if v_type not in ('text','image','audio','video','document','location','reaction','button','quick_reply','unknown') then
    v_type:='unknown';
  end if;

  insert into public.messages(
    conversation_id,
    whatsapp_message_id,
    direction,
    message_type,
    body_text,
    ai_interpretation,
    raw_event,
    delivery_status,
    created_at
  ) values(
    p_conversation_id,
    v_key,
    v_direction,
    v_type,
    nullif(trim(coalesce(p_body_text,'')),''),
    case
      when v_direction='outbound'
      then jsonb_build_object('source','papoai_commerce_external_agent')
      else '{}'::jsonb
    end,
    jsonb_build_object(
      'provider','papoai',
      'source','papoai_commerce_external_agent',
      'metadata',coalesce(p_metadata,'{}'::jsonb)
    ),
    case when v_direction='outbound' then 'sent' else null end,
    now()
  )
  on conflict(whatsapp_message_id) do update set
    body_text=coalesce(public.messages.body_text,excluded.body_text),
    updated_at=now()
  returning * into v_message;

  return jsonb_build_object(
    'ok',true,
    'persisted',true,
    'message_id',v_message.id,
    'conversation_id',v_message.conversation_id,
    'direction',v_message.direction
  );
end;
$$;

create or replace function public.maybe_enqueue_papoai_commerce_learning_v1(
  p_conversation_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_commerce public.papoai_commerce_brain_config%rowtype;
  v_agent public.agent_core_runtime_config%rowtype;
  v_message public.messages%rowtype;
  v_enqueued jsonb;
begin
  select * into v_commerce from public.papoai_commerce_brain_config where id=1;
  select * into v_agent from public.agent_core_runtime_config where id=1;

  if not coalesce(v_commerce.learning_enqueue_enabled,false) then
    return jsonb_build_object('ok',true,'enqueued',false,'reason','commerce_learning_disabled');
  end if;

  if not coalesce(v_agent.learning_write_enabled,false) then
    return jsonb_build_object('ok',true,'enqueued',false,'reason','agent_learning_disabled');
  end if;

  select * into v_message
  from public.messages
  where id=p_message_id and conversation_id=p_conversation_id;

  if not found then
    return jsonb_build_object('ok',false,'enqueued',false,'reason','message_not_found');
  end if;

  if v_message.direction<>'inbound'
     or coalesce(nullif(v_message.transcript,''),nullif(v_message.body_text,''),'')=''
  then
    return jsonb_build_object('ok',true,'enqueued',false,'reason','message_not_eligible');
  end if;

  v_enqueued:=public.enqueue_agent_core_learning_v1(
    p_conversation_id,
    p_message_id,
    'papoai_inbound_message',
    false
  );

  return jsonb_build_object(
    'ok',true,
    'enqueued',true,
    'queue',v_enqueued,
    'conversation_id',p_conversation_id,
    'message_id',p_message_id
  );
end;
$$;

revoke all on function public.persist_papoai_commerce_message_v1(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.persist_papoai_commerce_message_v1(uuid,text,text,text,text,jsonb) to service_role;

revoke all on function public.maybe_enqueue_papoai_commerce_learning_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.maybe_enqueue_papoai_commerce_learning_v1(uuid,uuid) to service_role;

update public.papoai_commerce_brain_config
set canonical_message_persistence_enabled=true,
    learning_enqueue_enabled=false,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'message_history_policy','canonical_messages_when_commerce_enabled',
      'learning_requires_double_gate',true,
      'learning_source','existing_agent_core_learning_v1'
    ),
    updated_at=now()
where id=1;

commit;
