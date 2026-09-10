-- Dona Antônia — checkout simples, cadastro explícito e continuidade por IA.
-- Mantém Bling/pós-venda fora do caminho; handoff humano só para exceções.

alter table public.whatsapp_sales_state
  add column if not exists pending_payment_method text;

alter table public.whatsapp_sales_state
  drop constraint if exists whatsapp_sales_state_pending_payment_method_check;

alter table public.whatsapp_sales_state
  add constraint whatsapp_sales_state_pending_payment_method_check
  check (pending_payment_method is null or pending_payment_method in ('pix','cash','credit_card','food_card'));

create or replace function public.whatsapp_address_line_v1(p_address jsonb)
returns text language plpgsql immutable set search_path=''
as $$
declare street text:=trim(coalesce(p_address->>'street','')); number_text text:=trim(coalesce(p_address->>'number','')); s text:='';
begin
  if street='' then return 'Não informado'; end if;
  if street ~ '^[0-9]+([[:space:]-]|$)' then street:='Rua '||street; end if;
  s:=street;
  if number_text<>'' then s:=s||', nº '||number_text; end if;
  if nullif(trim(coalesce(p_address->>'complement','')),'') is not null then s:=s||' - '||(p_address->>'complement'); end if;
  if nullif(trim(coalesce(p_address->>'neighborhood','')),'') is not null then s:=s||' - '||(p_address->>'neighborhood'); end if;
  if nullif(trim(coalesce(p_address->>'city','')),'') is not null then s:=s||' - '||(p_address->>'city'); end if;
  return s;
end;$$;

create or replace function public.format_whatsapp_basket_checkout_brief_v1(p_conversation_id uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare flow jsonb; contact jsonb; basket_name text; total_value numeric:=0; address_line text; person_name text; txt text;
begin
  flow:=public.get_whatsapp_basket_flow_state_v1(p_conversation_id);
  if coalesce((flow->>'active')::boolean,false) is not true then raise exception 'basket_flow_not_found'; end if;
  contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);
  basket_name:=coalesce(nullif(flow->'basket'->>'name',''),'Cesta básica');
  total_value:=coalesce((flow->'cart'->>'total')::numeric,(flow->'basket'->>'base_price')::numeric,0);
  address_line:=public.whatsapp_address_line_v1(coalesce(contact->'address','{}'::jsonb));
  person_name:=nullif(contact->>'person_name','');
  txt:=case when coalesce((contact->>'known_customer')::boolean,false) and person_name is not null then person_name||', encontrei seu cadastro.'||E'\n' else '' end
    ||'Cesta: '||left(basket_name,90)||E'\n'
    ||'*Total: R$ '||replace(to_char(total_value,'FM999999990.00'),'.',',')||'*'||E'\n'
    ||'Entrega: '||left(address_line,300)||E'\n\n'
    ||'Escolha a forma de pagamento. Se quiser, você ainda pode adicionar produtos ou alterar o endereço.';
  return left(txt,1000);
end;$$;

create or replace function public.whatsapp_basket_payment_interactive_v1(p_conversation_id uuid)
returns jsonb language sql security definer set search_path=''
as $$
  select jsonb_build_object('type','list','body',jsonb_build_object('text',public.format_whatsapp_basket_checkout_brief_v1(p_conversation_id)),'action',jsonb_build_object('button','Escolher opção','sections',jsonb_build_array(jsonb_build_object('title','Pagamento na entrega','rows',jsonb_build_array(
    jsonb_build_object('id','da_basket_payment_pix','title','PIX na entrega','description','Pague no recebimento'),
    jsonb_build_object('id','da_basket_payment_cash','title','Dinheiro na entrega','description','Pague no recebimento'),
    jsonb_build_object('id','da_basket_payment_credit','title','Cartão de crédito','description','Pague no recebimento'),
    jsonb_build_object('id','da_basket_payment_food','title','Cartão alimentação','description','Alimentação/refeição'),
    jsonb_build_object('id','da_basket_add_more','title','Adicionar produtos','description','Abrir a vitrine novamente'),
    jsonb_build_object('id','da_basket_change_address','title','Alterar endereço','description','Corrigir a entrega')
  ))))));
$$;

create or replace function public.queue_whatsapp_basket_post_storefront_v1(p_conversation_id uuid,p_source_message_id uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare src uuid:=p_source_message_id; flow jsonb; contact jsonb; basket_name text; total_value numeric:=0; body text; interactive jsonb; q jsonb;
begin
  if src is null then select id into src from public.messages where conversation_id=p_conversation_id and direction='inbound' order by created_at desc limit 1; end if;
  flow:=public.get_whatsapp_basket_flow_state_v1(p_conversation_id); contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);
  basket_name:=coalesce(flow->'basket'->>'name','Cesta básica'); total_value:=coalesce((flow->'cart'->>'total')::numeric,(flow->'basket'->>'base_price')::numeric,0);
  body:=case when coalesce((contact->>'known_customer')::boolean,false) and nullif(contact->>'person_name','') is not null then (contact->>'person_name')||', encontrei seu cadastro.'||E'\n' else '' end
    ||'Recebi sua '||left(basket_name,80)||'.'||E'\n'||'Entrega: '||left(public.whatsapp_address_line_v1(contact->'address'),260)||E'\n'
    ||'*Total: R$ '||replace(to_char(total_value,'FM999999990.00'),'.',',')||'*'||E'\n\n'||'O que deseja fazer agora?';
  interactive:=jsonb_build_object('type','button','body',jsonb_build_object('text',left(body,1024)),'action',jsonb_build_object('buttons',jsonb_build_array(
    jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_finalize','title','Finalizar pedido')),
    jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_add_more','title','Adicionar produtos')),
    jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_change_address','title','Alterar endereço')))));
  insert into public.whatsapp_sales_state(conversation_id,awaiting,last_action,pending_payment_method,updated_at) values(p_conversation_id,'basket_post_storefront','basket_storefront_return',null,now())
  on conflict(conversation_id) do update set awaiting='basket_post_storefront',last_action='basket_storefront_return',pending_payment_method=null,updated_at=now();
  q:=public.queue_whatsapp_sales_reply_v1(p_conversation_id,src,body,'interactive',null,interactive,'basket_post_storefront',jsonb_build_object('checkout','basket','known_customer',contact->'known_customer'),1);
  return jsonb_build_object('ok',true,'step','post_storefront','queued',true,'queue',q);
end;$$;

create or replace function public.queue_whatsapp_basket_add_more_v1(p_conversation_id uuid,p_source_message_id uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare src uuid:=p_source_message_id; s public.catalog_sessions%rowtype; url text; body text:='Claro. Abra sua cesta e escolha “Adicionar mais produtos”.'; interactive jsonb; q jsonb;
begin
  if src is null then select id into src from public.messages where conversation_id=p_conversation_id and direction='inbound' order by created_at desc limit 1; end if;
  select * into s from public.catalog_sessions where conversation_id=p_conversation_id and metadata->>'flow'='basket_basic_v1' and status='open' and expires_at>now() order by created_at desc limit 1;
  if not found then raise exception 'basket_session_unavailable'; end if;
  url:='https://donaantonia.com.br/cesta/?t='||s.public_token||'&add=1';
  interactive:=jsonb_build_object('type','cta_url','body',jsonb_build_object('text',body),'action',jsonb_build_object('name','cta_url','parameters',jsonb_build_object('display_text','Adicionar produtos','url',url)));
  insert into public.whatsapp_sales_state(conversation_id,awaiting,last_action,pending_payment_method,updated_at) values(p_conversation_id,'basket_storefront_return','basket_add_more',null,now())
  on conflict(conversation_id) do update set awaiting='basket_storefront_return',last_action='basket_add_more',pending_payment_method=null,updated_at=now();
  q:=public.queue_whatsapp_sales_reply_v1(p_conversation_id,src,body,'interactive',null,interactive,'basket_add_more',jsonb_build_object('url',url),1);
  return jsonb_build_object('ok',true,'url',url,'queue',q);
end;$$;

create or replace function public.queue_whatsapp_basket_final_confirmation_v1(p_conversation_id uuid,p_source_message_id uuid,p_payment_method text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare method text:=public.normalize_whatsapp_basket_payment_method_v1(p_payment_method); contact jsonb; flow jsonb; basket_name text; total_value numeric:=0; body text; interactive jsonb; q jsonb;
begin
  if method is null then raise exception 'invalid_payment_method'; end if;
  contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id); flow:=public.get_whatsapp_basket_flow_state_v1(p_conversation_id);
  basket_name:=coalesce(flow->'basket'->>'name','Cesta básica'); total_value:=coalesce((flow->'cart'->>'total')::numeric,(flow->'basket'->>'base_price')::numeric,0);
  body:='*Confira antes de confirmar*'||E'\n'||'Cesta: '||left(basket_name,90)||E'\n'||'Total: R$ '||replace(to_char(total_value,'FM999999990.00'),'.',',')||E'\n'
    ||'Entrega: '||left(public.whatsapp_address_line_v1(contact->'address'),260)||E'\n'||'Pagamento: '||public.whatsapp_basket_payment_label_v1(method)||E'\n\n'||'Está tudo certo?';
  interactive:=jsonb_build_object('type','button','body',jsonb_build_object('text',left(body,1024)),'action',jsonb_build_object('buttons',jsonb_build_array(
    jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_confirm_order','title','Confirmar pedido')),
    jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_add_more','title','Adicionar produtos')),
    jsonb_build_object('type','reply','reply',jsonb_build_object('id','da_basket_change_address','title','Alterar endereço')))));
  insert into public.whatsapp_sales_state(conversation_id,awaiting,last_action,pending_payment_method,updated_at) values(p_conversation_id,'basket_final_confirmation','basket_payment_selected',method,now())
  on conflict(conversation_id) do update set awaiting='basket_final_confirmation',last_action='basket_payment_selected',pending_payment_method=method,updated_at=now();
  q:=public.queue_whatsapp_sales_reply_v1(p_conversation_id,p_source_message_id,body,'interactive',null,interactive,'basket_final_confirmation',jsonb_build_object('payment_method',method),1);
  return jsonb_build_object('ok',true,'step','final_confirmation','queued',true,'queue',q);
end;$$;

create or replace function public.complete_whatsapp_basket_storefront_v1(p_public_token text,p_intent text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare s public.catalog_sessions%rowtype; v_intent text:=lower(trim(coalesce(p_intent,''))); v_flow text; src uuid; next_step jsonb; already boolean:=false; selection_summary text;
begin
  if p_public_token !~* '^[a-f0-9]{64}$' then raise exception 'invalid_token'; end if;
  select * into s from public.catalog_sessions where public_token=p_public_token and status='open' and expires_at>now() for update;
  if not found then raise exception 'catalog_session_unavailable'; end if;
  v_flow:=coalesce(s.metadata->>'flow','');
  if (v_flow='basket_basic_v1' and v_intent<>'order') or (v_flow='basket_extras_v1' and v_intent<>'extras_done') or v_flow not in ('basket_basic_v1','basket_extras_v1') then raise exception 'invalid_return_intent'; end if;
  already:=coalesce(s.metadata->>'checkout_return_intent','')=v_intent and nullif(s.metadata->>'checkout_return_queued_at','') is not null;
  if already then return jsonb_build_object('ok',true,'duplicate',true,'queued',true,'conversation_id',s.conversation_id,'intent',v_intent); end if;
  perform public.mark_whatsapp_basket_return_v1(p_public_token,v_intent);
  select id into src from public.messages where conversation_id=s.conversation_id and direction='inbound' order by created_at desc limit 1;
  selection_summary:=public.format_whatsapp_basket_storefront_return_v1(s.conversation_id);
  perform public.queue_whatsapp_sales_reply_v1(s.conversation_id,src,selection_summary,'text',null,null,'basket_storefront_selection_return',jsonb_build_object('catalog_session_id',s.id,'intent',v_intent),1);
  next_step:=public.queue_whatsapp_basket_post_storefront_v1(s.conversation_id,src);
  update public.catalog_sessions set metadata=metadata||jsonb_build_object('checkout_return_intent',v_intent,'selection_return_queued_at',now(),'checkout_return_queued_at',now()),current_view='returning',last_activity_at=now() where id=s.id;
  return jsonb_build_object('ok',true,'duplicate',false,'queued',true,'selection_returned',true,'conversation_id',s.conversation_id,'intent',v_intent,'next_step',next_step->>'step');
end;$$;

create or replace function public.route_whatsapp_basket_payment_checkout_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare m public.messages%rowtype; st public.whatsapp_sales_state%rowtype; iid text:=''; normalized text:=''; method text; parsed jsonb; final_result jsonb; delivery_text text; reply text; req_id uuid;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into m from public.messages where id=new.message_id and direction='inbound'; if not found then return new; end if;
  select * into st from public.whatsapp_sales_state where conversation_id=new.conversation_id; if not found then return new; end if;
  iid:=coalesce(m.ai_interpretation->>'id','');
  normalized:=translate(lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');

  if st.awaiting='basket_customer_base_data' then
    parsed:=public.parse_and_save_whatsapp_customer_base_v1(new.conversation_id,coalesce(m.body_text,m.transcript,''));
    if coalesce((parsed->>'ok')::boolean,false) is not true then perform public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,E'Preciso destes dados em uma única mensagem:\nNome | Rua | Quadra | Casa | Bairro | Cidade | Referência (opcional)','text',null,null,'request_customer_base_data',parsed,1);
    else perform public.queue_whatsapp_basket_payment_confirmation_v1(new.conversation_id,m.id); end if;
    new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','basket_customer_data_processed'); new.updated_at:=now(); return new;
  end if;

  if st.awaiting in ('basket_post_storefront','basket_payment_selection','basket_final_confirmation') and (iid='da_basket_add_more' or normalized ~ '(^| )(adicionar|acrescentar|incluir)( mais)? produtos?( |$)' or normalized ~ '(^| )quero adicionar mais produtos( |$)') then
    perform public.queue_whatsapp_basket_add_more_v1(new.conversation_id,m.id); new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','basket_add_more'); new.updated_at:=now(); return new;
  end if;
  if st.awaiting in ('basket_post_storefront','basket_payment_selection','basket_final_confirmation') and (iid='da_basket_change_address' or normalized ~ '(^| )(alterar|mudar|corrigir)( o)? endereco( |$)') then
    update public.whatsapp_sales_state set pending_payment_method=null where conversation_id=new.conversation_id;
    perform public.update_whatsapp_sales_state_v1(new.conversation_id,null,null,'basket_customer_base_data',null,'basket_customer_base_data');
    perform public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,E'Claro. Envie os dados corretos em uma única mensagem:\nNome | Rua | Quadra | Casa | Bairro | Cidade | Referência (opcional)','text',null,null,'request_customer_base_data',jsonb_build_object('change_address',true),1);
    new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','change_basket_delivery_address'); new.updated_at:=now(); return new;
  end if;

  if st.awaiting='basket_post_storefront' then
    if iid='da_basket_finalize' or normalized ~ '(^| )(finalizar|fechar|concluir)( o)? pedido( |$)' then
      perform public.queue_whatsapp_basket_payment_confirmation_v1(new.conversation_id,m.id); new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','basket_payment_selection'); new.updated_at:=now(); return new;
    end if;
  elsif st.awaiting='basket_payment_selection' then
    method:=public.normalize_whatsapp_basket_payment_method_v1(case when iid<>'' then iid else normalized end);
    if method is null then perform public.queue_whatsapp_basket_payment_confirmation_v1(new.conversation_id,m.id); new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','basket_payment_clarification'); new.updated_at:=now(); return new; end if;
    perform public.queue_whatsapp_basket_final_confirmation_v1(new.conversation_id,m.id,method); new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','basket_final_confirmation','payment_method',method); new.updated_at:=now(); return new;
  elsif st.awaiting='basket_final_confirmation' then
    if iid='da_basket_confirm_order' or normalized ~ '(^| )(confirmar|confirmo|pode confirmar|fechar pedido|confirmar pedido)( |$)' then
      method:=st.pending_payment_method;
      if method is null then perform public.queue_whatsapp_basket_payment_confirmation_v1(new.conversation_id,m.id); new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','basket_payment_missing'); new.updated_at:=now(); return new; end if;
      final_result:=public.finalize_whatsapp_basket_order_request_v2(new.conversation_id,method); req_id:=nullif(final_result->>'request_id','')::uuid;
      if req_id is not null then update public.whatsapp_basket_order_requests set status='accepted',updated_at=now() where id=req_id; end if;
      perform public.clear_whatsapp_sales_state_v1(new.conversation_id);
      delivery_text:=to_char((final_result->>'delivery_date')::date,'DD/MM/YYYY');
      reply:='Pedido confirmado ✅ Total: R$ '||replace(to_char((final_result->>'total')::numeric,'FM999999990.00'),'.',',')||'. Pagamento: '||coalesce(final_result->>'payment_label','na entrega')||'. Entrega prevista: '||delivery_text||'. Se precisar de mais alguma coisa, pode falar comigo por aqui.';
      perform public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,reply,'text',null,null,'basket_order_confirmed',final_result||jsonb_build_object('status','accepted'),1);
      new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','basket_order_confirmed','order_request',final_result); new.updated_at:=now(); return new;
    end if;
    perform public.queue_whatsapp_basket_final_confirmation_v1(new.conversation_id,m.id,st.pending_payment_method); new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','basket_final_confirmation_repeat'); new.updated_at:=now(); return new;
  end if;
  return new;
end;$$;

revoke all on function public.queue_whatsapp_basket_post_storefront_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.queue_whatsapp_basket_add_more_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.queue_whatsapp_basket_final_confirmation_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.queue_whatsapp_basket_post_storefront_v1(uuid,uuid) to service_role;
grant execute on function public.queue_whatsapp_basket_add_more_v1(uuid,uuid) to service_role;
grant execute on function public.queue_whatsapp_basket_final_confirmation_v1(uuid,uuid,text) to service_role;
