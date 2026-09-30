-- Applied to canonical Supabase 20260930023803
-- Dona Antônia Operations 2.0
CREATE OR REPLACE FUNCTION public.papoai_ensure_conversation_v2(p_capture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.papoai_webhook_inbox_v2%rowtype;
  v_phone_e164 text;
  v_phone_digits text;
  v_business_phone text;
  v_occurred_at timestamptz;
  v_customer_id uuid;
  v_contact_id text;
  v_session_uid text;
  v_account_id uuid;
  v_account_count integer;
  v_conversation_id uuid;
  v_created boolean:=false;
begin
  select * into v_row
  from public.papoai_webhook_inbox_v2
  where id=p_capture_id
  for update;

  if not found then return jsonb_build_object('ok',false,'error','capture_not_found'); end if;
  if v_row.status not in ('normalized','processed') then
    return jsonb_build_object('ok',false,'error','capture_not_normalized','status',v_row.status);
  end if;
  if coalesce(v_row.event_name,'')<>'message.received' then
    return jsonb_build_object('ok',true,'skipped',true,'reason','not_inbound_message');
  end if;

  v_phone_e164:=public.canonical_whatsapp_e164_br_v2(v_row.phone_candidate);
  if v_phone_e164 is null then
    update public.papoai_webhook_inbox_v2
       set status='review_required',last_error='phone_missing_for_conversation'
     where id=p_capture_id;
    return jsonb_build_object('ok',false,'error','phone_missing_for_conversation');
  end if;
  v_phone_digits:=public.normalize_phone_digits(v_phone_e164);
  v_business_phone:=public.canonical_whatsapp_e164_br_v2(v_row.metadata->>'phone_to');

  begin
    v_occurred_at:=coalesce(nullif(v_row.metadata->>'occurred_at','')::timestamptz,v_row.received_at);
  exception when others then v_occurred_at:=v_row.received_at; end;

  begin
    v_customer_id:=nullif(v_row.metadata->>'customer_id','')::uuid;
  exception when others then v_customer_id:=null; end;

  if v_customer_id is null then
    select customer_id into v_customer_id
    from public.lookup_customer_by_phone(v_phone_e164)
    limit 1;
  end if;

  v_contact_id:=nullif(v_row.metadata->>'contact_id','');
  v_session_uid:=nullif(v_row.conversation_ref,'');

  select count(*),(array_agg(id order by updated_at desc))[1]
    into v_account_count,v_account_id
  from public.whatsapp_accounts
  where is_active=true
    and v_business_phone is not null
    and public.normalize_phone_digits(phone_e164)=public.normalize_phone_digits(v_business_phone);

  if v_account_count<>1 or v_account_id is null then
    update public.papoai_webhook_inbox_v2
       set status='review_required',
           last_error=case when v_business_phone is null then 'business_phone_missing'
                           else 'whatsapp_account_unresolved' end
     where id=p_capture_id;
    return jsonb_build_object(
      'ok',false,
      'error',case when v_business_phone is null then 'business_phone_missing' else 'whatsapp_account_unresolved' end,
      'business_phone',v_business_phone,'count',v_account_count
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_account_id::text||':'||v_phone_digits,0));

  select c.id into v_conversation_id
  from public.conversations c
  where c.whatsapp_account_id=v_account_id
    and public.normalize_phone_digits(c.wa_contact_e164)=any(public.phone_variants_br(v_phone_e164))
    and c.status<>'closed'
  order by c.updated_at desc
  limit 1
  for update;

  if v_conversation_id is null then
    insert into public.conversations(
      whatsapp_account_id,channel_account_id,customer_id,wa_contact_e164,source,status,stage,
      response_preference,human_required,referral,opened_at,last_inbound_at,
      service_window_expires_at,created_at,updated_at,mode,channel,external_user_id
    ) values (
      v_account_id,v_account_id,v_customer_id,v_phone_e164,'organic','open','new',
      'auto',false,
      jsonb_strip_nulls(jsonb_build_object(
        'source','papoai','papoai_session_uid',v_session_uid,
        'papoai_contact_id',v_contact_id,'business_phone_e164',v_business_phone
      )),
      v_occurred_at,v_occurred_at,v_occurred_at+interval '24 hours',
      now(),now(),'ai','whatsapp',v_phone_e164
    )
    returning id into v_conversation_id;
    v_created:=true;
  else
    update public.conversations
       set customer_id=coalesce(customer_id,v_customer_id),
           wa_contact_e164=v_phone_e164,
           channel_account_id=coalesce(channel_account_id,v_account_id),
           external_user_id=coalesce(external_user_id,v_phone_e164),
           last_inbound_at=greatest(coalesce(last_inbound_at,v_occurred_at),v_occurred_at),
           service_window_expires_at=greatest(
             coalesce(service_window_expires_at,v_occurred_at+interval '24 hours'),
             v_occurred_at+interval '24 hours'
           ),
           referral=coalesce(referral,'{}'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object(
               'source','papoai','papoai_session_uid',v_session_uid,
               'papoai_contact_id',v_contact_id,'business_phone_e164',v_business_phone
             )),
           updated_at=now()
     where id=v_conversation_id;
  end if;

  update public.papoai_webhook_inbox_v2
     set phone_candidate=public.normalize_phone_digits(v_phone_e164),
         metadata=coalesce(metadata,'{}'::jsonb)
           || jsonb_build_object(
             'conversation_id',v_conversation_id,
             'conversation_created',v_created,
             'customer_id',v_customer_id,
             'conversation_bridge_version',3,
             'business_phone_e164',v_business_phone,
             'whatsapp_account_id',v_account_id,
             'canonical_phone_e164',v_phone_e164
           ),
         last_error=null
   where id=p_capture_id;

  return jsonb_build_object(
    'ok',true,'conversation_id',v_conversation_id,'created',v_created,
    'customer_id',v_customer_id,'phone_e164',v_phone_e164,
    'business_phone_e164',v_business_phone,'whatsapp_account_id',v_account_id
  );
end;
$function$
;
revoke all on function public.papoai_ensure_conversation_v2(uuid) from public,anon,authenticated;
grant execute on function public.papoai_ensure_conversation_v2(uuid) to service_role;
