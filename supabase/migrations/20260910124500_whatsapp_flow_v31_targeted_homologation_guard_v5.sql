-- WhatsApp Flow V31 owner-only homologation hardening.
-- Keeps all global rollout gates closed and binds homologation to the
-- already pre-authorized phone attached to the target conversation.

create or replace function public.renew_whatsapp_flow_owner_homologation_lease_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  a public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  v_phone text;
  v_expires_at timestamptz;
begin
  select * into a from public.automation_config where id=1;
  if a.id is null
     or coalesce(a.whatsapp_live_canary_percent,0) <> 1
     or coalesce(a.experience_orchestrator_enabled,false)
     or coalesce(a.whatsapp_flow_data_exchange_enabled,false)
     or coalesce(a.whatsapp_flow_send_enabled,false)
     or coalesce(a.whatsapp_flow_commercial_write_enabled,false)
     or coalesce(a.bling_order_sync_enabled,false) then
    return jsonb_build_object('ok',false,'reason','homologation_global_gates_not_safe');
  end if;

  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  if d.id is null
     or coalesce(d.status,'') <> 'ready'
     or coalesce(d.metadata->>'meta_status','') <> 'DRAFT'
     or not coalesce((d.metadata->>'candidate_not_live')::boolean,false)
     or coalesce((d.metadata->>'customer_exposure')::boolean,false)
     or coalesce((d.metadata->>'default_for_new_sessions')::boolean,false)
     or coalesce((d.config->>'production_enabled')::boolean,false)
     or coalesce((d.config->>'live_percent')::integer,0) <> 0 then
    return jsonb_build_object('ok',false,'reason','homologation_candidate_not_isolated');
  end if;

  select c.wa_contact_e164 into v_phone
  from public.conversations c
  where c.id=p_conversation_id;
  if coalesce(v_phone,'')='' then
    return jsonb_build_object('ok',false,'reason','conversation_phone_missing');
  end if;

  update public.whatsapp_test_allowlist w
     set enabled=true,
         expires_at=greatest(coalesce(w.expires_at,now()),now()+interval '13 hours'),
         updated_at=now()
   where w.phone_e164=v_phone
     and w.purpose='controlled_live_homologation';
  if not found then
    return jsonb_build_object('ok',false,'reason','owner_number_not_pre_authorized');
  end if;

  select w.expires_at into v_expires_at
  from public.whatsapp_test_allowlist w
  where w.phone_e164=v_phone;

  return jsonb_build_object(
    'ok',true,
    'purpose','controlled_live_homologation',
    'expires_at',v_expires_at,
    'candidate_slug',d.slug
  );
end;
$function$;

revoke all on function public.renew_whatsapp_flow_owner_homologation_lease_v1(uuid) from public;
revoke all on function public.renew_whatsapp_flow_owner_homologation_lease_v1(uuid) from anon;
revoke all on function public.renew_whatsapp_flow_owner_homologation_lease_v1(uuid) from authenticated;
grant execute on function public.renew_whatsapp_flow_owner_homologation_lease_v1(uuid) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v4(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_body_text text default 'TESTE V31 — Flow Dona Antônia. Toque em Montar pedido.'::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lease jsonb;
  v_result jsonb;
  v_preflight jsonb;
begin
  v_lease:=public.renew_whatsapp_flow_owner_homologation_lease_v1(p_conversation_id);
  if not coalesce((v_lease->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'reason','homologation_lease_failed','lease',v_lease);
  end if;

  v_result:=public.queue_and_dispatch_whatsapp_flow_owner_homologation_v3(
    p_conversation_id,p_idempotency_key,p_body_text
  );
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result||jsonb_build_object('lease',v_lease,'dispatch_version','v4-lease');
  end if;

  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v1((v_result->>'session_id')::uuid);
  if not coalesce((v_preflight->>'ok')::boolean,false) then
    raise exception 'v4_post_dispatch_preflight_failed';
  end if;

  return v_result||jsonb_build_object('lease',v_lease,'preflight',v_preflight,'dispatch_version','v4-lease');
end;
$function$;

revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v4(uuid,text,text) from public;
revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v4(uuid,text,text) from anon;
revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v4(uuid,text,text) from authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v4(uuid,text,text) to service_role;

create or replace function public.get_whatsapp_flow_v31_homologation_preflight_v2(
  p_session_id uuid default null,
  p_conversation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  d public.experience_definitions%rowtype;
  a public.automation_config%rowtype;
  s public.experience_sessions%rowtype;
  r jsonb;
  v_target_conversation uuid;
  v_target_phone text;
  v_allowlist_count integer:=0;
  v_checks jsonb;
  v_all_ok boolean;
begin
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  select * into a from public.automation_config where id=1;
  r:=public.get_whatsapp_flow_transport_readiness_v1();

  if p_session_id is not null then
    select * into s from public.experience_sessions where id=p_session_id;
    v_target_conversation:=s.conversation_id;
  else
    v_target_conversation:=p_conversation_id;
  end if;

  if v_target_conversation is not null then
    select c.wa_contact_e164 into v_target_phone
    from public.conversations c
    where c.id=v_target_conversation;

    select count(*) into v_allowlist_count
    from public.whatsapp_test_allowlist w
    where w.phone_e164=v_target_phone
      and w.purpose='controlled_live_homologation'
      and w.enabled
      and (w.expires_at is null or w.expires_at>now());
  else
    select count(*) into v_allowlist_count
    from public.whatsapp_test_allowlist w
    where w.purpose='controlled_live_homologation'
      and w.enabled
      and (w.expires_at is null or w.expires_at>now());
  end if;

  select jsonb_agg(jsonb_build_object('name',x.name,'ok',x.ok,'detail',x.detail) order by x.ord), bool_and(x.ok)
    into v_checks,v_all_ok
  from (values
    (1,'candidate_exists',d.id is not null,coalesce(d.slug,'missing')),
    (2,'candidate_ready',coalesce(d.status,'')='ready',coalesce(d.status,'missing')),
    (3,'meta_draft',coalesce(d.metadata->>'meta_status','')='DRAFT',coalesce(d.metadata->>'meta_status','missing')),
    (4,'meta_validated',coalesce((d.metadata->>'meta_validation_passed')::boolean,false) and coalesce((d.metadata->>'meta_validation_errors')::integer,999)=0,'errors='||coalesce(d.metadata->>'meta_validation_errors','missing')),
    (5,'candidate_isolated',coalesce((d.metadata->>'candidate_not_live')::boolean,false) and not coalesce((d.metadata->>'customer_exposure')::boolean,false) and not coalesce((d.metadata->>'default_for_new_sessions')::boolean,false),'candidate_not_live/customer_exposure/default'),
    (6,'production_disabled',not coalesce((d.config->>'production_enabled')::boolean,false) and coalesce((d.config->>'live_percent')::integer,0)=0,'production_enabled='||coalesce(d.config->>'production_enabled','missing')||', live_percent='||coalesce(d.config->>'live_percent','missing')),
    (7,'handler_v22',coalesce(d.config->>'handler_version','')='v22',coalesce(d.config->>'handler_version','missing')),
    (8,'catalog_never_full',coalesce((d.config->>'never_load_full_catalog')::boolean,false) and coalesce((d.config->>'full_catalog_load_forbidden')::boolean,false) and coalesce((d.config->>'catalog_query_only')::boolean,false),'dynamic subset only'),
    (9,'product_query_limit',coalesce((d.config->>'max_products_per_query')::integer,999)<=20 and coalesce((d.config->>'default_products_per_query')::integer,999)<=20,'max='||coalesce(d.config->>'max_products_per_query','missing')||', default='||coalesce(d.config->>'default_products_per_query','missing')),
    (10,'component_prices_hidden',not coalesce((d.config->>'component_prices_visible')::boolean,true),'component prices hidden'),
    (11,'stock_guard',coalesce((d.config->>'quantity_stock_cap_enabled')::boolean,false) and coalesce((d.config->>'product_stock_checked_runtime')::boolean,false),'stock checked at runtime'),
    (12,'upsell_optional',coalesce((d.config->>'upsell_optional')::boolean,false),'optional upsell'),
    (13,'payment_delivery_only',coalesce((d.config->>'payment_on_delivery_only')::boolean,false),'payment on delivery'),
    (14,'global_canary_1',coalesce(a.whatsapp_live_canary_percent,0)=1,'canary='||coalesce(a.whatsapp_live_canary_percent::text,'missing')),
    (15,'orchestrator_off',not coalesce(a.experience_orchestrator_enabled,false),'off'),
    (16,'data_exchange_global_off',not coalesce(a.whatsapp_flow_data_exchange_enabled,false),'off'),
    (17,'flow_send_global_off',not coalesce(a.whatsapp_flow_send_enabled,false),'off'),
    (18,'commercial_write_off',not coalesce(a.whatsapp_flow_commercial_write_enabled,false),'off'),
    (19,'bling_off',not coalesce(a.bling_order_sync_enabled,false),'off'),
    (20,'owner_allowlist_target',v_allowlist_count>0,case when v_target_phone is null then 'active_controlled_entries='||v_allowlist_count::text else 'target_authorized='||(v_allowlist_count>0)::text end),
    (21,'crypto_keys_ready',coalesce((r->>'private_key_configured')::boolean,false) and coalesce((r->>'public_key_configured')::boolean,false),'private/public configured'),
    (22,'meta_signature_valid',coalesce(r->>'meta_signature_status','')='valid',coalesce(r->>'meta_signature_status','missing')),
    (23,'replay_guard_enabled',coalesce((r->>'replay_guard_enabled')::boolean,false),'enabled'),
    (24,'session_exists',p_session_id is null or s.id is not null,case when p_session_id is null then 'not requested' else coalesce(s.id::text,'missing') end),
    (25,'session_candidate',p_session_id is null or (s.id is not null and s.definition_id=d.id),case when p_session_id is null then 'not requested' else 'definition match' end),
    (26,'session_state',p_session_id is null or (s.id is not null and s.status in ('offered','open')),case when p_session_id is null then 'not requested' else 'status='||coalesce(s.status,'missing') end),
    (27,'session_not_expired',p_session_id is null or (s.id is not null and s.expires_at>now()),case when p_session_id is null then 'not requested' else 'expires_at='||coalesce(s.expires_at::text,'missing') end),
    (28,'session_owner_homologation',p_session_id is null or (s.id is not null and coalesce((s.context->>'homologation_test')::boolean,false) and coalesce((s.context->>'requested_by_owner')::boolean,false)),case when p_session_id is null then 'not requested' else 'owner-only' end),
    (29,'target_conversation_consistent',p_session_id is null or p_conversation_id is null or s.conversation_id=p_conversation_id,case when p_session_id is null or p_conversation_id is null then 'not jointly requested' else 'session/conversation match' end)
  ) as x(ord,name,ok,detail);

  return jsonb_build_object(
    'ok',coalesce(v_all_ok,false),
    'checked_at',now(),
    'candidate_slug',d.slug,
    'provider_id',d.provider_id,
    'handler_version',d.config->>'handler_version',
    'flow_json_version',d.config->>'flow_json_version',
    'target_conversation_id',v_target_conversation,
    'checks',coalesce(v_checks,'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_homologation_preflight_v2(uuid,uuid) from public;
revoke all on function public.get_whatsapp_flow_v31_homologation_preflight_v2(uuid,uuid) from anon;
revoke all on function public.get_whatsapp_flow_v31_homologation_preflight_v2(uuid,uuid) from authenticated;
grant execute on function public.get_whatsapp_flow_v31_homologation_preflight_v2(uuid,uuid) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v5(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_body_text text default 'TESTE V31 — Flow Dona Antônia. Toque em Montar pedido.'::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lease jsonb;
  v_preflight jsonb;
  v_result jsonb;
  v_session_id uuid;
begin
  v_lease:=public.renew_whatsapp_flow_owner_homologation_lease_v1(p_conversation_id);
  if not coalesce((v_lease->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'reason','homologation_lease_failed','lease',v_lease);
  end if;

  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v2(null,p_conversation_id);
  if not coalesce((v_preflight->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'reason','target_preflight_failed','lease',v_lease,'preflight',v_preflight);
  end if;

  v_result:=public.queue_and_dispatch_whatsapp_flow_owner_homologation_v3(
    p_conversation_id,p_idempotency_key,p_body_text
  );
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result||jsonb_build_object('lease',v_lease,'target_preflight',v_preflight,'dispatch_version','v5-target-allowlist');
  end if;

  v_session_id:=(v_result->>'session_id')::uuid;
  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v2(v_session_id,p_conversation_id);
  if not coalesce((v_preflight->>'ok')::boolean,false) then
    raise exception 'v5_post_dispatch_target_preflight_failed';
  end if;

  return v_result||jsonb_build_object('lease',v_lease,'preflight',v_preflight,'dispatch_version','v5-target-allowlist');
end;
$function$;

revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v5(uuid,text,text) from public;
revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v5(uuid,text,text) from anon;
revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v5(uuid,text,text) from authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v5(uuid,text,text) to service_role;

create or replace function public.get_whatsapp_flow_v31_journey_audit_v3(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_base jsonb;
  v_preflight jsonb;
  v_healthy boolean;
begin
  v_base:=public.get_whatsapp_flow_v31_journey_audit_v2(p_session_id);
  if not coalesce((v_base->>'ok')::boolean,false) then
    return v_base||jsonb_build_object('audit_version','v3-target-preflight');
  end if;

  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v2(p_session_id,null);
  v_healthy:=coalesce((v_base->>'healthy')::boolean,false)
             and coalesce((v_preflight->>'ok')::boolean,false);

  return jsonb_set(
           jsonb_set(v_base,'{preflight}',v_preflight,false),
           '{healthy}',to_jsonb(v_healthy),false
         ) || jsonb_build_object('audit_version','v3-target-preflight');
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_journey_audit_v3(uuid) from public;
revoke all on function public.get_whatsapp_flow_v31_journey_audit_v3(uuid) from anon;
revoke all on function public.get_whatsapp_flow_v31_journey_audit_v3(uuid) from authenticated;
grant execute on function public.get_whatsapp_flow_v31_journey_audit_v3(uuid) to service_role;
