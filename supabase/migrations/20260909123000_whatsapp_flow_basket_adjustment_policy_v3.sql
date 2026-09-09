begin;

-- Dona Antônia — WhatsApp Flow Cestas Run 8
-- Prepara edição de componente em duas etapas, separando remoção, redução e aumento.
-- Não ativa Flow, Orchestrator, escrita comercial ou Bling.

create or replace function public.get_whatsapp_flow_basket_adjustment_options_v1(
  p_basket_id uuid,
  p_product_id uuid
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
  v_min numeric;
  v_max numeric;
  v_options jsonb;
  v_can_remove boolean;
  v_can_decrease boolean;
  v_can_increase boolean;
begin
  select * into b from public.basket_templates
   where id=p_basket_id and is_active=true and is_whatsapp_active=true;
  if not found then raise exception 'basket_not_available'; end if;

  select * into bi from public.basket_template_items
   where basket_id=b.id and product_id=p_product_id;
  if not found then raise exception 'basket_component_not_found'; end if;

  select * into p from public.products where id=p_product_id;
  if not found then raise exception 'product_missing'; end if;

  v_min:=coalesce(bi.min_quantity,case when bi.removable then 0 else bi.quantity end);
  v_max:=coalesce(bi.max_quantity,bi.quantity);
  v_can_remove:=coalesce(bi.removable,false) and v_min=0;
  v_can_decrease:=coalesce(bi.quantity_editable,false) and v_min<bi.quantity;
  v_can_increase:=coalesce(bi.quantity_editable,false) and v_max>bi.quantity;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',g::text,
    'title',case
      when g=0 then 'Retirar da cesta'
      when g=bi.quantity then trim(to_char(g,'FM999990D##'))||' · quantidade atual'
      else trim(to_char(g,'FM999990D##'))
    end
  ) order by g),'[]'::jsonb)
  into v_options
  from generate_series(ceil(v_min)::integer,floor(v_max)::integer) g
  where (g<>0 or v_can_remove)
    and (g=bi.quantity or bi.quantity_editable);

  return jsonb_build_object(
    'basket_id',b.id,
    'product_id',p.id,
    'product_name',p.name,
    'current_quantity',bi.quantity,
    'allowed_quantities',v_options,
    'policy',jsonb_build_object(
      'component_prices_visible',false,
      'removal_allowed',v_can_remove,
      'decrease_allowed',v_can_decrease,
      'increase_allowed',v_can_increase,
      'min_quantity',v_min,
      'max_quantity',v_max,
      'backend_validation_required',true
    )
  );
end;
$$;

create or replace function public.patch_whatsapp_flow_basket_selection_v2(
  p_basket_id uuid,
  p_selection jsonb,
  p_product_id uuid,
  p_quantity numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  bi public.basket_template_items%rowtype;
  v_min numeric;
  v_max numeric;
begin
  select * into bi from public.basket_template_items
   where basket_id=p_basket_id and product_id=p_product_id;
  if not found then raise exception 'basket_component_not_found'; end if;

  v_min:=coalesce(bi.min_quantity,case when bi.removable then 0 else bi.quantity end);
  v_max:=coalesce(bi.max_quantity,bi.quantity);

  if p_quantity<0 or trunc(p_quantity)<>p_quantity then
    return jsonb_build_object('valid',false,'issues',jsonb_build_array(jsonb_build_object('code','invalid_quantity')));
  end if;
  if p_quantity=0 and not coalesce(bi.removable,false) then
    return jsonb_build_object('valid',false,'issues',jsonb_build_array(jsonb_build_object('code','product_not_removable')));
  end if;
  if p_quantity<bi.quantity and p_quantity>0 and not coalesce(bi.quantity_editable,false) then
    return jsonb_build_object('valid',false,'issues',jsonb_build_array(jsonb_build_object('code','decrease_not_allowed')));
  end if;
  if p_quantity>bi.quantity and not coalesce(bi.quantity_editable,false) then
    return jsonb_build_object('valid',false,'issues',jsonb_build_array(jsonb_build_object('code','increase_not_allowed')));
  end if;
  if p_quantity<v_min or p_quantity>v_max then
    return jsonb_build_object('valid',false,'issues',jsonb_build_array(jsonb_build_object('code','quantity_out_of_range','min',v_min,'max',v_max)));
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
  v_basket_id uuid;
  v_product_id uuid;
  v_qty numeric;
  v_adjust jsonb;
  v_patch jsonb;
  v_editor jsonb;
begin
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then
    return jsonb_build_object('ok',false,'reason','flow_session_not_found');
  end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then
    return jsonb_build_object('ok',false,'reason','flow_session_inactive');
  end if;
  v_context:=coalesce(s.context,'{}'::jsonb);

  -- Contrato futuro da tela PERSONALIZAR: primeiro escolhe o item; só depois o backend devolve quantidades permitidas.
  if p_action='data_exchange' and coalesce(p_screen,'')='PERSONALIZAR'
     and coalesce(s.flow_current_screen,'')='PERSONALIZAR' and v_trigger='basket_item_prepare' then
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
        when coalesce((v_adjust->'policy'->>'removal_allowed')::boolean,false) then 'Você pode ajustar a quantidade ou retirar este item.'
        else 'Você pode ajustar apenas dentro das quantidades permitidas para este item.'
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
        'product_name',v_adjust->>'product_name','current_quantity',trim(to_char((v_adjust->>'current_quantity')::numeric,'FM999990D##')),
        'allowed_quantities',v_adjust->'allowed_quantities','policy_note','Essa alteração não é permitida para este item.'
      )));
    end if;
    v_context:=v_context||jsonb_build_object('flow_basket_selection',v_patch->'selection')-'flow_adjust_product_id';
    v_editor:=public.get_whatsapp_flow_basket_editor_v1(v_basket_id);
    update public.experience_sessions
       set context=v_context,flow_current_screen='PERSONALIZAR',flow_state_version=flow_state_version+1,updated_at=now()
     where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PERSONALIZAR','data',jsonb_build_object(
      'basket_name',v_editor->>'basket_name','basket_price',v_editor->>'basket_price',
      'basket_note','Os componentes da cesta não exibem preço individual.',
      'items_summary',v_patch->>'summary','actions',v_editor->'actions','items',v_editor->'items','quantities',jsonb_build_array(),
      'error_text','Alteração salva.'
    )));
  end if;

  return public.handle_whatsapp_flow_commercial_exchange_v2(p_session_id,p_conversation_id,p_action,p_screen,p_data);
end;
$$;

revoke all on function public.get_whatsapp_flow_basket_adjustment_options_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.patch_whatsapp_flow_basket_selection_v2(uuid,jsonb,uuid,numeric) from public,anon,authenticated;
revoke all on function public.handle_whatsapp_flow_commercial_exchange_v3(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_basket_adjustment_options_v1(uuid,uuid) to service_role;
grant execute on function public.patch_whatsapp_flow_basket_selection_v2(uuid,jsonb,uuid,numeric) to service_role;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v3(uuid,uuid,text,text,jsonb) to service_role;

update public.experience_definitions
   set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
       'handler_version','v3',
       'basket_adjustment_two_step',true,
       'basket_remove_policy_separate',true,
       'basket_increase_policy_separate',true
     ),
     metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('implementation_stage','basket_adjustment_policy_v3'),
     updated_at=now()
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
