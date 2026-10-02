-- Dona Antônia — Central de Atendimento: canonical outbound Meta v1
-- Registra o wamid imediatamente após o Graph aceitar o envio.
-- Reaplica status Meta que possam ter chegado antes do registro da mensagem.
-- Durante coexistência, o mesmo wamid pode ecoar pelo PapoAI: uma conta deve manter
-- uma única mensagem canônica para wamid, preferindo provider Meta.

create unique index if not exists whatsapp_messages_wamid_account_uidx
on public.whatsapp_messages_v1(whatsapp_account_id,provider_message_id)
where provider_message_id like 'wamid.%';

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
set search_path to ''
as $$
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

  -- Cross-provider dedupe somente para IDs oficiais Meta (wamid). Isso impede que o
  -- mesmo envio/recebimento seja mostrado duas vezes quando PapoAI e nosso app veem o evento.
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
          metadata=coalesce(m.metadata,'{}'::jsonb)
            || coalesce(p_message->'metadata','{}'::jsonb)
            || jsonb_build_object('shadow_provider',case when p_provider<>m.provider then p_provider else null end),
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
    -- Corrida entre Meta e PapoAI para o mesmo wamid: o índice cross-provider escolhe
    -- uma única linha e esta captura passa a apontar para ela.
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
$$;

revoke all on function public.whatsapp_ingest_event_v1(uuid,text,text,text,text,text,timestamptz,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_ingest_event_v1(uuid,text,text,text,text,text,timestamptz,text,jsonb,jsonb) to service_role;

create or replace function public.ops2_admin_attendance_accept_meta_outbound_v1(
  p_outbox_id uuid,
  p_provider_message_id text,
  p_accepted_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_message public.whatsapp_messages_v1%rowtype;
  v_provider_message_id text:=btrim(coalesce(p_provider_message_id,''));
  v_accepted_at timestamptz:=coalesce(p_accepted_at,now());
  v_message_id uuid;
  v_status_result jsonb;
  v_replayed integer:=0;
  v_status text;
  v_occurred_at timestamptz;
  r public.whatsapp_webhook_events_v1%rowtype;
begin
  if p_outbox_id is null then
    return jsonb_build_object('ok',false,'error','outbox_required');
  end if;
  if v_provider_message_id not like 'wamid.%'
     or char_length(v_provider_message_id)>500
     or v_provider_message_id ~ '[[:cntrl:][:space:]]' then
    return jsonb_build_object('ok',false,'error','provider_message_id_invalid');
  end if;

  select o.* into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.id=p_outbox_id
  for update;
  if not found then
    return jsonb_build_object('ok',false,'error','outbox_not_found');
  end if;

  if v_outbox.provider<>'meta' or v_outbox.purpose<>'human_attendance' or v_outbox.message_type<>'text' then
    return jsonb_build_object('ok',false,'error','outbox_not_meta_attendance');
  end if;
  if v_outbox.conversation_id is null then
    return jsonb_build_object('ok',false,'error','conversation_required');
  end if;

  if v_outbox.status='sent' then
    if v_outbox.provider_message_id is distinct from v_provider_message_id or v_outbox.message_id is null then
      return jsonb_build_object('ok',false,'error','already_sent_mismatch');
    end if;
    return jsonb_build_object(
      'ok',true,'already_accepted',true,'idempotent',true,
      'outbox_id',v_outbox.id,'message_id',v_outbox.message_id,
      'provider_message_id',v_outbox.provider_message_id,'status','sent'
    );
  end if;
  if v_outbox.status<>'claimed' then
    return jsonb_build_object('ok',false,'error','outbox_not_claimed','status',v_outbox.status);
  end if;

  -- Se o PapoAI ecoou primeiro o mesmo wamid, promovemos essa única linha para Meta.
  select m.* into v_message
  from public.whatsapp_messages_v1 m
  where m.whatsapp_account_id=v_outbox.whatsapp_account_id
    and m.provider_message_id=v_provider_message_id
  order by case when m.provider='meta' then 0 else 1 end,m.created_at,m.id
  limit 1
  for update;

  if found then
    if v_message.conversation_id is distinct from v_outbox.conversation_id then
      return jsonb_build_object('ok',false,'error','wamid_conversation_conflict');
    end if;
    if v_message.direction<>'outbound' then
      return jsonb_build_object('ok',false,'error','wamid_direction_conflict');
    end if;

    update public.whatsapp_messages_v1 m
    set provider='meta',
        customer_id=coalesce(m.customer_id,v_outbox.customer_id),
        message_type='text',
        text_body=coalesce(m.text_body,nullif(v_outbox.payload->>'text','')),
        status_current=case when m.status_current in ('sent','delivered','read','failed','cancelled') then m.status_current else 'accepted' end,
        sender_kind='human',
        sender_ref=coalesce(nullif(v_outbox.metadata->>'admin_user_id',''),m.sender_ref),
        sent_at=coalesce(m.sent_at,v_accepted_at),
        metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
          'source','attendance','transport','meta_cloud_api','outbox_id',v_outbox.id,
          'idempotency_key',v_outbox.idempotency_key,'meta_acceptance','accepted',
          'meta_accepted_at',v_accepted_at,'promoted_from_shadow',v_message.provider='papoai'
        )
    where m.id=v_message.id
    returning * into v_message;
  else
    begin
      insert into public.whatsapp_messages_v1(
        conversation_id,whatsapp_account_id,customer_id,direction,message_type,provider,
        provider_message_id,provider_conversation_id,text_body,status_current,sender_kind,
        sender_ref,sent_at,metadata
      ) values (
        v_outbox.conversation_id,v_outbox.whatsapp_account_id,v_outbox.customer_id,
        'outbound','text','meta',v_provider_message_id,null,
        nullif(v_outbox.payload->>'text',''),'accepted','human',
        nullif(v_outbox.metadata->>'admin_user_id',''),v_accepted_at,
        jsonb_build_object(
          'source','attendance','transport','meta_cloud_api','outbox_id',v_outbox.id,
          'idempotency_key',v_outbox.idempotency_key,'meta_acceptance','accepted',
          'meta_accepted_at',v_accepted_at
        )
      )
      returning * into v_message;
    exception when unique_violation then
      select m.* into v_message
      from public.whatsapp_messages_v1 m
      where m.whatsapp_account_id=v_outbox.whatsapp_account_id
        and m.provider_message_id=v_provider_message_id
      order by case when m.provider='meta' then 0 else 1 end,m.created_at,m.id
      limit 1
      for update;
      if not found then raise; end if;
      if v_message.conversation_id is distinct from v_outbox.conversation_id or v_message.direction<>'outbound' then
        return jsonb_build_object('ok',false,'error','wamid_race_conflict');
      end if;
      update public.whatsapp_messages_v1 m
      set provider='meta',sender_kind='human',
          sender_ref=coalesce(nullif(v_outbox.metadata->>'admin_user_id',''),m.sender_ref),
          text_body=coalesce(m.text_body,nullif(v_outbox.payload->>'text','')),
          status_current=case when m.status_current in ('sent','delivered','read','failed','cancelled') then m.status_current else 'accepted' end,
          sent_at=coalesce(m.sent_at,v_accepted_at),
          metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
            'source','attendance','transport','meta_cloud_api','outbox_id',v_outbox.id,
            'idempotency_key',v_outbox.idempotency_key,'meta_acceptance','accepted',
            'meta_accepted_at',v_accepted_at,'race_reconciled',true
          )
      where m.id=v_message.id
      returning * into v_message;
    end;
  end if;

  v_message_id:=v_message.id;

  update public.whatsapp_outbox_v1
  set message_id=v_message_id,
      provider_message_id=v_provider_message_id,
      status='sent',
      sent_at=v_accepted_at,
      last_error=null,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'meta_acceptance','accepted','meta_accepted_at',v_accepted_at,
        'canonical_message_id',v_message_id
      ),
      updated_at=now()
  where id=v_outbox.id;

  update public.conversations
  set last_outbound_at=greatest(coalesce(last_outbound_at,'-infinity'::timestamptz),v_accepted_at),
      last_human_message_at=greatest(coalesce(last_human_message_at,'-infinity'::timestamptz),v_accepted_at),
      updated_at=greatest(updated_at,v_accepted_at)
  where id=v_outbox.conversation_id;

  v_status_result:=public.whatsapp_record_status_v1(
    v_outbox.whatsapp_account_id,'meta',v_provider_message_id,'accepted',v_accepted_at,now(),
    null,null,null,jsonb_build_object('source','graph_send_response','outbox_id',v_outbox.id)
  );
  if coalesce((v_status_result->>'ok')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error','accepted_status_record_failed','detail',v_status_result);
  end if;

  for r in
    select e.*
    from public.whatsapp_webhook_events_v1 e
    where e.whatsapp_account_id=v_outbox.whatsapp_account_id
      and e.provider='meta'
      and e.provider_message_id=v_provider_message_id
      and e.event_type like 'message.status.%'
      and e.status='received'
    order by e.received_at,e.id
    for update
  loop
    v_status:=split_part(r.event_type,'.',3);
    if v_status not in ('sent','delivered','read','failed','cancelled') then
      update public.whatsapp_webhook_events_v1
      set status='ignored',processed_at=now(),last_error='status_not_supported_for_replay'
      where id=r.id;
      continue;
    end if;

    v_occurred_at:=case
      when coalesce(r.payload->>'timestamp','') ~ '^\d+(\.\d+)?$' then to_timestamp((r.payload->>'timestamp')::double precision)
      else r.received_at
    end;

    v_status_result:=public.whatsapp_record_status_v1(
      v_outbox.whatsapp_account_id,'meta',v_provider_message_id,v_status,
      v_occurred_at,r.received_at,
      nullif(r.payload->'errors'->0->>'code',''),
      nullif(r.payload->'errors'->0->>'title',''),
      nullif(coalesce(r.payload->'errors'->0->>'message',r.payload->'errors'->0->'error_data'->>'details'),''),
      r.payload
    );

    if coalesce((v_status_result->>'ok')::boolean,false) is true then
      update public.whatsapp_webhook_events_v1
      set status='normalized',processed_at=now(),last_error=null
      where id=r.id;
      v_replayed:=v_replayed+1;
    else
      update public.whatsapp_webhook_events_v1
      set status='review_required',processed_at=now(),
          last_error=left(coalesce(v_status_result->>'error','status_replay_failed'),500)
      where id=r.id;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'already_accepted',false,'idempotent',false,
    'outbox_id',v_outbox.id,'message_id',v_message_id,
    'provider_message_id',v_provider_message_id,
    'status_current',(select m.status_current from public.whatsapp_messages_v1 m where m.id=v_message_id),
    'pending_statuses_replayed',v_replayed,'status','sent'
  );
end;
$$;

revoke all on function public.ops2_admin_attendance_accept_meta_outbound_v1(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_accept_meta_outbound_v1(uuid,text,timestamptz) to service_role;
