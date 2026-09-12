-- WhatsApp Flow V67: make no-order terminal handoff consumption atomic under concurrent nfm_reply delivery.
-- Preserves all rollout/commercial gates and creates no orders/outbound.

create or replace function public.process_whatsapp_flow_nfm_reply_legacy_v1(p_conversation_id uuid, p_message_id uuid, p_response jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text:=trim(coalesce(p_response->>'flow_token',''));
  v_hash text;
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  c public.conversations%rowtype;
  a public.automation_config%rowtype;
  v_definition text;
  v_action text:=lower(trim(coalesce(p_response->>'action',p_response->>'result','completed')));
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_duplicate boolean:=false;
  v_homologation_no_order_candidate boolean:=false;
  v_homologation_no_order boolean:=false;
  v_preview_at timestamptz;
  v_no_order_consumed boolean:=false;
  v_claimed_session_id uuid;
begin
  if length(v_token)<32 or length(v_token)>200 then return jsonb_build_object('ok',false,'reason','invalid_flow_token'); end if;
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  select * into s from public.experience_sessions where flow_token_hash=v_hash;
  if not found then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;
  if s.conversation_id is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_conversation_mismatch'); end if;
  if s.status not in ('offered','open','completed') then return jsonb_build_object('ok',false,'reason','flow_session_inactive','session_id',s.id); end if;
  select * into d from public.experience_definitions where id=s.definition_id;
  if not found then return jsonb_build_object('ok',false,'reason','flow_definition_not_found'); end if;
  v_definition:=coalesce(d.slug,'');
  if v_definition not in ('flow-cestas-comercial-v1','flow-cestas-comercial-v2','flow-cestas-comercial-v3','flow-cestas-comercial-v4','flow-cestas-comercial-v5','flow-cestas-comercial-v6','flow-cestas-comercial-v7-diagnostico','flow-cestas-comercial-v8-stable') then return jsonb_build_object('ok',false,'reason','unsupported_flow_definition'); end if;
  if p_message_id is not null then select exists(select 1 from public.experience_events e where e.session_id=s.id and e.event_type='flow_nfm_reply' and e.event_data->>'message_id'=p_message_id::text) into v_duplicate; end if;
  begin v_order_id:=nullif(trim(coalesce(s.context->>'flow_order_id','')),'')::uuid; exception when others then v_order_id:=null; end;
  if v_order_id is not null then
    select * into v_order from public.orders where id=v_order_id and conversation_id=p_conversation_id and status='confirmed' and confirmed_at is not null and coalesce(total,0)>0;
    if not found then v_order_id:=null; end if;
  end if;

  if v_order_id is null and v_definition='flow-cestas-comercial-v8-stable' then
    begin v_preview_at:=nullif(s.context->>'homologation_terminal_preview_at','')::timestamptz; exception when others then v_preview_at:=null; end;
    v_no_order_consumed:=coalesce((s.context->>'homologation_terminal_nfm_consumed')::boolean,false);
    select * into a from public.automation_config where id=1;
    select * into c from public.conversations where id=p_conversation_id;
    v_homologation_no_order_candidate:=
      not v_no_order_consumed
      and coalesce((s.context->>'homologation_test')::boolean,false)
      and coalesce((s.context->>'requested_by_owner')::boolean,false)
      and coalesce((s.context->>'homologation_terminal_preview')::boolean,false)
      and coalesce((s.context->>'homologation_terminal_no_order')::boolean,false)
      and s.flow_current_screen='FINALIZAR'
      and v_preview_at is not null and v_preview_at>now()-interval '2 hours'
      and c.id is not null and c.wa_contact_e164 is not distinct from s.context->>'test_recipient'
      and exists(
        select 1 from public.whatsapp_test_allowlist w
        where w.phone_e164=c.wa_contact_e164 and w.enabled
          and w.purpose='controlled_live_homologation'
          and (w.expires_at is null or w.expires_at>now())
      )
      and coalesce(a.whatsapp_live_canary_percent,0)=1
      and not coalesce(a.experience_orchestrator_enabled,false)
      and not coalesce(a.whatsapp_flow_data_exchange_enabled,false)
      and not coalesce(a.whatsapp_flow_send_enabled,false)
      and not coalesce(a.whatsapp_flow_commercial_write_enabled,false)
      and not coalesce(a.bling_order_sync_enabled,false);
  end if;

  if not v_duplicate and v_homologation_no_order_candidate then
    update public.experience_sessions
       set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
             'homologation_terminal_nfm_consumed',true,
             'homologation_terminal_nfm_consumed_at',now(),
             'homologation_terminal_nfm_message_id',p_message_id
           ),
           updated_at=now()
     where id=s.id
       and coalesce((context->>'homologation_terminal_nfm_consumed')::boolean,false) is not true
     returning id into v_claimed_session_id;
    v_homologation_no_order:=v_claimed_session_id is not null;
  end if;

  if not v_duplicate then
    insert into public.experience_events(conversation_id,session_id,definition_id,event_type,interface_type,event_data)
    values(p_conversation_id,s.id,s.definition_id,'flow_nfm_reply','whatsapp_flow',jsonb_build_object(
      'message_id',p_message_id,
      'action',v_action,
      'definition_slug',v_definition,
      'session_status',s.status,
      'has_confirmed_order',v_order_id is not null,
      'order_id',v_order_id,
      'homologation_no_order',v_homologation_no_order,
      'no_order_handoff_consumed',v_homologation_no_order,
      'no_order_handoff_claimed_atomically',v_homologation_no_order,
      'return_to_chat',true
    ));
  end if;

  return jsonb_build_object(
    'ok',true,
    'session_id',s.id,
    'definition_slug',v_definition,
    'action',v_action,
    'order_id',v_order_id,
    'return_to_chat',true,
    'duplicate',v_duplicate,
    'homologation_no_order',v_homologation_no_order,
    'no_order_handoff_already_consumed',(v_no_order_consumed or (v_homologation_no_order_candidate and not v_homologation_no_order)),
    'no_order_handoff_claimed_atomically',v_homologation_no_order,
    'location_required',((v_order_id is not null or v_homologation_no_order) and not v_duplicate),
    'reply_text',case
      when v_duplicate then null
      when v_order_id is not null then 'Pedido confirmado. Agora envie sua localização pelo WhatsApp para confirmar o ponto da entrega. 📍'
      when v_homologation_no_order then 'Homologação concluída sem criar pedido real. Agora envie sua localização pelo WhatsApp para validar o ponto da entrega. 📍'
      when v_no_order_consumed or (v_homologation_no_order_candidate and not v_homologation_no_order) then null
      else 'Recebi suas escolhas. Vamos continuar por aqui.'
    end
  );
end;
$function$;

revoke all on function public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb) to service_role;

create or replace function public.get_whatsapp_flow_v67_terminal_handoff_readiness_v1()
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v66 jsonb;
  v64 jsonb;
  v_def text;
  v_anon boolean;
  v_auth boolean;
  v_service boolean;
  v_atomic boolean;
  v_ok boolean;
begin
  v66:=public.get_whatsapp_flow_v66_terminal_handoff_readiness_v1();
  v64:=public.get_whatsapp_flow_v64_homologation_control_plane_v1();
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  where p.pronamespace='public'::regnamespace and p.proname='process_whatsapp_flow_nfm_reply_legacy_v1'
  limit 1;
  v_anon:=has_function_privilege('anon','public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb)','execute');
  v_auth:=has_function_privilege('authenticated','public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb)','execute');
  v_service:=has_function_privilege('service_role','public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb)','execute');
  v_atomic:=position('returning id into v_claimed_session_id' in lower(coalesce(v_def,'')))>0
    and position('v_homologation_no_order:=v_claimed_session_id is not null' in lower(coalesce(v_def,'')))>0;
  v_ok:=coalesce((v66->>'ok')::boolean,false)
    and coalesce((v64->>'ok')::boolean,false)
    and v_atomic
    and not v_anon and not v_auth and v_service;
  return jsonb_build_object(
    'ok',v_ok,
    'readiness_version','v67-terminal-handoff-atomic-claim-v1',
    'atomic_single_use_claim',v_atomic,
    'anon_exec',v_anon,
    'authenticated_exec',v_auth,
    'service_role_exec',v_service,
    'physical_next_required',v64->>'physical_next_required',
    'eligible_owner_conversations',v64->'eligible_owner_conversations',
    'safe_to_launch_owner_v11',v64->'safe_to_launch_owner_v11',
    'writes_performed',false,
    'gates',v64->'gates'
  );
end;
$function$;
revoke all on function public.get_whatsapp_flow_v67_terminal_handoff_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v67_terminal_handoff_readiness_v1() to service_role;
