begin;

-- Alinha o handler V3 ao JSON visual V3: a tela PERSONALIZAR decide editar ou continuar;
-- a quantidade só é escolhida na tela AJUSTAR_ITEM após o backend calcular as opções permitidas.
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
  v_editor jsonb;
  v_legacy_data jsonb;
begin
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then
    return jsonb_build_object('ok',false,'reason','flow_session_not_found');
  end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then
    return jsonb_build_object('ok',false,'reason','flow_session_inactive');
  end if;
  v_context:=coalesce(s.context,'{}'::jsonb);

  if p_action='data_exchange' and coalesce(p_screen,'')='PERSONALIZAR'
     and coalesce(s.flow_current_screen,'')='PERSONALIZAR' and v_trigger='basket_customize_v3' then
    if v_choice='continue' then
      v_legacy_data:=jsonb_set(coalesce(p_data,'{}'::jsonb),'{trigger}','"basket_customize"'::jsonb,true);
      return public.handle_whatsapp_flow_commercial_exchange_v2(p_session_id,p_conversation_id,p_action,p_screen,v_legacy_data);
    end if;
    if v_choice<>'edit' then
      return jsonb_build_object('ok',false,'reason','customize_action_required');
    end if;
    begin v_basket_id:=(v_context->>'basket_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','basket_context_missing'); end;
    begin v_product_id:=(p_data->>'product_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_id'); end;
    v_adjust:=public.get_whatsapp_flow_basket_adjustment_options_v1(v_basket_id,v_product_id);
    update public.experience_sessions
       set context=v_context||jsonb_build_object('flow_adjust_product_id',v_product_id),
           flow_current_screen='AJUSTAR_ITEM',flow_state_version=flow_state_version+1,updated_at=now()
     where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','AJUSTAR_ITEM','data',jsonb_build_object(
      'product_name',v_adjust->>'product_name',
      'current_quantity',trim(to_char((v_adjust->>'current_quantity')::numeric,'FM999990D##')),
      'allowed_quantities',v_adjust->'allowed_quantities',
      'policy_note',case
        when coalesce((v_adjust->'policy'->>'removal_allowed')::boolean,false) then 'Escolha a nova quantidade. Zero retira este item da cesta.'
        else 'Escolha uma das quantidades permitidas para este item.'
      end
    ))));
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
        'product_name',v_adjust->>'product_name',
        'current_quantity',trim(to_char((v_adjust->>'current_quantity')::numeric,'FM999990D##')),
        'allowed_quantities',v_adjust->'allowed_quantities',
        'policy_note','Essa alteração não é permitida para este item.'
      )));
    end if;
    v_context:=(v_context||jsonb_build_object('flow_basket_selection',v_patch->'selection'))-'flow_adjust_product_id';
    v_editor:=public.get_whatsapp_flow_basket_editor_v1(v_basket_id);
    update public.experience_sessions
       set context=v_context,flow_current_screen='PERSONALIZAR',flow_state_version=flow_state_version+1,updated_at=now()
     where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PERSONALIZAR','data',jsonb_build_object(
      'basket_name',v_editor->>'basket_name','basket_price',v_editor->>'basket_price',
      'basket_note','Os componentes da cesta não exibem preço individual.',
      'items_summary',v_patch->>'summary','actions',v_editor->'actions','items',v_editor->'items','error_text','Alteração salva.'
    )));
  end if;

  return public.handle_whatsapp_flow_commercial_exchange_v2(p_session_id,p_conversation_id,p_action,p_screen,p_data);
end;
$$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v3(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v3(uuid,uuid,text,text,jsonb) to service_role;

update public.experience_definitions
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
  'flow_json_version','v3',
  'basket_adjustment_screen','AJUSTAR_ITEM',
  'basket_customize_trigger','basket_customize_v3'
),updated_at=now()
where slug='flow-cestas-comercial-v1';

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
