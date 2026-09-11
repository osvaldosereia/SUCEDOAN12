-- WhatsApp Flow V43: deterministic intent resolver for curated terms and direct searches.
-- Read-only. Never loads the full catalog and does not alter rollout/write gates.

create or replace function public.get_whatsapp_flow_intent_products_v1(p_intent text,p_limit integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_raw text:=left(trim(regexp_replace(coalesce(p_intent,''),'\s+',' ','g')),80);
  v_norm text;
  v_limit integer:=least(20,greatest(1,coalesce(p_limit,12)));
  v_term public.whatsapp_flow_search_terms%rowtype;
  v_query text;
  v_results jsonb;
  v_products jsonb;
begin
  if length(v_raw)<2 then
    return jsonb_build_object('ok',false,'reason','intent_too_short','products','[]'::jsonb,'product_count',0);
  end if;
  v_norm:=translate(lower(v_raw),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  select * into v_term
  from public.whatsapp_flow_search_terms w
  where w.enabled
    and (
      translate(lower(w.term_key),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')=replace(v_norm,' ','_')
      or translate(lower(w.term_title),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')=v_norm
      or translate(lower(w.search_query),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')=v_norm
    )
  order by w.sort_order,w.term_title
  limit 1;
  v_query:=coalesce(nullif(v_term.search_query,''),v_raw);
  v_results:=public.get_whatsapp_flow_product_results_v1(v_query,v_limit);
  v_products:=coalesce(v_results->'products','[]'::jsonb);
  return jsonb_build_object(
    'ok',true,
    'intent',v_raw,
    'resolved_query',v_query,
    'query_source',case when v_term.id is null then 'direct_search' else 'curated_term' end,
    'section_key',v_term.section_key,
    'section_title',v_term.section_title,
    'term_key',v_term.term_key,
    'term_title',v_term.term_title,
    'products',v_products,
    'product_count',jsonb_array_length(v_products),
    'max_products_per_query',v_limit,
    'full_catalog_loaded',false,
    'backend_source','supabase.products'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_intent_products_v1(text,integer) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_intent_products_v1(text,integer) to service_role;

create or replace function public.get_whatsapp_flow_v43_dynamic_search_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  a jsonb; b jsonb; c jsonb; x jsonb;
  v_ok boolean;
begin
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;
  a:=public.get_whatsapp_flow_intent_products_v1('sabonete',12);
  b:=public.get_whatsapp_flow_intent_products_v1('detergente',12);
  c:=public.get_whatsapp_flow_intent_products_v1('arroz',12);
  x:=public.get_whatsapp_flow_intent_products_v1('leite',12);
  v_ok:=cfg.whatsapp_live_canary_percent=1
    and not coalesce(cfg.experience_orchestrator_enabled,false)
    and not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)
    and not coalesce(cfg.whatsapp_flow_send_enabled,false)
    and not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)
    and not coalesce(cfg.bling_order_sync_enabled,false)
    and coalesce((d.config->>'full_catalog_load_forbidden')::boolean,false)
    and coalesce((d.config->>'max_products_per_query')::int,0)<=20
    and (a->>'query_source')='curated_term'
    and (b->>'query_source')='curated_term'
    and (c->>'query_source')='curated_term'
    and (x->>'query_source')='direct_search'
    and coalesce((a->>'product_count')::int,0)<=12
    and coalesce((b->>'product_count')::int,0)<=12
    and coalesce((c->>'product_count')::int,0)<=12
    and coalesce((x->>'product_count')::int,0)<=12;
  return jsonb_build_object(
    'ok',v_ok,
    'readiness_version','v43-dynamic-search-v1',
    'curated_examples',jsonb_build_array(a-'products',b-'products',c-'products'),
    'direct_search_example',x-'products',
    'catalog_policy',jsonb_build_object('never_load_full_catalog',true,'hard_cap',20,'default_limit',12),
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',cfg.bling_order_sync_enabled),
    'writes_executed',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v43_dynamic_search_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v43_dynamic_search_readiness_v1() to service_role;
