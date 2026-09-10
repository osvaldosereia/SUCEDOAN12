begin;

create or replace function public.start_whatsapp_order_checkout_agent_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  c public.conversations%rowtype;
  cart jsonb;
  contact jsonb;
  summary text;
begin
  if p_conversation_id is null or p_message_id is null then
    return jsonb_build_object('ok',false,'reason','conversation_and_message_required');
  end if;
  if not exists(select 1 from public.messages m where m.id=p_message_id and m.conversation_id=p_conversation_id and m.direction='inbound') then
    return jsonb_build_object('ok',false,'reason','message_conversation_mismatch');
  end if;
  select * into c from public.conversations where id=p_conversation_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','conversation_not_found'); end if;
  if c.mode='human' or coalesce(c.human_required,false) then return jsonb_build_object('ok',false,'reason','conversation_requires_human'); end if;
  if c.service_window_expires_at is null or c.service_window_expires_at<=now() then return jsonb_build_object('ok',false,'reason','service_window_closed'); end if;

  cart:=public.get_whatsapp_sales_cart_v1(p_conversation_id);
  if coalesce((cart->>'exists')::boolean,false) is not true
     or jsonb_typeof(coalesce(cart->'items','[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(cart->'items','[]'::jsonb))=0 then
    return jsonb_build_object('ok',false,'reason','cart_not_ready');
  end if;

  contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);
  if coalesce((contact->>'base_complete')::boolean,false) is not true then
    perform public.update_whatsapp_sales_state_v1(p_conversation_id,null,null,'order_customer_base_data',null,'order_customer_base_data');
    perform public.queue_whatsapp_sales_reply_v1(
      p_conversation_id,p_message_id,
      E'Para finalizar o pedido, envie estes dados em uma única mensagem:\nNome | Rua | Quadra | Casa | Bairro | Cidade\n\nExemplo: Maria Silva | Rua A | 12 | 34 | Centro | Cuiabá',
      'text',null,null,'request_customer_base_data',jsonb_build_object('agent_core',true),1
    );
    return jsonb_build_object('ok',true,'step','customer_base_data','queued',true,'pii_returned',false);
  end if;

  summary:=public.format_whatsapp_cart_checkout_summary_v1(p_conversation_id,cart);
  perform public.update_whatsapp_sales_state_v1(p_conversation_id,null,null,'order_summary_sent',null,'order_locator_confirmation');
  perform public.queue_whatsapp_sales_reply_v1(p_conversation_id,p_message_id,summary,'text',null,null,'checkout_summary_text',jsonb_build_object('agent_core',true),1);
  perform public.queue_whatsapp_sales_reply_v1(p_conversation_id,p_message_id,public.whatsapp_locator_prompt_v1(p_conversation_id),'text',null,null,'locator_confirmation_request',jsonb_build_object('agent_core',true,'after_summary',true),1);
  return jsonb_build_object('ok',true,'step','locator_confirmation','queued',true,'pii_returned',false);
exception when others then
  return jsonb_build_object('ok',false,'reason','order_checkout_prepare_failed','pii_returned',false);
end
$$;

revoke all on function public.start_whatsapp_order_checkout_agent_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_whatsapp_order_checkout_agent_v1(uuid,uuid) to service_role;

insert into public.ai_action_registry(
  action_key,version,display_name,description,category,implementation_kind,implementation_ref,
  input_schema,output_schema,preconditions,side_effects,compensation,confirmation_required,
  autonomy_level,max_amount_brl,allowed_channels,allowed_roles,idempotency_strategy,cost_class,
  enabled,execution_mode,requires_human_handoff_clear,metadata,risk_class,confidence_autorun_allowed
) values (
  'wa_start_order_checkout',1,'Iniciar checkout de produtos avulsos',
  'Avança deterministicamente um carrinho comum para coleta de cadastro ou confirmação de localizador, sem enviar pedido ao Bling e sem devolver PII ao modelo.',
  'commerce','deterministic','start_whatsapp_order_checkout_agent_v1',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,'["current_message_present","cart_valid"]'::jsonb,
  '["sales_state_change","outbound_prepare"]'::jsonb,null,false,
  'A',null,array['whatsapp'],array['system'],'derived','none',true,'observe',true,
  '{"agent_core":"v1","tool":true,"round4":"action_parity","pii_output_minimized":true,"edge_allowlist_pending":true,"executor_mapping_pending":true}'::jsonb,
  'reversible_write',false
)
on conflict(action_key) do update set
  version=excluded.version,display_name=excluded.display_name,description=excluded.description,category=excluded.category,
  implementation_kind=excluded.implementation_kind,implementation_ref=excluded.implementation_ref,
  input_schema=excluded.input_schema,output_schema=excluded.output_schema,preconditions=excluded.preconditions,
  side_effects=excluded.side_effects,compensation=excluded.compensation,confirmation_required=excluded.confirmation_required,
  autonomy_level=excluded.autonomy_level,max_amount_brl=excluded.max_amount_brl,allowed_channels=excluded.allowed_channels,
  allowed_roles=excluded.allowed_roles,idempotency_strategy=excluded.idempotency_strategy,cost_class=excluded.cost_class,
  enabled=excluded.enabled,execution_mode=excluded.execution_mode,requires_human_handoff_clear=excluded.requires_human_handoff_clear,
  metadata=excluded.metadata,risk_class=excluded.risk_class,confidence_autorun_allowed=excluded.confidence_autorun_allowed,updated_at=now();

create table if not exists public.agent_core_router_action_contracts(
  id bigint generated by default as identity primary key,
  trigger_name text not null,
  router_function text not null,
  legacy_action text not null,
  expected_tools text[] not null default '{}'::text[],
  tool_match_mode text not null default 'any' check(tool_match_mode in ('any','all','none')),
  expected_intents text[] not null default '{}'::text[],
  expected_next_actions text[] not null default '{}'::text[],
  minimum_samples smallint not null default 3 check(minimum_samples between 1 and 20),
  requires_pre_router_snapshot boolean not null default true,
  notes text,
  updated_at timestamptz not null default now(),
  unique(trigger_name,legacy_action)
);

alter table public.agent_core_router_action_contracts enable row level security;
revoke all on table public.agent_core_router_action_contracts from public,anon,authenticated;
grant select,insert,update,delete on table public.agent_core_router_action_contracts to service_role;
grant usage,select on sequence public.agent_core_router_action_contracts_id_seq to service_role;

insert into public.agent_core_router_action_contracts(trigger_name,router_function,legacy_action,expected_tools,tool_match_mode,expected_intents,expected_next_actions,minimum_samples,notes)
values
('aa_whatsapp_sales_greeting_fastpath','whatsapp_sales_greeting_ai_job_fastpath_v1','greeting',array['wa_link_customer_identity'],'any',array['greeting'],array['reply'],3,'Saudação held é shadow somente em homologação.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','basket_add_more',array['wa_add_more_products'],'any',array['basket','cart_change'],array['cart','reply'],3,'Adicionar extras à cesta.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','basket_payment_selection',array['wa_request_basket_payment'],'any',array['payment','checkout','basket'],array['checkout','reply','request_confirmation'],3,'Abrir seleção de pagamento.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','change_basket_delivery_address_flow',array['wa_request_address_flow'],'any',array['checkout','delivery'],array['checkout','reply'],3,'Alteração de endereço.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','address_flow_reopened',array['wa_request_address_flow'],'any',array['checkout','delivery'],array['checkout','reply'],3,'Reabrir alteração de endereço.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','address_flow_cancelled',array['wa_cancel_address_flow','wa_request_basket_payment'],'all',array['checkout','payment'],array['checkout','reply'],3,'Cancelar endereço e retornar ao pagamento.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','address_flow_from_legacy_state',array['wa_request_address_flow'],'any',array['checkout','delivery'],array['checkout','reply'],3,'Abrir endereço a partir do estado legado.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','legacy_address_escape_to_payment',array['wa_request_basket_payment'],'any',array['payment','checkout'],array['checkout','reply'],3,'Sair do estado legado para pagamento.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','legacy_address_escape_to_extras',array['wa_add_more_products'],'any',array['basket','cart_change'],array['cart','reply'],3,'Sair do estado legado para extras.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','basket_customer_data_processed',array['wa_save_checkout_customer_data'],'any',array['checkout'],array['checkout','reply','clarify'],3,'Processar dados da mensagem atual sem PII em argumentos.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','basket_payment_clarification',array['wa_request_basket_payment'],'any',array['payment','checkout'],array['clarify','reply','checkout'],3,'Pagamento não reconhecido deve repetir opções válidas.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','basket_final_confirmation',array['wa_prepare_basket_confirmation'],'any',array['payment','checkout'],array['request_confirmation','checkout','reply'],3,'Pagamento válido leva à confirmação final.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','basket_payment_missing',array['wa_request_basket_payment'],'any',array['payment','checkout'],array['clarify','checkout','reply'],3,'Forma de pagamento ausente.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','basket_order_confirmed',array['wa_finalize_basket_order'],'any',array['checkout'],array['checkout','reply'],3,'Commitment exige confirmação explícita no backend.'),
('aaa_whatsapp_basket_payment_checkout_v1','route_whatsapp_basket_payment_checkout_v1','basket_final_confirmation_repeat',array['wa_prepare_basket_confirmation'],'any',array['checkout','payment'],array['request_confirmation','reply','checkout'],3,'Repetição segura da confirmação final.'),
('ab_whatsapp_checkout_flow_v1','whatsapp_checkout_flow_router_v1','basket_customer_base_data',array['wa_start_basket_checkout'],'any',array['checkout','basket'],array['checkout','reply'],3,'Checkout de cesta sem cadastro completo.'),
('ab_whatsapp_checkout_flow_v1','whatsapp_checkout_flow_router_v1','basket_ready_for_human',array['wa_finalize_basket_order','wa_handoff_human'],'all',array['checkout','human'],array['handoff','checkout','reply'],3,'Finalização de cesta seguida de handoff quando a política exigir.'),
('ab_whatsapp_checkout_flow_v1','whatsapp_checkout_flow_router_v1','basket_summary_then_locator',array['wa_start_basket_checkout'],'any',array['checkout','basket'],array['checkout','reply'],3,'Fluxo moderno pode avançar direto ao pagamento; não exige reproduzir texto legado literalmente.'),
('ab_whatsapp_checkout_flow_v1','whatsapp_checkout_flow_router_v1','checkout_summary_then_locator',array['wa_save_checkout_customer_data','wa_start_order_checkout'],'any',array['checkout'],array['checkout','reply'],3,'A tool depende do estado pré-router: cesta usa save; pedido comum precisa start_order_checkout.'),
('ab_whatsapp_checkout_flow_v1','whatsapp_checkout_flow_router_v1','confirm_order',array['wa_confirm_order'],'any',array['checkout'],array['checkout','reply'],3,'Pedido avulso só confirma com guard explícito.'),
('ab_whatsapp_checkout_flow_v1','whatsapp_checkout_flow_router_v1','order_checkout_text_flow',array['wa_start_order_checkout'],'any',array['checkout'],array['checkout','reply'],3,'Novo contrato para iniciar checkout de carrinho comum.'),
('ab_whatsapp_checkout_flow_v1','whatsapp_checkout_flow_router_v1','request_customer_base_data',array['wa_save_checkout_customer_data','wa_start_basket_checkout','wa_start_order_checkout'],'any',array['checkout'],array['clarify','checkout','reply'],3,'A escolha depende de awaiting pré-router e se o pedido é cesta ou carrinho comum.'),
('trg_001_whatsapp_basket_fallback_v1','route_whatsapp_basket_fallback_v1','basket_list_fallback',array['wa_list_baskets'],'any',array['basket'],array['show_baskets','reply'],3,'Fallback de listagem.'),
('trg_001_whatsapp_basket_fallback_v1','route_whatsapp_basket_fallback_v1','basket_selected_followup',array['wa_select_basket'],'any',array['basket'],array['start_basket_flow','reply'],3,'Seleção determinística de cesta.'),
('trg_00_route_whatsapp_basket_swap_v1','route_whatsapp_basket_swap_ai_job_v1','basket_swap_showcase',array['wa_create_basket_replacement'],'any',array['basket','cart_change'],array['cart','reply'],3,'Criar sessão de substituição.'),
('trg_00_route_whatsapp_basket_swap_v1','route_whatsapp_basket_swap_ai_job_v1','basket_swap_source_required','{}'::text[],'none',array['basket','clarify'],array['clarify','reply'],3,'Sem produto de origem identificado, perguntar somente o necessário.'),
('trg_01_whatsapp_basket_personalization_choice_v1','route_whatsapp_basket_personalization_choice_v1','basket_keep_and_checkout',array['wa_start_basket_checkout'],'any',array['basket','checkout'],array['checkout','reply'],3,'Manter cesta e avançar.'),
('trg_01_whatsapp_basket_personalization_choice_v1','route_whatsapp_basket_personalization_choice_v1','basket_storefront_link',array['wa_open_basket_storefront'],'any',array['basket'],array['start_basket_flow','reply'],3,'Abrir personalização sem expor token ao modelo.'),
('trg_route_whatsapp_basic_sales_ai_job_v1','route_whatsapp_basic_sales_ai_job_v1','show_baskets',array['wa_list_baskets'],'any',array['basket'],array['show_baskets','reply'],3,'Listagem de cestas.'),
('trg_route_whatsapp_basic_sales_ai_job_v1','route_whatsapp_basic_sales_ai_job_v1','payment_methods',array['wa_get_policy'],'any',array['payment'],array['reply'],3,'Política de pagamento deve vir do backend.'),
('trg_route_whatsapp_basic_sales_ai_job_v1','route_whatsapp_basic_sales_ai_job_v1','delivery_time_handoff',array['wa_handoff_human'],'any',array['delivery','human'],array['handoff'],3,'Horário exato depende de rota/bairro e exige humano.'),
('trg_route_whatsapp_basic_sales_ai_job_v1','route_whatsapp_basic_sales_ai_job_v1','delivery_fee',array['wa_get_policy'],'any',array['delivery'],array['reply'],3,'Taxa de entrega pelo backend.'),
('trg_route_whatsapp_basic_sales_ai_job_v1','route_whatsapp_basic_sales_ai_job_v1','delivery_promise',array['wa_get_policy'],'any',array['delivery'],array['reply'],3,'Prazo é previsão, nunca promessa rígida.'),
('trg_route_whatsapp_basic_sales_ai_job_v1','route_whatsapp_basic_sales_ai_job_v1','request_basket_customer_data',array['wa_start_basket_checkout'],'any',array['checkout','basket'],array['checkout','reply'],3,'Iniciar checkout da cesta para pedir somente dados ausentes.'),
('trg_route_whatsapp_basic_sales_ai_job_v1','route_whatsapp_basic_sales_ai_job_v1','basket_ready_for_human',array['wa_finalize_basket_order','wa_handoff_human'],'all',array['checkout','human'],array['handoff','checkout','reply'],3,'Finalização/handoff do legado.'),
('trg_route_whatsapp_basic_sales_ai_job_v1','route_whatsapp_basic_sales_ai_job_v1','basket_catalog_link',array['wa_select_basket'],'any',array['basket'],array['start_basket_flow','reply'],3,'Seleção de cesta pela interação.'),
('trg_route_whatsapp_basic_sales_ai_job_v1','route_whatsapp_basic_sales_ai_job_v1','basket_customer_confirmation',array['wa_start_basket_checkout'],'any',array['checkout','basket'],array['checkout','request_confirmation','reply'],3,'Fluxo moderno decide próximos dados/pagamento pelo backend.'),
('trg_whatsapp_sales_multi_search_cta_v1','whatsapp_sales_multi_search_cta_v1','search_product_extra',array['wa_create_search_showcase'],'any',array['product_search'],array['show_products','reply'],3,'No máximo uma vitrine extra por turno.')
on conflict(trigger_name,legacy_action) do update set
  router_function=excluded.router_function,expected_tools=excluded.expected_tools,tool_match_mode=excluded.tool_match_mode,
  expected_intents=excluded.expected_intents,expected_next_actions=excluded.expected_next_actions,
  minimum_samples=excluded.minimum_samples,requires_pre_router_snapshot=excluded.requires_pre_router_snapshot,
  notes=excluded.notes,updated_at=now();

create or replace function public.get_agent_core_round4_action_tool_parity_v1(p_hours integer default 168)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_hours integer:=greatest(1,least(coalesce(p_hours,168),720));
  v_v20_start timestamptz;
  v_rows jsonb:='[]'::jsonb;
  v_total integer:=0;
  v_runtime_complete integer:=0;
  v_evidence_ready integer:=0;
  v_unmapped integer:=0;
begin
  select to_timestamp(version,'YYYYMMDDHH24MISS') into v_v20_start
  from supabase_migrations.schema_migrations
  where name='dona_antonia_agent_core_round4_pre_router_shadow_packet_v20'
  order by version desc limit 1;
  v_v20_start:=coalesce(v_v20_start,now());

  with contracts as (
    select c.*,
      case
        when cardinality(c.expected_tools)=0 then true
        when c.tool_match_mode='all' then not exists(
          select 1 from unnest(c.expected_tools) x(tool_key)
          where not exists(
            select 1 from public.ai_action_registry a
            where a.action_key=x.tool_key and a.enabled and a.execution_mode='observe'
              and coalesce((a.metadata->>'edge_allowlist_pending')::boolean,false)=false
              and coalesce((a.metadata->>'executor_mapping_pending')::boolean,false)=false
          )
        )
        else exists(
          select 1 from unnest(c.expected_tools) x(tool_key)
          join public.ai_action_registry a on a.action_key=x.tool_key
          where a.enabled and a.execution_mode='observe'
            and coalesce((a.metadata->>'edge_allowlist_pending')::boolean,false)=false
            and coalesce((a.metadata->>'executor_mapping_pending')::boolean,false)=false
        )
      end as runtime_contract_complete,
      coalesce((select jsonb_agg(x.tool_key order by x.tool_key)
        from unnest(c.expected_tools) x(tool_key)
        where not exists(select 1 from public.ai_action_registry a where a.action_key=x.tool_key and a.enabled and a.execution_mode='observe'
          and coalesce((a.metadata->>'edge_allowlist_pending')::boolean,false)=false
          and coalesce((a.metadata->>'executor_mapping_pending')::boolean,false)=false)),'[]'::jsonb) as runtime_pending_tools
    from public.agent_core_router_action_contracts c
  ), samples as (
    select c.id,o.ai_job_id,t.id turn_id,t.decision_intent,coalesce(t.metadata->>'next_action','') next_action,
      coalesce(array_agg(distinct tc.tool_key) filter(where tc.tool_key is not null),'{}'::text[]) chosen_tools
    from contracts c
    join public.agent_core_legacy_router_observations o on o.action=c.legacy_action
    join public.agent_core_pre_router_snapshots s on s.ai_job_id=o.ai_job_id and s.observed_at>=v_v20_start
    left join lateral (
      select at.* from public.agent_core_turns at
      where at.ai_job_id=o.ai_job_id and at.status='planned' and at.model is not null
      order by at.created_at desc limit 1
    ) t on true
    left join public.agent_core_tool_calls tc on tc.turn_id=t.id
    where o.observed_at>=now()-make_interval(hours=>v_hours)
    group by c.id,o.ai_job_id,t.id,t.decision_intent,t.metadata
  ), scored as (
    select c.*,
      count(s.ai_job_id) filter(where s.turn_id is not null)::integer sample_count,
      count(s.ai_job_id) filter(where s.turn_id is not null and
        (case when c.tool_match_mode='none' then true
              when c.tool_match_mode='all' then c.expected_tools <@ s.chosen_tools
              else c.expected_tools && s.chosen_tools end)
        and (cardinality(c.expected_intents)=0 or s.decision_intent=any(c.expected_intents))
        and (cardinality(c.expected_next_actions)=0 or s.next_action=any(c.expected_next_actions))
      )::integer aligned_count
    from contracts c
    left join samples s on s.id=c.id
    group by c.id,c.trigger_name,c.router_function,c.legacy_action,c.expected_tools,c.tool_match_mode,c.expected_intents,c.expected_next_actions,c.minimum_samples,c.requires_pre_router_snapshot,c.notes,c.updated_at,c.runtime_contract_complete,c.runtime_pending_tools
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'trigger',trigger_name,'legacy_action',legacy_action,'expected_tools',to_jsonb(expected_tools),
      'tool_match_mode',tool_match_mode,'expected_intents',to_jsonb(expected_intents),'expected_next_actions',to_jsonb(expected_next_actions),
      'runtime_contract_complete',runtime_contract_complete,'runtime_pending_tools',runtime_pending_tools,
      'sample_count',sample_count,'aligned_count',aligned_count,
      'alignment_rate',case when sample_count>0 then round(aligned_count::numeric/sample_count,4) else null end,
      'minimum_samples',minimum_samples,
      'evidence_ready',runtime_contract_complete and sample_count>=minimum_samples and aligned_count::numeric/sample_count>=0.95,
      'notes',notes
    ) order by trigger_name,legacy_action),'[]'::jsonb),
    count(*)::integer,
    count(*) filter(where runtime_contract_complete)::integer,
    count(*) filter(where runtime_contract_complete and sample_count>=minimum_samples and aligned_count::numeric/sample_count>=0.95)::integer
  into v_rows,v_total,v_runtime_complete,v_evidence_ready
  from scored;

  with target(trigger_name,router_function) as (values
    ('aaa_whatsapp_basket_payment_checkout_v1'::text,'route_whatsapp_basket_payment_checkout_v1'::text),
    ('ab_whatsapp_checkout_flow_v1','whatsapp_checkout_flow_router_v1'),
    ('trg_001_whatsapp_basket_fallback_v1','route_whatsapp_basket_fallback_v1'),
    ('trg_00_route_whatsapp_basket_swap_v1','route_whatsapp_basket_swap_ai_job_v1'),
    ('trg_01_whatsapp_basket_personalization_choice_v1','route_whatsapp_basket_personalization_choice_v1'),
    ('trg_route_whatsapp_basic_sales_ai_job_v1','route_whatsapp_basic_sales_ai_job_v1')
  ), defs as (
    select t.trigger_name,t.router_function,pg_get_functiondef(p.oid) d
    from target t join pg_proc p on p.proname=t.router_function
    join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
  ), literals as (
    select d.trigger_name,d.router_function,m[1] legacy_action
    from defs d cross join lateral regexp_matches(d.d,'''action''\s*,\s*''([^'']+)''','g') m
  )
  select count(*)::integer into v_unmapped
  from literals l
  where not exists(select 1 from public.agent_core_router_action_contracts c where c.trigger_name=l.trigger_name and c.legacy_action=l.legacy_action);

  return jsonb_build_object(
    'version',1,
    'window_hours',v_hours,
    'valid_snapshot_since',v_v20_start,
    'contract_count',v_total,
    'runtime_complete_count',v_runtime_complete,
    'runtime_pending_count',v_total-v_runtime_complete,
    'evidence_ready_count',v_evidence_ready,
    'unmapped_static_action_count',v_unmapped,
    'all_static_actions_mapped',v_unmapped=0,
    'all_runtime_contracts_complete',v_runtime_complete=v_total,
    'all_evidence_ready',v_evidence_ready=v_total,
    'minimum_alignment_rate',0.95,
    'historical_backfill_allowed',false,
    'pre_router_snapshot_required',true,
    'execution_authorized',false,
    'retirement_authorized',false,
    'pii_payload_returned',false,
    'contracts',v_rows,
    'reason',case
      when v_unmapped>0 then 'legacy_action_contracts_missing'
      when v_runtime_complete<v_total then 'runtime_tool_surface_pending'
      when v_evidence_ready<v_total then 'awaiting_pre_router_shadow_alignment_samples'
      else 'action_tool_parity_thresholds_met' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_action_tool_parity_v1(integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_action_tool_parity_v1(integer) to service_role;

create or replace function public.get_agent_core_round4_shadow_bridge_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'version',2,
  'legacy_eligibility_entrypoint_bridged_to_v2',position('is_whatsapp_agent_core_shadow_eligible_v2' in pg_get_functiondef(p.oid))>0,
  'packet_v2_available',to_regprocedure('public.build_whatsapp_agent_core_packet_v2(uuid,uuid)') is not null,
  'packet_v1_bridged_to_v2',position('build_whatsapp_agent_core_packet_v2' in (select pg_get_functiondef(p2.oid) from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace where n2.nspname='public' and p2.proname='build_whatsapp_agent_core_packet_v1' limit 1))>0,
  'edge_source_change_required',false,
  'execution_authorized',false,
  'retirement_authorized',false
)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='is_whatsapp_agent_core_shadow_eligible_v1'
limit 1;
$$;

revoke all on function public.get_agent_core_round4_shadow_bridge_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_shadow_bridge_readiness_v1() to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v14()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb:=public.get_agent_core_round4_consolidated_readiness_v13();
  packet jsonb:=public.get_agent_core_round4_packet_bridge_readiness_v1();
  shadow jsonb:=public.get_agent_core_round4_shadow_bridge_readiness_v1();
  parity jsonb:=public.get_agent_core_round4_action_tool_parity_v1(168);
begin
  return base || jsonb_build_object(
    'version',14,
    'pre_router_packet_bridge',packet,
    'shadow_bridge',shadow,
    'action_tool_parity',parity,
    'pre_router_shadow_packet_ready',coalesce((packet->>'pre_router_shadow_packet_active')::boolean,false),
    'action_contracts_runtime_complete',coalesce((parity->>'all_runtime_contracts_complete')::boolean,false),
    'action_tool_evidence_ready',coalesce((parity->>'all_evidence_ready')::boolean,false),
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false,
    'global_retirement_ready',false,
    'reason',case
      when not coalesce((packet->>'pre_router_shadow_packet_active')::boolean,false) then 'pre_router_shadow_packet_not_ready'
      when not coalesce((parity->>'all_static_actions_mapped')::boolean,false) then parity->>'reason'
      when not coalesce((parity->>'all_runtime_contracts_complete')::boolean,false) then parity->>'reason'
      when not coalesce((parity->>'all_evidence_ready')::boolean,false) then parity->>'reason'
      else base->>'reason' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v14() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v14() to service_role;

commit;