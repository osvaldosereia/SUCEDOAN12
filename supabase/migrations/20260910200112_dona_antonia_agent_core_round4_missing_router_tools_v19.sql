begin;

create or replace function public.link_whatsapp_customer_identity_compact_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ident jsonb;
begin
  if p_conversation_id is null then
    return jsonb_build_object('ok',false,'reason','conversation_required');
  end if;
  v_ident:=public.link_whatsapp_customer_from_phone_v1(p_conversation_id);
  return jsonb_build_object(
    'ok',true,
    'known_customer',coalesce((v_ident->>'known_customer')::boolean,false),
    'display_name_available',nullif(v_ident->>'person_name','') is not null
  );
exception when others then
  return jsonb_build_object('ok',false,'reason','identity_link_failed');
end
$$;

revoke all on function public.link_whatsapp_customer_identity_compact_v1(uuid) from public,anon,authenticated;
grant execute on function public.link_whatsapp_customer_identity_compact_v1(uuid) to service_role;

create or replace function public.queue_whatsapp_basket_storefront_link_agent_v1(
  p_conversation_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_flow jsonb;
  v_token text;
  v_url text;
  v_basket_name text;
  v_interactive jsonb;
begin
  if not exists(
    select 1 from public.messages
    where id=p_message_id and conversation_id=p_conversation_id and direction='inbound'
  ) then
    return jsonb_build_object('ok',false,'reason','message_conversation_mismatch');
  end if;

  v_flow:=public.get_whatsapp_basket_flow_state_v1(p_conversation_id);
  if coalesce((v_flow->>'active')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'reason','basket_session_inactive');
  end if;

  v_token:=v_flow->'basket_session'->>'token';
  if coalesce(v_token,'') !~* '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok',false,'reason','basket_token_invalid');
  end if;

  v_basket_name:=coalesce(v_flow->'basket'->>'name','sua cesta');
  v_url:='https://donaantonia.com.br/cesta/?t='||v_token;
  v_interactive:=jsonb_build_object(
    'type','cta_url',
    'body',jsonb_build_object('text','Perfeito. Abra a cesta para trocar, retirar ou aumentar produtos. Quando terminar, eu continuo a finalização com você no WhatsApp.'),
    'action',jsonb_build_object(
      'name','cta_url',
      'parameters',jsonb_build_object('display_text','Personalizar','url',v_url)
    )
  );

  perform public.update_whatsapp_sales_state_v1(
    p_conversation_id,null,null,'basket_storefront_opened',null,'basket_storefront_return'
  );
  perform public.queue_whatsapp_sales_reply_v1(
    p_conversation_id,p_message_id,'Perfeito. Abra a cesta para personalizar.','interactive',null,
    v_interactive,'basket_storefront_link',jsonb_build_object('basket_name',v_basket_name),1
  );

  return jsonb_build_object('ok',true,'action','basket_storefront_link');
exception when others then
  return jsonb_build_object('ok',false,'reason','basket_storefront_prepare_failed');
end
$$;

revoke all on function public.queue_whatsapp_basket_storefront_link_agent_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.queue_whatsapp_basket_storefront_link_agent_v1(uuid,uuid) to service_role;

create or replace function public.queue_whatsapp_search_showcase_agent_v1(
  p_conversation_id uuid,
  p_message_id uuid,
  p_query text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_query text:=left(trim(coalesce(p_query,'')),120);
  v_session jsonb;
  v_label text;
  v_text text;
  v_interactive jsonb;
  v_count integer:=0;
begin
  if v_query='' then
    return jsonb_build_object('ok',false,'reason','query_required');
  end if;
  if not exists(
    select 1 from public.messages
    where id=p_message_id and conversation_id=p_conversation_id and direction='inbound'
  ) then
    return jsonb_build_object('ok',false,'reason','message_conversation_mismatch');
  end if;

  v_session:=public.create_whatsapp_search_catalog_session_v1(p_conversation_id,v_query,20);
  v_count:=coalesce((v_session->>'item_count')::integer,0);
  if v_count<=0 then
    return jsonb_build_object('ok',false,'reason','no_sellable_products','item_count',0);
  end if;

  v_label:=left('Ver '||initcap(v_query),20);
  v_text:=left('Também encontrei opções de '||v_query||'. Toque em '||v_label||' para ver e adicionar ao pedido.',1024);
  v_interactive:=jsonb_build_object(
    'type','cta_url',
    'body',jsonb_build_object('text',v_text),
    'action',jsonb_build_object(
      'name','cta_url',
      'parameters',jsonb_build_object('display_text',v_label,'url',v_session->>'url')
    )
  );

  perform public.queue_whatsapp_sales_reply_v1(
    p_conversation_id,p_message_id,v_text,'interactive',null,v_interactive,
    'search_product_extra',jsonb_build_object('query',v_query,'agent_core',true),1
  );

  return jsonb_build_object('ok',true,'action','search_product_extra','item_count',v_count);
exception when others then
  return jsonb_build_object('ok',false,'reason','search_showcase_prepare_failed');
end
$$;

revoke all on function public.queue_whatsapp_search_showcase_agent_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.queue_whatsapp_search_showcase_agent_v1(uuid,uuid,text) to service_role;

insert into public.ai_action_registry(
  action_key,version,display_name,description,category,implementation_kind,implementation_ref,
  input_schema,output_schema,preconditions,side_effects,compensation,confirmation_required,
  autonomy_level,max_amount_brl,allowed_channels,allowed_roles,idempotency_strategy,cost_class,
  enabled,execution_mode,requires_human_handoff_clear,metadata,risk_class,confidence_autorun_allowed
) values
(
  'wa_link_customer_identity',1,'Vincular identidade conhecida',
  'Vincula deterministicamente a conversa a um cliente já conhecido pelo telefone, sem permitir que a IA invente ou altere identidade.',
  'customers','deterministic','link_whatsapp_customer_identity_compact_v1',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'[]'::jsonb,'["conversation_customer_link"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"blocked_router_completion","pii_output_minimized":true}'::jsonb,
  'reversible_write',false
),
(
  'wa_open_basket_storefront',1,'Abrir personalização da cesta',
  'Prepara deterministicamente o CTA da cesta selecionada para trocar, retirar ou aumentar produtos; o token da sessão não é devolvido ao modelo.',
  'commerce','deterministic','queue_whatsapp_basket_storefront_link_agent_v1',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["basket_session_active"]'::jsonb,'["basket_state_change","outbound_prepare"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"blocked_router_completion","session_token_hidden_from_model":true}'::jsonb,
  'reversible_write',false
),
(
  'wa_create_search_showcase',1,'Criar vitrine adicional de busca',
  'Cria no máximo uma vitrine adicional por chamada para uma consulta explícita; catálogo e disponibilidade continuam sendo validados pelo backend.',
  'commerce','deterministic','queue_whatsapp_search_showcase_agent_v1',
  '{"type":"object","properties":{"query":{"type":"string","minLength":1,"maxLength":120}},"required":["query"],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'[]'::jsonb,'["catalog_session_create","outbound_prepare"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"blocked_router_completion","max_showcases_per_call":1}'::jsonb,
  'reversible_write',false
)
on conflict(action_key) do update set
  version=excluded.version,
  display_name=excluded.display_name,
  description=excluded.description,
  category=excluded.category,
  implementation_kind=excluded.implementation_kind,
  implementation_ref=excluded.implementation_ref,
  input_schema=excluded.input_schema,
  output_schema=excluded.output_schema,
  preconditions=excluded.preconditions,
  side_effects=excluded.side_effects,
  compensation=excluded.compensation,
  confirmation_required=excluded.confirmation_required,
  autonomy_level=excluded.autonomy_level,
  max_amount_brl=excluded.max_amount_brl,
  allowed_channels=excluded.allowed_channels,
  allowed_roles=excluded.allowed_roles,
  idempotency_strategy=excluded.idempotency_strategy,
  cost_class=excluded.cost_class,
  enabled=excluded.enabled,
  execution_mode=excluded.execution_mode,
  requires_human_handoff_clear=excluded.requires_human_handoff_clear,
  metadata=excluded.metadata,
  risk_class=excluded.risk_class,
  confidence_autorun_allowed=excluded.confidence_autorun_allowed,
  updated_at=now();

commit;
