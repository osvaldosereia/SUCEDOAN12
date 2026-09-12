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

      if not coalesce((r->>'ok')::boolean,false)
         or coalesce(r->>'query_source','')<>'curated_term'
         or v_count<1 or v_count>20
         or coalesce((r->>'full_catalog_loaded')::boolean,true)
         or coalesce(r->>'backend_source','')<>'supabase.products' then
        v_structural_failures:=v_structural_failures+1;
      end if;

      for p in select value from jsonb_array_elements(coalesce(r->'products','[]'::jsonb)) loop
        v_products_checked:=v_products_checked+1;
        select count(*)::int into v_match
        from public.products pr
        where pr.id=(p->>'id')::uuid
          and pr.physically_verified=true
          and pr.is_active=true
          and pr.is_whatsapp_active=true
          and coalesce(pr.stock,0)>0
          and pr.price is not null
          and pr.price>0
          and pr.price=(p->>'price')::numeric
          and coalesce(pr.name,'')=coalesce(p->>'name','')
          and coalesce(pr.image_url,'')=coalesce(p->>'image_url','')
          and coalesce(pr.image_url,'') like 'https://%';
        if v_match<>1 then v_catalog_mismatches:=v_catalog_mismatches+1; end if;
      end loop;

      ai:=public.get_whatsapp_flow_ai_intent_entry_v1(t.term_key,20);
      v_ai_entry_checks:=v_ai_entry_checks+1;
      if not coalesce((ai->>'ok')::boolean,false)
         or coalesce(ai->>'target_screen','')<>'PRODUTOS_A'
         or coalesce(ai->>'query_source','')<>'curated_term'
         or coalesce((ai->>'product_count')::integer,0)<>v_count
         or coalesce((ai->>'product_count')::integer,0)>20
         or coalesce((ai->>'ai_authoritative_for_catalog')::boolean,true)
         or coalesce(ai->>'commercial_truth','')<>'backend_deterministic' then
        v_ai_option_mismatches:=v_ai_option_mismatches+1;
      end if;
    end loop;
  end loop;

  direct_r:=public.get_whatsapp_flow_intent_products_v1('leite',20);
  direct_ai:=public.get_whatsapp_flow_ai_intent_entry_v1('leite',20);
  v_count:=coalesce((direct_r->>'product_count')::integer,0);

  if not coalesce((direct_r->>'ok')::boolean,false)
     or coalesce(direct_r->>'query_source','')<>'direct_search'
     or v_count<1 or v_count>20
     or coalesce((direct_r->>'full_catalog_loaded')::boolean,true)
     or coalesce(direct_r->>'backend_source','')<>'supabase.products' then
    v_direct_failures:=v_direct_failures+1;
  end if;

  if not coalesce((direct_ai->>'ok')::boolean,false)
     or coalesce(direct_ai->>'target_screen','')<>'PRODUTOS_A'
     or coalesce(direct_ai->>'query_source','')<>'direct_search'
     or coalesce((direct_ai->>'product_count')::integer,0)<>v_count
     or coalesce((direct_ai->>'product_count')::integer,0)>20
     or coalesce((direct_ai->>'ai_authoritative_for_catalog')::boolean,true)
     or coalesce(direct_ai->>'commercial_truth','')<>'backend_deterministic' then
    v_direct_failures:=v_direct_failures+1;
  end if;

  for p in select value from jsonb_array_elements(coalesce(direct_r->'products','[]'::jsonb)) loop
    v_products_checked:=v_products_checked+1;
    select count(*)::int into v_match
    from public.products pr
    where pr.id=(p->>'id')::uuid
      and pr.physically_verified=true
      and pr.is_active=true
      and pr.is_whatsapp_active=true
      and coalesce(pr.stock,0)>0
      and pr.price is not null
      and pr.price>0
      and pr.price=(p->>'price')::numeric
      and coalesce(pr.name,'')=coalesce(p->>'name','')
      and coalesce(pr.image_url,'')=coalesce(p->>'image_url','')
      and coalesce(pr.image_url,'') like 'https://%';
    if v_match<>1 then v_catalog_mismatches:=v_catalog_mismatches+1; end if;
  end loop;

  v_ok:=v_visible_terms>0
    and v_intent_checks=v_visible_terms
    and v_ai_entry_checks=v_visible_terms
    and v_products_checked>0
    and v_catalog_mismatches=0
    and v_ai_option_mismatches=0
    and v_structural_failures=0
    and v_direct_failures=0
    and cfg.whatsapp_live_canary_percent=1
    and not cfg.experience_orchestrator_enabled
    and not cfg.whatsapp_flow_data_exchange_enabled
    and not cfg.whatsapp_flow_send_enabled
    and not cfg.whatsapp_flow_commercial_write_enabled
    and not cfg.bling_order_sync_enabled;

  return jsonb_build_object(
    'ok',v_ok,
    'readiness_version','v71-ai-intent-catalog-integrity-v1',
    'visible_terms_checked',v_visible_terms,
    'intent_checks',v_intent_checks,
    'ai_entry_checks',v_ai_entry_checks,
    'products_checked',v_products_checked,
    'catalog_mismatches',v_catalog_mismatches,
    'ai_option_mismatches',v_ai_option_mismatches,
    'structural_failures',v_structural_failures,
    'direct_search_failures',v_direct_failures,
    'direct_search_probe','leite',
    'direct_search_product_count',coalesce((direct_r->>'product_count')::integer,0),
    'max_products_per_query',20,
    'stock_verified_in_backend',true,
    'stock_exposed_to_flow',false,
    'full_catalog_loaded',false,
    'ai_role','intent_text_only',
    'ai_authoritative_for_catalog',false,
    'commercial_truth','backend_deterministic',
    'writes_performed',false,
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',cfg.bling_order_sync_enabled)
  );
end;
$function$;
revoke all on function public.get_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness_v1() to service_role;

create or replace function public.get_whatsapp_flow_owner_homologation_preflight_v12(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v11 jsonb;
  v71 jsonb;
  v_ok boolean;
begin
  v11:=public.get_whatsapp_flow_owner_homologation_preflight_v11(p_conversation_id);
  v71:=public.get_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness_v1();
  v_ok:=coalesce((v11->>'ok')::boolean,false) and coalesce((v71->>'ok')::boolean,false);
  return v11||jsonb_build_object(
    'ok',v_ok,
    'preflight_version','v12-v71-ai-intent-catalog-integrity',
    'ai_intent_catalog_integrity_ready',coalesce((v71->>'ok')::boolean,false),
    'ai_intent_products_checked',coalesce((v71->>'products_checked')::integer,0),
    'ai_intent_catalog_mismatches',coalesce((v71->>'catalog_mismatches')::integer,0),
    'direct_search_failures',coalesce((v71->>'direct_search_failures')::integer,0),
    'writes_performed',false
  );
end;
$function$;
revoke all on function public.get_whatsapp_flow_owner_homologation_preflight_v12(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_owner_homologation_preflight_v12(uuid) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v15(p_conversation_id uuid,p_idempotency_key text,p_body_text text default 'TESTE — Flow Dona Antônia. Toque em Montar pedido.'::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  preflight jsonb;
  result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dona_antonia_whatsapp_flow_owner_homologation_launch_v15'));
  preflight:=public.get_whatsapp_flow_owner_homologation_preflight_v12(p_conversation_id);
  if not coalesce((preflight->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'reason','owner_conversation_preflight_v12_failed','preflight',preflight,'dispatch_version','v15-v71-ai-intent-integrity-runtime-v26-edge49');
  end if;
  result:=public.queue_and_dispatch_whatsapp_flow_owner_homologation_v14(p_conversation_id,p_idempotency_key,p_body_text);
  return result||jsonb_build_object('preflight_v12',preflight,'serialized_launch',true,'runtime_handler','v26','edge_version',49,'dispatch_version','v15-v71-ai-intent-integrity-runtime-v26-edge49');
end;
$function$;
revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v15(uuid,text,text) from public,anon,authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v15(uuid,text,text) to service_role;
revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v14(uuid,text,text) from service_role;

create or replace function public.get_whatsapp_flow_v71_homologation_control_plane_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  base jsonb;
  integrity jsonb;
  eligible_count integer:=0;
  active_count integer:=0;
  evidence_ok boolean:=false;
  contamination boolean:=false;
  v14_disabled boolean:=false;
  v15_exists boolean:=false;
  safe_v15 boolean:=false;
  next_action text;
begin
  base:=public.get_whatsapp_flow_v70_homologation_control_plane_v1();
  integrity:=public.get_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness_v1();
  eligible_count:=coalesce((base->>'eligible_owner_conversations')::integer,0);
  active_count:=coalesce((base->>'active_owner_homologation_sessions')::integer,0);
  evidence_ok:=coalesce((base->>'physical_evidence_ok')::boolean,false);
  contamination:=coalesce((base->>'order_contamination_detected')::boolean,false);
  v15_exists:=to_regprocedure('public.queue_and_dispatch_whatsapp_flow_owner_homologation_v15(uuid,text,text)') is not null;
  v14_disabled:=not pg_catalog.has_function_privilege('service_role','public.queue_and_dispatch_whatsapp_flow_owner_homologation_v14(uuid,text,text)','EXECUTE');
  safe_v15:=coalesce((base->>'visible_taxonomy_ready')::boolean,false)
    and coalesce((base->>'visual_product_card_ready')::boolean,false)
    and coalesce((base->>'terminal_commercial_ready')::boolean,false)
    and coalesce((base->>'payment_rules_ready')::boolean,false)
    and coalesce((base->>'atomic_terminal_handoff_ready')::boolean,false)
    and coalesce((integrity->>'ok')::boolean,false)
    and not evidence_ok and not contamination
    and eligible_count=1 and active_count=0
    and v15_exists and v14_disabled;

  if contamination then next_action:='investigate_physical_order_contamination';
  elsif evidence_ok then next_action:='physical_terminal_no_order_evidence_complete';
  elsif not coalesce((integrity->>'ok')::boolean,false) then next_action:='fix_ai_intent_catalog_integrity';
  elsif not v14_disabled then next_action:='disable_legacy_owner_launcher_v14';
  elsif active_count>0 then next_action:='continue_existing_owner_homologation_session';
  elsif eligible_count=0 then next_action:='wait_for_owner_service_window';
  elsif eligible_count=1 then next_action:='owner_conversation_ready_for_v15';
  else next_action:='select_one_owner_conversation_explicitly';
  end if;

  return base||jsonb_build_object(
    'ai_intent_catalog_integrity_ready',coalesce((integrity->>'ok')::boolean,false),
    'ai_intent_integrity_version',integrity->>'readiness_version',
    'ai_intent_products_checked',integrity->'products_checked',
    'ai_intent_catalog_mismatches',integrity->'catalog_mismatches',
    'ai_intent_option_mismatches',integrity->'ai_option_mismatches',
    'direct_search_failures',integrity->'direct_search_failures',
    'safe_to_launch_owner_v14',false,
    'safe_to_launch_owner_v15',safe_v15,
    'direct_v14_service_role_disabled',v14_disabled,
    'launcher_preflight_version','v12-v71-ai-intent-catalog-integrity',
    'dispatch_version','v15-v71-ai-intent-integrity-runtime-v26-edge49',
    'next_action',next_action,
    'writes_performed',false,
    'control_plane_version','v71-ai-intent-catalog-integrity'
  );
end;
$function$;
revoke all on function public.get_whatsapp_flow_v71_homologation_control_plane_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v71_homologation_control_plane_v1() to service_role;

commit;
