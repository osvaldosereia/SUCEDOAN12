begin;

create or replace function public.get_whatsapp_flow_v72_basket_personalization_integrity_readiness_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $function$
declare
  cfg public.automation_config%rowtype;
  b record;
  c record;
  selection jsonb;
  validation jsonb;
  adjustment jsonb;
  normalized_item jsonb;
  q jsonb;
  component_ready jsonb;
  v_baskets_checked integer:=0;
  v_components_checked integer:=0;
  v_invalid_compositions integer:=0;
  v_default_selection_failures integer:=0;
  v_normalized_count_mismatches integer:=0;
  v_component_price_leaks integer:=0;
  v_adjustment_failures integer:=0;
  v_adjustment_price_leaks integer:=0;
  v_empty_quantity_options integer:=0;
  v_quantity_mismatches integer:=0;
  v_component_readiness_ok boolean:=false;
  v_component_readiness_total integer:=0;
  v_component_readiness_ready integer:=0;
  v_ok boolean:=false;
begin
  select * into cfg from public.automation_config where id=1;
  component_ready:=public.get_whatsapp_basket_component_readiness_v3(null);
  v_component_readiness_ok:=coalesce((component_ready->>'ready')::boolean,false);
  v_component_readiness_total:=coalesce((component_ready->>'total_baskets')::integer,0);
  v_component_readiness_ready:=coalesce((component_ready->>'ready_baskets')::integer,0);

  for b in
    select bt.id,bt.sku,bt.name,
           count(bi.id)::integer as total_items,
           count(p.id)::integer as resolved_items,
           count(*) filter(where coalesce(p.name,'')='')::integer as missing_names,
           count(*) filter(where bi.quantity is null or bi.quantity<=0)::integer as invalid_base_qty,
           count(*) filter(where bi.min_quantity is not null and bi.max_quantity is not null and bi.min_quantity>bi.max_quantity)::integer as invalid_ranges,
           jsonb_agg(jsonb_build_object('product_id',bi.product_id,'quantity',bi.quantity) order by bi.sort_order,bi.created_at) as default_selection
      from public.basket_templates bt
      join public.basket_template_items bi on bi.basket_id=bt.id
      left join public.products p on p.id=bi.product_id
     where bt.is_active=true and bt.is_whatsapp_active=true
     group by bt.id,bt.sku,bt.name
     order by bt.sku,bt.name
  loop
    v_baskets_checked:=v_baskets_checked+1;
    v_components_checked:=v_components_checked+b.total_items;

    if b.total_items<1
       or b.resolved_items<>b.total_items
       or b.missing_names<>0
       or b.invalid_base_qty<>0
       or b.invalid_ranges<>0 then
      v_invalid_compositions:=v_invalid_compositions+1;
    end if;

    selection:=b.default_selection;
    validation:=public.validate_basket_flow_selection_v1(b.id,selection);
    if not coalesce((validation->>'valid')::boolean,false)
       or coalesce(validation->>'contract','')<>'basket_personalization_v2'
       or coalesce((validation#>>'{policy,component_prices_visible}')::boolean,true)
       or not coalesce((validation#>>'{policy,requires_backend_validation}')::boolean,false) then
      v_default_selection_failures:=v_default_selection_failures+1;
    end if;

    if jsonb_array_length(coalesce(validation->'normalized','[]'::jsonb))<>b.total_items then
      v_normalized_count_mismatches:=v_normalized_count_mismatches+1;
    end if;

    for normalized_item in select value from jsonb_array_elements(coalesce(validation->'normalized','[]'::jsonb)) loop
      if normalized_item ?| array['price','unit_price','line_total','commercial_delta','base_price','remove_unit_delta','add_unit_delta','delta'] then
        v_component_price_leaks:=v_component_price_leaks+1;
      end if;
    end loop;

    for c in
      select bi.product_id,bi.quantity
        from public.basket_template_items bi
       where bi.basket_id=b.id
       order by bi.sort_order,bi.created_at
    loop
      adjustment:=public.get_whatsapp_flow_basket_adjustment_options_v1(b.id,c.product_id);
      if coalesce((adjustment#>>'{policy,component_prices_visible}')::boolean,true)
         or not coalesce((adjustment#>>'{policy,backend_validation_required}')::boolean,false)
         or coalesce(adjustment->>'product_id','')<>c.product_id::text then
        v_adjustment_failures:=v_adjustment_failures+1;
      end if;
      if coalesce((adjustment->>'current_quantity')::numeric,-1)<>c.quantity then
        v_quantity_mismatches:=v_quantity_mismatches+1;
      end if;
      if jsonb_array_length(coalesce(adjustment->'allowed_quantities','[]'::jsonb))<1 then
        v_empty_quantity_options:=v_empty_quantity_options+1;
      end if;
      for q in select value from jsonb_array_elements(coalesce(adjustment->'allowed_quantities','[]'::jsonb)) loop
        if q ?| array['price','unit_price','line_total','commercial_delta','base_price','remove_unit_delta','add_unit_delta','delta'] then
          v_adjustment_price_leaks:=v_adjustment_price_leaks+1;
        end if;
      end loop;
    end loop;
  end loop;

  v_ok:=v_baskets_checked>0
    and v_components_checked>0
    and v_component_readiness_ok
    and v_component_readiness_total=v_baskets_checked
    and v_component_readiness_ready=v_baskets_checked
    and v_invalid_compositions=0
    and v_default_selection_failures=0
    and v_normalized_count_mismatches=0
    and v_component_price_leaks=0
    and v_adjustment_failures=0
    and v_adjustment_price_leaks=0
    and v_empty_quantity_options=0
    and v_quantity_mismatches=0
    and cfg.whatsapp_live_canary_percent=1
    and not cfg.experience_orchestrator_enabled
    and not cfg.whatsapp_flow_data_exchange_enabled
    and not cfg.whatsapp_flow_send_enabled
    and not cfg.whatsapp_flow_commercial_write_enabled
    and not cfg.bling_order_sync_enabled;

  return jsonb_build_object(
    'ok',v_ok,
    'readiness_version','v72-basket-personalization-integrity-v1',
    'baskets_checked',v_baskets_checked,
    'components_checked',v_components_checked,
    'component_readiness_ok',v_component_readiness_ok,
    'component_readiness_total',v_component_readiness_total,
    'component_readiness_ready',v_component_readiness_ready,
    'invalid_compositions',v_invalid_compositions,
    'default_selection_failures',v_default_selection_failures,
    'normalized_count_mismatches',v_normalized_count_mismatches,
    'component_price_leaks',v_component_price_leaks,
    'adjustment_failures',v_adjustment_failures,
    'adjustment_price_leaks',v_adjustment_price_leaks,
    'empty_quantity_options',v_empty_quantity_options,
    'quantity_mismatches',v_quantity_mismatches,
    'component_prices_visible',false,
    'basket_personalization_contract','basket_personalization_v2',
    'backend_validation_required',true,
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
revoke all on function public.get_whatsapp_flow_v72_basket_personalization_integrity_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v72_basket_personalization_integrity_readiness_v1() to service_role;

create or replace function public.get_whatsapp_flow_owner_homologation_preflight_v13(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v12 jsonb;
  v72 jsonb;
  v_ok boolean;
begin
  v12:=public.get_whatsapp_flow_owner_homologation_preflight_v12(p_conversation_id);
  v72:=public.get_whatsapp_flow_v72_basket_personalization_integrity_readiness_v1();
  v_ok:=coalesce((v12->>'ok')::boolean,false) and coalesce((v72->>'ok')::boolean,false);
  return v12||jsonb_build_object(
    'ok',v_ok,
    'preflight_version','v13-v72-basket-personalization-integrity',
    'basket_personalization_integrity_ready',coalesce((v72->>'ok')::boolean,false),
    'basket_personalization_baskets_checked',coalesce((v72->>'baskets_checked')::integer,0),
    'basket_personalization_components_checked',coalesce((v72->>'components_checked')::integer,0),
    'basket_component_price_leaks',coalesce((v72->>'component_price_leaks')::integer,0),
    'basket_adjustment_price_leaks',coalesce((v72->>'adjustment_price_leaks')::integer,0),
    'writes_performed',false
  );
end;
$function$;
revoke all on function public.get_whatsapp_flow_owner_homologation_preflight_v13(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_owner_homologation_preflight_v13(uuid) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v16(p_conversation_id uuid,p_idempotency_key text,p_body_text text default 'TESTE — Flow Dona Antônia. Toque em Montar pedido.'::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  preflight jsonb;
  result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dona_antonia_whatsapp_flow_owner_homologation_launch_v16'));
  preflight:=public.get_whatsapp_flow_owner_homologation_preflight_v13(p_conversation_id);
  if not coalesce((preflight->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'reason','owner_conversation_preflight_v13_failed','preflight',preflight,'dispatch_version','v16-v72-basket-personalization-integrity-runtime-v26-edge49');
  end if;
  result:=public.queue_and_dispatch_whatsapp_flow_owner_homologation_v15(p_conversation_id,p_idempotency_key,p_body_text);
  return result||jsonb_build_object('preflight_v13',preflight,'serialized_launch',true,'runtime_handler','v26','edge_version',49,'dispatch_version','v16-v72-basket-personalization-integrity-runtime-v26-edge49');
end;
$function$;
revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v16(uuid,text,text) from public,anon,authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v16(uuid,text,text) to service_role;
revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v15(uuid,text,text) from service_role;

create or replace function public.get_whatsapp_flow_v72_homologation_control_plane_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  base jsonb;
  personalization jsonb;
  eligible_count integer:=0;
  active_count integer:=0;
  evidence_ok boolean:=false;
  contamination boolean:=false;
  v15_disabled boolean:=false;
  v16_exists boolean:=false;
  safe_v16 boolean:=false;
  next_action text;
begin
  base:=public.get_whatsapp_flow_v71_homologation_control_plane_v1();
  personalization:=public.get_whatsapp_flow_v72_basket_personalization_integrity_readiness_v1();
  eligible_count:=coalesce((base->>'eligible_owner_conversations')::integer,0);
  active_count:=coalesce((base->>'active_owner_homologation_sessions')::integer,0);
  evidence_ok:=coalesce((base->>'physical_evidence_ok')::boolean,false);
  contamination:=coalesce((base->>'order_contamination_detected')::boolean,false);
  v16_exists:=to_regprocedure('public.queue_and_dispatch_whatsapp_flow_owner_homologation_v16(uuid,text,text)') is not null;
  v15_disabled:=not pg_catalog.has_function_privilege('service_role','public.queue_and_dispatch_whatsapp_flow_owner_homologation_v15(uuid,text,text)','EXECUTE');
  safe_v16:=coalesce((base->>'visible_taxonomy_ready')::boolean,false)
    and coalesce((base->>'visual_product_card_ready')::boolean,false)
    and coalesce((base->>'terminal_commercial_ready')::boolean,false)
    and coalesce((base->>'payment_rules_ready')::boolean,false)
    and coalesce((base->>'atomic_terminal_handoff_ready')::boolean,false)
    and coalesce((base->>'ai_intent_catalog_integrity_ready')::boolean,false)
    and coalesce((personalization->>'ok')::boolean,false)
    and not evidence_ok and not contamination
    and eligible_count=1 and active_count=0
    and v16_exists and v15_disabled;

  if contamination then next_action:='investigate_physical_order_contamination';
  elsif evidence_ok then next_action:='physical_terminal_no_order_evidence_complete';
  elsif not coalesce((personalization->>'ok')::boolean,false) then next_action:='fix_basket_personalization_integrity';
  elsif not v15_disabled then next_action:='disable_legacy_owner_launcher_v15';
  elsif active_count>0 then next_action:='continue_existing_owner_homologation_session';
  elsif eligible_count=0 then next_action:='wait_for_owner_service_window';
  elsif eligible_count=1 then next_action:='owner_conversation_ready_for_v16';
  else next_action:='select_one_owner_conversation_explicitly';
  end if;

  return base||jsonb_build_object(
    'basket_personalization_integrity_ready',coalesce((personalization->>'ok')::boolean,false),
    'basket_personalization_integrity_version',personalization->>'readiness_version',
    'basket_personalization_baskets_checked',personalization->'baskets_checked',
    'basket_personalization_components_checked',personalization->'components_checked',
    'basket_component_price_leaks',personalization->'component_price_leaks',
    'basket_adjustment_price_leaks',personalization->'adjustment_price_leaks',
    'safe_to_launch_owner_v15',false,
    'safe_to_launch_owner_v16',safe_v16,
    'direct_v15_service_role_disabled',v15_disabled,
    'launcher_preflight_version','v13-v72-basket-personalization-integrity',
    'dispatch_version','v16-v72-basket-personalization-integrity-runtime-v26-edge49',
    'next_action',next_action,
    'writes_performed',false,
    'control_plane_version','v72-basket-personalization-integrity'
  );
end;
$function$;
revoke all on function public.get_whatsapp_flow_v72_homologation_control_plane_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v72_homologation_control_plane_v1() to service_role;

commit;
