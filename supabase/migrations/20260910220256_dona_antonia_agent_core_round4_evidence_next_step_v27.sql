begin;

create or replace function public.get_agent_core_round4_evidence_next_step_v1(p_conversation_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_pre jsonb:=public.get_agent_core_round4_homologation_evidence_preflight_v1();
  v_ev jsonb:=public.get_agent_core_round4_stateful_evidence_report_v1(168);
  v_conversation_id uuid;
  v_basket jsonb:='{}'::jsonb;
  v_contact jsonb:='{}'::jsonb;
  v_cart jsonb:='{}'::jsonb;
  v_missing jsonb:=coalesce(v_ev->'missing_core_action_samples','[]'::jsonb);
  v_target text:=null;
  v_hint text:=null;
  v_setup text:=null;
  v_direct boolean:=false;
  v_passive boolean:=coalesce((v_pre->>'passive_collection_ready')::boolean,false);
begin
  if p_conversation_id is not null then
    select c.id into v_conversation_id
    from public.conversations c
    where c.id=p_conversation_id
      and c.channel='whatsapp'
      and c.automation_cohort='homologation'
      and c.mode='ai'
      and coalesce(c.human_required,false)=false
      and c.service_window_expires_at>now()
      and not exists(
        select 1 from public.human_handoffs h
        where h.conversation_id=c.id and h.status in ('open','claimed')
      );
  else
    select c.id into v_conversation_id
    from public.conversations c
    where c.channel='whatsapp'
      and c.automation_cohort='homologation'
      and c.mode='ai'
      and coalesce(c.human_required,false)=false
      and c.service_window_expires_at>now()
      and not exists(
        select 1 from public.human_handoffs h
        where h.conversation_id=c.id and h.status in ('open','claimed')
      )
    order by c.last_inbound_at desc nulls last,c.updated_at desc
    limit 1;
  end if;

  if v_conversation_id is null then
    return jsonb_build_object(
      'version',1,
      'ready_for_real_turn',false,
      'reason','no_ai_clear_homologation_conversation_with_open_window',
      'target_action',null,
      'suggested_customer_phrase',null,
      'requires_manual_state_setup',true,
      'synthetic_backfill_allowed',false,
      'writes_permitted',false,
      'retirement_permitted',false
    );
  end if;

  v_basket:=coalesce(public.get_agent_core_basket_state_compact_v1(v_conversation_id),'{}'::jsonb);
  v_contact:=coalesce(public.get_agent_core_checkout_contact_compact_v1(v_conversation_id),'{}'::jsonb);
  v_cart:=coalesce(public.get_whatsapp_sales_cart_v1(v_conversation_id),'{}'::jsonb);

  if exists(select 1 from jsonb_array_elements(v_missing) x where x->>'action'='change_basket_delivery_address_flow')
     and coalesce((v_basket->>'active')::boolean,false)
     and coalesce((v_contact->>'address_known')::boolean,false) then
    v_target:='change_basket_delivery_address_flow';
    v_hint:='Quero mudar o endereço de entrega';
    v_direct:=true;
  elsif exists(select 1 from jsonb_array_elements(v_missing) x where x->>'action'='basket_ready_for_human')
     and coalesce((v_basket->>'active')::boolean,false) then
    v_target:='basket_ready_for_human';
    v_hint:='Quero finalizar a cesta';
    v_direct:=true;
  elsif exists(select 1 from jsonb_array_elements(v_missing) x where x->>'action'='basket_customer_data_processed') then
    v_target:='basket_customer_data_processed';
    if not coalesce((v_contact->>'base_complete')::boolean,false) then
      v_hint:='Quero finalizar a cesta';
      v_direct:=true;
    else
      v_setup:='requires_homologation_state_with_incomplete_customer_base_data';
    end if;
  elsif exists(select 1 from jsonb_array_elements(v_missing) x where x->>'action'='confirm_order') then
    v_target:='confirm_order';
    if coalesce((v_cart->>'exists')::boolean,false) and nullif(v_cart->>'basket_id','') is null then
      v_hint:='Confirmo o pedido';
      v_direct:=true;
    else
      v_setup:='requires_non_basket_cart_ready_for_confirmation';
    end if;
  end if;

  return jsonb_build_object(
    'version',1,
    'conversation_id',v_conversation_id,
    'ready_for_real_turn',v_passive and v_direct,
    'passive_collection_ready',v_passive,
    'target_action',v_target,
    'suggested_customer_phrase',v_hint,
    'requires_manual_state_setup',not v_direct,
    'manual_state_setup_reason',v_setup,
    'basket_active',coalesce((v_basket->>'active')::boolean,false),
    'customer_base_complete',coalesce((v_contact->>'base_complete')::boolean,false),
    'address_known',coalesce((v_contact->>'address_known')::boolean,false),
    'cart_exists',coalesce((v_cart->>'exists')::boolean,false),
    'cart_is_basket',nullif(v_cart->>'basket_id','') is not null,
    'synthetic_backfill_allowed',false,
    'writes_permitted',false,
    'retirement_permitted',false,
    'reason',case
      when not v_passive then 'passive_collection_not_ready'
      when v_target is null then 'core_stateful_evidence_complete_or_no_target'
      when v_direct then 'ready_for_next_real_homologation_turn'
      else 'target_requires_controlled_homologation_state_setup'
    end
  );
end
$$;

revoke all on function public.get_agent_core_round4_evidence_next_step_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_evidence_next_step_v1(uuid) to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v18(p_conversation_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb:=public.get_agent_core_round4_consolidated_readiness_v17();
  v_next jsonb:=public.get_agent_core_round4_evidence_next_step_v1(p_conversation_id);
begin
  return v_base || jsonb_build_object(
    'version',18,
    'evidence_next_step',v_next,
    'next_real_homologation_turn_ready',coalesce((v_next->>'ready_for_real_turn')::boolean,false),
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false,
    'global_retirement_ready',false
  );
end
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v18(uuid) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v18(uuid) to service_role;

commit;