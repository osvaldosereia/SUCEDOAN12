-- Dona Antônia — Flow simples de cestas: foto -> lista de produtos -> decisão.
-- Mantém Bling e pós-venda fora deste fluxo.

create or replace function public.get_whatsapp_basket_flow_detail_v1(p_basket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b public.basket_templates%rowtype;
  items_text text;
  item_count integer:=0;
begin
  select * into b
  from public.basket_templates
  where id=p_basket_id and is_active=true and is_whatsapp_active=true;
  if not found then raise exception 'basket_not_available'; end if;

  select
    coalesce(string_agg(
      trim(to_char(i.quantity,'FM999999990.##'))||' × '||left(p.name,120),
      E'\n' order by i.sort_order,p.name
    ),''),
    count(*)::integer
  into items_text,item_count
  from public.basket_template_items i
  join public.products p on p.id=i.product_id
  where i.basket_id=b.id;

  return jsonb_build_object(
    'id',b.id,
    'name',b.name,
    'price',b.base_price,
    'image_url',b.image_url,
    'item_count',item_count,
    'items_summary',left(items_text,4000)
  );
end;
$$;

revoke all on function public.get_whatsapp_basket_flow_detail_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_basket_flow_detail_v1(uuid) to service_role;

create or replace function public.handle_whatsapp_flow_basket_choice_v1(
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
  v_baskets jsonb:='[]'::jsonb;
  v_basket_id uuid;
  v_detail jsonb;
  v_basket_session jsonb;
  v_decision text;
  v_interactive jsonb;
  v_checkout jsonb;
  v_message text;
  v_source_message_id uuid;
begin
  select * into s
  from public.experience_sessions
  where id=p_session_id
  for update;

  if not found or s.conversation_id is distinct from p_conversation_id then
    return jsonb_build_object('ok',false,'reason','flow_session_not_found');
  end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then
    return jsonb_build_object('ok',false,'reason','flow_session_inactive','session_id',s.id);
  end if;

  if p_action='INIT' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id',b.id::text,
        'main-content',jsonb_build_object(
          'title',left(b.display_name,80),
          'description','Toque para ver os produtos',
          'metadata',''
        ),
        'end',jsonb_build_object(
          'title','R$ '||replace(to_char(b.base_price,'FM999999990.00'),'.',',')
        ),
        'on-click-action',jsonb_build_object(
          'name','data_exchange',
          'payload',jsonb_build_object(
            'trigger','basket_open',
            'basket_id',b.id::text
          )
        ),
        'image_url',b.image_url
      ) order by b.sort_order,b.display_name
    ),'[]'::jsonb)
    into v_baskets
    from public.get_whatsapp_simple_baskets_v1() b;

    update public.experience_sessions
       set flow_current_screen='CESTAS',
           flow_state_version=flow_state_version+1,
           context=coalesce(context,'{}'::jsonb)-'basket_decision_done',
           updated_at=now()
     where id=s.id;

    return jsonb_build_object(
      'ok',true,
      'session_id',s.id,
      'response',jsonb_build_object(
        'screen','CESTAS',
        'data',jsonb_build_object('baskets',v_baskets)
      )
    );
  end if;

  if p_action<>'data_exchange' then
    return jsonb_build_object('ok',false,'reason','flow_action_not_handled');
  end if;

  if coalesce(p_screen,'')='CESTAS'
     and coalesce(p_data->>'trigger','')='basket_open' then
    if coalesce(s.flow_current_screen,'')<>'CESTAS' then
      return jsonb_build_object('ok',false,'reason','flow_transition_invalid','expected_screen',s.flow_current_screen,'received_screen',p_screen);
    end if;

    begin
      v_basket_id:=(p_data->>'basket_id')::uuid;
    exception when others then
      return jsonb_build_object('ok',false,'reason','invalid_basket_id');
    end;

    begin
      v_detail:=public.get_whatsapp_basket_flow_detail_v1(v_basket_id);
    exception when others then
      return jsonb_build_object('ok',false,'reason','basket_not_available');
    end;

    update public.experience_sessions
       set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
             'basket_id',v_basket_id,
             'basket_name',v_detail->>'name',
             'basket_price',v_detail->'price',
             'basket_image_url',v_detail->>'image_url'
           ),
           flow_current_screen='DETALHE',
           flow_state_version=flow_state_version+1,
           updated_at=now()
     where id=s.id;

    return jsonb_build_object(
      'ok',true,
      'session_id',s.id,
      'response',jsonb_build_object(
        'screen','DETALHE',
        'data',jsonb_build_object(
          'basket_name',v_detail->>'name',
          'basket_price','R$ '||replace(to_char(coalesce((v_detail->>'price')::numeric,0),'FM999999990.00'),'.',','),
          'items_summary',v_detail->>'items_summary',
          'decision_options',jsonb_build_array(
            jsonb_build_object('id','customize','title','Quero trocar produtos','description','Abrir a vitrine para personalizar'),
            jsonb_build_object('id','standard','title','Quero encomendar a cesta padrão','description','Levar exatamente como está')
          )
        )
      )
    );
  end if;

  if coalesce(p_screen,'')='DETALHE'
     and coalesce(p_data->>'trigger','')='basket_decision' then
    if coalesce(s.flow_current_screen,'')<>'DETALHE' then
      return jsonb_build_object('ok',false,'reason','flow_transition_invalid','expected_screen',s.flow_current_screen,'received_screen',p_screen);
    end if;

    if coalesce((s.context->>'basket_decision_done')::boolean,false) then
      return jsonb_build_object(
        'ok',true,'session_id',s.id,
        'response',jsonb_build_object('screen','ENVIADO','data',jsonb_build_object('message',coalesce(s.context->>'basket_decision_message','Recebi sua escolha. Continue no WhatsApp.')))
      );
    end if;

    v_decision:=lower(trim(coalesce(p_data->>'decision','')));
    if v_decision not in ('customize','standard') then
      return jsonb_build_object('ok',false,'reason','basket_decision_required');
    end if;

    begin
      v_basket_id:=(s.context->>'basket_id')::uuid;
    exception when others then
      return jsonb_build_object('ok',false,'reason','basket_context_missing');
    end;

    v_basket_session:=public.create_whatsapp_basket_session_v1(p_conversation_id,v_basket_id);
    if coalesce(v_basket_session->>'url','')='' then
      return jsonb_build_object('ok',false,'reason','basket_session_failed');
    end if;

    select id into v_source_message_id
    from public.messages
    where conversation_id=p_conversation_id and direction='inbound'
    order by created_at desc
    limit 1;

    if v_decision='customize' then
      v_message:='Perfeito. Enviei o botão para você trocar, retirar ou aumentar os produtos da cesta. Quando terminar, a sua escolha volta automaticamente para esta conversa.';
      v_interactive:=jsonb_build_object(
        'type','cta_url',
        'body',jsonb_build_object('text',left(v_message,1024)),
        'action',jsonb_build_object(
          'name','cta_url',
          'parameters',jsonb_build_object(
            'display_text','Personalizar cesta',
            'url',v_basket_session->>'url'
          )
        )
      );

      perform public.update_whatsapp_sales_state_v1(
        p_conversation_id,null,null,'basket_storefront_opened',null,'basket_storefront_return'
      );
      perform public.queue_whatsapp_sales_reply_v1(
        p_conversation_id,v_source_message_id,v_message,'interactive',null,v_interactive,
        'basket_storefront_link',v_basket_session,1
      );
    else
      v_checkout:=public.start_whatsapp_basket_checkout_v2(p_conversation_id,v_source_message_id);
      v_message:=case coalesce(v_checkout->>'step','')
        when 'payment_selection' then 'Cesta padrão escolhida. Já deixei na conversa o resumo, o endereço e as formas de pagamento para você confirmar.'
        when 'customer_base_data' then 'Cesta padrão escolhida. Já pedi na conversa os dados que faltam para finalizar.'
        else 'Cesta padrão escolhida. Continue na conversa para finalizar a encomenda.'
      end;
    end if;

    update public.experience_sessions
       set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
             'basket_name',v_basket_session->>'basket_name',
             'basket_price',v_basket_session->'basket_price',
             'basket_storefront_url',v_basket_session->>'url',
             'basket_catalog_session_id',v_basket_session->>'session_id',
             'cart_id',v_basket_session->>'cart_id',
             'basket_decision',v_decision,
             'basket_decision_done',true,
             'basket_decision_message',v_message
           ),
           cart_id=nullif(v_basket_session->>'cart_id','')::uuid,
           flow_current_screen='ENVIADO',
           flow_state_version=flow_state_version+1,
           updated_at=now()
     where id=s.id;

    insert into public.experience_events(
      conversation_id,session_id,definition_id,event_type,interface_type,event_data
    ) values(
      p_conversation_id,s.id,s.definition_id,'basket_flow_decision','whatsapp_flow',
      jsonb_build_object('decision',v_decision,'basket_id',v_basket_id,'cart_id',v_basket_session->>'cart_id')
    );

    return jsonb_build_object(
      'ok',true,
      'session_id',s.id,
      'response',jsonb_build_object(
        'screen','ENVIADO',
        'data',jsonb_build_object('message',v_message)
      )
    );
  end if;

  return jsonb_build_object(
    'ok',false,'reason','flow_action_not_handled','expected_screen',s.flow_current_screen,'received_screen',p_screen
  );
end;
$$;

revoke all on function public.handle_whatsapp_flow_basket_choice_v1(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_basket_choice_v1(uuid,uuid,text,text,jsonb) to service_role;

-- O novo Flow já resolve a decisão dentro dele. O nfm_reply apenas registra a conclusão;
-- não pergunta novamente se o cliente quer personalizar.
create or replace function public.process_whatsapp_flow_nfm_reply_v1(
  p_conversation_id uuid,
  p_message_id uuid,
  p_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_token text:=trim(coalesce(p_response->>'flow_token',''));
  v_hash text;
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  v_duplicate boolean:=false;
begin
  if length(v_token)<32 or length(v_token)>200 then
    return public.process_whatsapp_flow_nfm_reply_legacy_v1(p_conversation_id,p_message_id,p_response);
  end if;

  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  select * into s from public.experience_sessions where flow_token_hash=v_hash;
  if not found then
    return public.process_whatsapp_flow_nfm_reply_legacy_v1(p_conversation_id,p_message_id,p_response);
  end if;

  select * into d from public.experience_definitions where id=s.definition_id;
  if not found or d.slug<>'flow-cestas-escolha-v1' then
    return public.process_whatsapp_flow_nfm_reply_legacy_v1(p_conversation_id,p_message_id,p_response);
  end if;

  if s.conversation_id is distinct from p_conversation_id then
    return jsonb_build_object('ok',false,'reason','flow_conversation_mismatch');
  end if;

  if p_message_id is not null then
    select exists(
      select 1 from public.experience_events e
      where e.session_id=s.id
        and e.event_type='basket_choice_nfm_reply'
        and e.event_data->>'message_id'=p_message_id::text
    ) into v_duplicate;
  end if;

  if not v_duplicate then
    insert into public.experience_events(
      conversation_id,session_id,definition_id,event_type,interface_type,event_data
    ) values(
      p_conversation_id,s.id,s.definition_id,'basket_choice_nfm_reply','whatsapp_flow',
      jsonb_build_object(
        'message_id',p_message_id,
        'decision',s.context->>'basket_decision',
        'decision_already_handled',true
      )
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'session_id',s.id,
    'definition_slug',d.slug,
    'return_to_chat',false,
    'duplicate',v_duplicate,
    'decision',s.context->>'basket_decision',
    'followup_queued',false
  );
end;
$$;

revoke all on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) to service_role;
