begin;

-- Reproducible terminal bridge for the V31 owner-only candidate.
-- The public entrypoint may wrap newer address/basket-choice flows and delegate
-- commercial Flow replies to this legacy commercial processor. Keep the V31
-- candidate explicitly supported so a completed order can return to chat and
-- request delivery location without opening any rollout gate.
create or replace function public.process_whatsapp_flow_nfm_reply_legacy_v1(
  p_conversation_id uuid,
  p_message_id uuid,
  p_response jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token text:=trim(coalesce(p_response->>'flow_token',''));
  v_hash text;
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  v_definition text;
  v_action text:=lower(trim(coalesce(p_response->>'action',p_response->>'result','completed')));
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_duplicate boolean:=false;
begin
  if length(v_token)<32 or length(v_token)>200 then
    return jsonb_build_object('ok',false,'reason','invalid_flow_token');
  end if;

  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  select * into s from public.experience_sessions where flow_token_hash=v_hash;
  if not found then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;
  if s.conversation_id is distinct from p_conversation_id then
    return jsonb_build_object('ok',false,'reason','flow_conversation_mismatch');
  end if;
  if s.status not in ('offered','open','completed') then
    return jsonb_build_object('ok',false,'reason','flow_session_inactive','session_id',s.id);
  end if;

  select * into d from public.experience_definitions where id=s.definition_id;
  if not found then return jsonb_build_object('ok',false,'reason','flow_definition_not_found'); end if;
  v_definition:=coalesce(d.slug,'');

  if v_definition not in (
    'flow-cestas-comercial-v1',
    'flow-cestas-comercial-v2',
    'flow-cestas-comercial-v3',
    'flow-cestas-comercial-v4',
    'flow-cestas-comercial-v5',
    'flow-cestas-comercial-v6',
    'flow-cestas-comercial-v7-diagnostico',
    'flow-cestas-comercial-v8-stable'
  ) then
    return jsonb_build_object('ok',false,'reason','unsupported_flow_definition');
  end if;

  if p_message_id is not null then
    select exists(
      select 1
      from public.experience_events e
      where e.session_id=s.id
        and e.event_type='flow_nfm_reply'
        and e.event_data->>'message_id'=p_message_id::text
    ) into v_duplicate;
  end if;

  begin
    v_order_id:=nullif(trim(coalesce(s.context->>'flow_order_id','')),'')::uuid;
  exception when others then
    v_order_id:=null;
  end;

  if v_order_id is not null then
    select * into v_order
    from public.orders
    where id=v_order_id
      and conversation_id=p_conversation_id
      and status='confirmed'
      and confirmed_at is not null
      and coalesce(total,0)>0;
    if not found then v_order_id:=null; end if;
  end if;

  if not v_duplicate then
    insert into public.experience_events(
      conversation_id,session_id,definition_id,event_type,interface_type,event_data
    ) values (
      p_conversation_id,s.id,s.definition_id,'flow_nfm_reply','whatsapp_flow',jsonb_build_object(
        'message_id',p_message_id,
        'action',v_action,
        'definition_slug',v_definition,
        'session_status',s.status,
        'has_confirmed_order',v_order_id is not null,
        'order_id',v_order_id,
        'return_to_chat',true
      )
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'session_id',s.id,
    'definition_slug',v_definition,
    'action',v_action,
    'order_id',v_order_id,
    'return_to_chat',true,
    'duplicate',v_duplicate,
    'location_required',(v_order_id is not null and not v_duplicate),
    'reply_text',case
      when v_duplicate then null
      when v_order_id is not null then 'Pedido confirmado. Agora envie sua localização pelo WhatsApp para confirmar o ponto da entrega. 📍'
      else 'Recebi suas escolhas. Vamos continuar por aqui.'
    end
  );
end;
$function$;

revoke all on function public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb) to service_role;

-- Read-only terminal readiness used by owner-only homologation. It checks the
-- live database definition rather than trusting documentation alone.
create or replace function public.get_whatsapp_flow_v31_terminal_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  a public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  v_wrapper text:=coalesce(pg_get_functiondef('public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb)'::regprocedure),'');
  v_legacy text:=coalesce(pg_get_functiondef('public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb)'::regprocedure),'');
  v_checks jsonb;
  v_ok boolean;
begin
  select * into a from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;

  select jsonb_agg(jsonb_build_object('name',x.name,'ok',x.ok,'detail',x.detail) order by x.ord),bool_and(x.ok)
  into v_checks,v_ok
  from (values
    (1,'candidate_ready',d.id is not null and d.status='ready','status='||coalesce(d.status,'missing')),
    (2,'candidate_meta_draft',coalesce(d.metadata->>'meta_status','')='DRAFT','meta='||coalesce(d.metadata->>'meta_status','missing')),
    (3,'candidate_isolated',not coalesce((d.config->>'production_enabled')::boolean,false) and coalesce((d.config->>'live_percent')::integer,0)=0,'production off/live 0'),
    (4,'global_canary_1',coalesce(a.whatsapp_live_canary_percent,0)=1,'canary='||coalesce(a.whatsapp_live_canary_percent::text,'missing')),
    (5,'global_flow_gates_off',not coalesce(a.experience_orchestrator_enabled,false) and not coalesce(a.whatsapp_flow_data_exchange_enabled,false) and not coalesce(a.whatsapp_flow_send_enabled,false) and not coalesce(a.whatsapp_flow_commercial_write_enabled,false),'flow globals off'),
    (6,'bling_off',not coalesce(a.bling_order_sync_enabled,false),'bling off'),
    (7,'wrapper_delegates_commercial',position('process_whatsapp_flow_nfm_reply_legacy_v1' in v_wrapper)>0,'wrapper delegates'),
    (8,'v31_supported_terminal',position('flow-cestas-comercial-v8-stable' in v_legacy)>0,'V31 slug supported'),
    (9,'completed_session_supported',position('completed' in v_legacy)>0,'completed accepted'),
    (10,'confirmed_order_required',position('status=''confirmed''' in v_legacy)>0 and position('confirmed_at is not null' in lower(v_legacy))>0,'confirmed order guard'),
    (11,'location_handoff',position('location_required' in v_legacy)>0 and position('envie sua localização' in lower(v_legacy))>0,'location requested after confirmed order'),
    (12,'idempotent_nfm_reply',position('event_type=''flow_nfm_reply''' in v_legacy)>0 and position('v_duplicate' in v_legacy)>0,'message id dedupe')
  ) as x(ord,name,ok,detail);

  return jsonb_build_object(
    'ok',coalesce(v_ok,false),
    'checked_at',now(),
    'candidate_slug',d.slug,
    'provider_id',d.provider_id,
    'checks',coalesce(v_checks,'[]'::jsonb),
    'readiness_version','v1-terminal-nfm'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_terminal_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_terminal_readiness_v1() to service_role;

commit;
