begin;

create or replace function public.ops2_ana_enqueue_live_job_v1(p_inbound_message_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_message public.whatsapp_messages_v1%rowtype;
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_gate jsonb;
  v_job public.whatsapp_ana_jobs_v1%rowtype;
begin
  if p_inbound_message_id is null then return jsonb_build_object('ok',false,'error','inbound_message_required'); end if;
  select * into v_message from public.whatsapp_messages_v1 where id=p_inbound_message_id;
  if not found or v_message.direction<>'inbound' then return jsonb_build_object('ok',false,'error','inbound_message_required'); end if;
  if v_message.message_type<>'text' or nullif(btrim(coalesce(v_message.text_body,'')),'') is null then
    return jsonb_build_object('ok',false,'error','message_type_not_supported');
  end if;
  select * into v_runtime from public.whatsapp_channel_runtime_v1
    where whatsapp_account_id=v_message.whatsapp_account_id;
  if not found or v_runtime.ana_enabled is not true or v_runtime.send_enabled is not true
     or v_runtime.outbound_provider is distinct from 'meta' or v_runtime.homologated_at is null then
    return jsonb_build_object('ok',false,'error','ana_channel_gate_closed');
  end if;
  v_gate:=public.ops2_attendance_ai_gate_v1(v_message.conversation_id);
  if coalesce((v_gate->>'allowed')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error','ai_gate_closed','gate',v_gate);
  end if;
  select * into v_job from public.whatsapp_ana_jobs_v1 where inbound_message_id=v_message.id;
  if found then return jsonb_build_object('ok',true,'duplicate',true,'job_id',v_job.id,'status',v_job.status); end if;
  insert into public.whatsapp_ana_jobs_v1(inbound_message_id,conversation_id,whatsapp_account_id,dry_run,status,metadata)
  values(v_message.id,v_message.conversation_id,v_message.whatsapp_account_id,false,'queued',
    jsonb_build_object('source','meta_webhook','provider',v_message.provider,'provider_message_id',v_message.provider_message_id))
  returning * into v_job;
  return jsonb_build_object('ok',true,'duplicate',false,'job_id',v_job.id,'status',v_job.status);
exception when unique_violation then
  select * into v_job from public.whatsapp_ana_jobs_v1 where inbound_message_id=p_inbound_message_id;
  return jsonb_build_object('ok',true,'duplicate',true,'job_id',v_job.id,'status',v_job.status);
end;
$function$;

create or replace function public.ops2_ana_claim_live_v1(p_limit integer default 1)
returns setof public.whatsapp_ana_jobs_v1 language plpgsql security definer set search_path=''
as $function$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,1),3));
begin
  return query with picked as (
    select j.id from public.whatsapp_ana_jobs_v1 j
    where j.status='queued' and j.dry_run=false and j.available_at<=now()
    order by j.created_at,j.id for update skip locked limit v_limit
  ), claimed as (
    update public.whatsapp_ana_jobs_v1 j set status='claimed',claimed_at=now(),attempt_count=j.attempt_count+1,
      updated_at=now(),last_error=null from picked p where j.id=p.id returning j.*
  ) select * from claimed;
end;
$function$;

create or replace function public.ops2_ana_begin_live_send_v1(p_job_id uuid,p_text text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_job public.whatsapp_ana_jobs_v1%rowtype;
  v_conversation public.conversations%rowtype;
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_gate jsonb;
  v_key text;
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_text text:=btrim(coalesce(p_text,''));
  v_phone text;
begin
  if p_job_id is null or v_text='' or char_length(v_text)>1200 then return jsonb_build_object('ok',false,'error','live_reply_invalid'); end if;
  select * into v_job from public.whatsapp_ana_jobs_v1 where id=p_job_id for update;
  if not found or v_job.dry_run is not false or v_job.status<>'claimed' then return jsonb_build_object('ok',false,'error','live_job_not_claimed'); end if;
  v_gate:=public.ops2_attendance_ai_gate_v1(v_job.conversation_id);
  if coalesce((v_gate->>'allowed')::boolean,false) is not true then return jsonb_build_object('ok',false,'error','ai_gate_closed'); end if;
  select * into v_conversation from public.conversations where id=v_job.conversation_id for update;
  if not found or v_conversation.whatsapp_account_id is distinct from v_job.whatsapp_account_id
     or v_conversation.last_inbound_at is null or now()>=v_conversation.last_inbound_at+interval '24 hours' then
    return jsonb_build_object('ok',false,'error','service_window_or_conversation_invalid');
  end if;
  select * into v_runtime from public.whatsapp_channel_runtime_v1 where whatsapp_account_id=v_job.whatsapp_account_id;
  if not found or v_runtime.ana_enabled is not true or v_runtime.send_enabled is not true
     or v_runtime.outbound_provider is distinct from 'meta' or v_runtime.homologated_at is null then return jsonb_build_object('ok',false,'error','ana_channel_gate_closed'); end if;
  select * into v_account from public.whatsapp_accounts where id=v_job.whatsapp_account_id and is_active=true;
  v_phone:=public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);
  if not found or v_phone is null or v_account.phone_number_id is null then return jsonb_build_object('ok',false,'error','meta_account_unavailable'); end if;
  v_key:='ana-live:'||v_job.id::text;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_outbox from public.whatsapp_outbox_v1 where idempotency_key=v_key;
  if found then return jsonb_build_object('ok',false,'error','live_send_already_started','outbox_id',v_outbox.id,'status',v_outbox.status); end if;
  insert into public.whatsapp_outbox_v1(idempotency_key,whatsapp_account_id,conversation_id,customer_id,to_phone_e164,
    purpose,message_type,payload,provider,status,metadata)
  values(v_key,v_job.whatsapp_account_id,v_job.conversation_id,v_conversation.customer_id,v_phone,
    'ai_attendance','text',jsonb_build_object('text',v_text),'meta','queued',
    jsonb_build_object('source','ana','job_id',v_job.id,'provider','meta')) returning * into v_outbox;
  update public.whatsapp_outbox_v1 set status='claimed',claimed_at=now(),attempt_count=attempt_count+1,updated_at=now()
    where id=v_outbox.id returning * into v_outbox;
  return jsonb_build_object('ok',true,'outbox_id',v_outbox.id,'phone_number_id',v_account.phone_number_id,
    'to_phone_e164',v_phone,'text',v_text,'whatsapp_account_id',v_job.whatsapp_account_id,'conversation_id',v_job.conversation_id);
end;
$function$;

create or replace function public.ops2_ana_accept_live_outbound_v1(p_outbox_id uuid,p_provider_message_id text,p_accepted_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_message public.whatsapp_messages_v1%rowtype;
  v_message_id uuid;
  v_status jsonb;
begin
  if p_outbox_id is null or coalesce(p_provider_message_id,'') not like 'wamid.%' then return jsonb_build_object('ok',false,'error','live_outbound_invalid'); end if;
  select * into v_outbox from public.whatsapp_outbox_v1 where id=p_outbox_id for update;
  if not found or v_outbox.provider<>'meta' or v_outbox.purpose<>'ai_attendance' or v_outbox.message_type<>'text'
     or v_outbox.status<>'claimed' then return jsonb_build_object('ok',false,'error','live_outbox_not_claimed'); end if;
  select * into v_message from public.whatsapp_messages_v1 where whatsapp_account_id=v_outbox.whatsapp_account_id
    and provider_message_id=p_provider_message_id limit 1 for update;
  if found then
    if v_message.conversation_id is distinct from v_outbox.conversation_id or v_message.direction<>'outbound' then
      return jsonb_build_object('ok',false,'error','live_wamid_conflict');
    end if;
    update public.whatsapp_messages_v1 set provider='meta',text_body=coalesce(text_body,nullif(v_outbox.payload->>'text','')),
      status_current=case when status_current in ('sent','delivered','read','failed','cancelled') then status_current else 'accepted' end,
      sender_kind='ana_ai',sender_ref='ana',sent_at=coalesce(sent_at,p_accepted_at,now()),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('source','ana','transport','meta_cloud_api',
        'outbox_id',v_outbox.id,'idempotency_key',v_outbox.idempotency_key,'promoted_from_shadow',v_message.provider='papoai')
      where id=v_message.id returning * into v_message;
    v_message_id:=v_message.id;
  else
    insert into public.whatsapp_messages_v1(conversation_id,whatsapp_account_id,customer_id,direction,message_type,provider,
      provider_message_id,text_body,status_current,sender_kind,sender_ref,sent_at,metadata)
    values(v_outbox.conversation_id,v_outbox.whatsapp_account_id,v_outbox.customer_id,'outbound','text','meta',
      p_provider_message_id,nullif(v_outbox.payload->>'text',''),'accepted','ana_ai','ana',coalesce(p_accepted_at,now()),
      jsonb_build_object('source','ana','transport','meta_cloud_api','outbox_id',v_outbox.id,'idempotency_key',v_outbox.idempotency_key))
    returning id into v_message_id;
  end if;
  update public.whatsapp_outbox_v1 set message_id=v_message_id,provider_message_id=p_provider_message_id,status='sent',
    sent_at=coalesce(p_accepted_at,now()),last_error=null,updated_at=now() where id=v_outbox.id;
  update public.conversations set last_outbound_at=greatest(coalesce(last_outbound_at,'-infinity'::timestamptz),coalesce(p_accepted_at,now())),
    updated_at=greatest(updated_at,coalesce(p_accepted_at,now())) where id=v_outbox.conversation_id;
  v_status:=public.whatsapp_record_status_v1(v_outbox.whatsapp_account_id,'meta',p_provider_message_id,'accepted',
    coalesce(p_accepted_at,now()),now(),null,null,null,jsonb_build_object('source','ana_send','outbox_id',v_outbox.id));
  if coalesce((v_status->>'ok')::boolean,false) is not true then raise exception 'ana_status_record_failed'; end if;
  return jsonb_build_object('ok',true,'message_id',v_message_id,'outbox_id',v_outbox.id,'status','sent');
end;
$function$;

create or replace function public.ops2_ana_finish_live_job_v1(p_job_id uuid,p_status text,p_decision text default null,
  p_text text default null,p_confidence numeric default null,p_reason text default null,p_model text default null,
  p_provider_response_id text default null,p_error text default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_job public.whatsapp_ana_jobs_v1%rowtype;
begin
  if p_status not in ('completed','skipped','failed') or coalesce(p_decision,'') not in ('suggest','handoff','no_reply') then
    return jsonb_build_object('ok',false,'error','live_job_result_invalid');
  end if;
  select * into v_job from public.whatsapp_ana_jobs_v1 where id=p_job_id for update;
  if not found or v_job.dry_run is not false or v_job.status not in ('claimed','queued') then
    return jsonb_build_object('ok',false,'error','live_job_not_claimed');
  end if;
  update public.whatsapp_ana_jobs_v1 set status=p_status,decision=p_decision,suggestion_text=nullif(btrim(coalesce(p_text,'')),''),
    confidence=greatest(0,least(coalesce(p_confidence,0),1)),reason=left(coalesce(p_reason,''),300),
    model=left(coalesce(p_model,''),120),provider_response_id=left(coalesce(p_provider_response_id,''),500),
    completed_at=now(),last_error=case when p_status='failed' then left(coalesce(p_error,'ana_live_failed'),500) else null end,
    metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('dry_run_not_sendable',false),updated_at=now()
  where id=p_job_id returning * into v_job;
  return jsonb_build_object('ok',true,'job_id',v_job.id,'status',v_job.status,'decision',v_job.decision);
end;
$function$;

create or replace function public.ops2_ana_fail_live_send_v1(p_outbox_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_outbox public.whatsapp_outbox_v1%rowtype;
begin
  update public.whatsapp_outbox_v1 set status='failed',last_error=left(coalesce(p_reason,'meta_send_uncertain'),250),updated_at=now()
    where id=p_outbox_id and purpose='ai_attendance' and status='claimed' returning * into v_outbox;
  if not found then return jsonb_build_object('ok',false,'error','live_outbox_not_claimed'); end if;
  return jsonb_build_object('ok',true,'outbox_id',v_outbox.id,'status',v_outbox.status);
end;
$function$;

revoke all on function public.ops2_ana_enqueue_live_job_v1(uuid) from public,anon,authenticated;
revoke all on function public.ops2_ana_claim_live_v1(integer) from public,anon,authenticated;
revoke all on function public.ops2_ana_begin_live_send_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.ops2_ana_accept_live_outbound_v1(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.ops2_ana_finish_live_job_v1(uuid,text,text,text,numeric,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.ops2_ana_fail_live_send_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.ops2_ana_enqueue_live_job_v1(uuid) to service_role;
grant execute on function public.ops2_ana_claim_live_v1(integer) to service_role;
grant execute on function public.ops2_ana_begin_live_send_v1(uuid,text) to service_role;
grant execute on function public.ops2_ana_accept_live_outbound_v1(uuid,text,timestamptz) to service_role;
grant execute on function public.ops2_ana_finish_live_job_v1(uuid,text,text,text,numeric,text,text,text,text,jsonb) to service_role;
grant execute on function public.ops2_ana_fail_live_send_v1(uuid,text) to service_role;

commit;
