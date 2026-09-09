begin;

create or replace function public.patch_whatsapp_flow_basket_selection_v1(
  p_basket_id uuid,p_selection jsonb,p_product_id uuid,p_quantity numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b public.basket_templates%rowtype;
  bi public.basket_template_items%rowtype;
  p public.products%rowtype;
  v_base jsonb;
  v_next jsonb:='[]'::jsonb;
  v_normalized jsonb:='[]'::jsonb;
  x jsonb;
  v_found boolean:=false;
  v_q numeric;
  v_min numeric;
  v_max numeric;
  v_name text;
  v_summary text;
  v_remove_priced boolean;
  v_add_priced boolean;
begin
  select * into b from public.basket_templates where id=p_basket_id and is_active=true and is_whatsapp_active=true;
  if not found then raise exception 'basket_not_available'; end if;
  if p_quantity is null or p_quantity<0 or p_quantity<>trunc(p_quantity) then raise exception 'basket_quantity_must_be_integer'; end if;

  if jsonb_typeof(coalesce(p_selection,'null'::jsonb))<>'array' then
    v_base:=public.get_whatsapp_flow_basket_editor_v1(p_basket_id)->'selection';
  else v_base:=p_selection; end if;

  for x in select value from jsonb_array_elements(v_base) loop
    begin v_q:=(x->>'quantity')::numeric; exception when others then raise exception 'invalid_basket_selection_quantity'; end;
    if v_q<>trunc(v_q) then raise exception 'basket_quantity_must_be_integer'; end if;
    if coalesce(x->>'product_id','')=p_product_id::text then v_q:=p_quantity; v_found:=true; end if;

    select * into bi from public.basket_template_items bi0 where bi0.basket_id=p_basket_id and bi0.product_id=(x->>'product_id')::uuid;
    if not found then raise exception 'basket_component_not_found'; end if;
    select * into p from public.products where id=bi.product_id;
    if not found then raise exception 'product_missing'; end if;
    v_name:=p.name;
    v_remove_priced:=bi.remove_unit_delta is not null or coalesce(p.price,0)>0;
    v_add_priced:=bi.add_unit_delta is not null or coalesce(p.price,0)>0;
    v_min:=coalesce(bi.min_quantity,case when bi.removable then 0 else bi.quantity end);
    v_max:=coalesce(bi.max_quantity,greatest(bi.quantity,20));
    if not v_remove_priced then v_min:=bi.quantity; end if;
    if not v_add_priced then v_max:=bi.quantity; end if;

    if v_q<v_min or v_q>v_max then return jsonb_build_object('valid',false,'reason','quantity_out_of_range','product_id',bi.product_id,'min',v_min,'max',v_max); end if;
    if not bi.quantity_editable and v_q<>bi.quantity then return jsonb_build_object('valid',false,'reason','quantity_not_editable','product_id',bi.product_id); end if;
    if not bi.removable and v_q=0 then return jsonb_build_object('valid',false,'reason','product_not_removable','product_id',bi.product_id); end if;

    v_next:=v_next||jsonb_build_array(jsonb_build_object('product_id',bi.product_id,'quantity',trunc(v_q)::integer));
    v_normalized:=v_normalized||jsonb_build_array(jsonb_build_object('product_id',bi.product_id,'name',v_name,'quantity',trunc(v_q)::integer,'base_quantity',bi.quantity,'changed',v_q<>bi.quantity,'removable',bi.removable,'quantity_editable',bi.quantity_editable));
  end loop;
  if not v_found then raise exception 'basket_component_not_found'; end if;

  select coalesce(string_agg(trim(to_char((e->>'quantity')::numeric,'FM999990'))||' × '||coalesce(e->>'name',''),E'\n'),'') into v_summary
  from jsonb_array_elements(v_normalized) e where (e->>'quantity')::numeric>0;

  return jsonb_build_object('valid',true,'selection',v_next,'normalized',v_normalized,'summary',v_summary,'write_validation_deferred',true,
    'policy',jsonb_build_object('component_prices_visible',false,'basket_components_follow_template_availability',true,'unpriced_components_fixed',true,'strict_validation_on_write',true));
end;
$$;

create or replace function public.patch_whatsapp_flow_basket_selection_v2(
  p_basket_id uuid,p_selection jsonb,p_product_id uuid,p_quantity numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_options jsonb;
  v_allowed boolean:=false;
begin
  if p_quantity is null or p_quantity<0 or trunc(p_quantity)<>p_quantity then
    return jsonb_build_object('valid',false,'issues',jsonb_build_array(jsonb_build_object('code','invalid_quantity')));
  end if;
  v_options:=public.get_whatsapp_flow_basket_adjustment_options_v1(p_basket_id,p_product_id);
  select exists(select 1 from jsonb_array_elements(coalesce(v_options->'allowed_quantities','[]'::jsonb)) e where (e->>'id')::numeric=p_quantity) into v_allowed;
  if not v_allowed then
    return jsonb_build_object('valid',false,'issues',jsonb_build_array(jsonb_build_object('code','quantity_not_allowed')),'policy',v_options->'policy');
  end if;
  return public.patch_whatsapp_flow_basket_selection_v1(p_basket_id,p_selection,p_product_id,p_quantity);
end;
$$;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v3(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.experience_sessions%rowtype;
  v_context jsonb;
  v_trigger text:=coalesce(p_data->>'trigger','');
  v_choice text:=lower(trim(coalesce(p_data->>'customize_action','')));
  v_basket_id uuid;
  v_product_id uuid;
  v_qty numeric;
  v_adjust jsonb;
  v_patch jsonb;
  v_legacy_data jsonb;
  v_editor jsonb;
begin
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then return jsonb_build_object('ok',false,'reason','flow_session_inactive'); end if;
  v_context:=coalesce(s.context,'{}'::jsonb);

  if p_action='data_exchange' and coalesce(p_screen,'')='PERSONALIZAR'
     and coalesce(s.flow_current_screen,'')='PERSONALIZAR' and v_trigger='basket_customize_v3' then
    if v_choice='continue' then
      v_legacy_data:=jsonb_set(coalesce(p_data,'{}'::jsonb),'{trigger}','"basket_customize"'::jsonb,true);
      return public.handle_whatsapp_flow_commercial_exchange_v2(p_session_id,p_conversation_id,p_action,p_screen,v_legacy_data);
    end if;
    if v_choice<>'edit' then return jsonb_build_object('ok',false,'reason','customize_action_required'); end if;
    begin v_basket_id:=(v_context->>'basket_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','basket_context_missing'); end;
    begin v_product_id:=(p_data->>'product_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_id'); end;
    v_adjust:=public.get_whatsapp_flow_basket_adjustment_options_v1(v_basket_id,v_product_id);
    update public.experience_sessions set context=v_context||jsonb_build_object('flow_adjust_product_id',v_product_id),flow_current_screen='AJUSTAR_ITEM',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','AJUSTAR_ITEM','data',jsonb_build_object(
      'product_name',v_adjust->>'product_name','current_quantity',trim(to_char((v_adjust->>'current_quantity')::numeric,'FM999990D##')),'allowed_quantities',v_adjust->'allowed_quantities',
      'policy_note',case when coalesce((v_adjust->'policy'->>'unpriced_component_fixed')::boolean,false) then 'Este item está com quantidade fixa nesta cesta.' when coalesce((v_adjust->'policy'->>'removal_allowed')::boolean,false) then 'Escolha a nova quantidade. Zero retira este item da cesta.' else 'Escolha uma das quantidades permitidas para este item.' end
    )));
  end if;

  if p_action='data_exchange' and coalesce(p_screen,'')='AJUSTAR_ITEM'
     and coalesce(s.flow_current_screen,'')='AJUSTAR_ITEM' and v_trigger='basket_item_apply' then
    begin v_basket_id:=(v_context->>'basket_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','basket_context_missing'); end;
    begin v_product_id:=(v_context->>'flow_adjust_product_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','adjust_product_context_missing'); end;
    begin v_qty:=(p_data->>'quantity')::numeric; exception when others then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end;
    v_patch:=public.patch_whatsapp_flow_basket_selection_v2(v_basket_id,coalesce(v_context->'flow_basket_selection','[]'::jsonb),v_product_id,v_qty);
    if not coalesce((v_patch->>'valid')::boolean,false) then
      v_adjust:=public.get_whatsapp_flow_basket_adjustment_options_v1(v_basket_id,v_product_id);
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','AJUSTAR_ITEM','data',jsonb_build_object(
        'product_name',v_adjust->>'product_name','current_quantity',trim(to_char((v_adjust->>'current_quantity')::numeric,'FM999990D##')),'allowed_quantities',v_adjust->'allowed_quantities','policy_note','Essa alteração não é permitida para este item.'
      )));
    end if;

    v_context:=(v_context||jsonb_build_object('flow_basket_selection',v_patch->'selection'))-'flow_adjust_product_id';
    update public.experience_sessions set context=v_context,flow_current_screen='PERSONALIZAR',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    v_editor:=public.get_whatsapp_flow_basket_editor_v1(v_basket_id);
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PERSONALIZAR','data',jsonb_build_object(
      'basket_name',v_editor->>'basket_name','basket_price',v_editor->>'basket_price','basket_note','Alteração salva. Você pode alterar outro item ou concluir.',
      'items_summary',v_patch->>'summary','actions',v_editor->'actions','items',v_editor->'items','quantities',v_editor->'quantities','error_text',''
    )));
  end if;

  return public.handle_whatsapp_flow_commercial_exchange_v2(p_session_id,p_conversation_id,p_action,p_screen,p_data);
end;
$$;

update public.experience_definitions
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object('personalization_rounds',3,'personalization_returns_after_adjustment',true,'default_component_max_quantity',20),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('implementation_stage','production_personalization_v9'),updated_at=now()
where slug='flow-cestas-comercial-v1';

-- activation remains off until the production smoke test passes.
update public.automation_config
set whatsapp_live_canary_percent=1,experience_orchestrator_enabled=false,whatsapp_flow_data_exchange_enabled=false,whatsapp_flow_send_enabled=false,whatsapp_flow_commercial_write_enabled=false,bling_order_sync_enabled=false,updated_at=now()
where id=1;

commit;
