begin;

create or replace function public.resolve_whatsapp_agent_core_topic_v6(
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
  v_base text:=public.resolve_whatsapp_agent_core_topic_v5(p_message,p_stage,p_awaiting,p_interactive_id);
  v_q text:=translate(lower(public.service_norm_text_v1(coalesce(p_message,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  v_iid text:=lower(split_part(trim(coalesce(p_interactive_id,'')),':',1));
begin
  -- Structured controls are exact contracts, not NLP guesses.
  if v_iid in ('da_basket_change_address','da_basket_customer_change') then
    return 'checkout';
  end if;

  -- Narrow deterministic routing guard: expose checkout/address tools for clear
  -- delivery-address edits while the model remains responsible for natural-language
  -- interpretation inside that governed surface.
  if v_q ~ '(^| )(alterar|mudar|corrigir|atualizar|trocar)( o| meu| o meu)? endereco( |$)' then
    return 'checkout';
  end if;

  -- Customer-data edit requests need checkout tools, never product-search tools.
  if v_q ~ '(^| )(alterar|mudar|corrigir|atualizar)( meus?| os)? (dados|cadastro)( |$)' then
    return 'checkout';
  end if;

  return v_base;
end;
$$;

revoke all on function public.resolve_whatsapp_agent_core_topic_v6(text,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_whatsapp_agent_core_topic_v6(text,text,text,text) to service_role;

create or replace function public.build_whatsapp_agent_core_packet_v4(
  p_conversation_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_packet jsonb;
  v_topic text;
  v_interactive text;
begin
  -- Preserve V3 order context + V2 pre-router snapshot semantics.
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

  return v_packet||jsonb_build_object(
    'topic',v_topic,
    'metadata',coalesce(v_packet->'metadata','{}'::jsonb)||jsonb_build_object(
      'packet_version',4,
      'topic_resolver','resolve_whatsapp_agent_core_topic_v6',
      'pre_router_state_authoritative',coalesce((v_packet#>>'{metadata,pre_router_snapshot_used}')::boolean,false),
      'pii_added_by_v4',false
    )
  );
end;
$$;

revoke all on function public.build_whatsapp_agent_core_packet_v4(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_agent_core_packet_v4(uuid,uuid) to service_role;

create or replace function public.get_agent_core_round4_structured_topic_readiness_v3()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'version',3,
  'resolver','resolve_whatsapp_agent_core_topic_v6',
  'packet','build_whatsapp_agent_core_packet_v4',
  'basket_structured',public.resolve_whatsapp_agent_core_topic_v6('', '', '', 'da_basket:00000000-0000-0000-0000-000000000000')='basket',
  'basket_customize_structured',public.resolve_whatsapp_agent_core_topic_v6('', '', '', 'da_basket_customize')='basket',
  'payment_structured',public.resolve_whatsapp_agent_core_topic_v6('', '', '', 'da_basket_payment_credit')='payment',
  'checkout_structured',public.resolve_whatsapp_agent_core_topic_v6('', '', '', 'da_confirm_order')='checkout',
  'address_change_structured',public.resolve_whatsapp_agent_core_topic_v6('', '', '', 'da_basket_change_address')='checkout',
  'customer_change_structured',public.resolve_whatsapp_agent_core_topic_v6('', '', '', 'da_basket_customer_change')='checkout',
  'address_change_natural_1',public.resolve_whatsapp_agent_core_topic_v6('Quero mudar o endereço da entrega','','','')='checkout',
  'address_change_natural_2',public.resolve_whatsapp_agent_core_topic_v6('Preciso alterar o endereço','','','')='checkout',
  'address_change_natural_3',public.resolve_whatsapp_agent_core_topic_v6('Quero corrigir o endereço','','','')='checkout',
  'customer_data_not_product',public.resolve_whatsapp_agent_core_topic_v6('Quero alterar meus dados','','','')='checkout',
  'short_product_arroz',public.resolve_whatsapp_agent_core_topic_v6('Quero arroz','','','')='product_search',
  'short_product_sabonete',public.resolve_whatsapp_agent_core_topic_v6('Sabonete ?','','','')='product_search',
  'pii_payload_returned',false,
  'rollout_changed',false
);
$$;

revoke all on function public.get_agent_core_round4_structured_topic_readiness_v3() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_structured_topic_readiness_v3() to service_role;

comment on function public.resolve_whatsapp_agent_core_topic_v6(text,text,text,text) is 'Round 4 V51. Restores address/customer-data checkout semantics on top of V5 basket naming without enumerating natural-language variants.';
comment on function public.build_whatsapp_agent_core_packet_v4(uuid,uuid) is 'Round 4 V51. Canonical Agent Core packet: V3 order context + V2 pre-router state + V6 topic resolver. No new PII.';
comment on function public.get_agent_core_round4_structured_topic_readiness_v3() is 'Round 4 V51. Readiness for the canonical packet/topic bridge; no rollout mutation.';

commit;
