-- WhatsApp Flow V44: deterministic AI-intent bridge for product discovery.
-- Read-only resolver + metadata wiring. No rollout/write gates are enabled.

create or replace function public.get_whatsapp_flow_ai_intent_entry_v1(
  p_intent text,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_resolved jsonb;
  v_products jsonb := '[]'::jsonb;
  v_options jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  v_resolved := public.get_whatsapp_flow_intent_products_v1(p_intent, least(20, greatest(1, coalesce(p_limit,12))));
  if not coalesce((v_resolved->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'reason',coalesce(v_resolved->>'reason','intent_not_resolved'),
      'target_screen','SECOES_A',
      'products','[]'::jsonb,
      'product_count',0,
      'full_catalog_loaded',false,
      'ai_authoritative_for_catalog',false
    );
  end if;

  v_products := coalesce(v_resolved->'products','[]'::jsonb);
  v_count := jsonb_array_length(v_products);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p->>'id',
    'title', left(coalesce(p->>'name','Produto'), 58) ||
      case when nullif(p->>'price','') is not null
        then ' · R$ ' || replace(to_char((p->>'price')::numeric,'FM999999990.00'),'.',',')
        else '' end,
    'description', left(concat_ws(' · ', nullif(p->>'brand',''), nullif(p->>'packaging','')), 90)
  )),'[]'::jsonb)
  into v_options
  from jsonb_array_elements(v_products) p;

  return jsonb_build_object(
    'ok',true,
    'intent',v_resolved->>'intent',
    'resolved_query',v_resolved->>'resolved_query',
    'query_source',v_resolved->>'query_source',
    'section_key',v_resolved->>'section_key',
    'section_title',v_resolved->>'section_title',
    'term_key',v_resolved->>'term_key',
    'term_title',v_resolved->>'term_title',
    'target_screen','PRODUTOS_A',
    'products',v_options,
    'product_count',v_count,
    'max_products_per_query',least(20, greatest(1, coalesce(p_limit,12))),
    'full_catalog_loaded',false,
    'backend_source','supabase.products',
    'ai_role','intent_text_only',
    'ai_authoritative_for_catalog',false,
    'commercial_truth','backend_deterministic',
    'component_prices_visible',true,
    'basket_component_prices_visible',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_ai_intent_entry_v1(text,integer) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_ai_intent_entry_v1(text,integer) to service_role;

update public.experience_definitions
set config = coalesce(config,'{}'::jsonb) || jsonb_build_object(
      'ai_direct_search_enabled', true,
      'ai_direct_search_rpc', 'get_whatsapp_flow_ai_intent_entry_v1',
      'ai_direct_search_role', 'intent_text_only',
      'ai_catalog_authoritative', false,
      'full_catalog_load_forbidden', true,
      'max_products_per_query', 20,
      'default_products_per_query', 12
    ),
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'dynamic_intent_resolver', 'get_whatsapp_flow_intent_products_v1',
      'ai_intent_bridge', 'get_whatsapp_flow_ai_intent_entry_v1',
      'ai_intent_bridge_version', 'v44'
    ),
    updated_at = now()
where slug='flow-cestas-comercial-v8-stable';

create or replace function public.get_whatsapp_flow_v44_ai_intent_bridge_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  a jsonb; b jsonb;
  v_ok boolean;
begin
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  a:=public.get_whatsapp_flow_ai_intent_entry_v1('sabonete',12);
  b:=public.get_whatsapp_flow_ai_intent_entry_v1('leite',12);

  v_ok:=cfg.whatsapp_live_canary_percent=1
    and not coalesce(cfg.experience_orchestrator_enabled,false)
    and not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)
    and not coalesce(cfg.whatsapp_flow_send_enabled,false)
    and not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)
    and not coalesce(cfg.bling_order_sync_enabled,false)
    and coalesce((d.config->>'ai_direct_search_enabled')::boolean,false)
    and d.config->>'ai_direct_search_rpc'='get_whatsapp_flow_ai_intent_entry_v1'
    and coalesce((d.config->>'ai_catalog_authoritative')::boolean,true)=false
    and coalesce((d.config->>'full_catalog_load_forbidden')::boolean,false)
    and coalesce((d.config->>'max_products_per_query')::int,0)<=20
    and (a->>'target_screen')='PRODUTOS_A'
    and (b->>'target_screen')='PRODUTOS_A'
    and (a->>'query_source')='curated_term'
    and (b->>'query_source')='direct_search'
    and coalesce((a->>'product_count')::int,0)<=12
    and coalesce((b->>'product_count')::int,0)<=12
    and coalesce((a->>'ai_authoritative_for_catalog')::boolean,true)=false
    and coalesce((b->>'ai_authoritative_for_catalog')::boolean,true)=false;

  return jsonb_build_object(
    'ok',v_ok,
    'readiness_version','v44-ai-intent-bridge-v1',
    'curated_example',a-'products',
    'direct_example',b-'products',
    'experience_wiring',jsonb_build_object(
      'definition_slug',d.slug,
      'ai_direct_search_enabled',d.config->'ai_direct_search_enabled',
      'ai_direct_search_rpc',d.config->>'ai_direct_search_rpc',
      'ai_catalog_authoritative',d.config->'ai_catalog_authoritative',
      'hard_cap',d.config->'max_products_per_query'),
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',cfg.bling_order_sync_enabled),
    'writes_executed',false,
    'customer_exposure_changed',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v44_ai_intent_bridge_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v44_ai_intent_bridge_readiness_v1() to service_role;
