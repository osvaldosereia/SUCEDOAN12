begin;

-- WhatsApp Flow comercial — normaliza quantidades integrais vindas de colunas numeric.
-- basket_template_items.quantity é numeric e jsonb_build_object preserva escala (ex.: 1.000).
-- O contrato aceita apenas quantidades inteiras, mas não deve rejeitar uma representação
-- decimal integral. Frações continuam inválidas.
create or replace function public.validate_basket_flow_selection_v1(p_basket_id uuid,p_selection jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b public.basket_templates%rowtype;
  x jsonb;
  bi public.basket_template_items%rowtype;
  p public.products%rowtype;
  v_id_text text;
  v_product_id uuid;
  v_qty numeric;
  v_min numeric;
  v_max numeric;
  v_seen uuid[]:='{}'::uuid[];
  v_normalized jsonb:='[]'::jsonb;
  v_issues jsonb:='[]'::jsonb;
  v_expected integer:=0;
  v_remove_priced boolean;
  v_add_priced boolean;
begin
  select * into b
  from public.basket_templates
  where id=p_basket_id and is_active=true and is_whatsapp_active=true;
  if not found then raise exception 'basket_not_available'; end if;

  if jsonb_typeof(coalesce(p_selection,'null'::jsonb))<>'array' then
    return jsonb_build_object(
      'valid',false,
      'contract','basket_personalization_v2',
      'normalized','[]'::jsonb,
      'issues',jsonb_build_array(jsonb_build_object('code','selection_must_be_array'))
    );
  end if;

  select count(*) into v_expected
  from public.basket_template_items
  where basket_id=b.id;

  for x in select value from jsonb_array_elements(p_selection)
  loop
    if jsonb_typeof(x)<>'object' then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','item_must_be_object'));
      continue;
    end if;

    v_id_text:=trim(coalesce(x->>'product_id',''));
    if v_id_text!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_product_id'));
      continue;
    end if;

    v_product_id:=v_id_text::uuid;
    if v_product_id=any(v_seen) then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','duplicate_product','product_id',v_product_id));
      continue;
    end if;
    v_seen:=array_append(v_seen,v_product_id);

    select * into bi
    from public.basket_template_items
    where basket_id=b.id and product_id=v_product_id;
    if not found then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','product_not_in_basket','product_id',v_product_id));
      continue;
    end if;

    select * into p from public.products where id=v_product_id;
    if not found then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','product_missing','product_id',v_product_id));
      continue;
    end if;

    -- Accept 1, 1.0, 1.000 etc.; reject negatives, exponent notation and true fractions.
    if coalesce(x->>'quantity','')!~'^[0-9]+([.]0+)?$' then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_quantity','product_id',v_product_id));
      continue;
    end if;
    v_qty:=(x->>'quantity')::numeric;
    if trunc(v_qty)<>v_qty then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_quantity','product_id',v_product_id));
      continue;
    end if;

    v_remove_priced:=bi.remove_unit_delta is not null or coalesce(p.price,0)>0;
    v_add_priced:=bi.add_unit_delta is not null or coalesce(p.price,0)>0;
    v_min:=coalesce(bi.min_quantity,case when bi.removable then 0 else bi.quantity end);
    v_max:=coalesce(bi.max_quantity,greatest(bi.quantity,20));
    if not v_remove_priced then v_min:=bi.quantity; end if;
    if not v_add_priced then v_max:=bi.quantity; end if;

    if v_qty<v_min or v_qty>v_max then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','quantity_out_of_range','product_id',v_product_id,'min',v_min,'max',v_max));
      continue;
    end if;
    if not bi.quantity_editable and v_qty<>bi.quantity then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','quantity_not_editable','product_id',v_product_id));
      continue;
    end if;
    if not bi.removable and v_qty=0 then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','product_not_removable','product_id',v_product_id));
      continue;
    end if;
    if v_qty<bi.quantity and not v_remove_priced then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','remove_pricing_not_configured','product_id',v_product_id));
      continue;
    end if;
    if v_qty>bi.quantity and not v_add_priced then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','add_pricing_not_configured','product_id',v_product_id));
      continue;
    end if;

    v_normalized:=v_normalized||jsonb_build_array(jsonb_build_object(
      'product_id',v_product_id,
      'name',p.name,
      'base_quantity',bi.quantity,
      'quantity',v_qty,
      'changed',v_qty<>bi.quantity,
      'removable',bi.removable,
      'quantity_editable',bi.quantity_editable
    ));
  end loop;

  for bi in select * from public.basket_template_items where basket_id=b.id
  loop
    if not(bi.product_id=any(v_seen)) then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','missing_component','product_id',bi.product_id));
    end if;
  end loop;

  return jsonb_build_object(
    'valid',jsonb_array_length(v_issues)=0 and jsonb_array_length(v_normalized)=v_expected,
    'contract','basket_personalization_v2',
    'basket_id',b.id,
    'normalized',v_normalized,
    'issues',v_issues,
    'policy',jsonb_build_object(
      'component_prices_visible',false,
      'basket_components_follow_template_availability',true,
      'unpriced_components_remain_fixed_quantity',true,
      'requires_backend_validation',true
    )
  );
end;
$$;

revoke all on function public.validate_basket_flow_selection_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.validate_basket_flow_selection_v1(uuid,jsonb) to service_role;

-- Homologation gates stay closed by contract.
update public.automation_config
set whatsapp_live_canary_percent=1,
    experience_orchestrator_enabled=false,
    whatsapp_flow_data_exchange_enabled=false,
    whatsapp_flow_send_enabled=false,
    whatsapp_flow_commercial_write_enabled=false,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

commit;
