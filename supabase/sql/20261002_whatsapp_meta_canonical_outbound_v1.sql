-- Dona Antônia — Central de Atendimento: canonical outbound Meta v1
-- Registra o wamid imediatamente após o Graph aceitar o envio.
-- Reaplica status Meta que possam ter chegado antes do registro da mensagem.

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
  if v_provider_message_id='' or char_length(v_provider_message_id)>500 or v_provider_message_id ~ '[[:cntrl:][:space:]]' then
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
      'ok',true,
      'already_accepted',true,
      'idempotent',true,
      'outbox_id',v_outbox.id,
      'message_id',v_outbox.message_id,
      'provider_message_id',v_outbox.provider_message_id,
      'status','sent'
    );
  end if;
  if v_outbox.status<>'claimed' then
    return jsonb_build_object('ok',false,'error','outbox_not_claimed','status',v_outbox.status);
  end if;

  insert into public.whatsapp_messages_v1(
    conversation_id,
    whatsapp_account_id,
    customer_id,
    direction,
    message_type,
    provider,
    provider_message_id,
    provider_conversation_id,
    text_body,
    status_current,
    sender_kind,
    sender_ref,
    sent_at,
    metadata
  ) values (
    v_outbox.conversation_id,
    v_outbox.whatsapp_account_id,
    v_outbox.customer_id,
    'outbound',
    'text',
    'meta',
    v_provider_message_id,
    null,
    nullif(v_outbox.payload->>'text',''),
    'accepted',
    'human',
    nullif(v_outbox.metadata->>'admin_user_id',''),
    v_accepted_at,
    jsonb_build_object(
      'source','attendance',
      'transport','meta_cloud_api',
      'outbox_id',v_outbox.id,
      'idempotency_key',v_outbox.idempotency_key
    )
  )
  on conflict (whatsapp_account_id,provider,provider_message_id) do update
  set metadata=public.whatsapp_messages_v1.metadata || excluded.metadata
  returning * into v_message;

  if v_message.conversation_id is distinct from v_outbox.conversation_id then
    return jsonb_build_object('ok',false,'error','wamid_conversation_conflict');
  end if;
  if v_message.direction<>'outbound' then
    return jsonb_build_object('ok',false,'error','wamid_direction_conflict');
  end if;
  v_message_id:=v_message.id;

  update public.whatsapp_outbox_v1
  set message_id=v_message_id,
      provider_message_id=v_provider_message_id,
      status='sent',
      sent_at=v_accepted_at,
      last_error=null,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('meta_accepted_at',v_accepted_at,'canonical_message_id',v_message_id),
      updated_at=now()
  where id=v_outbox.id;

  update public.conversations
  set last_outbound_at=greatest(coalesce(last_outbound_at,'-infinity'::timestamptz),v_accepted_at),
      updated_at=greatest(updated_at,v_accepted_at)
  where id=v_outbox.conversation_id;

  v_status_result:=public.whatsapp_record_status_v1(
    v_outbox.whatsapp_account_id,
    'meta',
    v_provider_message_id,
    'accepted',
    v_accepted_at,
    now(),
    null,null,null,
    jsonb_build_object('source','graph_send_response','outbox_id',v_outbox.id)
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
      v_outbox.whatsapp_account_id,
      'meta',
      v_provider_message_id,
      v_status,
      v_occurred_at,
      r.received_at,
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
      set status='review_required',processed_at=now(),last_error=left(coalesce(v_status_result->>'error','status_replay_failed'),500)
      where id=r.id;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'already_accepted',false,
    'idempotent',false,
    'outbox_id',v_outbox.id,
    'message_id',v_message_id,
    'provider_message_id',v_provider_message_id,
    'status_current',(select m.status_current from public.whatsapp_messages_v1 m where m.id=v_message_id),
    'pending_statuses_replayed',v_replayed,
    'status','sent'
  );
end;
$$;

revoke all on function public.ops2_admin_attendance_accept_meta_outbound_v1(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_accept_meta_outbound_v1(uuid,text,timestamptz) to service_role;
