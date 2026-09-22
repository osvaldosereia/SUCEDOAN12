begin;

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
  v_queued boolean:=false;
begin
  select * into v_commerce from public.papoai_commerce_brain_config where id=1;
  select * into v_agent from public.agent_core_runtime_config where id=1;

  if not coalesce(v_commerce.learning_enqueue_enabled,false) then
    return jsonb_build_object(
      'ok',true,'enqueued',false,'reason','commerce_learning_disabled'
    );
  end if;

  if not coalesce(v_agent.learning_write_enabled,false) then
    return jsonb_build_object(
      'ok',true,'enqueued',false,'reason','agent_learning_disabled'
    );
  end if;

  select * into v_message
  from public.messages
  where id=p_message_id and conversation_id=p_conversation_id;

  if not found then
    return jsonb_build_object(
      'ok',false,'enqueued',false,'reason','message_not_found'
    );
  end if;

  if v_message.direction<>'inbound'
     or coalesce(nullif(v_message.transcript,''),nullif(v_message.body_text,''),'')=''
  then
    return jsonb_build_object(
      'ok',true,'enqueued',false,'reason','message_not_eligible'
    );
  end if;

  v_enqueued:=public.enqueue_agent_core_learning_v1(
    p_conversation_id,
    p_message_id,
    'papoai_inbound_message',
    false
  );

  v_queued:=coalesce((v_enqueued->>'queued')::boolean,false);

  return jsonb_build_object(
    'ok',true,
    'enqueued',v_queued,
    'reason',case
      when v_queued then null
      else coalesce(v_enqueued->>'reason','enqueue_declined')
    end,
    'queue',v_enqueued,
    'conversation_id',p_conversation_id,
    'message_id',p_message_id
  );
end;
$$;

revoke all on function public.maybe_enqueue_papoai_commerce_learning_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.maybe_enqueue_papoai_commerce_learning_v1(uuid,uuid) to service_role;

commit;
