begin;

create or replace function public.persist_papoai_commerce_message_v1(
  p_conversation_id uuid,
  p_message_key text,
  p_direction text,
  p_message_type text,
  p_body_text text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_key text:=left(trim(coalesce(p_message_key,'')),240);
  v_direction text:=lower(trim(coalesce(p_direction,'')));
  v_type text:=lower(trim(coalesce(p_message_type,'text')));
  v_body text:=nullif(left(trim(coalesce(p_body_text,'')),12000),'');
  v_existing public.messages%rowtype;
  v_message public.messages%rowtype;
begin
  if p_conversation_id is null
     or not exists(select 1 from public.conversations where id=p_conversation_id)
  then
    raise exception 'conversation_not_found';
  end if;

  if v_key='' then raise exception 'message_key_required'; end if;
  if v_direction not in ('inbound','outbound') then raise exception 'message_direction_invalid'; end if;

  if v_type not in ('text','audio','image','video','document','interactive','location','contact','template','system','other') then
    v_type:='other';
  end if;

  select * into v_existing
  from public.messages
  where whatsapp_message_id=v_key;

  if found then
    return jsonb_build_object(
      'ok',true,
      'id',v_existing.id,
      'duplicate',true,
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
    transcript,
    ai_interpretation,
    raw_event
  ) values(
    p_conversation_id,
    v_key,
    v_direction,
    v_type,
    v_body,
    null,
    case
      when v_direction='outbound'
        then jsonb_build_object(
          'source','papoai_commerce',
          'generated_by','commerce_brain',
          'metadata',coalesce(p_metadata,'{}'::jsonb)
        )
      else '{}'::jsonb
    end,
    jsonb_build_object(
      'source','papoai_commerce',
      'provider','papoai',
      'metadata',coalesce(p_metadata,'{}'::jsonb)
    )
  )
  on conflict(whatsapp_message_id) do nothing
  returning * into v_message;

  if v_message.id is null then
    select * into v_message
    from public.messages
    where whatsapp_message_id=v_key;
  end if;

  if v_direction='inbound' then
    update public.conversations
       set last_inbound_at=now(),
           updated_at=now()
     where id=p_conversation_id;
  else
    update public.conversations
       set last_outbound_at=now(),
           updated_at=now()
     where id=p_conversation_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'id',v_message.id,
    'duplicate',false,
    'direction',v_direction,
    'message_type',v_type
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
