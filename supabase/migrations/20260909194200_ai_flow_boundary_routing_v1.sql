begin;

-- Fronteira oficial: IA informa/orienta; WhatsApp Flow monta, personaliza e fecha pedidos.
-- Este migration não altera JSON, Data Exchange, telas ou assets do Flow.

create or replace function public.is_whatsapp_transaction_intent_v1(p_text text)
returns boolean
language plpgsql immutable set search_path=''
as $$
declare
  n text:=translate(lower(trim(regexp_replace(coalesce(p_text,''),'\s+',' ','g'))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
begin
  if n='' then return false; end if;

  -- Perguntas informativas nunca devem abrir o Flow apenas por conter "quero" ou nome de produto.
  if n ~ '(quero|queria|preciso) saber'
     or n ~ '(quanto custa|qual( e)? o preco|qual valor|preco (do|da|das|dos)|tem\?|voc[eê]s tem|voc[eê]s vendem)'
     or n ~ '(^| )(como|quando|onde|porque|por que|aceita|entrega|frete|horario)( |$)'
  then
    return false;
  end if;

  return n ~ '(^| )(quero comprar|quero encomendar|quero pedir|quero uma cesta|quero a cesta|vou querer|me manda|manda pra mim|pode mandar|coloca|coloque|adiciona|adicione|separa|separe|preciso de|montar pedido|fazer pedido|personalizar|finalizar pedido|fechar pedido)( |$)';
end;
$$;

create or replace function public.route_whatsapp_flow_entry_v1()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  m public.messages%rowtype;
  iid text:='';
  normalized text:='';
  awaiting text:='';
  v_reset boolean:=false;
  v_transaction boolean:=false;
  v_flow jsonb;
  v_cart_id uuid;
  v_selected_basket uuid;
  v_body text;
  v_kind text:='generic';
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;

  select * into m from public.messages where id=new.message_id and direction='inbound';
  if not found then return new; end if;

  iid:=coalesce(m.ai_interpretation->>'id','');
  normalized:=translate(lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  select coalesce(s.awaiting,'') into awaiting from public.whatsapp_sales_state s where s.conversation_id=new.conversation_id;
  if not found then awaiting:=''; end if;

  v_reset:=normalized ~ '(^| )(novo pedido|pedido novo|reiniciar( o)? pedido|reinicie|recomecar( o)? pedido|comecar( um)? novo pedido|comecar de novo|quero (fazer )?(um )?pedido novo|quero (fazer )?outro pedido|quero comprar de novo|nova compra|fazer nova compra)( |$)';

  if v_reset then
    perform public.reset_whatsapp_order_context_v1(new.conversation_id,m.id,'explicit_new_order');
    v_body:='Claro. Vou abrir um novo pedido para você montar e finalizar aqui no WhatsApp.';
    begin
      v_flow:=public.queue_whatsapp_flow_offer_v1(new.conversation_id,m.id,'flow-cestas-comercial-v1',null,v_body,jsonb_build_object('entry_reason','new_order_reset','router','flow_boundary_v1'));
      new.status:='done';
      new.result:=jsonb_build_object('deterministic',true,'action','new_order_flow','flow',v_flow,'context_reset',true,'flow_boundary',true);
      new.updated_at:=now();
      return new;
    exception when others then
      -- Se o Flow estiver em homologação/desligado, não derruba o job: deixa a IA/handoff tratar.
      return new;
    end;
  end if;

  -- Fluxos de confirmação já iniciados continuam sob o estado existente.
  if awaiting in ('basket_customer_confirmation','basket_customer_data') then return new; end if;
  if normalized ~ '(quero encomendar a cesta que escolhi|terminei de escolher os produtos adicionais da minha cesta)' then return new; end if;

  -- Seleção explícita de cesta em interação antiga continua sendo intenção transacional.
  v_transaction:=iid like 'da_basket:%' or public.is_whatsapp_transaction_intent_v1(coalesce(m.body_text,m.transcript,''));
  if not v_transaction then return new; end if;

  if iid like 'da_basket:%' or normalized ~ '(^| )(cesta|cestas|cesta basica)( |$)' then
    v_kind:='basket';
    begin
      if iid like 'da_basket:%' then v_selected_basket:=substring(iid from length('da_basket:')+1)::uuid; end if;
    exception when others then
      v_selected_basket:=null;
    end;
    v_body:='Claro. Vou abrir as cestas para você escolher, personalizar e finalizar o pedido aqui no WhatsApp.';
  else
    v_kind:='products';
    v_body:='Claro. Vou abrir o pedido para você escolher os produtos, quantidades e finalizar aqui no WhatsApp.';
  end if;

  select id into v_cart_id from public.carts where conversation_id=new.conversation_id and status='draft' order by updated_at desc limit 1;

  begin
    v_flow:=public.queue_whatsapp_flow_offer_v1(
      new.conversation_id,
      m.id,
      'flow-cestas-comercial-v1',
      v_cart_id,
      v_body,
      jsonb_strip_nulls(jsonb_build_object(
        'entry_reason','explicit_transaction',
        'flow_kind',v_kind,
        'selected_basket_id',v_selected_basket,
        'customer_request',left(coalesce(m.body_text,m.transcript,''),500),
        'router','flow_boundary_v1'
      ))
    );
    new.status:='done';
    new.result:=jsonb_build_object('deterministic',true,'action','whatsapp_flow_transaction','flow_kind',v_kind,'flow',v_flow,'flow_boundary',true,'ai_call_saved',true);
    new.updated_at:=now();
    return new;
  exception when others then
    -- Fail-open para o worker: nunca perder a mensagem do cliente se o Flow estiver indisponível.
    return new;
  end;
end;
$$;

revoke all on function public.is_whatsapp_transaction_intent_v1(text) from public,anon,authenticated;
grant execute on function public.is_whatsapp_transaction_intent_v1(text) to service_role;
revoke all on function public.route_whatsapp_flow_entry_v1() from public,anon,authenticated;
grant execute on function public.route_whatsapp_flow_entry_v1() to service_role;

commit;
