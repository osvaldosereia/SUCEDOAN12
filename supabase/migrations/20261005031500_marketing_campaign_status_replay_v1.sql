begin;

-- Fase F hardening: status Meta pode chegar antes de o WAMID ser vinculado
-- à mensagem canônica. Reaplica eventos brutos pendentes após o aceite e
-- também em chamadas idempotentes do mesmo WAMID, sem reenviar à Meta.
create or replace function public.marketing_accept_meta_dispatch_v1(
  p_dispatch_id uuid,
  p_provider_message_id text,
  p_accepted_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_dispatch public.marketing_campaign_dispatches_v1%rowtype;
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_message public.whatsapp_messages_v1%rowtype;
  v_finish jsonb;
  v_status_result jsonb;
  v_accepted_at timestamptz:=coalesce(p_accepted_at,now());
  v_wamid text:=nullif(btrim(coalesce(p_provider_message_id,'')),'');
  v_duplicate boolean:=false;
  v_replayed integer:=0;
  v_event_status text;
  v_occurred_at timestamptz;
  r public.whatsapp_webhook_events_v1%rowtype;
begin
  if v_wamid is null or v_wamid !~ '^wamid\.' then
    return jsonb_build_object('ok',false,'error','provider_message_id_required');
  end if;

  select * into v_dispatch
  from public.marketing_campaign_dispatches_v1
  where id=p_dispatch_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','dispatch_not_found'); end if;

  if v_dispatch.status='accepted' then
    if v_dispatch.provider_message_id is distinct from v_wamid then
      return jsonb_build_object('ok',false,'error','provider_message_conflict');
    end if;
    v_duplicate:=true;
  elsif v_dispatch.status<>'claimed' then
    return jsonb_build_object('ok',false,'error','dispatch_not_claimed','status',v_dispatch.status);
  end if;

  if v_dispatch.outbox_id is null then return jsonb_build_object('ok',false,'error','campaign_outbox_missing'); end if;

  select * into v_outbox
  from public.whatsapp_outbox_v1
  where id=v_dispatch.outbox_id
  for update;
  if not found or v_outbox.purpose<>'marketing_campaign' or v_outbox.message_type<>'template'
     or v_outbox.whatsapp_account_id<>v_dispatch.whatsapp_account_id
     or v_outbox.customer_id is distinct from v_dispatch.customer_id then
    return jsonb_build_object('ok',false,'error','campaign_outbox_invalid');
  end if;
  if v_outbox.message_id is null then return jsonb_build_object('ok',false,'error','canonical_message_missing'); end if;

  select * into v_message
  from public.whatsapp_messages_v1
  where id=v_outbox.message_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','canonical_message_missing'); end if;

  if v_duplicate is false then
    v_finish:=public.marketing_finish_dispatch_v1(v_dispatch.id,'accepted',v_wamid,null,null);
    if coalesce((v_finish->>'ok')::boolean,false) is not true then
      raise exception 'marketing_accept_finish_failed:%',coalesce(v_finish->>'error','unknown');
    end if;

    update public.whatsapp_messages_v1
    set provider='meta',provider_message_id=v_wamid,status_current='accepted',sender_kind='campaign',sent_at=v_accepted_at,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('source','marketing_campaign_worker','campaign_dispatch_id',v_dispatch.id)
    where id=v_message.id
    returning * into v_message;

    v_status_result:=public.whatsapp_record_status_v1(
      v_dispatch.whatsapp_account_id,'meta',v_wamid,'accepted',v_accepted_at,v_accepted_at,
      null,null,null,jsonb_build_object('source','marketing_campaign_worker','dispatch_id',v_dispatch.id)
    );
    if coalesce((v_status_result->>'ok')::boolean,false) is not true then
      raise exception 'marketing_accept_status_failed:%',coalesce(v_status_result->>'error','unknown');
    end if;
  end if;

  for r in
    select e.*
    from public.whatsapp_webhook_events_v1 e
    where e.whatsapp_account_id=v_dispatch.whatsapp_account_id
      and e.provider='meta'
      and e.provider_message_id=v_wamid
      and e.event_type like 'message.status.%'
      and e.status='received'
    order by e.received_at,e.id
    for update
  loop
    v_event_status:=split_part(r.event_type,'.',3);
    if v_event_status not in ('sent','delivered','read','failed','cancelled') then
      update public.whatsapp_webhook_events_v1
      set status='ignored',processed_at=now(),last_error='status_not_supported_for_replay'
      where id=r.id;
      continue;
    end if;

    v_occurred_at:=case
      when coalesce(r.payload->>'timestamp','') ~ '^\d+(\.\d+)?$'
        then to_timestamp((r.payload->>'timestamp')::double precision)
      else r.received_at
    end;

    v_status_result:=public.whatsapp_record_status_v1(
      v_dispatch.whatsapp_account_id,'meta',v_wamid,v_event_status,v_occurred_at,r.received_at,
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

  select * into v_message from public.whatsapp_messages_v1 where id=v_outbox.message_id;

  return jsonb_build_object(
    'ok',true,
    'duplicate',v_duplicate,
    'dispatch_id',v_dispatch.id,
    'outbox_id',v_outbox.id,
    'message_id',v_message.id,
    'status','accepted',
    'status_current',v_message.status_current,
    'provider_message_id',v_wamid,
    'pending_statuses_replayed',v_replayed
  );
end;
$$;
revoke all on function public.marketing_accept_meta_dispatch_v1(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.marketing_accept_meta_dispatch_v1(uuid,text,timestamptz) to service_role;

commit;
