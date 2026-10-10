begin;

create or replace function public.ops2_accept_order_whatsapp_meta_v1(
  p_outbox_id uuid,
  p_provider_message_id text,
  p_accepted_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_outbox public.ops2_whatsapp_outbox_v1%rowtype;
  v_message public.whatsapp_messages_v1%rowtype;
  v_provider_message_id text:=btrim(coalesce(p_provider_message_id,''));
  v_accepted_at timestamptz:=coalesce(p_accepted_at,now());
  v_conversation_id uuid;
  v_resolved jsonb;
  v_status_result jsonb;
  v_status text;
  v_occurred_at timestamptz;
  v_replayed integer:=0;
  v_sender_kind text;
  r public.whatsapp_webhook_events_v1%rowtype;
begin
  if p_outbox_id is null then return jsonb_build_object('ok',false,'error','outbox_required'); end if;
  if v_provider_message_id not like 'wamid.%' or char_length(v_provider_message_id)>500 or v_provider_message_id ~ '[[:cntrl:][:space:]]' then
    return jsonb_build_object('ok',false,'error','provider_message_id_invalid');
  end if;

  select q.* into v_outbox
  from public.ops2_whatsapp_outbox_v1 q
  where q.id=p_outbox_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','outbox_not_found'); end if;
  if v_outbox.delivery_mode<>'utility_template' or v_outbox.message_kind<>'order_received' then
    return jsonb_build_object('ok',false,'error','outbox_not_order_template');
  end if;
  if v_outbox.whatsapp_account_id is null or nullif(btrim(coalesce(v_outbox.phone_e164,'')),'') is null then
    return jsonb_build_object('ok',false,'error','outbox_route_incomplete');
  end if;

  if v_outbox.status='sent' then
    if v_outbox.external_message_id is distinct from v_provider_message_id then
      return jsonb_build_object('ok',false,'error','already_sent_mismatch');
    end if;
    return jsonb_build_object(
      'ok',true,'already_accepted',true,'idempotent',true,'outbox_id',v_outbox.id,
      'message_id',nullif(v_outbox.payload->>'canonical_message_id','')::uuid,
      'provider_message_id',v_outbox.external_message_id,'status','sent'
    );
  end if;
  if v_outbox.status<>'sending' then
    return jsonb_build_object('ok',false,'error','outbox_not_sending','status',v_outbox.status);
  end if;

  v_conversation_id:=v_outbox.conversation_id;
  if v_conversation_id is null then
    v_resolved:=public.whatsapp_resolve_conversation_v1(
      v_outbox.whatsapp_account_id,
      v_outbox.phone_e164,
      v_outbox.customer_id,
      'website'
    );
    if coalesce((v_resolved->>'ok')::boolean,false) is not true then
      return jsonb_build_object('ok',false,'error','conversation_resolve_failed','detail',v_resolved);
    end if;
    v_conversation_id:=nullif(v_resolved->>'conversation_id','')::uuid;
    if v_conversation_id is null then return jsonb_build_object('ok',false,'error','conversation_resolve_empty'); end if;
    update public.ops2_whatsapp_outbox_v1 set conversation_id=v_conversation_id,updated_at=now() where id=v_outbox.id;
  end if;

  v_sender_kind:=case when coalesce(v_outbox.payload#>>'{meta_request,dispatch_scope}','checkout_auto')='admin_manual' then 'human' else 'automation' end;

  select m.* into v_message
  from public.whatsapp_messages_v1 m
  where m.whatsapp_account_id=v_outbox.whatsapp_account_id
    and m.provider_message_id=v_provider_message_id
  order by case when m.provider='meta' then 0 else 1 end,m.created_at,m.id
  limit 1
  for update;

  if found then
    if v_message.conversation_id is distinct from v_conversation_id then return jsonb_build_object('ok',false,'error','wamid_conversation_conflict'); end if;
    if v_message.direction<>'outbound' then return jsonb_build_object('ok',false,'error','wamid_direction_conflict'); end if;
    update public.whatsapp_messages_v1 m set
      provider='meta',
      customer_id=coalesce(m.customer_id,v_outbox.customer_id),
      message_type='template',
      status_current=case when m.status_current in ('sent','delivered','read','failed','cancelled') then m.status_current else 'accepted' end,
      sender_kind=v_sender_kind,
      sent_at=coalesce(m.sent_at,v_accepted_at),
      metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
        'source','order_confirmation','transport','meta_cloud_api','order_outbox_id',v_outbox.id,
        'order_id',v_outbox.order_id,'meta_acceptance','accepted','meta_accepted_at',v_accepted_at,
        'template_name',v_outbox.payload#>>'{meta_request,template_name}',
        'template_language',v_outbox.payload#>>'{meta_request,language_code}',
        'promoted_from_shadow',v_message.provider='papoai'
      )
    where m.id=v_message.id
    returning * into v_message;
  else
    begin
      insert into public.whatsapp_messages_v1(
        conversation_id,whatsapp_account_id,customer_id,direction,message_type,provider,provider_message_id,
        provider_conversation_id,text_body,status_current,sender_kind,sender_ref,sent_at,metadata
      ) values (
        v_conversation_id,v_outbox.whatsapp_account_id,v_outbox.customer_id,'outbound','template','meta',v_provider_message_id,
        null,null,'accepted',v_sender_kind,null,v_accepted_at,
        jsonb_build_object(
          'source','order_confirmation','transport','meta_cloud_api','order_outbox_id',v_outbox.id,
          'order_id',v_outbox.order_id,'meta_acceptance','accepted','meta_accepted_at',v_accepted_at,
          'template_name',v_outbox.payload#>>'{meta_request,template_name}',
          'template_language',v_outbox.payload#>>'{meta_request,language_code}'
        )
      ) returning * into v_message;
    exception when unique_violation then
      select m.* into v_message
      from public.whatsapp_messages_v1 m
      where m.whatsapp_account_id=v_outbox.whatsapp_account_id and m.provider='meta' and m.provider_message_id=v_provider_message_id
      limit 1 for update;
      if not found then raise; end if;
      if v_message.conversation_id is distinct from v_conversation_id or v_message.direction<>'outbound' then
        return jsonb_build_object('ok',false,'error','wamid_race_conflict');
      end if;
    end;
  end if;

  update public.ops2_whatsapp_outbox_v1 set
    conversation_id=v_conversation_id,
    status='sent',
    external_message_id=v_provider_message_id,
    sent_at=v_accepted_at,
    last_error=null,
    locked_at=null,
    payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
      'provider','meta','canonical_message_id',v_message.id,'meta_accepted_at',v_accepted_at
    ),
    updated_at=now()
  where id=v_outbox.id;

  update public.conversations set
    last_outbound_at=greatest(coalesce(last_outbound_at,'-infinity'::timestamptz),v_accepted_at),
    last_human_message_at=case when v_sender_kind='human' then greatest(coalesce(last_human_message_at,'-infinity'::timestamptz),v_accepted_at) else last_human_message_at end,
    updated_at=greatest(updated_at,v_accepted_at)
  where id=v_conversation_id;

  v_status_result:=public.whatsapp_record_status_v1(
    v_outbox.whatsapp_account_id,'meta',v_provider_message_id,'accepted',v_accepted_at,now(),
    null,null,null,jsonb_build_object('source','order_confirmation_send_response','order_outbox_id',v_outbox.id,'order_id',v_outbox.order_id)
  );
  if coalesce((v_status_result->>'ok')::boolean,false) is not true then
    raise exception using
      errcode='P0001',
      message='accepted_status_record_failed:'||left(coalesce(v_status_result::text,'{}'),400);
  end if;

  for r in
    select e.* from public.whatsapp_webhook_events_v1 e
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
      update public.whatsapp_webhook_events_v1 set status='ignored',processed_at=now(),last_error='status_not_supported_for_replay' where id=r.id;
      continue;
    end if;
    v_occurred_at:=case when coalesce(r.payload->>'timestamp','') ~ '^\d+(\.\d+)?$' then to_timestamp((r.payload->>'timestamp')::double precision) else r.received_at end;
    v_status_result:=public.whatsapp_record_status_v1(
      v_outbox.whatsapp_account_id,'meta',v_provider_message_id,v_status,v_occurred_at,r.received_at,
      nullif(r.payload->'errors'->0->>'code',''),nullif(r.payload->'errors'->0->>'title',''),
      nullif(coalesce(r.payload->'errors'->0->>'message',r.payload->'errors'->0->'error_data'->>'details'),''),r.payload
    );
    if coalesce((v_status_result->>'ok')::boolean,false) is true then
      update public.whatsapp_webhook_events_v1 set status='normalized',processed_at=now(),last_error=null where id=r.id;
      v_replayed:=v_replayed+1;
    else
      update public.whatsapp_webhook_events_v1 set status='review_required',processed_at=now(),last_error=left(coalesce(v_status_result->>'error','status_replay_failed'),500) where id=r.id;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'already_accepted',false,'idempotent',false,'outbox_id',v_outbox.id,
    'message_id',v_message.id,'conversation_id',v_conversation_id,'provider_message_id',v_provider_message_id,
    'status_current',(select m.status_current from public.whatsapp_messages_v1 m where m.id=v_message.id),
    'pending_statuses_replayed',v_replayed,'status','sent'
  );
end;
$function$;

revoke all on function public.ops2_accept_order_whatsapp_meta_v1(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ops2_accept_order_whatsapp_meta_v1(uuid,text,timestamptz) to service_role;

commit;
