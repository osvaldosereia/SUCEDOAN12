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
       or coalesce(validation->>'contract','')<>'basket_personalization_v3'
       or coalesce((validation#>>'{policy,component_prices_visible}')::boolean,true)
       or not coalesce((validation#>>'{policy,requires_backend_validation}')::boolean,false)
       or not coalesce((validation#>>'{policy,stock_limits_increases}')::boolean,false) then
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
    'readiness_version','v72-basket-personalization-integrity-v2',
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
    'basket_personalization_contract','basket_personalization_v3',
    'stock_limits_increases',true,
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
