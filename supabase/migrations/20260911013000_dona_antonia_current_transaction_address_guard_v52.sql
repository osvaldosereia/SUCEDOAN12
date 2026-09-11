-- V52: scope historical confirmed orders to the current transaction, ignore stale Flow returns,
-- and provide a gate-safe address-edit compatibility lane while WhatsApp Flow send remains OFF.

create or replace function public.is_whatsapp_confirmed_order_mutation_request_v1(
  p_conversation_id uuid,
  p_message_id uuid
) returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.messages m
    where m.id=p_message_id
      and m.conversation_id=p_conversation_id
      and m.direction='inbound'
      and exists(
        select 1 from public.orders o
        where o.conversation_id=p_conversation_id
          and o.confirmed_at is not null
      )
      and public.service_norm_text_v1(coalesce(m.body_text,m.transcript,''))
          ~ '(^| )(pedido|encomenda|compra|confirmad[oa]?|finalizad[oa]?|fechad[oa]?)( |$)'
      and public.service_norm_text_v1(coalesce(m.body_text,m.transcript,''))
          ~ '(^| )(alterar|mudar|trocar|corrigir|cancelar|cancelamento|endereco|pagamento|produto|item|devolver|devolucao|reembolso|atrasad[oa]?|atraso|faltando|faltou|errad[oa]?|avariad[oa]?|quebrad[oa]?|nao chegou|nao recebi)( |$)'
  );
$$;

create or replace function public.is_whatsapp_address_change_request_v1(
  p_conversation_id uuid,
  p_message_id uuid
) returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.messages m
    where m.id=p_message_id
      and m.conversation_id=p_conversation_id
      and m.direction='inbound'
      and (
        coalesce(m.ai_interpretation->>'id','')='da_basket_change_address'
        or public.service_norm_text_v1(coalesce(m.body_text,m.transcript,''))
           ~ '(^| )(alterar|mudar|corrigir|atualizar|trocar)( o| meu| o meu| a| minha| a minha)? endereco( |$)'
        or public.service_norm_text_v1(coalesce(m.body_text,m.transcript,''))
           ~ '(^| )endereco( esta| ta)? errad[oa]?( |$)'
        or public.service_norm_text_v1(coalesce(m.body_text,m.transcript,''))
           ~ '(^| )entrega .* outro lugar( |$)'
      )
  );
$$;

create or replace function public.get_whatsapp_basket_flow_state_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base_s public.catalog_sessions%rowtype;
  extra_s public.catalog_sessions%rowtype;
  pending_s public.catalog_sessions%rowtype;
  b public.basket_templates%rowtype;
  k public.carts%rowtype;
  cust jsonb;
begin
  select * into base_s
  from public.catalog_sessions
  where conversation_id=p_conversation_id
    and metadata->>'flow'='basket_basic_v1'
  order by created_at desc
  limit 1;

  if base_s.id is not null then
    select * into b from public.basket_templates
    where id=nullif(base_s.metadata->>'basket_id','')::uuid;
  end if;

  select * into extra_s
  from public.catalog_sessions
  where conversation_id=p_conversation_id
    and metadata->>'flow'='basket_extras_v1'
    and (
      base_s.id is null
      or metadata->>'parent_basket_session_id'=base_s.id::text
    )
  order by created_at desc
  limit 1;

  -- A return belongs only to the current basket session. Old closed sessions must
  -- never hijack a new customer message.
  if base_s.id is not null then
    select * into pending_s
    from public.catalog_sessions
    where conversation_id=p_conversation_id
      and coalesce(metadata->>'return_intent','')<>''
      and (
        id=base_s.id
        or metadata->>'parent_basket_session_id'=base_s.id::text
      )
    order by last_activity_at desc,created_at desc
    limit 1;
  end if;

  if base_s.cart_id is not null then
    select * into k from public.carts where id=base_s.cart_id;
  end if;

  cust:=public.get_whatsapp_basket_customer_status_v1(p_conversation_id);
  return jsonb_build_object(
    'active',base_s.id is not null,
    'basket_session',case when base_s.id is null then null else jsonb_build_object('id',base_s.id,'token',base_s.public_token,'status',base_s.status,'metadata',base_s.metadata) end,
    'basket',case when b.id is null then null else jsonb_build_object('id',b.id,'name',b.name,'base_price',b.base_price,'image_url',b.image_url) end,
    'extras_session',case when extra_s.id is null then null else jsonb_build_object('id',extra_s.id,'token',extra_s.public_token,'status',extra_s.status,'metadata',extra_s.metadata) end,
    'pending_return',case when pending_s.id is null then null else jsonb_build_object('session_id',pending_s.id,'intent',pending_s.metadata->>'return_intent','flow',pending_s.metadata->>'flow') end,
    'cart',case when k.id is null then null else jsonb_build_object('id',k.id,'total',k.total,'base_commercial_price',k.base_commercial_price,'basket_id',k.basket_id) end,
    'customer_status',cust
  );
end;
$$;

create or replace function public.build_whatsapp_agent_core_packet_v4(
  p_conversation_id uuid,
  p_message_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_packet jsonb;
  v_topic text;
  v_interactive text;
  v_order jsonb;
  v_active_transaction boolean:=false;
  v_confirmed_order_mutation boolean:=false;
begin
  v_packet:=public.build_whatsapp_agent_core_packet_v3(p_conversation_id,p_message_id);
  if coalesce((v_packet->>'enabled')::boolean,false) is not true then
    return v_packet;
  end if;

  v_interactive:=coalesce(
    v_packet#>>'{pre_router_state,interactive_id}',
    v_packet#>>'{message,interactive,id}',
    ''
  );
  v_topic:=public.resolve_whatsapp_agent_core_topic_v6(
    coalesce(v_packet#>>'{message,text}',''),
    coalesce(v_packet#>>'{conversation,stage}',''),
    coalesce(v_packet#>>'{sales_state,awaiting}',''),
    v_interactive
  );

  v_order:=coalesce(v_packet->'order','{}'::jsonb);
  v_active_transaction:=
    coalesce((v_packet#>>'{cart,exists}')::boolean,false)
    or coalesce((v_packet#>>'{pre_router_state,basket_session_active}')::boolean,false)
    or nullif(coalesce(v_packet#>>'{sales_state,awaiting}',''),'') is not null;
  v_confirmed_order_mutation:=public.is_whatsapp_confirmed_order_mutation_request_v1(p_conversation_id,p_message_id);

  if v_active_transaction
     and not v_confirmed_order_mutation
     and v_topic in ('basket','checkout','payment','delivery')
     and coalesce((v_order->>'commercial_commitment_exists')::boolean,false)
  then
    v_order:=v_order||jsonb_build_object(
      'status','historical_confirmed',
      'confirmed',false,
      'commercial_commitment_exists',false,
      'historical_confirmed_exists',true,
      'current_transaction_scope',true
    );
    v_packet:=jsonb_set(v_packet,'{order}',v_order,true);
  end if;

  return v_packet||jsonb_build_object(
    'topic',v_topic,
    'metadata',coalesce(v_packet->'metadata','{}'::jsonb)||jsonb_build_object(
      'packet_version',4,
      'topic_resolver','resolve_whatsapp_agent_core_topic_v6',
      'pre_router_state_authoritative',coalesce((v_packet#>>'{metadata,pre_router_snapshot_used}')::boolean,false),
      'transaction_scope_guard_version',1,
      'confirmed_order_mutation_current_message',v_confirmed_order_mutation,
      'pii_added_by_v4',false
    )
  );
end;
$$;

create or replace function public.parse_whatsapp_address_text_v1(p_message text)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  raw text:=coalesce(p_message,'');
  m text[];
  street text:=''; num text:=''; complement text:=''; neighborhood text:=''; city text:=''; postal text:=''; reference text:='';
begin
  m:=regexp_match(raw,'(?:^|\n)\s*(?:rua|logradouro)\s*:\s*([^\n;]+)','i'); if m is not null then street:=trim(m[1]); end if;
  m:=regexp_match(raw,'(?:^|\n)\s*(?:numero|número|nº|casa)\s*:\s*([^\n;]+)','i'); if m is not null then num:=trim(m[1]); end if;
  m:=regexp_match(raw,'(?:^|\n)\s*(?:complemento)\s*:\s*([^\n;]+)','i'); if m is not null then complement:=trim(m[1]); end if;
  m:=regexp_match(raw,'(?:^|\n)\s*(?:bairro)\s*:\s*([^\n;]+)','i'); if m is not null then neighborhood:=trim(m[1]); end if;
  m:=regexp_match(raw,'(?:^|\n)\s*(?:cidade)\s*:\s*([^\n;]+)','i'); if m is not null then city:=trim(m[1]); end if;
  m:=regexp_match(raw,'(?:^|\n)\s*(?:cep)\s*:\s*([^\n;]+)','i'); if m is not null then postal:=trim(m[1]); end if;
  m:=regexp_match(raw,'(?:^|\n)\s*(?:referencia|referência|localizador)\s*:\s*([^\n;]+)','i'); if m is not null then reference:=trim(m[1]); end if;
  return jsonb_build_object(
    'street',street,'number',num,'complement',complement,'neighborhood',neighborhood,
    'city',city,'postal_code',postal,'reference',reference,
    'complete',street<>'' and num<>'' and neighborhood<>'' and city<>''
  );
end;
$$;

create or replace function public.route_whatsapp_active_basket_address_guard_v52()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  st public.whatsapp_sales_state%rowtype;
  cfg public.automation_config%rowtype;
  parsed jsonb;
  use_flow boolean:=false;
  has_active_basket boolean:=false;
  saved jsonb;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into m from public.messages where id=new.message_id and direction='inbound';
  if not found then return new; end if;
  select * into st from public.whatsapp_sales_state where conversation_id=new.conversation_id;
  if not found then return new; end if;

  if st.awaiting='basket_address_text' then
    parsed:=public.parse_whatsapp_address_text_v1(coalesce(m.body_text,m.transcript,''));
    if coalesce((parsed->>'complete')::boolean,false) is not true then
      perform public.queue_whatsapp_sales_reply_v1(
        new.conversation_id,m.id,
        E'Envie o novo endereço em uma única mensagem assim:\n\nRua: \nNúmero/Casa: \nBairro: \nCidade: \nComplemento: (opcional)\nReferência: (opcional)',
        'text',null,null,'address_text_retry',jsonb_build_object('complete',false),1
      );
      new.status:='done';
      new.result:=jsonb_build_object('deterministic',true,'action','change_basket_delivery_address','address_input_required',true);
      new.updated_at:=now();
      return new;
    end if;

    saved:=public.save_whatsapp_customer_address_v2(
      new.conversation_id,
      parsed->>'postal_code',parsed->>'street',parsed->>'number',parsed->>'complement',
      parsed->>'neighborhood',parsed->>'city',parsed->>'reference'
    );
    if st.pending_payment_method is not null then
      perform public.queue_whatsapp_basket_final_confirmation_v1(new.conversation_id,m.id,st.pending_payment_method);
    else
      perform public.queue_whatsapp_basket_payment_confirmation_v1(new.conversation_id,m.id);
    end if;
    new.status:='done';
    new.result:=jsonb_build_object('deterministic',true,'action','change_basket_delivery_address','address_saved',true);
    new.updated_at:=now();
    return new;
  end if;

  if public.is_whatsapp_address_change_request_v1(new.conversation_id,m.id) is not true then return new; end if;
  if public.is_whatsapp_confirmed_order_mutation_request_v1(new.conversation_id,m.id) then return new; end if;

  select exists(
    select 1 from public.catalog_sessions s
    where s.conversation_id=new.conversation_id
      and s.metadata->>'flow'='basket_basic_v1'
      and s.status='open'
  ) into has_active_basket;
  if not has_active_basket then return new; end if;

  select * into cfg from public.automation_config where id=1;
  use_flow:=coalesce(cfg.whatsapp_flow_send_enabled,false)
            and coalesce(cfg.experience_orchestrator_enabled,false);

  if use_flow then
    perform public.queue_whatsapp_address_flow_v1(
      new.conversation_id,m.id,
      case when st.awaiting in ('basket_post_storefront','basket_payment_selection','basket_final_confirmation')
           then st.awaiting else 'basket_payment_selection' end
    );
  else
    perform public.update_whatsapp_sales_state_v1(
      p_conversation_id=>new.conversation_id,
      p_awaiting=>'basket_address_text',
      p_last_action=>'address_text_requested'
    );
    perform public.queue_whatsapp_sales_reply_v1(
      new.conversation_id,m.id,
      E'Claro. Envie o novo endereço em uma única mensagem assim:\n\nRua: \nNúmero/Casa: \nBairro: \nCidade: \nComplemento: (opcional)\nReferência: (opcional)',
      'text',null,null,'request_address_text',jsonb_build_object('flow_send_enabled',false),1
    );
  end if;

  new.status:='done';
  new.result:=jsonb_build_object(
    'deterministic',true,
    'action','change_basket_delivery_address',
    'delivery_mode',case when use_flow then 'flow' else 'text_fallback' end
  );
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists a2_whatsapp_active_basket_address_guard_v52 on public.ai_jobs;
create trigger a2_whatsapp_active_basket_address_guard_v52
before insert on public.ai_jobs
for each row execute function public.route_whatsapp_active_basket_address_guard_v52();

insert into public.agent_core_router_inventory(
  table_name,trigger_name,function_name,phase,classification,retirement_state,precedence,notes,last_verified_at
) values (
  'ai_jobs','a2_whatsapp_active_basket_address_guard_v52','route_whatsapp_active_basket_address_guard_v52',
  'before','compatibility','keep',20,
  'Compatibilidade determinística de alteração de endereço em cesta ativa. Respeita gates: Flow só é enviado quando flow_send e orchestrator estiverem explicitamente ativos; caso contrário usa fallback textual. Não trata da decisão semântica geral do Agent Core.',now()
)
on conflict (table_name,trigger_name) do update set
  function_name=excluded.function_name,
  phase=excluded.phase,
  classification=excluded.classification,
  retirement_state=excluded.retirement_state,
  precedence=excluded.precedence,
  notes=excluded.notes,
  last_verified_at=now();

insert into public.agent_eval_scenarios(
  scenario_key,category,message_text,stage,awaiting,fixture,expected,priority,source,active
) values (
  'delivery_change_address_historical_order_scoped','delivery','Quero mudar o endereço de entrega','checkout',null,
  '{"cart":{"total":230,"exists":true,"is_basket":true},"customer":{"registered":true,"has_known_address":true},"order":{"exists":true,"status":"historical_confirmed","confirmed":false,"commercial_commitment_exists":false,"historical_confirmed_exists":true}}'::jsonb,
  '{"critical":true,"tool_any":["wa_request_address_flow"],"intent_any":["delivery","checkout"],"needs_human":false,"answer_semantics":"pedido confirmado histórico não pode sequestrar uma nova compra ativa"}'::jsonb,
  1,'v52_real_regression',true
)
on conflict (scenario_key) do update set
  category=excluded.category,message_text=excluded.message_text,stage=excluded.stage,awaiting=excluded.awaiting,
  fixture=excluded.fixture,expected=excluded.expected,priority=excluded.priority,source=excluded.source,active=true,updated_at=now();