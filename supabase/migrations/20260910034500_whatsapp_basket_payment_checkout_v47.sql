-- Dona Antônia — checkout curto de cesta com pagamento na entrega.
-- Objetivo: depois de escolher/manter/personalizar a cesta, confirmar em uma única
-- interação o resumo + endereço + forma de pagamento. Nenhum efeito fiscal/Bling.

alter table public.whatsapp_basket_order_requests
  add column if not exists payment_method text;

alter table public.whatsapp_basket_order_requests
  drop constraint if exists whatsapp_basket_order_requests_payment_method_check;

alter table public.whatsapp_basket_order_requests
  add constraint whatsapp_basket_order_requests_payment_method_check
  check (payment_method is null or payment_method in ('pix','cash','credit_card','food_card'));

create or replace function public.normalize_whatsapp_basket_payment_method_v1(p_value text)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when translate(lower(trim(coalesce(p_value,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') in ('pix','da_basket_payment_pix') then 'pix'
    when translate(lower(trim(coalesce(p_value,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') in ('dinheiro','cash','da_basket_payment_cash') then 'cash'
    when translate(lower(trim(coalesce(p_value,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') in ('cartao','cartao de credito','credito','credit_card','da_basket_payment_credit') then 'credit_card'
    when translate(lower(trim(coalesce(p_value,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') in ('cartao alimentacao','cartao refeicao','alimentacao','refeicao','food_card','da_basket_payment_food') then 'food_card'
    else null
  end;
$$;

create or replace function public.whatsapp_basket_payment_label_v1(p_method text)
returns text
language sql
immutable
set search_path=''
as $$
  select case public.normalize_whatsapp_basket_payment_method_v1(p_method)
    when 'pix' then 'PIX na entrega'
    when 'cash' then 'Dinheiro na entrega'
    when 'credit_card' then 'Cartão de crédito na entrega'
    when 'food_card' then 'Cartão alimentação/refeição na entrega'
    else null
  end;
$$;

create or replace function public.format_whatsapp_basket_checkout_brief_v1(p_conversation_id uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  flow jsonb;
  contact jsonb;
  basket_session_id uuid;
  cart_id uuid;
  basket_name text;
  total_value numeric:=0;
  customized boolean:=false;
  extras_units integer:=0;
  address_line text;
  txt text;
begin
  flow:=public.get_whatsapp_basket_flow_state_v1(p_conversation_id);
  if coalesce((flow->>'active')::boolean,false) is not true then raise exception 'basket_flow_not_found'; end if;

  contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);
  basket_session_id:=nullif(flow->'basket_session'->>'id','')::uuid;
  cart_id:=nullif(flow->'cart'->>'id','')::uuid;
  basket_name:=coalesce(nullif(flow->'basket'->>'name',''),'Cesta básica');
  total_value:=coalesce((flow->'cart'->>'total')::numeric,(flow->'basket'->>'base_price')::numeric,0);
  address_line:=public.whatsapp_address_line_v1(coalesce(contact->'address','{}'::jsonb));

  if basket_session_id is not null then
    select exists(
      select 1
      from public.catalog_session_items i
      where i.catalog_session_id=basket_session_id
        and (
          i.quantity is distinct from coalesce(nullif(i.metadata->>'base_quantity','')::numeric,i.quantity)
          or coalesce(i.metadata->'substitution','null'::jsonb) <> 'null'::jsonb
        )
    ) into customized;
  end if;

  if cart_id is not null then
    select coalesce(sum(ci.quantity),0)::integer
      into extras_units
    from public.cart_items ci
    where ci.cart_id=cart_id and ci.source='addon' and ci.quantity>0;
  end if;

  txt:='*Revise sua encomenda*'||E'\n'
    ||'Cesta: '||left(basket_name,90)||case when customized then ' (personalizada)' else '' end||E'\n'
    ||case when extras_units>0 then 'Produtos adicionais: '||extras_units::text||E'\n' else '' end
    ||'*Total: R$ '||replace(to_char(total_value,'FM999999990.00'),'.',',')||'*'||E'\n'
    ||'Entrega: '||left(address_line,300)||E'\n\n'
    ||'Se está tudo certo, escolha como vai pagar para confirmar a encomenda.';

  return left(txt,1000);
end;
$$;

create or replace function public.whatsapp_basket_payment_interactive_v1(p_conversation_id uuid)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'type','list',
    'body',jsonb_build_object('text',public.format_whatsapp_basket_checkout_brief_v1(p_conversation_id)),
    'action',jsonb_build_object(
      'button','Escolher pagamento',
      'sections',jsonb_build_array(
        jsonb_build_object(
          'title','Pagamento na entrega',
          'rows',jsonb_build_array(
            jsonb_build_object('id','da_basket_payment_pix','title','PIX na entrega','description','Pague no recebimento'),
            jsonb_build_object('id','da_basket_payment_cash','title','Dinheiro na entrega','description','Pague no recebimento'),
            jsonb_build_object('id','da_basket_payment_credit','title','Cartão de crédito','description','Pague no recebimento'),
            jsonb_build_object('id','da_basket_payment_food','title','Cartão alimentação','description','Alimentação/refeição na entrega'),
            jsonb_build_object('id','da_basket_change_address','title','Alterar endereço','description','Corrigir dados da entrega')
          )
        )
      )
    )
  );
$$;

create or replace function public.queue_whatsapp_basket_payment_confirmation_v1(
  p_conversation_id uuid,
  p_source_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  src uuid:=p_source_message_id;
  body text;
  interactive jsonb;
  q jsonb;
begin
  if src is null then
    select id into src
    from public.messages
    where conversation_id=p_conversation_id and direction='inbound'
    order by created_at desc limit 1;
  end if;

  body:=public.format_whatsapp_basket_checkout_brief_v1(p_conversation_id);
  interactive:=public.whatsapp_basket_payment_interactive_v1(p_conversation_id);

  perform public.update_whatsapp_sales_state_v1(
    p_conversation_id,null,null,'basket_payment_requested',null,'basket_payment_selection'
  );

  q:=public.queue_whatsapp_sales_reply_v1(
    p_conversation_id,src,body,'interactive',null,interactive,
    'basket_payment_confirmation',jsonb_build_object('checkout','basket','confirmation_by_payment_selection',true),1
  );

  return jsonb_build_object('ok',true,'step','payment_selection','queued',true,'queue',q);
end;
$$;

-- Aceita os 6 campos essenciais e, opcionalmente, um 7º campo de referência/localizador.
create or replace function public.parse_and_save_whatsapp_customer_base_v1(p_conversation_id uuid,p_text text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  raw text:=trim(coalesce(p_text,''));
  parts text[];
  nm text;street text;block text;house text;neighborhood text;city text;locator text;
  saved jsonb;
begin
  raw:=replace(raw,';','|');
  parts:=regexp_split_to_array(raw,'\s*\|\s*');

  if cardinality(parts) in (6,7) then
    nm:=trim(parts[1]);street:=trim(parts[2]);block:=trim(parts[3]);house:=trim(parts[4]);
    neighborhood:=trim(parts[5]);city:=trim(parts[6]);
    if cardinality(parts)=7 then locator:=nullif(trim(parts[7]),''); end if;
  else
    nm:=substring(raw from '(?i)nome\s*:\s*([^\n|;]+)');
    street:=substring(raw from '(?i)rua\s*:\s*([^\n|;]+)');
    block:=coalesce(substring(raw from '(?i)quadra\s*:\s*([^\n|;]+)'),'');
    house:=coalesce(substring(raw from '(?i)(?:casa|n[uú]mero|nº)\s*:\s*([^\n|;]+)'),'');
    neighborhood:=substring(raw from '(?i)bairro\s*:\s*([^\n|;]+)');
    city:=substring(raw from '(?i)cidade\s*:\s*([^\n|;]+)');
    locator:=coalesce(
      substring(raw from '(?i)localizador\s*:\s*([^\n|;]+)'),
      substring(raw from '(?i)(?:refer[eê]ncia|ponto de refer[eê]ncia)\s*:\s*([^\n|;]+)')
    );
  end if;

  if nullif(trim(coalesce(nm,'')),'') is null
     or nullif(trim(coalesce(street,'')),'') is null
     or nullif(trim(coalesce(house,'')),'') is null
     or nullif(trim(coalesce(neighborhood,'')),'') is null
     or nullif(trim(coalesce(city,'')),'') is null then
    return jsonb_build_object('ok',false,'error','base_customer_fields_missing');
  end if;

  begin
    saved:=public.save_whatsapp_customer_base_v1(p_conversation_id,nm,street,block,house,neighborhood,city);
    if nullif(trim(coalesce(locator,'')),'') is not null then
      perform public.set_whatsapp_locator_v1(p_conversation_id,locator);
    end if;
    return jsonb_build_object('ok',true,'contact',public.get_whatsapp_checkout_contact_v1(p_conversation_id));
  exception when others then
    return jsonb_build_object('ok',false,'error',sqlerrm);
  end;
end;
$$;

create or replace function public.start_whatsapp_basket_checkout_v2(
  p_conversation_id uuid,
  p_source_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  c public.conversations%rowtype;
  contact jsonb;
  src uuid:=p_source_message_id;
  q jsonb;
begin
  select * into c from public.conversations where id=p_conversation_id for update;
  if not found then raise exception 'conversation_not_found'; end if;
  if c.mode='human' or c.human_required then return jsonb_build_object('ok',false,'reason','conversation_requires_human'); end if;
  if c.service_window_expires_at<=now() then return jsonb_build_object('ok',false,'reason','conversation_service_window_closed'); end if;

  if src is null then
    select id into src from public.messages
    where conversation_id=p_conversation_id and direction='inbound'
    order by created_at desc limit 1;
  end if;

  contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);

  if coalesce((contact->>'base_complete')::boolean,false) is not true then
    perform public.update_whatsapp_sales_state_v1(
      p_conversation_id,null,null,'basket_customer_base_data',null,'basket_customer_base_data'
    );
    q:=public.queue_whatsapp_sales_reply_v1(
      p_conversation_id,src,
      E'Para finalizar, envie os dados em uma única mensagem:\nNome | Rua | Quadra | Casa | Bairro | Cidade | Referência (opcional)\n\nExemplo: Maria Silva | Rua A | 12 | 34 | Centro | Cuiabá | perto da igreja',
      'text',null,null,'request_customer_base_data',contact,1
    );
    return jsonb_build_object('ok',true,'step','customer_base_data','queued',true,'queue',q);
  end if;

  return public.queue_whatsapp_basket_payment_confirmation_v1(p_conversation_id,src);
end;
$$;

create or replace function public.finalize_whatsapp_basket_order_request_v2(
  p_conversation_id uuid,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  method text:=public.normalize_whatsapp_basket_payment_method_v1(p_payment_method);
  result jsonb;
  request_id uuid;
begin
  if method is null then raise exception 'invalid_payment_method'; end if;
  result:=public.finalize_whatsapp_basket_order_request_v1(p_conversation_id);
  request_id:=nullif(result->>'request_id','')::uuid;
  if request_id is null then raise exception 'basket_order_request_missing'; end if;

  update public.whatsapp_basket_order_requests
     set payment_method=method,updated_at=now()
   where id=request_id;

  return result||jsonb_build_object(
    'payment_method',method,
    'payment_label',public.whatsapp_basket_payment_label_v1(method)
  );
end;
$$;

-- Roda antes do checkout legado e só captura os dois novos estados.
create or replace function public.route_whatsapp_basket_payment_checkout_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  st public.whatsapp_sales_state%rowtype;
  iid text:='';
  normalized text:='';
  method text;
  parsed jsonb;
  final_result jsonb;
  delivery_text text;
  reply text;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into m from public.messages where id=new.message_id and direction='inbound';
  if not found then return new; end if;
  select * into st from public.whatsapp_sales_state where conversation_id=new.conversation_id;
  if not found then return new; end if;

  iid:=coalesce(m.ai_interpretation->>'id','');
  normalized:=translate(lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');

  if st.awaiting='basket_customer_base_data' then
    parsed:=public.parse_and_save_whatsapp_customer_base_v1(new.conversation_id,coalesce(m.body_text,m.transcript,''));
    if coalesce((parsed->>'ok')::boolean,false) is not true then
      perform public.queue_whatsapp_sales_reply_v1(
        new.conversation_id,m.id,
        E'Preciso destes dados em uma única mensagem:\nNome | Rua | Quadra | Casa | Bairro | Cidade | Referência (opcional)',
        'text',null,null,'request_customer_base_data',parsed,1
      );
      new.status:='done';
      new.result:=jsonb_build_object('deterministic',true,'action','request_customer_base_data');
      new.updated_at:=now();
      return new;
    end if;

    perform public.queue_whatsapp_basket_payment_confirmation_v1(new.conversation_id,m.id);
    new.status:='done';
    new.result:=jsonb_build_object('deterministic',true,'action','basket_payment_selection');
    new.updated_at:=now();
    return new;
  end if;

  if st.awaiting<>'basket_payment_selection' then return new; end if;

  if iid='da_basket_change_address' or normalized ~ '(^| )(alterar|mudar|corrigir)( o)? endereco( |$)' then
    perform public.update_whatsapp_sales_state_v1(
      new.conversation_id,null,null,'basket_customer_base_data',null,'basket_customer_base_data'
    );
    perform public.queue_whatsapp_sales_reply_v1(
      new.conversation_id,m.id,
      E'Claro. Envie os dados corretos em uma única mensagem:\nNome | Rua | Quadra | Casa | Bairro | Cidade | Referência (opcional)',
      'text',null,null,'request_customer_base_data',jsonb_build_object('change_address',true),1
    );
    new.status:='done';
    new.result:=jsonb_build_object('deterministic',true,'action','change_basket_delivery_address');
    new.updated_at:=now();
    return new;
  end if;

  method:=public.normalize_whatsapp_basket_payment_method_v1(case when iid<>'' then iid else normalized end);
  if method is null then
    perform public.queue_whatsapp_basket_payment_confirmation_v1(new.conversation_id,m.id);
    new.status:='done';
    new.result:=jsonb_build_object('deterministic',true,'action','basket_payment_clarification');
    new.updated_at:=now();
    return new;
  end if;

  final_result:=public.finalize_whatsapp_basket_order_request_v2(new.conversation_id,method);
  perform public.clear_whatsapp_sales_state_v1(new.conversation_id);
  delivery_text:=to_char((final_result->>'delivery_date')::date,'DD/MM/YYYY');
  reply:='Encomenda recebida para conferência. Total: R$ '
    ||replace(to_char((final_result->>'total')::numeric,'FM999999990.00'),'.',',')
    ||'. Pagamento: '||coalesce(final_result->>'payment_label','na entrega')
    ||'. Entrega prevista: '||delivery_text||'. A equipe vai conferir e concluir o atendimento com você.';

  perform public.queue_whatsapp_sales_reply_v1(
    new.conversation_id,m.id,reply,'text',null,null,'basket_ready_for_human',final_result,1
  );
  perform public.queue_human_handoff_v1(
    new.conversation_id,'basket_order_ready_for_human',m.id,3::smallint,
    'Encomenda de cesta pronta para conferência e conclusão humana.',
    jsonb_build_object('source','whatsapp_basket_payment_checkout_v1','order_request',final_result)
  );

  new.status:='done';
  new.result:=jsonb_build_object('deterministic',true,'action','basket_ready_for_human','order_request',final_result);
  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function public.normalize_whatsapp_basket_payment_method_v1(text) from public,anon,authenticated;
revoke all on function public.whatsapp_basket_payment_label_v1(text) from public,anon,authenticated;
revoke all on function public.format_whatsapp_basket_checkout_brief_v1(uuid) from public,anon,authenticated;
revoke all on function public.whatsapp_basket_payment_interactive_v1(uuid) from public,anon,authenticated;
revoke all on function public.queue_whatsapp_basket_payment_confirmation_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.start_whatsapp_basket_checkout_v2(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finalize_whatsapp_basket_order_request_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.route_whatsapp_basket_payment_checkout_v1() from public,anon,authenticated;

grant execute on function public.normalize_whatsapp_basket_payment_method_v1(text) to service_role;
grant execute on function public.whatsapp_basket_payment_label_v1(text) to service_role;
grant execute on function public.format_whatsapp_basket_checkout_brief_v1(uuid) to service_role;
grant execute on function public.whatsapp_basket_payment_interactive_v1(uuid) to service_role;
grant execute on function public.queue_whatsapp_basket_payment_confirmation_v1(uuid,uuid) to service_role;
grant execute on function public.start_whatsapp_basket_checkout_v2(uuid,uuid) to service_role;
grant execute on function public.finalize_whatsapp_basket_order_request_v2(uuid,text) to service_role;

drop trigger if exists aaa_whatsapp_basket_payment_checkout_v1 on public.ai_jobs;
create trigger aaa_whatsapp_basket_payment_checkout_v1
before insert on public.ai_jobs
for each row execute function public.route_whatsapp_basket_payment_checkout_v1();
