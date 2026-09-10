begin;

update public.agent_core_router_inventory
set retirement_state='blocked',
    notes=case trigger_name
      when 'aa_whatsapp_sales_greeting_fastpath' then 'Saudação possui vínculo de cliente e outbound determinístico; sem cobertura própria suficiente. Manter até eval de greeting + substituto operacional.'
      when 'trg_00_route_whatsapp_basket_swap_v1' then 'Troca depende de sessão/carrinho e cria vitrine de substituição; interpretação pode migrar ao Agent Core, mas o efeito stateful precisa homologação própria.'
      when 'trg_01_whatsapp_basket_personalization_choice_v1' then 'Escolha de personalização altera estado e pode abrir checkout/vitrine; manter até tools stateful passarem eval de transição.'
      when 'trg_whatsapp_sales_multi_search_cta_v1' then 'Pós-processamento cria vitrines extras e outbound; precisa substituto de apresentação multi-busca e eval específico.'
      else notes end,
    last_verified_at=now()
where trigger_name in (
  'aa_whatsapp_sales_greeting_fastpath',
  'trg_00_route_whatsapp_basket_swap_v1',
  'trg_01_whatsapp_basket_personalization_choice_v1',
  'trg_whatsapp_sales_multi_search_cta_v1'
) and retirement_state='candidate';

update public.agent_core_router_inventory
set notes='Busca textual simples possui cobertura semântica própria e busca canônica isolada no Agent Core. Evidência de aposentadoria pronta; desligamento real somente após cutover de execução controlado.',
    last_verified_at=now()
where trigger_name='a1_whatsapp_simple_product_query_v1';

create or replace function public.get_agent_core_round4_router_retirement_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  p jsonb:=public.get_agent_core_round4_parity_report_v5(168);
  hp jsonb:=public.get_agent_core_round4_historical_packet_readiness_v1();
  ps jsonb:=public.get_agent_core_round4_product_search_readiness_v1();
  cfg public.agent_core_runtime_config%rowtype;
  product_count integer:=coalesce((p#>>'{coverage,product_search}')::integer,0);
  search_ready boolean;
  execution_cutover boolean;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;

  search_ready:=
    coalesce((p->>'candidate_retirement_ready')::boolean,false)
    and product_count>=6
    and coalesce((p->>'policy_intent_match_rate')::numeric,0)>=0.95
    and coalesce((p->>'decision_tool_coherence_rate')::numeric,0)>=0.95
    and coalesce((hp->>'ready')::boolean,false)
    and coalesce((ps->>'intent_and_availability_separated')::boolean,false)
    and coalesce((ps->>'live_search_unchanged')::boolean,false);

  execution_cutover:=coalesce(cfg.enabled,false)
    and cfg.execution_mode in ('homologation','canary','live')
    and cfg.legacy_router_policy in ('bypass','retired');

  return jsonb_build_object(
    'version',1,
    'execution_mode',cfg.execution_mode,
    'legacy_router_policy',cfg.legacy_router_policy,
    'execution_cutover_permitted',execution_cutover,
    'routers',jsonb_build_array(
      jsonb_build_object(
        'trigger','a1_whatsapp_simple_product_query_v1',
        'replacement','Agent Core product_search + wa_search_products',
        'evidence_ready',search_ready,
        'can_disable_now',search_ready and execution_cutover,
        'reason',case when not search_ready then 'product_search_evidence_incomplete' when not execution_cutover then 'agent_core_observe_only' else 'ready_for_controlled_disable' end
      ),
      jsonb_build_object(
        'trigger','aa_whatsapp_sales_greeting_fastpath',
        'replacement','pending greeting/customer-link contract',
        'evidence_ready',false,'can_disable_now',false,
        'reason','greeting_specific_eval_and_customer_link_side_effect_required'
      ),
      jsonb_build_object(
        'trigger','trg_00_route_whatsapp_basket_swap_v1',
        'replacement','wa_create_basket_replacement + state transition',
        'evidence_ready',false,'can_disable_now',false,
        'reason','stateful_swap_eval_required'
      ),
      jsonb_build_object(
        'trigger','trg_01_whatsapp_basket_personalization_choice_v1',
        'replacement','wa_start_basket_checkout / storefront transition',
        'evidence_ready',false,'can_disable_now',false,
        'reason','stateful_personalization_eval_required'
      ),
      jsonb_build_object(
        'trigger','trg_whatsapp_sales_multi_search_cta_v1',
        'replacement','pending multi-search presentation contract',
        'evidence_ready',false,'can_disable_now',false,
        'reason','multi_search_outbound_eval_required'
      )
    ),
    'evidence_ready_count',case when search_ready then 1 else 0 end,
    'disable_now_count',case when search_ready and execution_cutover then 1 else 0 end
  );
end
$$;

revoke all on function public.get_agent_core_round4_router_retirement_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_router_retirement_readiness_v1() to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v7()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb:=public.get_agent_core_round4_consolidated_readiness_v6();
  rr jsonb:=public.get_agent_core_round4_router_retirement_readiness_v1();
  inv jsonb;
  blocked_count integer;
  candidate_count integer;
  hard_invalid integer;
  evidence_ready boolean:=false;
  execution_cutover boolean:=false;
begin
  select count(*) filter(where retirement_state='blocked'),
         count(*) filter(where retirement_state='candidate'),
         count(*) filter(where classification='hard_safety' and retirement_state<>'keep'),
         jsonb_build_object(
           'candidate_count',count(*) filter(where retirement_state='candidate'),
           'blocked_count',count(*) filter(where retirement_state='blocked'),
           'retired_count',count(*) filter(where retirement_state='retired'),
           'keep_count',count(*) filter(where retirement_state='keep'),
           'hard_safety_invalid_count',count(*) filter(where classification='hard_safety' and retirement_state<>'keep')
         )
  into blocked_count,candidate_count,hard_invalid,inv
  from public.agent_core_router_inventory;

  evidence_ready:=coalesce((rr->>'evidence_ready_count')::integer,0)>=1;
  execution_cutover:=coalesce((rr->>'execution_cutover_permitted')::boolean,false);

  return base || jsonb_build_object(
    'version',7,
    'router_retirement',rr,
    'router_inventory',inv,
    'candidate_retirement_ready',
      coalesce((base->>'candidate_retirement_ready')::boolean,false)
      and evidence_ready
      and hard_invalid=0,
    'retirement_execution_permitted',execution_cutover,
    'global_retirement_ready',
      coalesce((base->>'candidate_retirement_ready')::boolean,false)
      and evidence_ready and execution_cutover
      and blocked_count=0 and hard_invalid=0,
    'reason',case
      when not coalesce((base->>'candidate_retirement_ready')::boolean,false) then base->>'reason'
      when not evidence_ready then 'no_router_has_specific_retirement_evidence'
      when hard_invalid>0 then 'hard_safety_invalid'
      when blocked_count>0 then 'blocked_routers_remain'
      when not execution_cutover then 'agent_core_not_in_execution_cutover_mode'
      else 'global_retirement_ready' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v7() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v7() to service_role;

commit;