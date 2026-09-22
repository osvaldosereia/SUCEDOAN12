begin;

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
  v_key text:=left(
    'papoai-commerce:'||
    coalesce(nullif(trim(p_external_message_key),''),gen_random_uuid()::text),
    255
  );
  v_body text:=nullif(left(trim(coalesce(p_body_text,'')),12000),'');
  v_message public.messages%rowtype;
  v_existing public.messages%rowtype;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;

  if not coalesce(v_cfg.canonical_message_persistence_enabled,true) then
    return jsonb_build_object(
      'ok',true,'persisted',false,'reason','message_persistence_disabled'
    );
  end if;

  if not exists(select 1 from public.conversations where id=p_conversation_id) then
    return jsonb_build_object(
      'ok',false,'persisted',false,'reason','conversation_not_found'
    );
  end if;

  if v_direction not in ('inbound','outbound') then
    return jsonb_build_object(
      'ok',false,'persisted',false,'reason','direction_invalid'
    );
  end if;

  if v_type in ('button','quick_reply') then
    v_type:='interactive';
  elsif v_type='unknown' then
    v_type:='other';
  elsif v_type not in (
    'text','audio','image','video','document',
    'interactive','location','contact','template','system','other'
  ) then
    v_type:='other';
  end if;

  select * into v_existing
  from public.messages
  where whatsapp_message_id=v_key;

  if found then
    return jsonb_build_object(
      'ok',true,
      'persisted',true,
      'duplicate',true,
      'message_id',v_existing.id,
      'conversation_id',v_existing.conversation_id,
      'direction',v_existing.direction,
      'message_type',v_existing.message_type
    );
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
    v_body,
    case
      when v_direction='outbound'
      then jsonb_build_object(
        'source','papoai_commerce_external_agent',
        'generated_by','commerce_brain'
      )
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
  on conflict(whatsapp_message_id) do nothing
  returning * into v_message;

  if v_message.id is null then
    select * into v_message
    from public.messages
    where whatsapp_message_id=v_key;
  end if;

  update public.conversations
     set last_inbound_at=case
           when v_direction='inbound' then now()
           else last_inbound_at
         end,
         last_outbound_at=case
           when v_direction='outbound' then now()
           else last_outbound_at
         end,
         updated_at=now()
   where id=p_conversation_id;

  return jsonb_build_object(
    'ok',true,
    'persisted',true,
    'duplicate',false,
    'message_id',v_message.id,
    'conversation_id',v_message.conversation_id,
    'direction',v_message.direction,
    'message_type',v_message.message_type
  );
end;
$$;

revoke all on function public.persist_papoai_commerce_message_v1(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.persist_papoai_commerce_message_v1(uuid,text,text,text,text,jsonb) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'canonical_message_persistence_version','v1',
  'canonical_message_raw_payload_policy','minimal_no_secrets',
  'canonical_message_outbound_learning_source',true
),
updated_at=now()
where id=1;

commit;
