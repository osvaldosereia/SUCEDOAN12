create or replace function public.issue_whatsapp_flow_owner_homologation_token_v1(
  p_conversation_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  a public.automation_config%rowtype;
  c public.conversations%rowtype;
  d public.experience_definitions%rowtype;
  s public.experience_sessions%rowtype;
  v_key text:=trim(coalesce(p_idempotency_key,''));
  v_token text;
  v_hash text;
  v_protocol text;
  v_allowed boolean:=false;
begin
  if length(v_key)<12 or length(v_key)>200 then
    raise exception 'invalid_homologation_idempotency_key';
  end if;

  select * into a from public.automation_config where id=1;
  if not found then raise exception 'automation_config_missing'; end if;
  if coalesce(a.whatsapp_live_canary_percent,0)<>1
     or a.experience_orchestrator_enabled
     or a.whatsapp_flow_data_exchange_enabled
     or a.whatsapp_flow_send_enabled
     or a.whatsapp_flow_commercial_write_enabled
     or a.bling_order_sync_enabled then
    raise exception 'homologation_gates_not_locked';
  end if;

  select * into c from public.conversations where id=p_conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;

  select exists(
    select 1 from public.whatsapp_test_allowlist w
     where w.phone_e164=c.wa_contact_e164
       and w.enabled
       and w.purpose='flow_v31_owner_homologation'
       and (w.expires_at is null or w.expires_at>now())
  ) into v_allowed;
  if not v_allowed then raise exception 'homologation_recipient_not_allowed'; end if;

  select * into d
    from public.experience_definitions
   where slug='flow-cestas-comercial-v8-stable'
     and status='ready';
  if not found then raise exception 'v31_candidate_not_ready'; end if;
  if coalesce(d.provider_id,'')='' then raise exception 'v31_meta_flow_missing'; end if;
  if coalesce((d.metadata->>'candidate_not_live')::boolean,false) is not true
     or coalesce((d.metadata->>'customer_exposure')::boolean,false) is not false
     or coalesce((d.metadata->>'default_for_new_sessions')::boolean,false) is not false
     or upper(coalesce(d.metadata->>'meta_status',''))<>'DRAFT'
     or coalesce((d.config->>'production_enabled')::boolean,false) is not false then
    raise exception 'v31_candidate_isolation_invalid';
  end if;

  select * into s from public.experience_sessions where idempotency_key=v_key for update;
  if found then
    if s.definition_id<>d.id or s.conversation_id<>c.id then
      raise exception 'homologation_idempotency_collision';
    end if;
    if s.status not in ('offered','open') or s.expires_at<=now() then
      raise exception 'homologation_session_not_launchable';
    end if;
  else
    insert into public.experience_sessions(
      conversation_id,customer_id,definition_id,idempotency_key,status,context
    ) values (
      c.id,c.customer_id,d.id,v_key,'offered',
      jsonb_build_object(
        'test_mode',true,
        'requested_by','owner',
        'homologation_test',true,
        'requested_by_owner',true,
        'test_recipient',c.wa_contact_e164,
        'audit_only',true,
        'revision','v31-owner-homologation-token-v1'
      )
    ) returning * into s;

    insert into public.experience_events(
      conversation_id,session_id,definition_id,event_type,interface_type,cohort,event_data
    ) values (
      c.id,s.id,d.id,'homologation_session_created','whatsapp_flow',c.automation_cohort,
      jsonb_build_object('definition_slug',d.slug,'provider_id',d.provider_id,'owner_only',true)
    );
  end if;

  v_token:=encode(extensions.gen_random_bytes(24),'hex');
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  select protocol_version into v_protocol from public.whatsapp_flow_transport_config where id=1;

  update public.experience_sessions
     set flow_token_hash=v_hash,
         flow_token_issued_at=now(),
         flow_last_exchange_at=null,
         flow_exchange_count=0,
         flow_current_screen=null,
         flow_state_version=0,
         flow_last_request_fingerprint=null,
         context=coalesce(context,'{}'::jsonb)||jsonb_build_object('test_recipient',c.wa_contact_e164,'homologation_test',true,'requested_by_owner',true),
         updated_at=now()
   where id=s.id;

  insert into public.experience_events(
    conversation_id,session_id,definition_id,event_type,interface_type,cohort,event_data
  ) values (
    c.id,s.id,d.id,'homologation_flow_token_issued','whatsapp_flow',c.automation_cohort,
    jsonb_build_object('definition_slug',d.slug,'provider_id',d.provider_id,'protocol_version',v_protocol,'global_gates_bypassed',false,'owner_allowlist_required',true)
  );

  return jsonb_build_object(
    'ok',true,
    'session_id',s.id,
    'flow_token',v_token,
    'flow_id',d.provider_id,
    'flow_message_version',v_protocol,
    'flow_action',coalesce(nullif(d.config->>'flow_action',''),'data_exchange'),
    'flow_cta',coalesce(nullif(d.config->>'flow_cta',''),'Montar pedido'),
    'definition_slug',d.slug,
    'expires_at',s.expires_at,
    'homologation_only',true
  );
end;
$function$;

revoke all on function public.issue_whatsapp_flow_owner_homologation_token_v1(uuid,text) from public, anon, authenticated;
grant execute on function public.issue_whatsapp_flow_owner_homologation_token_v1(uuid,text) to service_role;
