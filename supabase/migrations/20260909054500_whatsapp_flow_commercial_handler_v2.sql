begin;

create or replace function public.get_whatsapp_flow_commercial_write_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'ready',coalesce(a.experience_orchestrator_enabled,false)
      and coalesce(a.whatsapp_flow_data_exchange_enabled,false)
      and coalesce(a.whatsapp_flow_send_enabled,false)
      and coalesce(a.whatsapp_flow_commercial_write_enabled,false),
    'orchestrator_enabled',coalesce(a.experience_orchestrator_enabled,false),
    'data_exchange_enabled',coalesce(a.whatsapp_flow_data_exchange_enabled,false),
    'send_enabled',coalesce(a.whatsapp_flow_send_enabled,false),
    'commercial_write_enabled',coalesce(a.whatsapp_flow_commercial_write_enabled,false)
  ) from public.automation_config a where a.id=1;
$$;

create or replace function public.save_whatsapp_flow_customer_checkout_v1(
  p_session_id uuid,
  p_expected_state_version integer,
  p_operation_key text,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  a public.automation_config%rowtype;
  s public.experience_sessions%rowtype;
  c public.conversations%rowtype;
  v_key text:=trim(coalesce(p_operation_key,''));
  v_fp text;
  v_existing public.whatsapp_flow_write_operations%rowtype;
  v_result jsonb;
begin
  select * into a from public.automation_config where id=1;
  if not coalesce(a.whatsapp_flow_commercial_write_enabled,false) then raise exception 'whatsapp_flow_commercial_write_disabled'; end if;
  if not a.experience_orchestrator_enabled then raise exception 'experience_orchestrator_disabled'; end if;
  if not a.whatsapp_flow_data_exchange_enabled then raise exception 'whatsapp_flow_data_exchange_disabled'; end if;
  if not a.whatsapp_flow_send_enabled then raise exception 'whatsapp_flow_send_disabled'; end if;
  if v_key !~ '^[A-Za-z0-9:_-]{8,180}$' then raise exception 'invalid_operation_key'; end if;
  v_fp:=encode(extensions.digest(convert_to(coalesce(p_data,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.whatsapp_flow_write_operations where operation_key=v_key;
  if found then
    if v_existing.session_id is distinct from p_session_id or v_existing.operation_type<>'set_customer_checkout' or v_existing.request_fingerprint<>v_fp then raise exception 'flow_write_idempotency_conflict'; end if;
    return v_existing.result||jsonb_build_object('idempotent_replay',true);
  end if;
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.status not in ('offered','open') or s.expires_at<=now() then raise exception 'experience_session_inactive'; end if;
  if s.flow_state_version is distinct from p_expected_state_version then raise exception 'flow_state_version_conflict'; end if;
  select * into c from public.conversations where id=s.conversation_id for update;
  if not found then raise exception 'conversation_not_found'; end if;
  if c.human_required or c.mode='human' then raise exception 'conversation_requires_human'; end if;

  v_result:=public.save_whatsapp_basket_customer_v2(
    c.id,
    nullif(trim(coalesce(p_data->>'name','')),''),
    nullif(trim(coalesce(p_data->>'street','')),''),
    nullif(trim(coalesce(p_data->>'complement','')),''),
    nullif(trim(coalesce(p_data->>'number','')),''),
    nullif(trim(coalesce(p_data->>'neighborhood','')),''),
    nullif(trim(coalesce(p_data->>'city','')),''),
    nullif(trim(coalesce(p_data->>'locator','')),'')
  );

  insert into public.whatsapp_flow_write_operations(operation_key,session_id,conversation_id,operation_type,request_fingerprint,result)
  values(v_key,s.id,c.id,'set_customer_checkout',v_fp,coalesce(v_result,'{}'::jsonb));
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('idempotent_replay',false);
end;
$$;

-- Handler V2: mantém o mesmo nome/contrato público, mas troca personalização livre por edição estruturada,
-- grava cesta/adicionais/upsell somente quando TODOS os gates estiverem prontos, usa resumo real do carrinho,
-- reaproveita cadastro/endereço existente e finaliza pedido localmente sem enfileirar Bling.
create or replace function public.handle_whatsapp_flow_commercial_exchange_v1(
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
  v_current text;
  v_trigger text:=coalesce(p_data->>'trigger','');
  v_context jsonb;
  v_snapshot jsonb;
  v_editor jsonb;
  v_patch jsonb;
  v_review jsonb;
  v_customer jsonb;
  v_write jsonb:=public.get_whatsapp_flow_commercial_write_readiness_v1();
  v_write_ready boolean:=coalesce((v_write->>'ready')::boolean,false);
  v_baskets jsonb;
  v_sections jsonb;
  v_terms jsonb;
  v_results jsonb;
  v_options jsonb;
  v_basket_id uuid;
  v_product_id uuid;
  v_section text;
  v_term text;
  v_query text;
  v_title text;
  v_product jsonb;
  v_selection jsonb;
  v_qty numeric;
  v_action text;
  v_state integer;
  v_op text;
  v_write_result jsonb;
  v_customer_registered boolean;
  v_customer_obj jsonb;
  v_address_obj jsonb;
  v_payment text;
  v_order jsonb;
begin
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then return jsonb_build_object('ok',false,'reason','flow_session_inactive'); end if;
  v_current:=coalesce(s.flow_current_screen,'');
  v_context:=coalesce(s.context,'{}'::jsonb);
  v_state:=coalesce(s.flow_state_version,0);

  if p_action='INIT' then
    v_snapshot:=public.get_whatsapp_flow_commercial_snapshot_v1(p_conversation_id);
    select coalesce(jsonb_agg(jsonb_build_object('id',e->>'id','title',(e->>'name')||' · R$ '||replace(e->>'price','.',','),'description','Toque para personalizar')),'[]'::jsonb)
      into v_baskets from jsonb_array_elements(coalesce(v_snapshot->'baskets','[]'::jsonb)) e;
    update public.experience_sessions set flow_current_screen='CESTAS',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','CESTAS','data',jsonb_build_object('intro','Escolha uma cesta básica para começar.','baskets',v_baskets)));
  end if;

  if p_action<>'data_exchange' then return jsonb_build_object('ok',false,'reason','flow_action_not_handled'); end if;
  if coalesce(p_screen,'')<>v_current then return jsonb_build_object('ok',false,'reason','flow_transition_invalid','expected_screen',v_current,'received_screen',p_screen); end if;

  if v_current='CESTAS' and v_trigger='basket_selected' then
    begin v_basket_id:=(p_data->>'basket_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_basket_id'); end;
    v_editor:=public.get_whatsapp_flow_basket_editor_v1(v_basket_id);
    if v_write_ready then
      v_op:=replace(s.id::text,'-','')||':basket:'||v_state::text;
      v_write_result:=public.apply_whatsapp_flow_commercial_write_v1(s.id,v_state,v_op,'start_basket',jsonb_build_object('basket_id',v_basket_id));
    end if;
    update public.experience_sessions set context=v_context||jsonb_build_object('basket_id',v_basket_id,'flow_basket_selection',v_editor->'selection'),flow_current_screen='PERSONALIZAR',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PERSONALIZAR','data',jsonb_build_object('basket_name',v_editor->>'basket_name','basket_price',v_editor->>'basket_price','basket_note','Os componentes da cesta não exibem preço individual.','items_summary',v_editor->>'summary','actions',v_editor->'actions','items',v_editor->'items','quantities',v_editor->'quantities','error_text','')));
  end if;

  if v_current='PERSONALIZAR' and v_trigger='basket_customize' then
    begin v_basket_id:=(v_context->>'basket_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','basket_context_missing'); end;
    v_editor:=public.get_whatsapp_flow_basket_editor_v1(v_basket_id);
    v_selection:=coalesce(v_context->'flow_basket_selection',v_editor->'selection');
    v_action:=lower(trim(coalesce(p_data->>'customize_action','')));
    if v_action='edit' then
      begin v_product_id:=(p_data->>'product_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_id'); end;
      begin v_qty:=(p_data->>'quantity')::numeric; exception when others then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end;
      v_patch:=public.patch_whatsapp_flow_basket_selection_v1(v_basket_id,v_selection,v_product_id,v_qty);
      if not coalesce((v_patch->>'valid')::boolean,false) then
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PERSONALIZAR','data',jsonb_build_object('basket_name',v_editor->>'basket_name','basket_price',v_editor->>'basket_price','basket_note','Alteração não permitida para este item.','items_summary',v_editor->>'summary','actions',v_editor->'actions','items',v_editor->'items','quantities',v_editor->'quantities','error_text','Confira a quantidade permitida deste produto.')));
      end if;
      update public.experience_sessions set context=v_context||jsonb_build_object('flow_basket_selection',v_patch->'selection'),updated_at=now() where id=s.id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PERSONALIZAR','data',jsonb_build_object('basket_name',v_editor->>'basket_name','basket_price',v_editor->>'basket_price','basket_note','Alteração salva. Você pode alterar outro item ou concluir.','items_summary',v_patch->>'summary','actions',v_editor->'actions','items',v_editor->'items','quantities',v_editor->'quantities','error_text','')));
    end if;
    if v_action<>'continue' then return jsonb_build_object('ok',false,'reason','customize_action_required'); end if;
    if v_write_ready then
      v_op:=replace(s.id::text,'-','')||':selection:'||v_state::text;
      v_write_result:=public.apply_whatsapp_flow_commercial_write_v1(s.id,v_state,v_op,'apply_basket_selection',jsonb_build_object('selection',v_selection));
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',section_key,'title',section_title) order by sort_order,section_title),'[]'::jsonb) into v_sections from public.get_whatsapp_flow_sections_v1();
    v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
    update public.experience_sessions set flow_current_screen='SECOES',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES','data',jsonb_build_object('sections',v_sections,'cart_total',case when v_write_ready then v_review->>'total' else 'Prévia da cesta pronta' end)));
  end if;

  if v_current='SECOES' and v_trigger='section_selected' then
    v_section:=lower(trim(coalesce(p_data->>'section_key','')));
    select coalesce(jsonb_agg(jsonb_build_object('id',term_key,'title',term_title) order by sort_order,term_title),'[]'::jsonb) into v_terms from public.get_whatsapp_flow_search_terms_v1(v_section);
    if jsonb_array_length(v_terms)=0 then return jsonb_build_object('ok',false,'reason','section_not_found'); end if;
    select min(section_title) into v_title from public.whatsapp_flow_search_terms where enabled and section_key=v_section;
    update public.experience_sessions set context=v_context||jsonb_build_object('flow_section_key',v_section),flow_current_screen='TERMOS',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','TERMOS','data',jsonb_build_object('section_title',v_title,'terms',v_terms)));
  end if;

  if v_current='TERMOS' and v_trigger='term_selected' then
    v_section:=coalesce(v_context->>'flow_section_key',''); v_term:=lower(trim(coalesce(p_data->>'term_key','')));
    select search_query,term_title into v_query,v_title from public.whatsapp_flow_search_terms where enabled and section_key=v_section and term_key=v_term;
    if v_query is null then return jsonb_build_object('ok',false,'reason','search_term_not_found'); end if;
    v_results:=public.get_whatsapp_flow_product_results_v1(v_query,12);
    select coalesce(jsonb_agg(jsonb_build_object('id',e->>'id','title',left(e->>'name',70)||' · R$ '||replace(e->>'price','.',','),'description',left(trim(concat_ws(' · ',nullif(e->>'brand',''),nullif(e->>'packaging',''))),90))),'[]'::jsonb) into v_options from jsonb_array_elements(coalesce(v_results->'products','[]'::jsonb)) e;
    update public.experience_sessions set context=v_context||jsonb_build_object('flow_query',v_query,'flow_query_title',v_title),flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS','data',jsonb_build_object('query_title',v_title,'result_note',jsonb_array_length(v_options)::text||' opções disponíveis','products',v_options)));
  end if;

  if v_current='PRODUTOS' and v_trigger='product_selected' then
    begin v_product_id:=(p_data->>'product_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_id'); end;
    v_product:=public.get_whatsapp_sellable_product_v1(v_product_id);
    if v_product is null then return jsonb_build_object('ok',false,'reason','product_not_sellable'); end if;
    update public.experience_sessions set context=v_context||jsonb_build_object('flow_product_id',v_product_id),flow_current_screen='PRODUTO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTO','data',jsonb_build_object('product_name',v_product->>'name','product_price','R$ '||replace(v_product->>'price','.',','),'product_description',trim(concat_ws(' · ',nullif(v_product->>'brand',''),nullif(v_product->>'packaging',''),'Disponível para entrega')),'product_image_url',coalesce(v_product->>'image_url',''),'product_image_base64','','product_id',v_product_id::text,'quantities',(select jsonb_agg(jsonb_build_object('id',g::text,'title',g::text)) from generate_series(1,10) g))));
  end if;

  if v_current='PRODUTO' and v_trigger='add_product' then
    begin v_product_id:=(p_data->>'product_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_id'); end;
    begin v_qty:=(p_data->>'quantity')::numeric; exception when others then return jsonb_build_object('ok',false,'reason','invalid_quantity'); end;
    if v_write_ready then
      v_op:=replace(s.id::text,'-','')||':addon:'||v_state::text;
      v_write_result:=public.apply_whatsapp_flow_commercial_write_v1(s.id,v_state,v_op,'set_addon',jsonb_build_object('product_id',v_product_id,'quantity',v_qty));
    else
      update public.experience_sessions set context=v_context||jsonb_build_object('flow_pending_product',jsonb_build_object('product_id',v_product_id,'quantity',v_qty)),updated_at=now() where id=s.id;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',u.product_id,'title',left(u.name,70)||' · R$ '||replace(u.price::text,'.',','),'description',left(coalesce(u.reason,'Sugestão opcional'),90)) order by u.score desc),'[]'::jsonb) into v_options from public.get_cart_aware_recommendations(p_conversation_id,6,'upsell') u;
    update public.experience_sessions set flow_current_screen='UPSELL',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','UPSELL','data',jsonb_build_object('upsell_note','Sugestões opcionais. Você pode continuar sem adicionar nada.','products',v_options)));
  end if;

  if v_current='UPSELL' and v_trigger='upsell_continue' then
    if nullif(trim(coalesce(p_data->>'product_id','')),'') is not null and v_write_ready then
      begin v_product_id:=(p_data->>'product_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_product_id'); end;
      v_op:=replace(s.id::text,'-','')||':upsell:'||v_state::text;
      v_write_result:=public.apply_whatsapp_flow_commercial_write_v1(s.id,v_state,v_op,'set_upsell',jsonb_build_object('product_id',v_product_id,'quantity',1));
    end if;
    v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
    update public.experience_sessions set context=v_context||jsonb_build_object('flow_pending_upsell_product_id',nullif(p_data->>'product_id','')),flow_current_screen='REVISAO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','REVISAO','data',jsonb_build_object('summary',case when v_write_ready then v_review->>'summary' else 'Prévia pronta para homologação segura.' end,'total',case when v_write_ready then v_review->>'total' else '' end,'pricing_note',coalesce(v_review->>'pricing_note','A cesta possui preço comercial próprio; componentes não têm preço individual exibido.'))));
  end if;

  if v_current='REVISAO' and v_trigger='review_confirm' then
    v_customer:=public.get_whatsapp_basket_customer_status_v1(p_conversation_id);
    v_customer_registered:=coalesce((v_customer->>'registered')::boolean,false);
    v_customer_obj:=coalesce(v_customer->'customer','{}'::jsonb);
    v_address_obj:=coalesce(v_customer->'address','{}'::jsonb);
    update public.experience_sessions set flow_current_screen='CLIENTE',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','CLIENTE','data',jsonb_build_object('customer_name',coalesce(v_customer_obj->>'name',''),'address_summary',trim(concat_ws(', ',nullif(v_address_obj->>'street',''),nullif(v_address_obj->>'house',''),nullif(v_address_obj->>'neighborhood',''),nullif(v_address_obj->>'city',''))),'customer_registered',v_customer_registered,'name_value',coalesce(v_customer_obj->>'name',''),'street_value',coalesce(v_address_obj->>'street',''),'number_value',coalesce(v_address_obj->>'house',''),'complement_value',coalesce(v_address_obj->>'block',''),'neighborhood_value',coalesce(v_address_obj->>'neighborhood',''),'city_value',coalesce(v_address_obj->>'city','Cuiabá'),'locator_value',coalesce(v_address_obj->>'locator',''),'error_text','','payment_options',jsonb_build_array(jsonb_build_object('id','pix','title','PIX na entrega'),jsonb_build_object('id','dinheiro','title','Dinheiro na entrega'),jsonb_build_object('id','cartao_entrega','title','Cartão na entrega')))));
  end if;

  if v_current='CLIENTE' and v_trigger='checkout_confirm' then
    v_payment:=lower(trim(coalesce(p_data->>'payment_method','')));
    v_customer:=public.get_whatsapp_basket_customer_status_v1(p_conversation_id);
    v_customer_registered:=coalesce((v_customer->>'registered')::boolean,false);
    if v_write_ready and (not v_customer_registered or nullif(trim(coalesce(p_data->>'name','')),'') is not null) then
      v_op:=replace(s.id::text,'-','')||':customer:'||v_state::text;
      v_write_result:=public.save_whatsapp_flow_customer_checkout_v1(s.id,v_state,v_op,jsonb_build_object('name',p_data->>'name','street',p_data->>'street','number',p_data->>'number','complement',p_data->>'complement','neighborhood',p_data->>'neighborhood','city',p_data->>'city','locator',p_data->>'locator'));
      v_customer:=public.get_whatsapp_basket_customer_status_v1(p_conversation_id);
      v_customer_registered:=coalesce((v_customer->>'registered')::boolean,false);
    end if;
    if v_write_ready and not v_customer_registered then
      v_customer_obj:=coalesce(v_customer->'customer','{}'::jsonb); v_address_obj:=coalesce(v_customer->'address','{}'::jsonb);
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','CLIENTE','data',jsonb_build_object('customer_name',coalesce(v_customer_obj->>'name',''),'address_summary','','customer_registered',false,'name_value',coalesce(v_customer_obj->>'name',''),'street_value',coalesce(v_address_obj->>'street',''),'number_value',coalesce(v_address_obj->>'house',''),'complement_value',coalesce(v_address_obj->>'block',''),'neighborhood_value',coalesce(v_address_obj->>'neighborhood',''),'city_value',coalesce(v_address_obj->>'city','Cuiabá'),'locator_value',coalesce(v_address_obj->>'locator',''),'error_text','Complete nome e endereço de entrega para finalizar.','payment_options',jsonb_build_array(jsonb_build_object('id','pix','title','PIX na entrega'),jsonb_build_object('id','dinheiro','title','Dinheiro na entrega'),jsonb_build_object('id','cartao_entrega','title','Cartão na entrega')))));
    end if;
    if v_write_ready then
      v_op:=replace(s.id::text,'-','')||':order:'||v_state::text;
      v_order:=public.finalize_whatsapp_flow_commercial_order_v1(s.id,v_state,v_op,v_payment,p_data->>'notes');
      v_review:=public.format_whatsapp_flow_cart_review_v1(p_conversation_id);
    else
      update public.experience_sessions set context=v_context||jsonb_build_object('flow_payment_method',v_payment,'flow_checkout_preview',true),updated_at=now() where id=s.id;
    end if;
    update public.experience_sessions set flow_current_screen='FINALIZAR',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','FINALIZAR','data',jsonb_build_object('confirmation',case when v_write_ready then 'Pedido confirmado com sucesso.' else 'Pedido preparado para homologação.' end,'final_summary',case when v_write_ready then coalesce(v_review->>'summary','') else 'A gravação comercial continua protegida pelo gate de homologação.' end,'final_total',case when v_write_ready then coalesce(v_review->>'total','') else '' end,'next_step','Ao voltar para a conversa, envie sua localização para confirmar o ponto da entrega.','write_enabled',v_write_ready)));
  end if;

  return jsonb_build_object('ok',false,'reason','flow_action_not_handled','expected_screen',v_current,'trigger',v_trigger);
end;
$$;

revoke all on function public.get_whatsapp_flow_commercial_write_readiness_v1() from public,anon,authenticated;
revoke all on function public.save_whatsapp_flow_customer_checkout_v1(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_commercial_write_readiness_v1() to service_role;
grant execute on function public.save_whatsapp_flow_customer_checkout_v1(uuid,integer,text,jsonb) to service_role;

commit;