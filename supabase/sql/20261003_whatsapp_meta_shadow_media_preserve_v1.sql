begin;

create or replace function public.whatsapp_ingest_event_v1(
  p_whatsapp_account_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_provider_message_id text,
  p_phone_e164 text,
  p_received_at timestamptz,
  p_payload_hash text,
  p_payload jsonb,
  p_message jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_event_id uuid;
  v_duplicate boolean:=false;
  v_conversation jsonb;
  v_message_id uuid;
  v_existing_wamid_message_id uuid;
  v_direction text;
  v_message_type text;
  v_sender_kind text;
  v_status text;
  v_customer_id uuid;
  v_provider_event_id text:=nullif(btrim(coalesce(p_provider_event_id,'')),'');
  v_provider_message_id text:=nullif(btrim(coalesce(p_provider_message_id,'')),'');
begin
  if p_provider not in ('papoai','meta') then
    return jsonb_build_object('ok',false,'error','provider_invalid');
  end if;
  if p_whatsapp_account_id is null or nullif(btrim(coalesce(p_payload_hash,'')),'') is null then
    return jsonb_build_object('ok',false,'error','account_and_payload_hash_required');
  end if;

  begin
    insert into public.whatsapp_webhook_events_v1(
      whatsapp_account_id,provider,provider_event_id,event_type,provider_message_id,
      phone_e164,received_at,payload_hash,payload,status,metadata
    ) values(
      p_whatsapp_account_id,p_provider,v_provider_event_id,
      coalesce(nullif(btrim(p_event_type),''),'unknown'),v_provider_message_id,
      nullif(btrim(coalesce(p_phone_e164,'')),''),coalesce(p_received_at,now()),
      p_payload_hash,coalesce(p_payload,'{}'::jsonb),'received','{}'::jsonb
    ) returning id into v_event_id;
  exception when unique_violation then
    v_duplicate:=true;
    select e.id into v_event_id
    from public.whatsapp_webhook_events_v1 e
    where e.provider=p_provider
      and e.whatsapp_account_id=p_whatsapp_account_id
      and ((v_provider_event_id is not null and e.provider_event_id=v_provider_event_id)
        or (v_provider_event_id is null and e.payload_hash=p_payload_hash))
    order by e.received_at desc
    limit 1;
  end;

  if p_message is null or v_duplicate then
    return jsonb_build_object('ok',true,'event_id',v_event_id,'duplicate',v_duplicate,'message_id',null);
  end if;

  if v_provider_message_id like 'wamid.%' then
    select m.id into v_existing_wamid_message_id
    from public.whatsapp_messages_v1 m
    where m.whatsapp_account_id=p_whatsapp_account_id
      and m.provider_message_id=v_provider_message_id
    order by case when m.provider='meta' then 0 else 1 end,m.created_at,m.id
    limit 1
    for update;

    if v_existing_wamid_message_id is not null then
      update public.whatsapp_messages_v1 m
      set provider=case when p_provider='meta' then 'meta' else m.provider end,
          customer_id=coalesce(m.customer_id,nullif(p_message->>'customer_id','')::uuid),
          provider_conversation_id=coalesce(m.provider_conversation_id,nullif(p_message->>'provider_conversation_id','')),
          text_body=coalesce(m.text_body,p_message->>'text_body'),
          metadata=case
            when m.provider='meta' and p_provider='papoai' then
              coalesce(m.metadata,'{}'::jsonb)
              || (coalesce(p_message->'metadata','{}'::jsonb) - 'media' - 'source')
              || case
                   when m.metadata ? 'media' or coalesce(p_message->'metadata','{}'::jsonb) ? 'media'
                   then jsonb_build_object(
                     'media',
                     coalesce(p_message->'metadata'->'media','{}'::jsonb)
                     || coalesce(m.metadata->'media','{}'::jsonb)
                   )
                   else '{}'::jsonb
                 end
              || jsonb_build_object(
                   'source',coalesce(m.metadata->>'source','meta'),
                   'shadow_provider','papoai'
                 )
            else
              coalesce(m.metadata,'{}'::jsonb)
              || coalesce(p_message->'metadata','{}'::jsonb)
              || jsonb_build_object('shadow_provider',case when p_provider<>m.provider then p_provider else null end)
          end,
          sender_kind=case when p_provider='meta' and m.direction='inbound' then 'customer' else m.sender_kind end
      where m.id=v_existing_wamid_message_id;

      update public.whatsapp_webhook_events_v1
      set status='normalized',processed_at=now(),last_error=null,
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('canonical_message_id',v_existing_wamid_message_id,'cross_provider_duplicate',true)
      where id=v_event_id;

      return jsonb_build_object(
        'ok',true,'event_id',v_event_id,'duplicate',true,
        'cross_provider_duplicate',true,'message_id',v_existing_wamid_message_id
      );
    end if;
  end if;

  v_direction:=coalesce(nullif(p_message->>'direction',''),'inbound');
  v_message_type:=coalesce(nullif(p_message->>'message_type',''),'unknown');
  v_sender_kind:=coalesce(nullif(p_message->>'sender_kind',''),case when v_direction='inbound' then 'customer' else 'system' end);
  v_status:=coalesce(nullif(p_message->>'status_current',''),case when v_direction='inbound' then 'received' else 'queued' end);

  v_conversation:=public.whatsapp_resolve_conversation_v1(
    p_whatsapp_account_id,p_phone_e164,nullif(p_message->>'customer_id','')::uuid,
    coalesce(nullif(p_message->>'source',''),'unknown')
  );
  if coalesce((v_conversation->>'ok')::boolean,false) is not true then
    update public.whatsapp_webhook_events_v1
    set status='review_required',processed_at=now(),last_error='conversation_resolution_failed'
    where id=v_event_id;
    return jsonb_build_object('ok',false,'event_id',v_event_id,'error','conversation_resolution_failed','conversation',v_conversation);
  end if;

  v_customer_id:=nullif(v_conversation->>'customer_id','')::uuid;

  begin
    insert into public.whatsapp_messages_v1(
      conversation_id,whatsapp_account_id,customer_id,direction,message_type,provider,
      provider_message_id,provider_conversation_id,text_body,status_current,sender_kind,
      sender_ref,sent_at,received_at,metadata
    ) values(
      (v_conversation->>'conversation_id')::uuid,p_whatsapp_account_id,v_customer_id,
      v_direction,v_message_type,p_provider,v_provider_message_id,
      nullif(p_message->>'provider_conversation_id',''),p_message->>'text_body',v_status,
      v_sender_kind,nullif(p_message->>'sender_ref',''),
      case when v_direction='outbound' then coalesce((p_message->>'sent_at')::timestamptz,p_received_at,now()) else null end,
      case when v_direction='inbound' then coalesce((p_message->>'received_at')::timestamptz,p_received_at,now()) else null end,
      coalesce(p_message->'metadata','{}'::jsonb)
    )
    on conflict (whatsapp_account_id,provider,provider_message_id) do update
    set conversation_id=excluded.conversation_id,
        customer_id=coalesce(public.whatsapp_messages_v1.customer_id,excluded.customer_id),
        text_body=coalesce(public.whatsapp_messages_v1.text_body,excluded.text_body),
        metadata=public.whatsapp_messages_v1.metadata || excluded.metadata
    returning id into v_message_id;
  exception when unique_violation then
    if v_provider_message_id like 'wamid.%' then
      select m.id into v_existing_wamid_message_id
      from public.whatsapp_messages_v1 m
      where m.whatsapp_account_id=p_whatsapp_account_id
        and m.provider_message_id=v_provider_message_id
      order by case when m.provider='meta' then 0 else 1 end,m.created_at,m.id
      limit 1;
      if v_existing_wamid_message_id is not null then
        v_message_id:=v_existing_wamid_message_id;
        v_duplicate:=true;
      else
        raise;
      end if;
    else
      raise;
    end if;
  end;

  update public.whatsapp_webhook_events_v1
  set status='normalized',processed_at=now(),last_error=null,
      metadata=coalesce(metadata,'{}'::jsonb)||case when v_duplicate then jsonb_build_object('canonical_message_id',v_message_id,'cross_provider_duplicate',true) else '{}'::jsonb end
  where id=v_event_id;

  update public.conversations
  set last_inbound_at=case when v_direction='inbound' then greatest(coalesce(last_inbound_at,'-infinity'::timestamptz),coalesce(p_received_at,now())) else last_inbound_at end,
      last_outbound_at=case when v_direction='outbound' then greatest(coalesce(last_outbound_at,'-infinity'::timestamptz),coalesce(p_received_at,now())) else last_outbound_at end,
      updated_at=greatest(updated_at,coalesce(p_received_at,now()))
  where id=(v_conversation->>'conversation_id')::uuid;

  return jsonb_build_object(
    'ok',true,'event_id',v_event_id,'duplicate',v_duplicate,
    'message_id',v_message_id,'conversation_id',v_conversation->>'conversation_id'
  );
end;
$function$;

commit;
