create or replace function public.get_whatsapp_flow_v59_dynamic_search_quality_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_total_terms int:=0;
  v_dead_terms int:=0;
  v_exposed_dead_terms int:=0;
  v_sections int:=0;
  v_exposed_terms int:=0;
  v_cfg public.automation_config%rowtype;
begin
  select count(*)::int into v_total_terms from public.whatsapp_flow_search_terms where enabled;

  select count(*)::int into v_dead_terms
  from public.whatsapp_flow_search_terms t
  where t.enabled
    and not exists (
      select 1 from public.search_whatsapp_sellable_products_v1(t.search_query,1) p where p.id is not null
    );

  select count(*)::int into v_exposed_terms
  from public.whatsapp_flow_search_terms t
  where t.enabled
    and exists (
      select 1 from public.search_whatsapp_sellable_products_v1(t.search_query,1) p where p.id is not null
    );

  select count(*)::int into v_sections from public.get_whatsapp_flow_sections_v1();

  select count(*)::int into v_exposed_dead_terms
  from public.get_whatsapp_flow_sections_v1() s
  cross join lateral public.get_whatsapp_flow_search_terms_v1(s.section_key) t
  where not exists (
    select 1 from public.search_whatsapp_sellable_products_v1(t.search_query,1) p where p.id is not null
  );

  select * into v_cfg from public.automation_config where id=1;

  return jsonb_build_object(
    'ok',
      v_sections>0
      and v_exposed_terms>0
      and v_exposed_dead_terms=0
      and coalesce(v_cfg.whatsapp_live_canary_percent,0)=1
      and not coalesce(v_cfg.experience_orchestrator_enabled,false)
      and not coalesce(v_cfg.whatsapp_flow_data_exchange_enabled,false)
      and not coalesce(v_cfg.whatsapp_flow_send_enabled,false)
      and not coalesce(v_cfg.whatsapp_flow_commercial_write_enabled,false)
      and not coalesce(v_cfg.bling_order_sync_enabled,false),
    'readiness_version','v59-dynamic-search-quality-v1',
    'curated_terms_total',v_total_terms,
    'curated_terms_currently_without_inventory',v_dead_terms,
    'curated_terms_exposed_to_flow',v_exposed_terms,
    'dead_terms_exposed_to_flow',v_exposed_dead_terms,
    'sections_exposed_to_flow',v_sections,
    'dead_terms_are_hidden',v_exposed_dead_terms=0,
    'max_products_per_query',20,
    'full_catalog_loaded',false,
    'ai_authoritative_for_catalog',false,
    'writes_performed',false,
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',v_cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',v_cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',v_cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',v_cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',v_cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',v_cfg.bling_order_sync_enabled
    )
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v59_dynamic_search_quality_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v59_dynamic_search_quality_v1() to service_role;
