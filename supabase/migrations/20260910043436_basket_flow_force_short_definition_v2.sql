-- Garante que cesta básica sempre abra o Flow curto oficial, sem cair no Flow comercial legado.
create or replace function public.route_whatsapp_flow_entry_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype; cfg public.automation_config%rowtype; iid text:=''; normalized text:=''; awaiting text:='';
  v_reset boolean:=false; v_flow jsonb; v_cart_id uuid; v_selected_basket uuid; v_body text;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into cfg from public.automation_config where id=1;
  if not coalesce(cfg.experience_orchestrator_enabled and cfg.whatsapp_flow_data_exchange_enabled and cfg.whatsapp_flow_send_enabled,false) then return new; end if;
  select * into m from public.messages where id=new.message_id and direction='inbound'; if not found then return new; end if;
  iid:=coalesce(m.ai_interpretation->>'id','');
  normalized:=translate(lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  select coalesce(s.awaiting,'') into awaiting from public.whatsapp_sales_state s where s.conversation_id=new.conversation_id; if not found then awaiting:=''; end if;
  v_reset:=normalized ~ '(^| )(novo pedido|pedido novo|reiniciar( o)? pedido|reinicie|recomecar( o)? pedido|comecar( um)? novo pedido|comecar de novo|quero (fazer )?(um )?pedido novo|quero (fazer )?outro pedido|quero comprar de novo|nova compra|fazer nova compra)( |$)';
  if v_reset then
    perform public.reset_whatsapp_order_context_v1(new.conversation_id,m.id,'explicit_new_order');
    v_body:='Vamos começar um novo pedido. Abra para escolher sua cesta, ver a composição e encomendar.';
    v_flow:=public.queue_whatsapp_flow_offer_v1(new.conversation_id,m.id,'flow-cestas-escolha-v1',null,v_body,jsonb_build_object('entry_reason','new_order_reset','experience','basket_photo_list_v2'));
    new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','new_order_flow','flow',v_flow,'context_reset',true); new.updated_at:=now(); return new;
  end if;
  if awaiting in ('basket_customer_confirmation','basket_customer_data') then return new; end if;
  if normalized ~ '(quero encomendar a cesta que escolhi|terminei de escolher os produtos adicionais da minha cesta)' then return new; end if;
  if iid like 'da_basket:%' or normalized ~ '(^| )(cesta|cestas|cesta basica|cestas basicas)( |$)' then
    begin if iid like 'da_basket:%' then v_selected_basket:=substring(iid from length('da_basket:')+1)::uuid; end if; exception when others then v_selected_basket:=null; end;
    select id into v_cart_id from public.carts where conversation_id=new.conversation_id and status='draft' order by updated_at desc limit 1;
    v_body:='Abra para escolher sua cesta, ver a composição e encomendar.';
    v_flow:=public.queue_whatsapp_flow_offer_v1(new.conversation_id,m.id,'flow-cestas-escolha-v1',v_cart_id,v_body,jsonb_strip_nulls(jsonb_build_object('entry_reason','basket_intent','selected_basket_id',v_selected_basket,'experience','basket_photo_list_v2')));
    new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','whatsapp_flow_baskets','flow',v_flow); new.updated_at:=now(); return new;
  end if;
  return new;
end;
$$;
revoke all on function public.route_whatsapp_flow_entry_v1() from public,anon,authenticated;
