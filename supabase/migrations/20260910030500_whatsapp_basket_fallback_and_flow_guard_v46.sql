create or replace function public.route_whatsapp_basket_fallback_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  st public.whatsapp_sales_state%rowtype;
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  iid text:='';
  normalized text:='';
  awaiting text:='';
  v_reset boolean:=false;
  flow_ready boolean:=false;
  v_basket_id uuid;
  v_basket jsonb;
  v_body text;
  v_interactive jsonb;
  v_queue jsonb;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into m from public.messages where id=new.message_id and direction='inbound';
  if not found then return new; end if;
  iid:=coalesce(m.ai_interpretation->>'id','');
  normalized:=translate(lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-escolha-v1';
  flow_ready:=found and d.status in ('ready','active') and nullif(d.provider_id,'') is not null and coalesce(cfg.experience_orchestrator_enabled,false) and coalesce(cfg.whatsapp_flow_data_exchange_enabled,false) and coalesce(cfg.whatsapp_flow_send_enabled,false);
  if iid like 'da_basket:%' then
    begin v_basket_id:=substring(iid from length('da_basket:')+1)::uuid; exception when others then return new; end;
    v_basket:=public.create_whatsapp_basket_session_v1(new.conversation_id,v_basket_id);
    v_body:='Você escolheu '||coalesce(v_basket->>'basket_name','essa cesta')||' — R$ '||replace(to_char(coalesce((v_basket->>'basket_price')::numeric,0),'FM999999990.00'),'.',',')||'. Quer receber assim ou prefere personalizar?';
    v_interactive:=jsonb_build_object('type','button','body',jsonb_build_object('text',left(v_body,1024)),'action',jsonb_build_object('buttons',jsonb_build_array(jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_keep','title','Quero assim')),jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_customize','title','Personalizar')))));
    perform public.update_whatsapp_sales_state_v1(new.conversation_id,null,null,'basket_selected',null,'basket_personalization_choice');
    v_queue:=public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,v_body,'interactive',null,v_interactive,'basket_personalization_choice',jsonb_build_object('basket_id',v_basket_id,'basket_name',v_basket->>'basket_name','basket_price',v_basket->'basket_price','basket_session_id',v_basket->>'session_id','cart_id',v_basket->>'cart_id','storefront_url',v_basket->>'url','fallback',true),1);
    new.status:='done';
    new.result:=jsonb_build_object('deterministic',true,'action','basket_selected_followup','basket',v_basket,'queue',v_queue,'flow_fallback',true);
    new.updated_at:=now();
    return new;
  end if;
  if flow_ready then return new; end if;
  select * into st from public.whatsapp_sales_state where conversation_id=new.conversation_id;
  if found then awaiting:=coalesce(st.awaiting,''); end if;
  v_reset:=normalized ~ '(^| )(novo pedido|pedido novo|reiniciar( o)? pedido|recomecar( o)? pedido|comecar( um)? novo pedido|comecar de novo|quero (fazer )?(um )?pedido novo|quero (fazer )?outro pedido|nova compra)( |$)';
  if not v_reset and awaiting<>'' then return new; end if;
  if v_reset then perform public.reset_whatsapp_order_context_v1(new.conversation_id,m.id,'explicit_new_order'); elsif normalized !~ '(^| )(cesta|cestas|cesta basica|cestas basicas)( |$)' then return new; end if;
  v_body:='Escolha sua cesta básica. Depois eu te pergunto se quer receber assim ou personalizar.';
  v_interactive:=public.whatsapp_simple_basket_list_interactive_v1();
  v_queue:=public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,v_body,'interactive',null,v_interactive,'basket_list_fallback',jsonb_build_object('fallback',true,'reason','short_flow_not_ready'),1);
  new.status:='done';
  new.result:=jsonb_build_object('deterministic',true,'action','basket_list_fallback','queue',v_queue);
  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function public.route_whatsapp_basket_fallback_v1() from public,anon,authenticated;

drop trigger if exists trg_001_whatsapp_basket_fallback_v1 on public.ai_jobs;
create trigger trg_001_whatsapp_basket_fallback_v1
before insert on public.ai_jobs
for each row execute function public.route_whatsapp_basket_fallback_v1();

create or replace function public.route_whatsapp_flow_entry_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  cfg public.automation_config%rowtype;
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
  select * into cfg from public.automation_config where id=1;
  if not coalesce(cfg.experience_orchestrator_enabled and cfg.whatsapp_flow_data_exchange_enabled and cfg.whatsapp_flow_send_enabled,false) then return new; end if;
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
    begin if iid like 'da_basket:%' then v_selected_basket:=substring(iid from length('da_basket:')+1)::uuid; end if; exception when others then v_selected_basket:=null; end;
    select id into v_cart_id from public.carts where conversation_id=new.conversation_id and status='draft' order by updated_at desc limit 1;
    v_body:='Abra o pedido para ver as cestas, preços e composição.';
    v_flow:=public.queue_whatsapp_flow_offer_v1(new.conversation_id,m.id,null,v_cart_id,v_body,jsonb_strip_nulls(jsonb_build_object('entry_reason','basket_intent','selected_basket_id',v_selected_basket)));
    new.status:='done';
    new.result:=jsonb_build_object('deterministic',true,'action','whatsapp_flow_baskets','flow',v_flow);
    new.updated_at:=now();
    return new;
  end if;
  return new;
end;
$$;
