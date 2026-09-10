begin;

-- Rodada 4/6: decompoe os routers de cesta/checkout em ferramentas governadas.
-- Todas entram em observe; writes continuam simulados pelo Agent Core.

insert into public.ai_action_registry(
  action_key,version,display_name,description,category,implementation_kind,implementation_ref,
  input_schema,output_schema,preconditions,side_effects,compensation,confirmation_required,
  autonomy_level,max_amount_brl,allowed_channels,allowed_roles,idempotency_strategy,cost_class,
  enabled,execution_mode,requires_human_handoff_clear,metadata,risk_class,confidence_autorun_allowed
) values
(
  'wa_select_basket',1,'Selecionar cesta básica',
  'Seleciona deterministicamente uma cesta ativa para a conversa. O modelo fornece apenas o basket_id retornado pelo catálogo; preço e composição permanecem no backend.',
  'commerce','deterministic','create_whatsapp_basket_session_v1',
  '{"type":"object","properties":{"basket_id":{"type":"string","pattern":"^[0-9a-fA-F-]{36}$"}},"required":["basket_id"],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["basket_exists","basket_active"]'::jsonb,'["basket_session_create","draft_cart_prepare"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"basket_checkout_decomposition","basket_component_prices":"hidden"}'::jsonb,'reversible_write',false
),
(
  'wa_get_basket_state',1,'Consultar estado da cesta',
  'Lê o estado determinístico da cesta selecionada, personalização, carrinho associado e retorno pendente, sem alterar dados.',
  'commerce','deterministic','get_whatsapp_basket_flow_state_v1',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'[]'::jsonb,'[]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"basket_checkout_decomposition","read_only_truth":true}'::jsonb,'read_only',false
),
(
  'wa_get_checkout_contact',1,'Consultar cadastro de checkout',
  'Lê se o cliente e o endereço base necessários ao checkout já são conhecidos, evitando perguntar novamente dados existentes.',
  'orders','deterministic','get_whatsapp_checkout_contact_v1',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'[]'::jsonb,'[]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"basket_checkout_decomposition","pii_return_minimized":true}'::jsonb,'read_only',false
),
(
  'wa_get_basket_customer_status',1,'Consultar status cadastral da cesta',
  'Consulta deterministicamente se o cliente da conversa possui cadastro suficiente para concluir a encomenda de cesta.',
  'orders','deterministic','get_whatsapp_basket_customer_status_v1',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'[]'::jsonb,'[]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"basket_checkout_decomposition"}'::jsonb,'read_only',false
),
(
  'wa_start_basket_checkout',1,'Iniciar checkout da cesta',
  'Avança deterministicamente a cesta escolhida para checkout quando o cliente decide manter/concluir a personalização. IDs da conversa e da mensagem são injetados pelo backend.',
  'orders','deterministic','start_whatsapp_basket_checkout_v2',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["basket_session_active"]'::jsonb,'["basket_checkout_state_change","outbound_prepare"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"basket_checkout_decomposition"}'::jsonb,'reversible_write',false
),
(
  'wa_create_basket_replacement',1,'Preparar troca de produto da cesta',
  'Cria uma sessão determinística de substituição para um componente da cesta; a IA não decide preço, estoque nem produtos válidos.',
  'commerce','deterministic','create_whatsapp_basket_replacement_session_v1',
  '{"type":"object","properties":{"source_product_id":{"type":"string","pattern":"^[0-9a-fA-F-]{36}$"},"target_query":{"type":"string","maxLength":120},"categories":{"type":"array","maxItems":3,"items":{"type":"string","maxLength":80}}},"required":["source_product_id","target_query","categories"],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["basket_session_active","source_product_in_basket"]'::jsonb,'["replacement_session_create"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"basket_checkout_decomposition"}'::jsonb,'reversible_write',false
),
(
  'wa_add_more_products',1,'Abrir adição de produtos extras',
  'Prepara deterministicamente a etapa de adicionar produtos extras à cesta sem carregar o catálogo inteiro.',
  'commerce','deterministic','queue_whatsapp_basket_add_more_v1',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["basket_session_active"]'::jsonb,'["outbound_prepare"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"basket_checkout_decomposition","catalog_subset_only":true}'::jsonb,'reversible_write',false
),
(
  'wa_request_basket_payment',1,'Solicitar forma de pagamento',
  'Prepara a seleção determinística de pagamento da cesta usando somente as formas aceitas pelo backend.',
  'orders','deterministic','queue_whatsapp_basket_payment_confirmation_v1',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["basket_checkout_ready"]'::jsonb,'["outbound_prepare","checkout_state_change"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"basket_checkout_decomposition"}'::jsonb,'reversible_write',false
),
(
  'wa_prepare_basket_confirmation',1,'Preparar confirmação final da cesta',
  'Monta a confirmação final determinística depois que a forma de pagamento foi escolhida. Não cria a encomenda final.',
  'orders','deterministic','queue_whatsapp_basket_final_confirmation_v1',
  '{"type":"object","properties":{"payment_method":{"type":"string","enum":["pix","cash","credit_card","food_card"]}},"required":["payment_method"],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["basket_checkout_ready","payment_method_valid"]'::jsonb,'["outbound_prepare","checkout_state_change"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"basket_checkout_decomposition"}'::jsonb,'reversible_write',false
),
(
  'wa_finalize_basket_order',1,'Finalizar encomenda de cesta',
  'Cria a solicitação final de encomenda somente após confirmação explícita do cliente e validações determinísticas. Não sincroniza com Bling nesta etapa.',
  'orders','deterministic','finalize_whatsapp_basket_order_request_v2',
  '{"type":"object","properties":{"payment_method":{"type":"string","enum":["pix","cash","credit_card","food_card"]}},"required":["payment_method"],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["explicit_customer_confirmation","basket_valid","customer_valid","payment_method_valid"]'::jsonb,'["basket_order_request_create"]'::jsonb,null,true,
  'B',null,array['whatsapp'],array['system'],'required','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"basket_checkout_decomposition","bling":false,"explicit_confirmation_required":true}'::jsonb,'commitment',false
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

create or replace function public.get_agent_core_round4_basket_tool_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  with expected(action_key,risk_class) as (values
    ('wa_select_basket','reversible_write'),
    ('wa_get_basket_state','read_only'),
    ('wa_get_checkout_contact','read_only'),
    ('wa_get_basket_customer_status','read_only'),
    ('wa_start_basket_checkout','reversible_write'),
    ('wa_create_basket_replacement','reversible_write'),
    ('wa_add_more_products','reversible_write'),
    ('wa_request_basket_payment','reversible_write'),
    ('wa_prepare_basket_confirmation','reversible_write'),
    ('wa_finalize_basket_order','commitment')
  ), actual as (
    select e.action_key,e.risk_class as expected_risk,a.risk_class,a.enabled,a.execution_mode,a.confirmation_required,a.implementation_ref
    from expected e left join public.ai_action_registry a using(action_key)
  )
  select jsonb_build_object(
    'expected_count',(select count(*) from expected),
    'present_count',(select count(*) from actual where implementation_ref is not null),
    'observe_only',not exists(select 1 from actual where execution_mode is distinct from 'observe'),
    'risk_mismatches',(select count(*) from actual where risk_class is distinct from expected_risk),
    'commitment_confirmation_guard',coalesce((select confirmation_required from actual where action_key='wa_finalize_basket_order'),false),
    'missing',coalesce((select jsonb_agg(action_key) from actual where implementation_ref is null),'[]'::jsonb)
  );
$$;

revoke all on function public.get_agent_core_round4_basket_tool_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_basket_tool_readiness_v1() to service_role;

commit;
