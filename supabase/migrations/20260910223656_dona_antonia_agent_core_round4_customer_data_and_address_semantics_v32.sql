begin;

create or replace function public.is_whatsapp_customer_data_change_request_v1(
  p_conversation_id uuid,
  p_message_id uuid
)
returns boolean
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
        coalesce(m.ai_interpretation->>'id','')='da_basket_customer_change'
        or public.service_norm_text_v1(coalesce(m.body_text,m.transcript,'')) ~ '(^| )(alterar|mudar|corrigir|atualizar)( meus?| os)? (dados|cadastro)( |$)'
      )
  );
$$;
revoke all on function public.is_whatsapp_customer_data_change_request_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.is_whatsapp_customer_data_change_request_v1(uuid,uuid) to service_role;

create or replace function public.resolve_whatsapp_agent_core_topic_v4(
  p_message text,
  p_stage text,
  p_awaiting text,
  p_interactive_id text
)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base text;
  q text:=public.service_norm_text_v1(p_message);
  iid text:=lower(split_part(trim(coalesce(p_interactive_id,'')),':',1));
  vocab jsonb;
begin
  if iid in ('da_basket_change_address','da_basket_customer_change') then return 'checkout'; end if;
  if q ~ '(^| )(alterar|mudar|corrigir)( o| meu| o meu)? endereco( |$)' then return 'checkout'; end if;
  if q ~ '(^| )(alterar|mudar|corrigir|atualizar)( meus?| os)? (dados|cadastro)( |$)' then return 'checkout'; end if;

  base:=public.resolve_whatsapp_agent_core_topic_v3(p_message,p_stage,p_awaiting,p_interactive_id);
  if base not in ('general','product_search') then return base; end if;
  if q ~ '(^| )(cadastro|meu cadastro|meus dados)( |$)' then return 'general'; end if;
  vocab:=public.match_whatsapp_product_vocabulary_v1(p_message);
  if coalesce((vocab->>'matched')::boolean,false) then return 'product_search'; end if;
  return base;
end;
$$;
revoke all on function public.resolve_whatsapp_agent_core_topic_v4(text,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_whatsapp_agent_core_topic_v4(text,text,text,text) to service_role;

create or replace function public.evaluate_whatsapp_agent_action_preconditions_v3(
  p_conversation_id uuid,
  p_message_id uuid,
  p_action_key text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb:=public.evaluate_whatsapp_agent_action_preconditions_v2(
    p_conversation_id,p_message_id,p_action_key,coalesce(p_input,'{}'::jsonb)
  );
  v_missing jsonb:=coalesce(v_base->'missing','[]'::jsonb);
  v_checks jsonb:=coalesce(v_base->'checks','{}'::jsonb);
  v_unsupported jsonb:=coalesce(v_base->'unsupported','[]'::jsonb);
  v_customer_change boolean:=false;
begin
  if p_action_key='wa_save_checkout_customer_data' and v_missing ? 'checkout_customer_data_requested' then
    v_customer_change:=public.is_whatsapp_customer_data_change_request_v1(p_conversation_id,p_message_id);
    if v_customer_change then
      select coalesce(jsonb_agg(e.value),'[]'::jsonb) into v_missing
      from jsonb_array_elements(v_missing) e(value)
      where e.value <> to_jsonb('checkout_customer_data_requested'::text);
      v_checks:=v_checks||jsonb_build_object('checkout_customer_data_requested',true,'customer_data_change_requested',true);
    end if;
  end if;

  return v_base||jsonb_build_object(
    'ready',jsonb_array_length(v_missing)=0 and jsonb_array_length(v_unsupported)=0,
    'missing',v_missing,'checks',v_checks,
    'precondition_semantics_version',3,
    'customer_data_change_detector','structured_or_semantic_v1',
    'pii_returned',false
  );
end;
$$;
revoke all on function public.evaluate_whatsapp_agent_action_preconditions_v3(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.evaluate_whatsapp_agent_action_preconditions_v3(uuid,uuid,text,jsonb) to service_role;

create or replace function public.preview_whatsapp_agent_action_v2(
  p_conversation_id uuid,
  p_message_id uuid,
  p_action_key text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb; pre jsonb; allowed boolean; decision text;
begin
  base:=public.preview_whatsapp_agent_action_v1(p_conversation_id,p_action_key,coalesce(p_input,'{}'::jsonb));
  if coalesce((base->>'allowed')::boolean,false) is not true then
    return base||jsonb_build_object('precondition_version',4,'state_preconditions',null);
  end if;
  pre:=public.evaluate_whatsapp_agent_action_preconditions_v3(p_conversation_id,p_message_id,p_action_key,coalesce(p_input,'{}'::jsonb));
  allowed:=coalesce((pre->>'ready')::boolean,false);
  decision:=case when not allowed then 'blocked' else coalesce(base->>'decision','blocked') end;
  return base||jsonb_build_object(
    'allowed',allowed,'decision',decision,
    'reasons',coalesce(base->'reasons','[]'::jsonb)||coalesce(pre->'missing','[]'::jsonb)||coalesce(pre->'unsupported','[]'::jsonb),
    'precondition_version',4,'state_preconditions',pre
  );
end;
$$;
revoke all on function public.preview_whatsapp_agent_action_v2(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.preview_whatsapp_agent_action_v2(uuid,uuid,text,jsonb) to service_role;

create or replace function public.handle_whatsapp_checkout_customer_data_agent_v2(
  p_conversation_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  st public.whatsapp_sales_state%rowtype;
  v_basket boolean:=false;
  v_awaiting text;
  parsed jsonb;
  q jsonb;
begin
  select * into m from public.messages where id=p_message_id and conversation_id=p_conversation_id and direction='inbound';
  if not found then return jsonb_build_object('ok',false,'reason','inbound_message_required','pii_returned',false); end if;

  select exists(
    select 1 from public.catalog_sessions cs
    where cs.conversation_id=p_conversation_id
      and cs.metadata->>'flow'='basket_basic_v1'
      and cs.status='open'
      and (cs.expires_at is null or cs.expires_at>now())
  ) into v_basket;

  if public.is_whatsapp_customer_data_change_request_v1(p_conversation_id,p_message_id) then
    v_awaiting:=case when v_basket then 'basket_customer_base_data' else 'order_customer_base_data' end;
    perform public.update_whatsapp_sales_state_v1(p_conversation_id,null,null,'customer_data_change_requested',null,v_awaiting);
    q:=public.queue_whatsapp_sales_reply_v1(
      p_conversation_id,p_message_id,
      E'Claro. Envie os dados atualizados em uma única mensagem:\nNome | Rua | Quadra | Casa | Bairro | Cidade | Referência (opcional)',
      'text',null,null,'request_customer_base_data',
      jsonb_build_object('source','agent_customer_data_change','basket',v_basket),1
    );
    return jsonb_build_object('ok',true,'step','customer_data_requested','basket',v_basket,'queued',true,'queue_id',q->>'job_id','pii_returned',false);
  end if;

  select * into st from public.whatsapp_sales_state where conversation_id=p_conversation_id;
  if not found or coalesce(st.awaiting,'') not in ('basket_customer_base_data','order_customer_base_data') then
    return jsonb_build_object('ok',false,'reason','customer_data_not_requested','pii_returned',false);
  end if;

  parsed:=public.parse_and_save_whatsapp_customer_base_v1(p_conversation_id,coalesce(m.body_text,m.transcript,''));
  return jsonb_build_object(
    'ok',coalesce((parsed->>'ok')::boolean,false),
    'step',case when coalesce((parsed->>'ok')::boolean,false) then 'customer_data_saved' else 'customer_data_invalid' end,
    'error',case when coalesce((parsed->>'ok')::boolean,false) then null else parsed->>'error' end,
    'pii_returned',false
  );
end;
$$;
revoke all on function public.handle_whatsapp_checkout_customer_data_agent_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_checkout_customer_data_agent_v2(uuid,uuid) to service_role;

update public.ai_action_registry
set version=2,
    display_name='Gerenciar dados de checkout',
    description='Gerencia deterministicamente os dados básicos do checkout. Se o cliente pedir para alterar dados/cadastro, inclusive pelo botão Alterar dados, esta é a ferramenta correta para abrir a coleta. Se o checkout já estiver aguardando os dados, processa a mensagem atual. Nunca use esta ferramenta para uma alteração que mencione especificamente endereço de entrega; nesse caso use wa_request_address_flow.',
    implementation_ref='handle_whatsapp_checkout_customer_data_agent_v2',
    side_effects='["customer_data_collection_state_change","customer_base_update","delivery_address_update","outbound_prepare"]'::jsonb,
    metadata=metadata||jsonb_build_object(
      'structured_customer_change_supported',true,
      'customer_change_interactive_id','da_basket_customer_change',
      'address_change_is_separate_tool',true,
      'pii_not_in_tool_arguments',true,
      'current_message_injected_by_backend',true,
      'runtime_surface_verified_version',32
    ),
    updated_at=now()
where action_key='wa_save_checkout_customer_data';

create or replace function public.route_whatsapp_basket_swap_ai_job_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  raw_text text;
  norm text;
  bs public.catalog_sessions%rowtype;
  source_part text:='';
  target_part text:='';
  src uuid;
  src_name text;
  swap jsonb;
  reply text;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into m from public.messages where id=new.message_id and direction='inbound';
  if not found then return new; end if;

  if public.is_whatsapp_address_change_request_v1(new.conversation_id,m.id)
     or public.is_whatsapp_customer_data_change_request_v1(new.conversation_id,m.id) then
    return new;
  end if;

  raw_text:=trim(coalesce(m.body_text,m.transcript,''));
  norm:=translate(lower(raw_text),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  if norm !~ '(^| )(trocar|troca|substituir|substitui|mudar|muda)( |$)' then return new; end if;

  select * into bs from public.catalog_sessions
  where conversation_id=new.conversation_id and metadata->>'flow'='basket_basic_v1'
  order by created_at desc limit 1;
  if not found then return new; end if;

  if position(' por ' in norm)>0 then
    source_part:=trim(regexp_replace(split_part(norm,' por ',1),'^.*?(trocar|troca|substituir|substitui|mudar|muda)\s+','','i'));
    target_part:=trim(split_part(norm,' por ',2));
  else
    source_part:=trim(regexp_replace(norm,'^.*?(trocar|troca|substituir|substitui|mudar|muda)\s+','','i'));
  end if;
  source_part:=regexp_replace(source_part,'^(o|a|um|uma|do|da|de)\s+','','i');
  target_part:=regexp_replace(target_part,'^(o|a|um|uma|do|da|de)\s+','','i');

  if source_part<>'' then
    select i.product_id,p.name into src,src_name
    from public.catalog_session_items i
    join public.products p on p.id=i.product_id
    where i.catalog_session_id=bs.id
      and translate(lower(p.name),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') like '%'||source_part||'%'
    order by length(p.name),i.rank
    limit 1;
  end if;

  if src is null then
    reply:='Qual produto da cesta você quer trocar? Me diga o nome do produto. Assim eu monto a vitrine de substituição para você.';
    perform public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,reply,'text',null,null,'basket_swap_source_required',jsonb_build_object('deterministic',true),1);
    new.status:='done';
    new.result:=jsonb_build_object('deterministic',true,'action','basket_swap_source_required');
    new.updated_at:=now();
    return new;
  end if;

  swap:=public.create_whatsapp_basket_replacement_session_v1(new.conversation_id,src,nullif(target_part,''),array[]::text[]);
  reply:=case
    when coalesce((swap->>'item_count')::integer,0)>0 then
      'Entendi a troca de '||src_name||'. Separei as opções na vitrine. Escolha por lá para eu registrar a substituição:'||E'\n'||swap->>'url'
    else
      'Vamos trocar '||src_name||'. Abra a vitrine, marque a categoria do produto que quer colocar e escolha a opção:'||E'\n'||swap->>'url'
  end;
  perform public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,reply,'text',null,null,'basket_swap_showcase',swap,1);
  new.status:='done';
  new.result:=jsonb_build_object('deterministic',true,'action','basket_swap_showcase');
  new.updated_at:=now();
  return new;
end;
$$;

comment on function public.is_whatsapp_customer_data_change_request_v1(uuid,uuid) is 'Round 4 V32. Minimal deterministic guard for customer-data edit requests; structured button has priority and no PII is returned.';
comment on function public.handle_whatsapp_checkout_customer_data_agent_v2(uuid,uuid) is 'Round 4 V32. Backend authority for opening/processing checkout customer-data collection. Agent Core remains observe-only.';
comment on function public.route_whatsapp_basket_swap_ai_job_v1() is 'Round 4 V32. Legacy basket swap router with explicit exclusion for delivery-address and customer-data change semantics.';

commit;
