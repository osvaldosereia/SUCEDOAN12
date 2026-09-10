-- Flow de cesta simplificado: lista com fotos -> composição -> Encomendar -> WhatsApp.
create or replace function public.handle_whatsapp_flow_basket_choice_v1(
  p_session_id uuid,p_conversation_id uuid,p_action text,p_screen text default null,p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s public.experience_sessions%rowtype; v_baskets jsonb:='[]'::jsonb; v_basket_id uuid;
  v_detail jsonb; v_basket_session jsonb; v_message text;
begin
  select * into s from public.experience_sessions where id=p_session_id for update;
  if not found or s.conversation_id is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_session_not_found'); end if;
  if s.expires_at<=now() or s.status not in ('offered','open') then return jsonb_build_object('ok',false,'reason','flow_session_inactive','session_id',s.id); end if;

  if p_action='INIT' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',b.id::text,
      'main-content',jsonb_build_object('title',left(b.display_name,80),'description','Toque para ver os produtos','metadata',''),
      'end',jsonb_build_object('title','R$ '||replace(to_char(b.base_price,'FM999999990.00'),'.',',')),
      'on-click-action',jsonb_build_object('name','data_exchange','payload',jsonb_build_object('trigger','basket_open','basket_id',b.id::text)),
      'image_url',b.image_url
    ) order by b.sort_order,b.display_name),'[]'::jsonb) into v_baskets
    from public.get_whatsapp_simple_baskets_v1() b;
    update public.experience_sessions set flow_current_screen='CESTAS',flow_state_version=flow_state_version+1,context=coalesce(context,'{}'::jsonb)-'basket_order_done',updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'session_id',s.id,'response',jsonb_build_object('screen','CESTAS','data',jsonb_build_object('baskets',v_baskets)));
  end if;

  if p_action<>'data_exchange' then return jsonb_build_object('ok',false,'reason','flow_action_not_handled'); end if;

  if coalesce(p_screen,'')='CESTAS' and coalesce(p_data->>'trigger','')='basket_open' then
    if coalesce(s.flow_current_screen,'')<>'CESTAS' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid','expected_screen',s.flow_current_screen,'received_screen',p_screen); end if;
    begin v_basket_id:=(p_data->>'basket_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','invalid_basket_id'); end;
    begin v_detail:=public.get_whatsapp_basket_flow_detail_v1(v_basket_id); exception when others then return jsonb_build_object('ok',false,'reason','basket_not_available'); end;
    update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('basket_id',v_basket_id,'basket_name',v_detail->>'name','basket_price',v_detail->'price','basket_image_url',v_detail->>'image_url'),flow_current_screen='DETALHE',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    return jsonb_build_object('ok',true,'session_id',s.id,'response',jsonb_build_object('screen','DETALHE','data',jsonb_build_object('basket_name',v_detail->>'name','basket_price','R$ '||replace(to_char(coalesce((v_detail->>'price')::numeric,0),'FM999999990.00'),'.',','),'items_summary',v_detail->>'items_summary')));
  end if;

  if coalesce(p_screen,'')='DETALHE' and coalesce(p_data->>'trigger','')='basket_order' then
    if coalesce(s.flow_current_screen,'')<>'DETALHE' then return jsonb_build_object('ok',false,'reason','flow_transition_invalid','expected_screen',s.flow_current_screen,'received_screen',p_screen); end if;
    if coalesce((s.context->>'basket_order_done')::boolean,false) then return jsonb_build_object('ok',true,'session_id',s.id,'response',jsonb_build_object('screen','ENVIADO','data',jsonb_build_object('message',coalesce(s.context->>'basket_order_message','Cesta escolhida. Continue no WhatsApp.')))); end if;
    begin v_basket_id:=(s.context->>'basket_id')::uuid; exception when others then return jsonb_build_object('ok',false,'reason','basket_context_missing'); end;
    v_basket_session:=public.create_whatsapp_basket_session_v1(p_conversation_id,v_basket_id);
    if coalesce(v_basket_session->>'url','')='' then return jsonb_build_object('ok',false,'reason','basket_session_failed'); end if;
    v_message:='Cesta escolhida. Volte ao WhatsApp para finalizar o pedido ou personalizar.';
    update public.experience_sessions set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('basket_name',v_basket_session->>'basket_name','basket_price',v_basket_session->'basket_price','basket_storefront_url',v_basket_session->>'url','basket_catalog_session_id',v_basket_session->>'session_id','cart_id',v_basket_session->>'cart_id','basket_order_done',true,'basket_order_message',v_message),cart_id=nullif(v_basket_session->>'cart_id','')::uuid,flow_current_screen='ENVIADO',flow_state_version=flow_state_version+1,updated_at=now() where id=s.id;
    insert into public.experience_events(conversation_id,session_id,definition_id,event_type,interface_type,event_data) values(p_conversation_id,s.id,s.definition_id,'basket_flow_order','whatsapp_flow',jsonb_build_object('basket_id',v_basket_id,'cart_id',v_basket_session->>'cart_id'));
    return jsonb_build_object('ok',true,'session_id',s.id,'response',jsonb_build_object('screen','ENVIADO','data',jsonb_build_object('message',v_message)));
  end if;
  return jsonb_build_object('ok',false,'reason','flow_action_not_handled','expected_screen',s.flow_current_screen,'received_screen',p_screen);
end; $$;

create or replace function public.process_whatsapp_flow_nfm_reply_v1(p_conversation_id uuid,p_message_id uuid,p_response jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_token text:=trim(coalesce(p_response->>'flow_token','')); v_hash text; s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype; v_duplicate boolean:=false; v_body text; v_interactive jsonb; v_queue jsonb;
begin
  if length(v_token)<32 or length(v_token)>200 then return public.process_whatsapp_flow_nfm_reply_legacy_v1(p_conversation_id,p_message_id,p_response); end if;
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  select * into s from public.experience_sessions where flow_token_hash=v_hash;
  if not found then return public.process_whatsapp_flow_nfm_reply_legacy_v1(p_conversation_id,p_message_id,p_response); end if;
  select * into d from public.experience_definitions where id=s.definition_id;
  if not found or d.slug<>'flow-cestas-escolha-v1' then return public.process_whatsapp_flow_nfm_reply_legacy_v1(p_conversation_id,p_message_id,p_response); end if;
  if s.conversation_id is distinct from p_conversation_id then return jsonb_build_object('ok',false,'reason','flow_conversation_mismatch'); end if;
  if p_message_id is not null then select exists(select 1 from public.experience_events e where e.session_id=s.id and e.event_type='basket_choice_nfm_reply' and e.event_data->>'message_id'=p_message_id::text) into v_duplicate; end if;
  if not v_duplicate then
    if coalesce((s.context->>'basket_order_done')::boolean,false) is not true then return jsonb_build_object('ok',false,'reason','basket_order_not_completed'); end if;
    perform public.update_whatsapp_sales_state_v1(p_conversation_id,null,null,'basket_selected',null,'basket_personalization_choice');
    v_body:='Você escolheu '||coalesce(s.context->>'basket_name','essa cesta')||' — R$ '||replace(to_char(coalesce((s.context->>'basket_price')::numeric,0),'FM999999990.00'),'.',',')||'. Quer finalizar o pedido ou personalizar?';
    v_interactive:=jsonb_build_object('type','button','body',jsonb_build_object('text',left(v_body,1024)),'action',jsonb_build_object('buttons',jsonb_build_array(jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_keep','title','Finalizar pedido')),jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_customize','title','Personalizar')))));
    v_queue:=public.queue_whatsapp_sales_reply_v1(p_conversation_id,p_message_id,v_body,'interactive',null,v_interactive,'basket_personalization_choice',jsonb_build_object('flow_session_id',s.id,'basket_id',s.context->>'basket_id','basket_name',s.context->>'basket_name','cart_id',s.context->>'cart_id'),1);
    insert into public.experience_events(conversation_id,session_id,definition_id,event_type,interface_type,event_data) values(p_conversation_id,s.id,s.definition_id,'basket_choice_nfm_reply','whatsapp_flow',jsonb_build_object('message_id',p_message_id,'action',coalesce(p_response->>'action','basket_order_done'),'followup','basket_personalization_choice','queued',true));
  end if;
  return jsonb_build_object('ok',true,'session_id',s.id,'definition_slug',d.slug,'return_to_chat',false,'duplicate',v_duplicate,'followup_queued',not v_duplicate);
end; $$;

-- O fallback continua disponível, mas usa o mesmo texto/botões da experiência oficial.
create or replace function public.route_whatsapp_basket_fallback_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  m public.messages%rowtype; st public.whatsapp_sales_state%rowtype; cfg public.automation_config%rowtype; d public.experience_definitions%rowtype;
  iid text:=''; normalized text:=''; awaiting text:=''; v_reset boolean:=false; flow_ready boolean:=false;
  v_basket_id uuid; v_basket jsonb; v_body text; v_interactive jsonb; v_queue jsonb;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into m from public.messages where id=new.message_id and direction='inbound'; if not found then return new; end if;
  iid:=coalesce(m.ai_interpretation->>'id','');
  normalized:=translate(lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  select * into cfg from public.automation_config where id=1; select * into d from public.experience_definitions where slug='flow-cestas-escolha-v1';
  flow_ready:=found and d.status in ('ready','active') and nullif(d.provider_id,'') is not null and coalesce(cfg.experience_orchestrator_enabled,false) and coalesce(cfg.whatsapp_flow_data_exchange_enabled,false) and coalesce(cfg.whatsapp_flow_send_enabled,false);
  if iid like 'da_basket:%' then
    begin v_basket_id:=substring(iid from length('da_basket:')+1)::uuid; exception when others then return new; end;
    v_basket:=public.create_whatsapp_basket_session_v1(new.conversation_id,v_basket_id);
    v_body:='Você escolheu '||coalesce(v_basket->>'basket_name','essa cesta')||' — R$ '||replace(to_char(coalesce((v_basket->>'basket_price')::numeric,0),'FM999999990.00'),'.',',')||'. Quer finalizar o pedido ou personalizar?';
    v_interactive:=jsonb_build_object('type','button','body',jsonb_build_object('text',left(v_body,1024)),'action',jsonb_build_object('buttons',jsonb_build_array(jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_keep','title','Finalizar pedido')),jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_customize','title','Personalizar')))));
    perform public.update_whatsapp_sales_state_v1(new.conversation_id,null,null,'basket_selected',null,'basket_personalization_choice');
    v_queue:=public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,v_body,'interactive',null,v_interactive,'basket_personalization_choice',jsonb_build_object('basket_id',v_basket_id,'basket_name',v_basket->>'basket_name','basket_price',v_basket->'basket_price','basket_session_id',v_basket->>'session_id','cart_id',v_basket->>'cart_id','storefront_url',v_basket->>'url','fallback',true),1);
    new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','basket_selected_followup','basket',v_basket,'queue',v_queue,'flow_fallback',true); new.updated_at:=now(); return new;
  end if;
  if flow_ready then return new; end if;
  select * into st from public.whatsapp_sales_state where conversation_id=new.conversation_id; if found then awaiting:=coalesce(st.awaiting,''); end if;
  v_reset:=normalized ~ '(^| )(novo pedido|pedido novo|reiniciar( o)? pedido|recomecar( o)? pedido|comecar( um)? novo pedido|comecar de novo|quero (fazer )?(um )?pedido novo|quero (fazer )?outro pedido|nova compra)( |$)';
  if not v_reset and awaiting<>'' then return new; end if;
  if v_reset then perform public.reset_whatsapp_order_context_v1(new.conversation_id,m.id,'explicit_new_order'); elsif normalized !~ '(^| )(cesta|cestas|cesta basica|cestas basicas)( |$)' then return new; end if;
  v_body:='Escolha sua cesta básica para ver a composição e encomendar.'; v_interactive:=public.whatsapp_simple_basket_list_interactive_v1();
  v_queue:=public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,v_body,'interactive',null,v_interactive,'basket_list_fallback',jsonb_build_object('fallback',true,'reason','short_flow_not_ready'),1);
  new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','basket_list_fallback','queue',v_queue); new.updated_at:=now(); return new;
end; $$;

update public.experience_definitions set status='active',provider='meta_whatsapp',provider_id='1070149582048643',provider_version='7.3',config=coalesce(config,'{}'::jsonb)||jsonb_build_object('data_api_version','3.0','endpoint_uri','https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-flow-data-exchange-v1','flow_json_path','whatsapp/flows/flow-cestas-escolha-v1.json'),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('candidate_not_live',false,'default_for_new_sessions',true,'provider_status','PUBLISHED','health_status','AVAILABLE','activated_at',now()),updated_at=now() where slug='flow-cestas-escolha-v1';
update public.automation_config set experience_orchestrator_enabled=true,whatsapp_flow_data_exchange_enabled=true,whatsapp_flow_send_enabled=true,updated_at=now() where id=1;

revoke all on function public.handle_whatsapp_flow_basket_choice_v1(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.route_whatsapp_basket_fallback_v1() from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_basket_choice_v1(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb) to service_role;
