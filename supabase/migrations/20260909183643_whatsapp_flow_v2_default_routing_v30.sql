begin;

update public.experience_definitions
set status='active',
    config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
      'live_percent',100,
      'production_enabled',true,
      'flow_json_version','v25',
      'handler_version','v9'
    ),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'meta_status','published',
      'meta_validation_passed',true,
      'meta_validation_errors',0,
      'meta_published_at',now(),
      'production_enabled',true,
      'customer_exposure',true,
      'default_for_new_sessions',true,
      'edge_version',13,
      'image_max_bytes',80000,
      'selector_image_max_bytes',45000,
      'bulk_selection_single_recalc',true,
      'implementation_stage','v2_default_routing_v30'
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v2'
  and provider_id='1539877778181619';

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'default_for_new_sessions',false,
      'legacy_compatibility',true,
      'new_sessions_enabled',false,
      'superseded_by','flow-cestas-comercial-v2'
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v1';

create or replace function public.get_whatsapp_current_commercial_flow_slug_v1()
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_slug text;
begin
  select d.slug into v_slug
  from public.experience_definitions d
  where d.feature_key='flow_basket_commercial'
    and d.experience_type='whatsapp_flow'
    and d.status='active'
    and nullif(trim(coalesce(d.provider_id,'')),'') is not null
    and coalesce((d.metadata->>'default_for_new_sessions')::boolean,false)
  order by d.updated_at desc,d.created_at desc
  limit 1;

  if v_slug is null then
    select d.slug into v_slug
    from public.experience_definitions d
    where d.slug in ('flow-cestas-comercial-v2','flow-cestas-comercial-v1')
      and d.status in ('active','ready')
      and nullif(trim(coalesce(d.provider_id,'')),'') is not null
    order by case d.slug when 'flow-cestas-comercial-v2' then 1 else 2 end
    limit 1;
  end if;

  if v_slug is null then raise exception 'commercial_flow_definition_not_available'; end if;
  return v_slug;
end;
$$;

revoke all on function public.get_whatsapp_current_commercial_flow_slug_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_current_commercial_flow_slug_v1() to service_role;

create or replace function public.queue_whatsapp_flow_offer_v1(
  p_conversation_id uuid,
  p_source_message_id uuid,
  p_definition_slug text default null,
  p_cart_id uuid default null,
  p_body_text text default 'Escolha sua cesta e monte seu pedido aqui pelo WhatsApp.',
  p_context jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  cfg public.automation_config%rowtype;
  c public.conversations%rowtype;
  s jsonb;
  t jsonb;
  v_session_id uuid;
  v_body text:=left(trim(coalesce(p_body_text,'')),1024);
  v_key text;
  v_interactive jsonb;
  v_reply_id uuid;
  v_job_id uuid;
  v_slug text;
begin
  select * into cfg from public.automation_config where id=1;
  if not coalesce(cfg.experience_orchestrator_enabled and cfg.whatsapp_flow_data_exchange_enabled and cfg.whatsapp_flow_send_enabled,false) then
    raise exception 'whatsapp_flow_send_disabled';
  end if;

  select * into c from public.conversations where id=p_conversation_id and mode='ai' and status<>'closed' for update;
  if not found then raise exception 'conversation_not_available'; end if;
  if c.service_window_expires_at<=now() then raise exception 'conversation_service_window_closed'; end if;
  if v_body='' then v_body:='Escolha sua cesta e monte seu pedido aqui pelo WhatsApp.'; end if;

  v_slug:=coalesce(nullif(trim(coalesce(p_definition_slug,'')),''),public.get_whatsapp_current_commercial_flow_slug_v1());
  v_key:='flow-offer:'||coalesce(p_source_message_id::text,gen_random_uuid()::text)||':'||left(v_slug,80);
  s:=public.create_experience_session_v1(c.id,v_slug,v_key,p_source_message_id,p_cart_id,coalesce(p_context,'{}'::jsonb));
  v_session_id:=(s->>'session_id')::uuid;
  t:=public.issue_whatsapp_flow_token_v1(v_session_id);

  v_interactive:=jsonb_build_object(
    'type','flow',
    'body',jsonb_build_object('text',v_body),
    'action',jsonb_build_object(
      'name','flow',
      'parameters',jsonb_build_object(
        'flow_message_version',t->>'flow_message_version',
        'flow_token',t->>'flow_token',
        'flow_id',t->>'flow_id',
        'flow_cta',t->>'flow_cta',
        'flow_action',t->>'flow_action'
      )
    )
  );

  insert into public.messages(conversation_id,direction,message_type,body_text,ai_interpretation,raw_event)
  values(c.id,'outbound','interactive',v_body,
    jsonb_build_object('source','whatsapp_flow','action_type','whatsapp_flow_offer','delivery_mode','interactive','action_result',jsonb_build_object('session_id',v_session_id,'flow_id',t->>'flow_id','definition_slug',t->>'definition_slug')),
    jsonb_build_object('source','whatsapp','flow_offer',true,'source_message_id',p_source_message_id))
  returning id into v_reply_id;

  insert into public.outbound_jobs(whatsapp_account_id,customer_id,conversation_id,job_type,recipient_e164,dedupe_key,payload)
  values(c.whatsapp_account_id,c.customer_id,c.id,'seller_message',c.wa_contact_e164,'flow_offer:'||v_reply_id::text,
    jsonb_build_object('message_kind','conversation_reply','message_type','interactive','body_text',v_body,'delivery_mode','interactive','interactive',v_interactive,'reply_message_id',v_reply_id,'source_message_id',p_source_message_id,'service_window_expires_at',c.service_window_expires_at))
  on conflict(dedupe_key) do nothing returning id into v_job_id;

  insert into public.whatsapp_sales_action_events(conversation_id,message_id,action_type,action_payload,result,reversible,required_confirmation,confidence)
  values(c.id,p_source_message_id,'whatsapp_flow_offer',jsonb_build_object('interactive',v_interactive),jsonb_build_object('session_id',v_session_id,'flow_id',t->>'flow_id','definition_slug',v_slug),true,false,1);

  return jsonb_build_object('ok',true,'session_id',v_session_id,'reply_message_id',v_reply_id,'outbound_job_id',v_job_id,'flow_id',t->>'flow_id','flow_action',t->>'flow_action','definition_slug',v_slug);
end;
$$;

revoke all on function public.queue_whatsapp_flow_offer_v1(uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.queue_whatsapp_flow_offer_v1(uuid,uuid,text,uuid,text,jsonb) to service_role;

create or replace function public.route_whatsapp_flow_entry_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  iid text:='';
  normalized text:='';
  awaiting text:='';
  v_reset boolean:=false;
  v_flow jsonb;
  v_cart_id uuid;
  v_selected_basket uuid;
  v_body text;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into m from public.messages where id=new.message_id and direction='inbound';
  if not found then return new; end if;

  iid:=coalesce(m.ai_interpretation->>'id','');
  normalized:=translate(lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  select coalesce(s.awaiting,'') into awaiting from public.whatsapp_sales_state s where s.conversation_id=new.conversation_id;
  if not found then awaiting:=''; end if;

  v_reset:= normalized ~ '(^| )(novo pedido|pedido novo|reiniciar( o)? pedido|reinicie|recomecar( o)? pedido|comecar( um)? novo pedido|comecar de novo|quero (fazer )?(um )?pedido novo|quero (fazer )?outro pedido|quero comprar de novo|nova compra|fazer nova compra)( |$)';

  if v_reset then
    perform public.reset_whatsapp_order_context_v1(new.conversation_id,m.id,'explicit_new_order');
    v_body:='Vamos começar um novo pedido. Toque em Montar pedido para escolher sua cesta, personalizar e adicionar outros produtos.';
    v_flow:=public.queue_whatsapp_flow_offer_v1(new.conversation_id,m.id,null,null,v_body,jsonb_build_object('entry_reason','new_order_reset'));
    new.status:='done';
    new.result:=jsonb_build_object('deterministic',true,'action','new_order_flow','flow',v_flow,'context_reset',true);
    new.updated_at:=now();
    return new;
  end if;

  if awaiting in ('basket_customer_confirmation','basket_customer_data') then return new; end if;
  if normalized ~ '(quero encomendar a cesta que escolhi|terminei de escolher os produtos adicionais da minha cesta)' then return new; end if;

  if iid like 'da_basket:%' or normalized ~ '(^| )(cesta|cestas)( |$)' then
    begin
      if iid like 'da_basket:%' then v_selected_basket:=substring(iid from length('da_basket:')+1)::uuid; end if;
    exception when others then v_selected_basket:=null; end;
    select id into v_cart_id from public.carts where conversation_id=new.conversation_id and status='draft' order by updated_at desc limit 1;
    v_body:='Abra o pedido para ver as 9 cestas com fotos, preços e composição. Você pode personalizar e adicionar outros produtos sem sair do WhatsApp.';
    v_flow:=public.queue_whatsapp_flow_offer_v1(new.conversation_id,m.id,null,v_cart_id,v_body,
      jsonb_strip_nulls(jsonb_build_object('entry_reason','basket_intent','selected_basket_id',v_selected_basket)));
    new.status:='done';
    new.result:=jsonb_build_object('deterministic',true,'action','whatsapp_flow_baskets','flow',v_flow);
    new.updated_at:=now();
    return new;
  end if;

  return new;
end;
$$;

revoke all on function public.route_whatsapp_flow_entry_v1() from public,anon,authenticated;
grant execute on function public.route_whatsapp_flow_entry_v1() to service_role;

create or replace function public.get_whatsapp_flow_commercial_readiness_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_transport jsonb:=public.get_whatsapp_flow_transport_readiness_v1();
  v_write jsonb:=public.get_whatsapp_flow_commercial_write_readiness_v1();
  v_baskets jsonb:=public.get_whatsapp_basket_component_readiness_v1(null);
  v_def jsonb;
  v_slug text;
begin
  v_slug:=public.get_whatsapp_current_commercial_flow_slug_v1();
  select jsonb_build_object(
    'exists',true,
    'slug',slug,
    'status',status,
    'provider_id',provider_id,
    'provider_id_configured',coalesce(provider_id,'')<>'',
    'feature_key',feature_key,
    'meta_status',metadata->>'meta_status',
    'validation_passed',coalesce((metadata->>'meta_validation_passed')::boolean,false),
    'customer_exposure',coalesce((metadata->>'customer_exposure')::boolean,false)
  ) into v_def
  from public.experience_definitions where slug=v_slug limit 1;
  if v_def is null then v_def:=jsonb_build_object('exists',false,'slug',v_slug,'status','missing','provider_id_configured',false); end if;

  return jsonb_build_object(
    'ready_for_real_homologation',
      coalesce((v_transport->>'send_ready')::boolean,false)
      and coalesce((v_baskets->>'ready')::boolean,false)
      and coalesce((v_def->>'provider_id_configured')::boolean,false),
    'current_definition_slug',v_slug,
    'transport',v_transport,
    'commercial_write',v_write,
    'basket_components',v_baskets,
    'flow_definition',v_def,
    'blockers',jsonb_strip_nulls(jsonb_build_object(
      'basket_components',case when not coalesce((v_baskets->>'ready')::boolean,false) then 'basket_components_not_reconciled' end,
      'provider_id',case when not coalesce((v_def->>'provider_id_configured')::boolean,false) then 'flow_provider_id_missing' end,
      'transport',case when not coalesce((v_transport->>'send_ready')::boolean,false) then 'flow_transport_not_ready' end
    ))
  );
end;
$$;

revoke all on function public.get_whatsapp_flow_commercial_readiness_v2() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_commercial_readiness_v2() to service_role;

commit;
