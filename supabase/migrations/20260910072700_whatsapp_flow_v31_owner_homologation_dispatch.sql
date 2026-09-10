create or replace function public.dispatch_whatsapp_flow_owner_homologation_job_v1(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  a public.automation_config%rowtype;
  j public.outbound_jobs%rowtype;
  c public.conversations%rowtype;
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  v_token text;
  v_token_hash text;
  v_session_id uuid;
  v_webhook text;
  v_request_id bigint;
  v_payload jsonb;
begin
  select * into a from public.automation_config where id=1;
  if coalesce(a.whatsapp_live_canary_percent,0)<>1
     or a.experience_orchestrator_enabled
     or a.whatsapp_flow_data_exchange_enabled
     or a.whatsapp_flow_send_enabled
     or a.whatsapp_flow_commercial_write_enabled
     or a.bling_order_sync_enabled then
    raise exception 'homologation_gates_not_locked';
  end if;

  select * into j from public.outbound_jobs where id=p_job_id for update;
  if not found then raise exception 'homologation_job_not_found'; end if;
  if j.status not in ('pending','error') or j.job_type<>'seller_message'
     or j.payload->>'delivery_mode'<>'interactive'
     or j.payload#>>'{interactive,type}'<>'flow'
     or j.payload#>>'{interactive,action,name}'<>'flow' then
    raise exception 'homologation_job_invalid';
  end if;

  select * into c from public.conversations where id=j.conversation_id;
  if not found or c.mode<>'ai' or c.service_window_expires_at<=now() then
    raise exception 'homologation_conversation_unavailable';
  end if;
  if c.wa_contact_e164<>j.recipient_e164 then raise exception 'homologation_recipient_mismatch'; end if;
  if not exists(select 1 from public.whatsapp_test_allowlist w where w.phone_e164=j.recipient_e164 and w.enabled and w.purpose='flow_v31_owner_homologation' and (w.expires_at is null or w.expires_at>now())) then
    raise exception 'homologation_recipient_not_allowed';
  end if;

  begin v_session_id=(j.payload->>'homologation_session_id')::uuid; exception when others then raise exception 'homologation_session_required'; end;
  select * into s from public.experience_sessions where id=v_session_id and conversation_id=c.id;
  if not found or s.status not in ('offered','open') or s.expires_at<=now() then raise exception 'homologation_session_invalid'; end if;
  if coalesce((s.context->>'homologation_test')::boolean,false) is not true or coalesce((s.context->>'requested_by_owner')::boolean,false) is not true or s.context->>'test_recipient'<>j.recipient_e164 then
    raise exception 'homologation_session_not_owner';
  end if;

  select * into d from public.experience_definitions where id=s.definition_id;
  if d.slug<>'flow-cestas-comercial-v8-stable' or d.status<>'ready' or upper(coalesce(d.metadata->>'meta_status',''))<>'DRAFT'
     or coalesce((d.metadata->>'candidate_not_live')::boolean,false) is not true
     or coalesce((d.metadata->>'customer_exposure')::boolean,false) is not false then
    raise exception 'homologation_definition_invalid';
  end if;
  if j.payload#>>'{interactive,action,parameters,flow_id}'<>d.provider_id then raise exception 'homologation_flow_id_mismatch'; end if;
  v_token:=j.payload#>>'{interactive,action,parameters,flow_token}';
  if v_token is null or v_token !~ '^[A-Fa-f0-9]{32,128}$' then raise exception 'homologation_token_invalid'; end if;
  v_token_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  if v_token_hash<>s.flow_token_hash then raise exception 'homologation_token_session_mismatch'; end if;

  select decrypted_secret into v_webhook from vault.decrypted_secrets where name='dona_antonia_whatsapp_outbound_make_webhook' order by created_at desc limit 1;
  if nullif(v_webhook,'') is null then raise exception 'homologation_webhook_unavailable'; end if;

  update public.outbound_jobs set status='processing',attempts=attempts+1,locked_at=now(),locked_by='pgnet-make-flow-owner-homologation-v1',dispatch_attempts=dispatch_attempts+1,last_dispatch_at=now(),last_error=null,updated_at=now() where id=j.id returning * into j;

  v_payload:=jsonb_build_object('event','outbound_delivery','protocol_version',4,'job',jsonb_build_object(
    'id',j.id::text,'conversation_id',j.conversation_id::text,'recipient_e164',j.recipient_e164,'attempt',j.attempts,
    'delivery_mode','interactive','body_text',left(coalesce(j.payload->>'body_text',''),4096),'interactive',j.payload->'interactive','reply_message_id',j.payload->>'reply_message_id'
  ));
  v_request_id:=net.http_post(url:=v_webhook,body:=v_payload,headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=30000);
  update public.outbound_jobs set last_dispatch_request_id=v_request_id,updated_at=now() where id=j.id;
  return jsonb_build_object('ok',true,'job_id',j.id,'request_id',v_request_id,'homologation_only',true);
end;
$function$;

revoke all on function public.dispatch_whatsapp_flow_owner_homologation_job_v1(uuid) from public,anon,authenticated;
grant execute on function public.dispatch_whatsapp_flow_owner_homologation_job_v1(uuid) to service_role;
