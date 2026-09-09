begin;

-- Dona Antônia — Flow Comercial V5
-- UX profissional, forward-only e segura: 9 cestas com mídia, até 3 ajustes de cesta,
-- categorias múltiplas, busca direta, catálogo sob demanda, identificação/prefill e checkout.
-- Esta migration NÃO ativa nenhum gate.

create or replace function public.handle_whatsapp_flow_commercial_exchange_v5(
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
  v_screen text:=coalesce(p_screen,'');
  v_canonical text:=coalesce(p_screen,'');
  v_round integer:=1;
  v_trigger text:=coalesce(p_data->>'trigger','');
  v_action text:=lower(trim(coalesce(p_data->>'extras_action','')));
  v_result jsonb;
  v_second jsonb;
  v_response jsonb;
  v_next text;
  v_basket_id uuid;
  v_basket_image text;
  v_baskets jsonb;
  v_sections jsonb;
  v_section_keys text[]:=array[]::text[];
  v_terms jsonb;
  v_query text;
  v_query_title text;
  v_results jsonb;
  v_options jsonb;
  v_product_id uuid;
  v_customer jsonb;
  v_customer_obj jsonb;
  v_address_obj jsonb;
begin
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then
    return jsonb_build_object('ok',false,'reason','flow_session_not_found');
  end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then
    return jsonb_build_object('ok',false,'reason','flow_session_inactive');
  end if;

  if v_screen ~ '^(PERSONALIZAR|AJUSTAR_ITEM|SECOES|TERMOS|PRODUTOS|PRODUTO)_[123]$' then
    v_round:=right(v_screen,1)::integer;
    v_canonical:=regexp_replace(v_screen,'_[123]$','');
  end if;

  -- INIT: mantém o estado já homologado no handler V4, mas retorna as nove cestas
  -- com URL de mídia para a Edge Function normalizar em base64 JPEG/PNG.
  if p_action='INIT' then
    v_result:=public.handle_whatsapp_flow_commercial_exchange_v4(
      p_session_id,p_conversation_id,p_action,p_screen,p_data
    );
    if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',b.id::text,
      'title',left(b.display_name||' · R$ '||replace(to_char(b.base_price,'FM999990.00'),'.',','),30),
      'description','Toque para ver e personalizar',
      'image_url',coalesce(b.image_url,''),
      'alt-text',left('Cesta '||b.display_name,80)
    ) order by b.sort_order,b.display_name),'[]'::jsonb)
      into v_baskets
      from public.get_whatsapp_simple_baskets_v1() b;
    v_response:=v_result->'response';
    v_response:=jsonb_set(v_response,'{data,baskets}',v_baskets,true);
    v_response:=jsonb_set(v_response,'{data,intro}',to_jsonb('Escolha uma das 9 cestas. Você poderá conferir os itens e personalizar antes de finalizar.'::text),true);
    return jsonb_set(v_result,'{response}',v_response,false);
  end if;

  -- Personalização unrolled: permite até três ajustes sem criar ciclo no routing_model.
  if v_canonical='PERSONALIZAR' then
    v_result:=public.handle_whatsapp_flow_commercial_exchange_v3(
      p_session_id,p_conversation_id,p_action,'PERSONALIZAR',p_data
    );
    if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
    v_response:=v_result->'response';
    v_next:=coalesce(v_response->>'screen','');

    begin
      v_basket_id:=(select (context->>'basket_id')::uuid from public.experience_sessions where id=p_session_id);
      select image_url into v_basket_image from public.basket_templates where id=v_basket_id;
    exception when others then
      v_basket_image:='';
    end;

    if v_next='AJUSTAR_ITEM' then
      v_response:=jsonb_set(v_response,'{screen}',to_jsonb('AJUSTAR_ITEM_'||v_round::text),false);
    elsif v_next='SECOES' then
      v_response:=jsonb_set(v_response,'{screen}',to_jsonb('SECOES_1'::text),false);
    elsif v_next='PERSONALIZAR' then
      v_response:=jsonb_set(v_response,'{screen}',to_jsonb('PERSONALIZAR_'||v_round::text),false);
    end if;
    if coalesce(v_response->>'screen','') like 'PERSONALIZAR_%' then
      v_response:=jsonb_set(v_response,'{data,basket_image_url}',to_jsonb(coalesce(v_basket_image,'')),true);
      v_response:=jsonb_set(v_response,'{data,basket_image_base64}',to_jsonb(''::text),true);
      v_response:=jsonb_set(v_response,'{data,has_basket_image}',to_jsonb(false),true);
    end if;
    return jsonb_set(v_result,'{response}',v_response,false);
  end if;

  if v_canonical='AJUSTAR_ITEM' then
    v_result:=public.handle_whatsapp_flow_commercial_exchange_v3(
      p_session_id,p_conversation_id,p_action,'AJUSTAR_ITEM',p_data
    );
    if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
    v_response:=v_result->'response';
    v_next:=coalesce(v_response->>'screen','');

    if v_next='PERSONALIZAR' and v_round<3 then
      begin
        v_basket_id:=(select (context->>'basket_id')::uuid from public.experience_sessions where id=p_session_id);
        select image_url into v_basket_image from public.basket_templates where id=v_basket_id;
      exception when others then
        v_basket_image:='';
      end;
      v_response:=jsonb_set(v_response,'{screen}',to_jsonb('PERSONALIZAR_'||(v_round+1)::text),false);
      v_response:=jsonb_set(v_response,'{data,basket_image_url}',to_jsonb(coalesce(v_basket_image,'')),true);
      v_response:=jsonb_set(v_response,'{data,basket_image_base64}',to_jsonb(''::text),true);
      v_response:=jsonb_set(v_response,'{data,has_basket_image}',to_jsonb(false),true);
      return jsonb_set(v_result,'{response}',v_response,false);
    end if;

    if v_next='PERSONALIZAR' and v_round>=3 then
      -- Terceiro ajuste encerra a edição estruturada e segue, sem loop.
      v_second:=public.handle_whatsapp_flow_commercial_exchange_v3(
        p_session_id,p_conversation_id,'data_exchange','PERSONALIZAR',
        jsonb_build_object('trigger','basket_customize_v3','customize_action','continue')
      );
      if not coalesce((v_second->>'ok')::boolean,false) then return v_second; end if;
      v_response:=v_second->'response';
      if coalesce(v_response->>'screen','')='SECOES' then
        v_response:=jsonb_set(v_response,'{screen}',to_jsonb('SECOES_1'::text),false);
      end if;
      return jsonb_set(v_second,'{response}',v_response,false);
    end if;

    return v_result;
  end if;

  -- Seções: múltipla escolha de categorias ou busca direta, sempre sob demanda.
  if v_canonical='SECOES' and p_action='data_exchange' and v_trigger='extras_continue_v2' then
    if coalesce(s.flow_current_screen,'')<>'SECOES' then
      return jsonb_build_object('ok',false,'reason','flow_transition_invalid','expected_screen',s.flow_current_screen,'received_screen',p_screen);
    end if;

    if v_action='browse' then
      if jsonb_typeof(p_data->'section_keys')='array' then
        select coalesce(array_agg(x.value order by x.ord),array[]::text[])
          into v_section_keys
          from jsonb_array_elements_text(p_data->'section_keys') with ordinality x(value,ord)
         where x.value ~ '^[a-z0-9_-]{1,50}$';
      end if;
      if coalesce(array_length(v_section_keys,1),0)=0 then
        v_response:=jsonb_build_object('screen','SECOES_'||v_round::text,'data',public.get_whatsapp_flow_extras_screen_v2(p_conversation_id,'Marque pelo menos uma categoria.'));
        return jsonb_build_object('ok',true,'response',v_response);
      end if;
      if array_length(v_section_keys,1)>3 then
        v_section_keys:=v_section_keys[1:3];
      end if;

      select coalesce(jsonb_agg(jsonb_build_object(
        'id',w.section_key||'::'||w.term_key,
        'title',left(w.term_title,30),
        'description',left(w.section_title,80)
      ) order by w.sort_order,w.section_title,w.term_title),'[]'::jsonb)
        into v_terms
        from public.whatsapp_flow_search_terms w
       where w.enabled and w.section_key=any(v_section_keys);

      if jsonb_array_length(v_terms)=0 then
        v_response:=jsonb_build_object('screen','SECOES_'||v_round::text,'data',public.get_whatsapp_flow_extras_screen_v2(p_conversation_id,'Nenhum tipo de produto disponível nessas categorias.'));
        return jsonb_build_object('ok',true,'response',v_response);
      end if;

      update public.experience_sessions
         set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_section_keys',to_jsonb(v_section_keys)),
             flow_current_screen='TERMOS',flow_state_version=flow_state_version+1,updated_at=now()
       where id=p_session_id;

      return jsonb_build_object('ok',true,'response',jsonb_build_object(
        'screen','TERMOS_'||v_round::text,
        'data',jsonb_build_object('section_title','O que você procura?','terms',v_terms)
      ));
    end if;

    if v_action='direct_search' then
      v_query:=left(trim(coalesce(p_data->>'direct_query','')),80);
      if length(v_query)<2 then
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES_'||v_round::text,'data',public.get_whatsapp_flow_extras_screen_v2(p_conversation_id,'Digite pelo menos 2 letras para buscar.')));
      end if;
      v_results:=public.get_whatsapp_flow_product_results_v1(v_query,12);
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',e->>'id',
        'title',left(e->>'name',16)||' · R$ '||replace(e->>'price','.',','),
        'description',left(trim(concat_ws(' · ',e->>'name',nullif(e->>'brand',''),nullif(e->>'packaging',''))),180)
      )),'[]'::jsonb)
        into v_options
        from jsonb_array_elements(coalesce(v_results->'products','[]'::jsonb)) e;
      if jsonb_array_length(v_options)=0 then
        return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES_'||v_round::text,'data',public.get_whatsapp_flow_extras_screen_v2(p_conversation_id,'Nenhum produto disponível nessa busca.')));
      end if;
      update public.experience_sessions
         set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_query',v_query,'flow_query_title',v_query),
             flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now()
       where id=p_session_id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS_'||v_round::text,'data',jsonb_build_object(
        'query_title',left(v_query,80),'result_note',jsonb_array_length(v_options)::text||' opções disponíveis','products',v_options
      )));
    end if;

    if v_action='finish' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',u.product_id,
        'title',left(u.name,16)||' · R$ '||replace(u.price::text,'.',','),
        'description',left(u.name||' · '||coalesce(u.reason,'Sugestão opcional'),180)
      ) order by u.score desc),'[]'::jsonb)
        into v_options
        from public.get_cart_aware_recommendations(p_conversation_id,6,'upsell') u;
      update public.experience_sessions
         set flow_current_screen='UPSELL',flow_state_version=flow_state_version+1,updated_at=now()
       where id=p_session_id;
      return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','UPSELL','data',jsonb_build_object(
        'upsell_note','Sugestões opcionais de acordo com seu pedido. Você pode seguir sem adicionar nada.',
        'products',v_options
      )));
    end if;

    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','SECOES_'||v_round::text,'data',public.get_whatsapp_flow_extras_screen_v2(p_conversation_id,'Escolha como deseja continuar.')));
  end if;

  -- Termos compostos por categoria: section::term evita colisão entre categorias.
  if v_canonical='TERMOS' and p_action='data_exchange' and v_trigger='term_selected_v2' then
    if coalesce(s.flow_current_screen,'')<>'TERMOS' then
      return jsonb_build_object('ok',false,'reason','flow_transition_invalid');
    end if;
    if position('::' in coalesce(p_data->>'term_id',''))<2 then
      return jsonb_build_object('ok',false,'reason','search_term_not_found');
    end if;
    select w.search_query,w.term_title
      into v_query,v_query_title
      from public.whatsapp_flow_search_terms w
     where w.enabled
       and w.section_key=split_part(p_data->>'term_id','::',1)
       and w.term_key=split_part(p_data->>'term_id','::',2)
     limit 1;
    if v_query is null then return jsonb_build_object('ok',false,'reason','search_term_not_found'); end if;

    v_results:=public.get_whatsapp_flow_product_results_v1(v_query,12);
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',e->>'id',
      'title',left(e->>'name',16)||' · R$ '||replace(e->>'price','.',','),
      'description',left(trim(concat_ws(' · ',e->>'name',nullif(e->>'brand',''),nullif(e->>'packaging',''))),180)
    )),'[]'::jsonb)
      into v_options
      from jsonb_array_elements(coalesce(v_results->'products','[]'::jsonb)) e;

    update public.experience_sessions
       set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('flow_query',v_query,'flow_query_title',v_query_title),
           flow_current_screen='PRODUTOS',flow_state_version=flow_state_version+1,updated_at=now()
     where id=p_session_id;

    return jsonb_build_object('ok',true,'response',jsonb_build_object('screen','PRODUTOS_'||v_round::text,'data',jsonb_build_object(
      'query_title',v_query_title,'result_note',jsonb_array_length(v_options)::text||' opções disponíveis','products',v_options
    )));
  end if;

  -- Demais telas seguem o handler V4, que já faz unroll de até 3 adicionais.
  v_result:=public.handle_whatsapp_flow_commercial_exchange_v4(
    p_session_id,p_conversation_id,p_action,p_screen,p_data
  );
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  v_response:=v_result->'response';
  v_next:=coalesce(v_response->>'screen','');

  -- Primeira entrada na personalização.
  if v_next='PERSONALIZAR' then
    begin
      v_basket_id:=(select (context->>'basket_id')::uuid from public.experience_sessions where id=p_session_id);
      select image_url into v_basket_image from public.basket_templates where id=v_basket_id;
    exception when others then
      v_basket_image:='';
    end;
    v_response:=jsonb_set(v_response,'{screen}',to_jsonb('PERSONALIZAR_1'::text),false);
    v_response:=jsonb_set(v_response,'{data,basket_image_url}',to_jsonb(coalesce(v_basket_image,'')),true);
    v_response:=jsonb_set(v_response,'{data,basket_image_base64}',to_jsonb(''::text),true);
    v_response:=jsonb_set(v_response,'{data,has_basket_image}',to_jsonb(false),true);
  end if;

  -- Prefill explícito no checkout e opções de pagamento completas na entrega.
  if v_next='CLIENTE' then
    v_customer:=public.get_whatsapp_basket_customer_status_v1(p_conversation_id);
    v_customer_obj:=coalesce(v_customer->'customer','{}'::jsonb);
    v_address_obj:=coalesce(v_customer->'address','{}'::jsonb);
    v_response:=jsonb_set(v_response,'{data,customer_registered}',to_jsonb(coalesce((v_customer->>'registered')::boolean,false)),true);
    v_response:=jsonb_set(v_response,'{data,name_value}',to_jsonb(coalesce(v_customer_obj->>'name','')),true);
    v_response:=jsonb_set(v_response,'{data,street_value}',to_jsonb(coalesce(v_address_obj->>'street','')),true);
    v_response:=jsonb_set(v_response,'{data,number_value}',to_jsonb(coalesce(v_address_obj->>'house','')),true);
    v_response:=jsonb_set(v_response,'{data,complement_value}',to_jsonb(coalesce(v_address_obj->>'block','')),true);
    v_response:=jsonb_set(v_response,'{data,neighborhood_value}',to_jsonb(coalesce(v_address_obj->>'neighborhood','')),true);
    v_response:=jsonb_set(v_response,'{data,city_value}',to_jsonb(coalesce(nullif(v_address_obj->>'city',''),'Cuiabá')),true);
    v_response:=jsonb_set(v_response,'{data,locator_value}',to_jsonb(coalesce(v_address_obj->>'locator','')),true);
    v_response:=jsonb_set(v_response,'{data,payment_options}',jsonb_build_array(
      jsonb_build_object('id','pix','title','PIX na entrega'),
      jsonb_build_object('id','dinheiro','title','Dinheiro na entrega'),
      jsonb_build_object('id','cartao_entrega','title','Cartão crédito/débito'),
      jsonb_build_object('id','cartao_alimentacao','title','Alimentação/refeição')
    ),true);
  end if;

  return jsonb_set(v_result,'{response}',v_response,false);
end;
$$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v5(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v5(uuid,uuid,text,text,jsonb) to service_role;

-- Amplia apenas a enumeração interna do pagamento presencial; nada é cobrado online.
create or replace function public.finalize_whatsapp_flow_commercial_order_v1(
  p_session_id uuid,
  p_expected_state_version integer,
  p_operation_key text,
  p_payment_method text,
  p_notes text default null
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
  v_cart jsonb;
  v_customer jsonb;
  v_address jsonb;
  v_order jsonb;
  v_method text:=lower(trim(coalesce(p_payment_method,'')));
  v_key text:=trim(coalesce(p_operation_key,''));
begin
  select * into a from public.automation_config where id=1;
  if not coalesce(a.whatsapp_flow_commercial_write_enabled,false) then raise exception 'whatsapp_flow_commercial_write_disabled'; end if;
  if not a.experience_orchestrator_enabled then raise exception 'experience_orchestrator_disabled'; end if;
  if not a.whatsapp_flow_data_exchange_enabled then raise exception 'whatsapp_flow_data_exchange_disabled'; end if;
  if not a.whatsapp_flow_send_enabled then raise exception 'whatsapp_flow_send_disabled'; end if;
  if v_key !~ '^[A-Za-z0-9:_-]{8,180}$' then raise exception 'invalid_operation_key'; end if;
  if v_method not in ('pix','dinheiro','cartao_entrega','cartao_alimentacao') then raise exception 'invalid_payment_method'; end if;

  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.status not in ('offered','open') or s.expires_at<=now() then raise exception 'experience_session_inactive'; end if;
  if s.flow_state_version is distinct from p_expected_state_version then raise exception 'flow_state_version_conflict'; end if;
  select * into c from public.conversations where id=s.conversation_id for update;
  if not found then raise exception 'conversation_not_found'; end if;
  if c.human_required or c.mode='human' then raise exception 'conversation_requires_human'; end if;

  v_customer:=public.get_whatsapp_basket_customer_status_v1(c.id);
  if not coalesce((v_customer->>'registered')::boolean,false) then raise exception 'customer_registration_incomplete'; end if;
  v_address:=v_customer->'address';
  v_cart:=public.get_whatsapp_sales_cart_v1(c.id);
  if not coalesce((v_cart->>'exists')::boolean,false) then raise exception 'cart_not_started'; end if;

  v_order:=public.confirm_cart_order_v2((v_cart->>'cart_id')::uuid,v_address,'flow-order:'||v_key);
  update public.experience_sessions
     set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
       'flow_payment_method',v_method,
       'flow_checkout_notes',nullif(left(trim(coalesce(p_notes,'')),1000),''),
       'flow_order_id',v_order->>'order_id',
       'flow_order_confirmed_at',now()
     ),
     status='completed',
     completed_at=coalesce(completed_at,now()),
     updated_at=now()
   where id=s.id;

  return jsonb_build_object(
    'ok',true,
    'order',v_order,
    'payment_method',v_method,
    'next_step','send_location_in_chat',
    'bling_queued',false
  );
end;
$$;

update public.experience_definitions
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
  'handler_version','v5',
  'flow_json_version','v6',
  'basket_cards_with_media',true,
  'basket_adjustment_rounds',3,
  'multi_category_browse',true,
  'customer_prefill',true,
  'payment_on_delivery_only',true,
  'max_category_selection',3,
  'meta_forward_only_routing',true,
  'never_load_full_catalog',true
),
metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('implementation_stage','professional_flow_v6_readiness'),
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
