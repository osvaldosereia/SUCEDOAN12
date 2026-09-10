-- Alinha metadata/preflight do candidato V31 com o runtime V23 já promovido na Edge.
-- Não abre gates nem altera exposição.

update public.experience_definitions
set config=jsonb_set(config,'{handler_version}',to_jsonb('v23'::text),true),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'edge_version',44,
      'implementation_stage','v31_v23_checkout_contact_ready',
      'checkout_contact_source','get_whatsapp_checkout_contact_v1',
      'checkout_known_complete_confirmation_only',true,
      'checkout_incomplete_prefill',true
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v8-stable'
  and status='ready'
  and coalesce(metadata->>'meta_status','')='DRAFT'
  and coalesce((metadata->>'candidate_not_live')::boolean,false)
  and not coalesce((metadata->>'customer_exposure')::boolean,false);

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
  if p_session_id is not null then select * into s from public.experience_sessions where id=p_session_id; v_target_conversation:=s.conversation_id; else v_target_conversation:=p_conversation_id; end if;
  if v_target_conversation is not null then
    select c.wa_contact_e164 into v_target_phone from public.conversations c where c.id=v_target_conversation;
    select count(*) into v_allowlist_count from public.whatsapp_test_allowlist w where w.phone_e164=v_target_phone and w.purpose='controlled_live_homologation' and w.enabled and (w.expires_at is null or w.expires_at>now());
  else
    select count(*) into v_allowlist_count from public.whatsapp_test_allowlist w where w.purpose='controlled_live_homologation' and w.enabled and (w.expires_at is null or w.expires_at>now());
  end if;
  select jsonb_agg(jsonb_build_object('name',x.name,'ok',x.ok,'detail',x.detail) order by x.ord),bool_and(x.ok) into v_checks,v_all_ok
  from (values
    (1,'candidate_exists',d.id is not null,coalesce(d.slug,'missing')),
    (2,'candidate_ready',coalesce(d.status,'')='ready',coalesce(d.status,'missing')),
    (3,'meta_draft',coalesce(d.metadata->>'meta_status','')='DRAFT',coalesce(d.metadata->>'meta_status','missing')),
    (4,'meta_validated',coalesce((d.metadata->>'meta_validation_passed')::boolean,false) and coalesce((d.metadata->>'meta_validation_errors')::integer,999)=0,'errors='||coalesce(d.metadata->>'meta_validation_errors','missing')),
    (5,'candidate_isolated',coalesce((d.metadata->>'candidate_not_live')::boolean,false) and not coalesce((d.metadata->>'customer_exposure')::boolean,false) and not coalesce((d.metadata->>'default_for_new_sessions')::boolean,false),'candidate_not_live/customer_exposure/default'),
    (6,'production_disabled',not coalesce((d.config->>'production_enabled')::boolean,false) and coalesce((d.config->>'live_percent')::integer,0)=0,'production_enabled='||coalesce(d.config->>'production_enabled','missing')||', live_percent='||coalesce(d.config->>'live_percent','missing')),
    (7,'handler_v23',coalesce(d.config->>'handler_version','')='v23',coalesce(d.config->>'handler_version','missing')),
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
  return jsonb_build_object('ok',coalesce(v_all_ok,false),'checked_at',now(),'candidate_slug',d.slug,'provider_id',d.provider_id,'handler_version',d.config->>'handler_version','flow_json_version',d.config->>'flow_json_version','target_conversation_id',v_target_conversation,'checks',coalesce(v_checks,'[]'::jsonb));
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_homologation_preflight_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_homologation_preflight_v2(uuid,uuid) to service_role;
