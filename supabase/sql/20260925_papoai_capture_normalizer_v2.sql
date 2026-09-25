-- Dona Antonia Operations 2.0
-- PapoAI capture normalizer v2.
-- Centralizes the observed webhook schema without creating a parallel message store.

create or replace function public.papoai_normalize_capture_v2(
  p_capture_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.papoai_webhook_inbox_v2%rowtype;
  v_payload jsonb;
  v_event_name text;
  v_message_id text;
  v_whatsapp_message_id text;
  v_conversation_ref text;
  v_direction text;
  v_message_type text;
  v_phone_from text;
  v_phone_to text;
  v_phone text;
  v_contact_id text;
  v_contact_name text;
  v_customer_id uuid;
  v_occurred_at text;
  v_metadata jsonb;
begin
  select * into v_row
  from public.papoai_webhook_inbox_v2
  where id=p_capture_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','capture_not_found');
  end if;

  if v_row.status in ('processed','ignored') then
    return jsonb_build_object('ok',true,'id',v_row.id,'status',v_row.status,'already_final',true);
  end if;

  v_payload:=coalesce(v_row.payload,'{}'::jsonb);

  v_event_name:=nullif(trim(coalesce(
    v_payload#>>'{event,type}',
    v_row.event_name,
    v_payload#>>'{event_name}'
  )),'');
  v_message_id:=nullif(trim(coalesce(
    v_payload#>>'{data,message,id}',
    v_row.external_message_id
  )),'');
  v_whatsapp_message_id:=nullif(trim(v_payload#>>'{data,message,external_id}'),'');
  v_conversation_ref:=nullif(trim(coalesce(
    v_payload#>>'{data,session,uid}',
    v_row.conversation_ref
  )),'');
  v_direction:=lower(nullif(trim(v_payload#>>'{data,message,direction}'),''));
  v_message_type:=lower(nullif(trim(v_payload#>>'{data,message,type}'),''));
  v_phone_from:=regexp_replace(coalesce(v_payload#>>'{data,message,phone_number_from}',''),'\D','','g');
  v_phone_to:=regexp_replace(coalesce(v_payload#>>'{data,message,phone_number_to}',''),'\D','','g');
  v_contact_id:=nullif(trim(v_payload#>>'{data,contact,id}'),'');
  v_contact_name:=nullif(trim(v_payload#>>'{data,contact,name}'),'');
  v_occurred_at:=nullif(trim(coalesce(
    v_payload#>>'{event,occurred_at}',
    v_payload#>>'{data,message,created_at}'
  )),'');
  v_phone:=case
    when v_direction='inbound' and length(v_phone_from)>=10 then v_phone_from
    when v_direction='outbound' and length(v_phone_to)>=10 then v_phone_to
    when length(v_phone_from)>=10 then v_phone_from
    when length(v_phone_to)>=10 then v_phone_to
    else null
  end;

  if v_phone is not null then
    select c.id into v_customer_id
    from public.customers c
    where regexp_replace(coalesce(c.primary_whatsapp_e164,''),'\D','','g')=v_phone
    limit 1;

    if v_customer_id is null then
      select cp.customer_id into v_customer_id
      from public.customer_phones cp
      where regexp_replace(coalesce(cp.phone_e164,''),'\D','','g')=v_phone
      order by cp.is_primary desc,cp.created_at asc
      limit 1;
    end if;
  end if;

  v_metadata:=coalesce(v_row.metadata,'{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'source','papoai',
      'capture_only',true,
      'adapter_version',2,
      'direction',v_direction,
      'message_type',v_message_type,
      'whatsapp_message_id',v_whatsapp_message_id,
      'contact_id',v_contact_id,
      'contact_name',v_contact_name,
      'phone_from',nullif(v_phone_from,''),
      'phone_to',nullif(v_phone_to,''),
      'customer_id',v_customer_id,
      'occurred_at',v_occurred_at
    ));

  update public.papoai_webhook_inbox_v2
     set event_name=v_event_name,
         external_message_id=v_message_id,
         conversation_ref=v_conversation_ref,
         phone_candidate=v_phone,
         metadata=v_metadata,
         adapter_version=2,
         status=case
           when v_event_name in ('message.received','message.sent') and v_message_id is not null and v_conversation_ref is not null
             then 'normalized'
           else 'review_required'
         end,
         last_error=case
           when v_event_name in ('message.received','message.sent') and v_message_id is not null and v_conversation_ref is not null
             then null
           else 'unsupported_or_incomplete_payload'
         end
   where id=p_capture_id;

  return jsonb_build_object(
    'ok',true,
    'id',p_capture_id,
    'status',case
      when v_event_name in ('message.received','message.sent') and v_message_id is not null and v_conversation_ref is not null
        then 'normalized'
      else 'review_required'
    end,
    'event_name',v_event_name,
    'conversation_ref',v_conversation_ref,
    'external_message_id',v_message_id,
    'phone_candidate',v_phone,
    'customer_id',v_customer_id,
    'adapter_version',2
  );
end;
$$;

create or replace function public.papoai_normalize_pending_v2(
  p_limit integer default 50
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row record;
  v_total integer:=0;
  v_normalized integer:=0;
  v_review integer:=0;
  v_result jsonb;
begin
  for v_row in
    select id
    from public.papoai_webhook_inbox_v2
    where status='captured'
      and expires_at>now()
    order by received_at
    limit greatest(1,least(200,coalesce(p_limit,50)))
  loop
    v_total:=v_total+1;
    v_result:=public.papoai_normalize_capture_v2(v_row.id);
    if v_result->>'status'='normalized' then
      v_normalized:=v_normalized+1;
    else
      v_review:=v_review+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'processed',v_total,
    'normalized',v_normalized,
    'review_required',v_review
  );
end;
$$;

create or replace function public.get_papoai_webhook_capture_status_v2()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'capture_enabled',r.capture_enabled,
    'last_seen_at',r.last_seen_at,
    'last_event_key',r.last_event_key,
    'last_error',r.last_error,
    'captured_24h',(select count(*) from public.papoai_webhook_inbox_v2 where received_at>=now()-interval '24 hours'),
    'pending',(select count(*) from public.papoai_webhook_inbox_v2 where status in ('captured','normalized') and expires_at>now()),
    'raw_pending',(select count(*) from public.papoai_webhook_inbox_v2 where status='captured' and expires_at>now()),
    'normalized_pending',(select count(*) from public.papoai_webhook_inbox_v2 where status='normalized' and expires_at>now()),
    'review_required',(select count(*) from public.papoai_webhook_inbox_v2 where status='review_required' and expires_at>now()),
    'expired',(select count(*) from public.papoai_webhook_inbox_v2 where expires_at<=now()),
    'adapter_version',2
  )
  from public.papoai_webhook_runtime_v2 r
  where r.id=1;
$$;

revoke all on function public.papoai_normalize_capture_v2(uuid) from public,anon,authenticated;
revoke all on function public.papoai_normalize_pending_v2(integer) from public,anon,authenticated;
revoke all on function public.get_papoai_webhook_capture_status_v2() from public,anon,authenticated;

grant execute on function public.papoai_normalize_capture_v2(uuid) to service_role;
grant execute on function public.papoai_normalize_pending_v2(integer) to service_role;
grant execute on function public.get_papoai_webhook_capture_status_v2() to service_role;
