begin;

create or replace function public.get_agent_core_round4_blocked_router_contract_readiness_v1(p_hours integer default 168)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_hours integer:=greatest(1,least(coalesce(p_hours,168),720));
  v_routers jsonb:='[]'::jsonb;
  v_missing_tools integer:=0;
  v_contract_complete integer:=0;
  v_evidence_ready integer:=0;
  v_total integer:=0;
begin
  with contracts(trigger_name,replacement,required_tools,legacy_actions,min_router_samples,notes) as (values
    ('aa_whatsapp_sales_greeting_fastpath'::text,
      'Agent Core greeting + deterministic customer identity link'::text,
      array['wa_link_customer_identity']::text[],
      array['greeting']::text[],3,
      'Saudação deve preservar identificação de cliente sem transformar vínculo de identidade em decisão do modelo.'::text),
    ('aaa_whatsapp_basket_payment_checkout_v1',
      'Agent Core stateful checkout tools + deterministic payment/address guards',
      array['wa_cancel_address_flow','wa_add_more_products','wa_request_basket_payment','wa_request_address_flow','wa_save_checkout_customer_data','wa_prepare_basket_confirmation','wa_finalize_basket_order']::text[],
      array['basket_customer_data_processed','basket_payment_selection','basket_final_confirmation','basket_order_confirmed','change_basket_delivery_address_flow']::text[],3,
      'Interpretação pode migrar ao Agent Core; validação de pagamento, endereço e confirmação final permanece determinística.'),
    ('ab_whatsapp_checkout_flow_v1',
      'Agent Core checkout tools + explicit confirmation guard',
      array['wa_set_delivery_locator','wa_save_checkout_customer_data','wa_get_checkout_contact','wa_confirm_order','wa_finalize_basket_order','wa_handoff_human']::text[],
      array['confirm_order','basket_ready_for_human','request_customer_base_data','checkout_summary_then_locator','basket_summary_then_locator','basket_customer_base_data','order_checkout_text_flow']::text[],3,
      'Confirmação de pedido continua commitment e exige confirmação explícita + backend authority.'),
    ('trg_001_whatsapp_basket_fallback_v1',
      'Agent Core basket selection/list + deterministic presentation',
      array['wa_select_basket','wa_list_baskets']::text[],
      array['basket_selected_followup','basket_list_fallback']::text[],3,
      'Fallback só pode sair depois de cobertura de seleção e apresentação sem depender do Flow.'),
    ('trg_00_route_whatsapp_basket_swap_v1',
      'wa_create_basket_replacement + deterministic replacement catalog',
      array['wa_create_basket_replacement']::text[],
      array['basket_swap_showcase','basket_swap_source_required']::text[],3,
      'A troca exige sessão ativa e validação do item de origem; a IA não escolhe estoque/preço.'),
    ('trg_01_whatsapp_basket_personalization_choice_v1',
      'wa_start_basket_checkout / wa_open_basket_storefront',
      array['wa_start_basket_checkout','wa_open_basket_storefront']::text[],
      array['basket_keep_and_checkout','basket_storefront_link']::text[],3,
      'O caminho manter cesta já possui tool; abrir storefront ainda precisa de contrato explícito antes de aposentar o router.'),
    ('trg_route_whatsapp_basic_sales_ai_job_v1',
      'Agent Core basket/policy/customer tools + deterministic finalization/handoff',
      array['wa_select_basket','wa_list_baskets','wa_get_policy','wa_get_basket_customer_status','wa_save_checkout_customer_data','wa_finalize_basket_order','wa_handoff_human']::text[],
      array['show_baskets','payment_methods','delivery_time_handoff','delivery_fee','delivery_promise','request_basket_customer_data','basket_ready_for_human']::text[],3,
      'Router amplo deve ser aposentado por capacidades, não em bloco.'),
    ('trg_whatsapp_sales_multi_search_cta_v1',
      'Agent Core multi-query presentation contract',
      array['wa_create_search_showcase']::text[],
      array['search_product_extra']::text[],3,
      'Pós-processamento de múltiplas buscas precisa contrato próprio para apresentação; não deve ser substituído por side effect implícito.')
  ), tool_status as (
    select c.*,
      coalesce((select jsonb_agg(t order by t) from unnest(c.required_tools) t),'[]'::jsonb) required_tools_json,
      coalesce((select jsonb_agg(t order by t) from unnest(c.required_tools) t
                where not exists(select 1 from public.ai_action_registry a where a.action_key=t and a.enabled and a.execution_mode='observe' and a.implementation_ref is not null)),'[]'::jsonb) missing_tools,
      (select count(*)::integer from unnest(c.required_tools) t
       where exists(select 1 from public.ai_action_registry a where a.action_key=t and a.enabled and a.execution_mode='observe' and a.implementation_ref is not null)) present_tool_count
    from contracts c
  ), evidence as (
    select t.*,
      coalesce((select count(distinct s.ai_job_id)::integer
        from public.agent_core_pre_router_snapshots s
        join public.agent_core_legacy_router_observations o on o.ai_job_id=s.ai_job_id
        where s.observed_at>=now()-make_interval(hours=>v_hours)
          and o.action=any(t.legacy_actions)),0) router_sample_count,
      coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'sample_count',a.sample_count) order by a.action)
        from (
          select la action,
                 (select count(distinct s.ai_job_id)::integer
                    from public.agent_core_pre_router_snapshots s
                    join public.agent_core_legacy_router_observations o on o.ai_job_id=s.ai_job_id
                    where s.observed_at>=now()-make_interval(hours=>v_hours) and o.action=la) sample_count
          from unnest(t.legacy_actions) la
        ) a),'[]'::jsonb) action_samples
    from tool_status t
  ), shaped as (
    select *,
      jsonb_array_length(missing_tools)=0 as contract_complete,
      jsonb_array_length(missing_tools)=0 and router_sample_count>=min_router_samples as evidence_ready
    from evidence
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'trigger',trigger_name,
      'replacement',replacement,
      'required_tools',required_tools_json,
      'missing_tools',missing_tools,
      'present_tool_count',present_tool_count,
      'required_tool_count',cardinality(required_tools),
      'contract_complete',contract_complete,
      'legacy_actions',to_jsonb(legacy_actions),
      'action_samples',action_samples,
      'router_sample_count',router_sample_count,
      'minimum_router_samples',min_router_samples,
      'evidence_ready',evidence_ready,
      'can_disable_now',false,
      'notes',notes
    ) order by trigger_name),'[]'::jsonb),
    count(*)::integer,
    count(*) filter(where jsonb_array_length(missing_tools)>0)::integer,
    count(*) filter(where contract_complete)::integer,
    count(*) filter(where evidence_ready)::integer
  into v_routers,v_total,v_missing_tools,v_contract_complete,v_evidence_ready
  from shaped;

  return jsonb_build_object(
    'version',1,
    'window_hours',v_hours,
    'blocked_router_count',v_total,
    'contract_complete_count',v_contract_complete,
    'routers_with_missing_tools',v_missing_tools,
    'evidence_ready_count',v_evidence_ready,
    'all_contracts_complete',v_contract_complete=v_total,
    'all_evidence_ready',v_evidence_ready=v_total,
    'execution_authorized',false,
    'retirement_authorized',false,
    'historical_backfill_allowed',false,
    'pii_payload_returned',false,
    'routers',v_routers,
    'reason',case
      when v_missing_tools>0 then 'replacement_tool_contracts_missing'
      when v_evidence_ready<v_total then 'awaiting_router_specific_homologation_evidence'
      else 'router_contract_and_evidence_thresholds_met' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_blocked_router_contract_readiness_v1(integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_blocked_router_contract_readiness_v1(integer) to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v13()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb:=public.get_agent_core_round4_consolidated_readiness_v12();
  rc jsonb:=public.get_agent_core_round4_blocked_router_contract_readiness_v1(168);
begin
  return base || jsonb_build_object(
    'version',13,
    'blocked_router_contracts',rc,
    'blocked_router_contracts_complete',coalesce((rc->>'all_contracts_complete')::boolean,false),
    'blocked_router_evidence_ready',coalesce((rc->>'all_evidence_ready')::boolean,false),
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false,
    'global_retirement_ready',false,
    'reason',case
      when not coalesce((rc->>'all_contracts_complete')::boolean,false) then rc->>'reason'
      when not coalesce((base->>'stateful_evidence_ready')::boolean,false) then base->>'reason'
      when not coalesce((rc->>'all_evidence_ready')::boolean,false) then rc->>'reason'
      else base->>'reason' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v13() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v13() to service_role;

commit;
