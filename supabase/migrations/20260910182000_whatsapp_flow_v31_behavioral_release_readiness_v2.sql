-- WhatsApp Flow V31: readiness comportamental com dados reais do catálogo/cestas.
-- Somente leitura. Mantém os gates globais fechados e não cria sessões/pedidos.

create or replace function public.get_whatsapp_flow_v31_behavioral_catalog_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_basket_count int:=0;
  v_baskets_with_image int:=0;
  v_baskets_with_editor int:=0;
  v_component_price_leaks int:=0;
  v_enabled_terms int:=0;
  v_viable_terms int:=0;
  v_term_payload_violations int:=0;
  v_unsellable_product_violations int:=0;
  v_product_image_missing int:=0;
  v_direct_search_ok boolean:=false;
  v_direct_search_count int:=0;
  v_checks jsonb:='[]'::jsonb;
  v_ok boolean;
  r record;
  v_editor jsonb;
  v_results jsonb;
  v_products jsonb;
  v_count int;
begin
  select count(*)::int,
         count(*) filter(where nullif(trim(coalesce(image_url,'')),'') is not null)::int
    into v_basket_count,v_baskets_with_image
  from public.get_whatsapp_simple_baskets_v1();

  for r in select id from public.basket_templates where is_active=true and is_whatsapp_active=true order by sort_order nulls last,name
  loop
    begin
      v_editor:=public.get_whatsapp_flow_basket_editor_v2(r.id);
      if jsonb_array_length(coalesce(v_editor->'selection','[]'::jsonb))>0 then
        v_baskets_with_editor:=v_baskets_with_editor+1;
      end if;
      if exists(
        select 1 from jsonb_array_elements(coalesce(v_editor->'items','[]'::jsonb)) e
        where e ? 'price' or e ? 'unit_price' or e ? 'preco' or e ? 'price_text'
      ) then
        v_component_price_leaks:=v_component_price_leaks+1;
      end if;
    exception when others then
      null;
    end;
  end loop;

  for r in
    select section_key,term_key,search_query
    from public.whatsapp_flow_search_terms
    where enabled=true
    order by section_key,sort_order,term_key
  loop
    v_enabled_terms:=v_enabled_terms+1;
    v_results:=public.get_whatsapp_flow_product_results_v1(r.search_query,20);
    v_products:=coalesce(v_results->'products','[]'::jsonb);
    v_count:=jsonb_array_length(v_products);
    if v_count>0 then v_viable_terms:=v_viable_terms+1; end if;
    if v_count>20 then v_term_payload_violations:=v_term_payload_violations+1; end if;

    if exists(
      select 1
      from jsonb_array_elements(v_products) e
      left join public.products p
        on coalesce(e->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and p.id=(e->>'id')::uuid
      where p.id is null
         or not p.is_active
         or not coalesce(p.is_whatsapp_active,false)
         or coalesce(p.price,0)<=0
         or coalesce(p.stock,0)<=0
    ) then
      v_unsellable_product_violations:=v_unsellable_product_violations+1;
    end if;

    select v_product_image_missing + count(*)::int
      into v_product_image_missing
    from jsonb_array_elements(v_products) e
    where nullif(trim(coalesce(e->>'image_url','')),'') is null;
  end loop;

  v_results:=public.get_whatsapp_flow_product_results_v1('sabonete',12);
  v_direct_search_count:=jsonb_array_length(coalesce(v_results->'products','[]'::jsonb));
  v_direct_search_ok:=v_direct_search_count between 1 and 12;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','nine_baskets','ok',v_basket_count=9,'detail','count='||v_basket_count));
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','basket_images_complete','ok',v_baskets_with_image=v_basket_count and v_basket_count=9,'detail','with_image='||v_baskets_with_image||'/'||v_basket_count));
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','basket_editors_resolve','ok',v_baskets_with_editor=v_basket_count and v_basket_count=9,'detail','editors='||v_baskets_with_editor||'/'||v_basket_count));
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','component_prices_hidden','ok',v_component_price_leaks=0,'detail','leaks='||v_component_price_leaks));
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','search_terms_present','ok',v_enabled_terms>=20,'detail','enabled='||v_enabled_terms));
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','search_terms_have_live_results','ok',v_viable_terms>0,'detail','viable='||v_viable_terms||'/'||v_enabled_terms));
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','term_payload_hard_cap','ok',v_term_payload_violations=0,'detail','violations='||v_term_payload_violations));
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','term_results_sellable','ok',v_unsellable_product_violations=0,'detail','violations='||v_unsellable_product_violations));
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','product_images_present','ok',v_product_image_missing=0,'detail','missing='||v_product_image_missing));
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','direct_search_bounded','ok',v_direct_search_ok,'detail','sabonete_count='||v_direct_search_count));

  select bool_and(coalesce((e->>'ok')::boolean,false)) into v_ok
  from jsonb_array_elements(v_checks) e;

  return jsonb_build_object(
    'ok',coalesce(v_ok,false),
    'version','v1-behavioral-catalog',
    'checked_at',now(),
    'checks',v_checks,
    'passed',(select count(*) from jsonb_array_elements(v_checks) e where coalesce((e->>'ok')::boolean,false)),
    'total',jsonb_array_length(v_checks),
    'baskets',v_basket_count,
    'enabled_terms',v_enabled_terms,
    'viable_terms',v_viable_terms,
    'catalog_strategy','bounded dynamic subsets only; never full catalog'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_behavioral_catalog_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_behavioral_catalog_readiness_v1() to service_role;

create or replace function public.get_whatsapp_flow_v31_full_release_readiness_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_conversation_id uuid;
  v_commercial jsonb;
  v_terminal jsonb;
  v_behavioral jsonb;
  v_preflight jsonb;
  v_audit jsonb;
  v_cfg public.automation_config%rowtype;
  v_runtime text:=coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v23(uuid,uuid,text,text,jsonb)'::regprocedure),'');
  v_nfm text:=coalesce(pg_get_functiondef('public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb)'::regprocedure),'');
  checks jsonb:='[]'::jsonb;
  passed int:=0;
  total int:=0;
  c jsonb;
begin
  select conversation_id into v_conversation_id from public.experience_sessions where id=p_session_id;
  if v_conversation_id is null then
    return jsonb_build_object('ok',false,'reason','session_not_found','session_id',p_session_id);
  end if;

  select * into v_cfg from public.automation_config where id=1;
  v_commercial:=public.get_whatsapp_flow_v31_commercial_journey_readiness_v1();
  v_terminal:=public.get_whatsapp_flow_v31_terminal_readiness_v1();
  v_behavioral:=public.get_whatsapp_flow_v31_behavioral_catalog_readiness_v1();
  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v3(p_session_id,v_conversation_id);
  v_audit:=public.get_whatsapp_flow_v31_journey_audit_v4(p_session_id);

  checks:=jsonb_build_array(
    jsonb_build_object('name','commercial_journey_ready','ok',coalesce((v_commercial->>'ok')::boolean,false)),
    jsonb_build_object('name','terminal_bridge_ready','ok',coalesce((v_terminal->>'ok')::boolean,false)),
    jsonb_build_object('name','behavioral_catalog_ready','ok',coalesce((v_behavioral->>'ok')::boolean,false)),
    jsonb_build_object('name','journey_healthy','ok',coalesce((v_audit->>'healthy')::boolean,false)),
    jsonb_build_object('name','canary_locked_1','ok',coalesce(v_cfg.whatsapp_live_canary_percent,0)=1),
    jsonb_build_object('name','orchestrator_off','ok',not coalesce(v_cfg.experience_orchestrator_enabled,false)),
    jsonb_build_object('name','data_exchange_global_off','ok',not coalesce(v_cfg.whatsapp_flow_data_exchange_enabled,false)),
    jsonb_build_object('name','flow_send_global_off','ok',not coalesce(v_cfg.whatsapp_flow_send_enabled,false)),
    jsonb_build_object('name','commercial_write_off','ok',not coalesce(v_cfg.whatsapp_flow_commercial_write_enabled,false)),
    jsonb_build_object('name','bling_off','ok',not coalesce(v_cfg.bling_order_sync_enabled,false)),
    jsonb_build_object('name','runtime_v23_present','ok',position('handle_whatsapp_flow_commercial_exchange_v22' in v_runtime)>0 and position('get_whatsapp_checkout_contact_v1' in v_runtime)>0),
    jsonb_build_object('name','nfm_reply_present','ok',length(v_nfm)>0),
    jsonb_build_object('name','owner_target_authorized','ok',coalesce((v_preflight#>>'{checks,19,ok}')::boolean,false)),
    jsonb_build_object('name','owner_conversation_ai','ok',coalesce((v_preflight#>>'{checks,29,ok}')::boolean,false)),
    jsonb_build_object('name','owner_service_window_open','ok',coalesce((v_preflight#>>'{checks,30,ok}')::boolean,false)),
    jsonb_build_object('name','owner_handoff_clear','ok',coalesce((v_preflight#>>'{checks,31,ok}')::boolean,false))
  );

  total:=jsonb_array_length(checks);
  for c in select value from jsonb_array_elements(checks) loop
    if coalesce((c->>'ok')::boolean,false) then passed:=passed+1; end if;
  end loop;

  return jsonb_build_object(
    'ok',passed=total,
    'healthy',coalesce((v_commercial->>'ok')::boolean,false)
              and coalesce((v_terminal->>'ok')::boolean,false)
              and coalesce((v_behavioral->>'ok')::boolean,false)
              and coalesce((v_audit->>'healthy')::boolean,false),
    'homologation_ready',coalesce((v_preflight->>'ok')::boolean,false),
    'passed',passed,
    'total',total,
    'checks',checks,
    'session_id',p_session_id,
    'conversation_id',v_conversation_id,
    'next_expected',v_audit->>'next_expected',
    'commercial',v_commercial,
    'terminal',v_terminal,
    'behavioral',v_behavioral,
    'preflight',v_preflight,
    'audit',v_audit,
    'checked_at',now()
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_full_release_readiness_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_full_release_readiness_v1(uuid) to service_role;
