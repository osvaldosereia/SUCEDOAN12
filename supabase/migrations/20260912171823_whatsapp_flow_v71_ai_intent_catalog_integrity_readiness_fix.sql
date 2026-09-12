begin;

create or replace function public.get_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $function$
declare
  cfg public.automation_config%rowtype;
  s record;
  t record;
  r jsonb;
  ai jsonb;
  p jsonb;
  direct_r jsonb;
  direct_ai jsonb;
  v_visible_terms integer:=0;
  v_intent_checks integer:=0;
  v_ai_entry_checks integer:=0;
  v_products_checked integer:=0;
  v_catalog_mismatches integer:=0;
  v_ai_option_mismatches integer:=0;
  v_structural_failures integer:=0;
  v_direct_failures integer:=0;
  v_count integer:=0;
  v_match integer:=0;
  v_ok boolean:=false;
begin
  select * into cfg from public.automation_config where id=1;
  for s in select * from public.get_whatsapp_flow_sections_v1() loop
    for t in select * from public.get_whatsapp_flow_search_terms_v1(s.section_key) loop
      v_visible_terms:=v_visible_terms+1;
      r:=public.get_whatsapp_flow_intent_products_v1(t.term_key,20);
      v_intent_checks:=v_intent_checks+1;
      v_count:=coalesce((r->>'product_count')::integer,0);
      if not coalesce((r->>'ok')::boolean,false) or coalesce(r->>'query_source','')<>'curated_term' or v_count<1 or v_count>20 or coalesce((r->>'full_catalog_loaded')::boolean,true) or coalesce(r->>'backend_source','')<>'supabase.products' then
        v_structural_failures:=v_structural_failures+1;
      end if;
      for p in select value from jsonb_array_elements(coalesce(r->'products','[]'::jsonb)) loop
        v_products_checked:=v_products_checked+1;
        select count(*)::int into v_match from public.products pr
        where pr.id=(p->>'id')::uuid and pr.physically_verified=true and pr.is_active=true and pr.is_whatsapp_active=true
          and coalesce(pr.stock,0)>0 and pr.price is not null and pr.price>0 and pr.price=(p->>'price')::numeric
          and coalesce(pr.name,'')=coalesce(p->>'name','') and coalesce(pr.image_url,'')=coalesce(p->>'image_url','')
          and coalesce(pr.image_url,'') like 'https://%';
        if v_match<>1 then v_catalog_mismatches:=v_catalog_mismatches+1; end if;
      end loop;
      ai:=public.get_whatsapp_flow_ai_intent_entry_v1(t.term_key,20);
      v_ai_entry_checks:=v_ai_entry_checks+1;
      if not coalesce((ai->>'ok')::boolean,false) or coalesce(ai->>'target_screen','')<>'PRODUTOS_A' or coalesce(ai->>'query_source','')<>'curated_term'
         or coalesce((ai->>'product_count')::integer,0)<>v_count or coalesce((ai->>'product_count')::integer,0)>20
         or coalesce((ai->>'ai_authoritative_for_catalog')::boolean,true) or coalesce(ai->>'commercial_truth','')<>'backend_deterministic' then
        v_ai_option_mismatches:=v_ai_option_mismatches+1;
      end if;
    end loop;
  end loop;

  direct_r:=public.get_whatsapp_flow_intent_products_v1('leite',20);
  direct_ai:=public.get_whatsapp_flow_ai_intent_entry_v1('leite',20);
  v_count:=coalesce((direct_r->>'product_count')::integer,0);
  if not coalesce((direct_r->>'ok')::boolean,false) or coalesce(direct_r->>'query_source','')<>'direct_search' or v_count<1 or v_count>20
     or coalesce((direct_r->>'full_catalog_loaded')::boolean,true) or coalesce(direct_r->>'backend_source','')<>'supabase.products' then
    v_direct_failures:=v_direct_failures+1;
  end if;
  if not coalesce((direct_ai->>'ok')::boolean,false) or coalesce(direct_ai->>'target_screen','')<>'PRODUTOS_A' or coalesce(direct_ai->>'query_source','')<>'direct_search'
     or coalesce((direct_ai->>'product_count')::integer,0)<>v_count or coalesce((direct_ai->>'product_count')::integer,0)>20
     or coalesce((direct_ai->>'ai_authoritative_for_catalog')::boolean,true) or coalesce(direct_ai->>'commercial_truth','')<>'backend_deterministic' then
    v_direct_failures:=v_direct_failures+1;
  end if;
  for p in select value from jsonb_array_elements(coalesce(direct_r->'products','[]'::jsonb)) loop
    v_products_checked:=v_products_checked+1;
    select count(*)::int into v_match from public.products pr
    where pr.id=(p->>'id')::uuid and pr.physically_verified=true and pr.is_active=true and pr.is_whatsapp_active=true
      and coalesce(pr.stock,0)>0 and pr.price is not null and pr.price>0 and pr.price=(p->>'price')::numeric
      and coalesce(pr.name,'')=coalesce(p->>'name','') and coalesce(pr.image_url,'')=coalesce(p->>'image_url','')
      and coalesce(pr.image_url,'') like 'https://%';
    if v_match<>1 then v_catalog_mismatches:=v_catalog_mismatches+1; end if;
  end loop;

  v_ok:=v_visible_terms>0 and v_intent_checks=v_visible_terms and v_ai_entry_checks=v_visible_terms and v_products_checked>0
    and v_catalog_mismatches=0 and v_ai_option_mismatches=0 and v_structural_failures=0 and v_direct_failures=0
    and cfg.whatsapp_live_canary_percent=1 and not cfg.experience_orchestrator_enabled and not cfg.whatsapp_flow_data_exchange_enabled
    and not cfg.whatsapp_flow_send_enabled and not cfg.whatsapp_flow_commercial_write_enabled and not cfg.bling_order_sync_enabled;

  return jsonb_build_object('ok',v_ok,'readiness_version','v71-ai-intent-catalog-integrity-v1','visible_terms_checked',v_visible_terms,
    'intent_checks',v_intent_checks,'ai_entry_checks',v_ai_entry_checks,'products_checked',v_products_checked,'catalog_mismatches',v_catalog_mismatches,
    'ai_option_mismatches',v_ai_option_mismatches,'structural_failures',v_structural_failures,'direct_search_failures',v_direct_failures,
    'direct_search_probe','leite','direct_search_product_count',coalesce((direct_r->>'product_count')::integer,0),'max_products_per_query',20,
    'stock_verified_in_backend',true,'stock_exposed_to_flow',false,'full_catalog_loaded',false,'ai_role','intent_text_only',
    'ai_authoritative_for_catalog',false,'commercial_truth','backend_deterministic','writes_performed',false,
    'gates',jsonb_build_object('whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,'bling_order_sync_enabled',cfg.bling_order_sync_enabled));
end;
$function$;
revoke all on function public.get_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness_v1() to service_role;

commit;
