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
  v_message text;
begin
  select * into s from public.experience_sessions where id=p_session_id for update;
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
          'title',left(b.display_name,30),
          'description','Ver produtos',
          'metadata',''
        ),
        'end',jsonb_build_object(
          'title',left('R$ '||replace(to_char(b.base_price,'FM999999990.00'),'.',','),10)
        ),
        'on-click-action',jsonb_build_object(
          'name','data_exchange',
          'payload',jsonb_build_object('trigger','basket_open','basket_id',b.id::text)
        ),
        'image_url',b.image_url
      ) order by b.sort_order,b.display_name
    ),'[]'::jsonb)
    into v_baskets
    from public.get_whatsapp_simple_baskets_v1() b;

    update public.experience_sessions
       set flow_current_screen='CESTAS',
           flow_state_version=flow_state_version+1,
           context=coalesce(context,'{}'::jsonb)-'basket_order_done',
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

  if coalesce(p_screen,'')='CESTAS' and coalesce(p_data->>'trigger','')='basket_open' then
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
          'items_summary',v_detail->>'items_summary'
        )
      )
    );
  end if;

  if coalesce(p_screen,'')='DETALHE' and coalesce(p_data->>'trigger','')='basket_order' then
    if coalesce(s.flow_current_screen,'')<>'DETALHE' then
      return jsonb_build_object('ok',false,'reason','flow_transition_invalid','expected_screen',s.flow_current_screen,'received_screen',p_screen);
    end if;
    if coalesce((s.context->>'basket_order_done')::boolean,false) then
      return jsonb_build_object(
        'ok',true,
        'session_id',s.id,
        'response',jsonb_build_object(
          'screen','ENVIADO',
          'data',jsonb_build_object('message',coalesce(s.context->>'basket_order_message','Cesta escolhida. Continue no WhatsApp.'))
        )
      );
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
    v_message:='Cesta escolhida. Volte ao WhatsApp para finalizar o pedido ou personalizar.';

    update public.experience_sessions
       set context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
             'basket_name',v_basket_session->>'basket_name',
             'basket_price',v_basket_session->'basket_price',
             'basket_storefront_url',v_basket_session->>'url',
             'basket_catalog_session_id',v_basket_session->>'session_id',
             'cart_id',v_basket_session->>'cart_id',
             'basket_order_done',true,
             'basket_order_message',v_message
           ),
           cart_id=nullif(v_basket_session->>'cart_id','')::uuid,
           flow_current_screen='ENVIADO',
           flow_state_version=flow_state_version+1,
           updated_at=now()
     where id=s.id;

    insert into public.experience_events(
      conversation_id,session_id,definition_id,event_type,interface_type,event_data
    ) values(
      p_conversation_id,s.id,s.definition_id,'basket_flow_order','whatsapp_flow',
      jsonb_build_object('basket_id',v_basket_id,'cart_id',v_basket_session->>'cart_id')
    );

    return jsonb_build_object(
      'ok',true,
      'session_id',s.id,
      'response',jsonb_build_object('screen','ENVIADO','data',jsonb_build_object('message',v_message))
    );
  end if;

  return jsonb_build_object('ok',false,'reason','flow_action_not_handled','expected_screen',s.flow_current_screen,'received_screen',p_screen);
end;
$$;

revoke all on function public.handle_whatsapp_flow_basket_choice_v1(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_basket_choice_v1(uuid,uuid,text,text,jsonb) to service_role;