begin;

create or replace function public.get_agent_core_order_state_compact_v1(p_conversation_id uuid)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'available',true,
        'exists',true,
        'status',coalesce(o.status,''),
        'confirmed',o.confirmed_at is not null,
        'delivered',o.delivered_at is not null,
        'cancelled',o.cancelled_at is not null,
        'returned',o.returned_at is not null,
        'commercial_commitment_exists',o.confirmed_at is not null,
        'contains_pii',false
      )
      from public.orders o
      where o.conversation_id=p_conversation_id
      order by coalesce(o.confirmed_at,o.created_at) desc, o.created_at desc
      limit 1
    ),
    jsonb_build_object(
      'available',true,
      'exists',false,
      'status','',
      'confirmed',false,
      'delivered',false,
      'cancelled',false,
      'returned',false,
      'commercial_commitment_exists',false,
      'contains_pii',false
    )
  );
$$;
revoke all on function public.get_agent_core_order_state_compact_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_agent_core_order_state_compact_v1(uuid) to service_role;

create or replace function public.resolve_whatsapp_agent_core_topic_v5(
  p_message text,
  p_stage text,
  p_awaiting text,
  p_interactive_id text
)
returns text
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_base text:=public.resolve_whatsapp_agent_core_topic_v4(p_message,p_stage,p_awaiting,p_interactive_id);
  v_q text:=translate(lower(public.service_norm_text_v1(coalesce(p_message,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  v_match boolean:=false;
begin
  if v_base not in ('general','product_search') then return v_base; end if;

  select exists(
    select 1
    from public.basket_templates b
    where b.is_active=true
      and coalesce(b.is_whatsapp_active,true)=true
      and length(trim(coalesce(b.name,'')))>=4
      and strpos(
        ' '||v_q||' ',
        ' '||translate(lower(public.service_norm_text_v1(b.name)),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')||' '
      )>0
  ) into v_match;

  if v_match then return 'basket'; end if;
  return v_base;
end;
$$;
revoke all on function public.resolve_whatsapp_agent_core_topic_v5(text,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_whatsapp_agent_core_topic_v5(text,text,text,text) to service_role;

create or replace function public.build_whatsapp_agent_core_packet_v3(p_conversation_id uuid,p_message_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_packet jsonb;
  v_order jsonb;
  v_topic text;
  v_interactive text;
begin
  v_packet:=public.build_whatsapp_agent_core_packet_v2(p_conversation_id,p_message_id);
  if coalesce((v_packet->>'enabled')::boolean,false) is not true then return v_packet; end if;

  v_order:=public.get_agent_core_order_state_compact_v1(p_conversation_id);
  v_interactive:=coalesce(v_packet#>>'{pre_router_state,interactive_id}',v_packet#>>'{message,interactive,id}','');
  v_topic:=public.resolve_whatsapp_agent_core_topic_v5(
    coalesce(v_packet#>>'{message,text}',''),
    coalesce(v_packet#>>'{conversation,stage}',''),
    coalesce(v_packet#>>'{sales_state,awaiting}',''),
    v_interactive
  );

  return v_packet||jsonb_build_object(
    'topic',v_topic,
    'order',v_order,
    'rules',coalesce(v_packet->'rules','{}'::jsonb)||jsonb_build_object(
      'confirmed_order_mutations_require_governed_post_sale_path',true,
      'order_context_contains_pii',false
    ),
    'metadata',coalesce(v_packet->'metadata','{}'::jsonb)||jsonb_build_object(
      'packet_version',3,
      'order_context_compact',true,
      'order_context_contains_pii',false
    )
  );
end;
$$;
revoke all on function public.build_whatsapp_agent_core_packet_v3(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_agent_core_packet_v3(uuid,uuid) to service_role;

create or replace function public.build_whatsapp_agent_core_packet_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
  select public.build_whatsapp_agent_core_packet_v3(p_conversation_id,p_message_id);
$$;
revoke all on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) to service_role;

create or replace function public.is_whatsapp_confirmed_order_mutation_request_v1(p_conversation_id uuid,p_message_id uuid)
returns boolean
language sql
stable security definer
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
      and public.service_norm_text_v1(coalesce(m.body_text,m.transcript,'')) ~ '(^| )(pedido|encomenda|compra|confirmad[oa]|finalizad[oa]|fechad[oa])( |$)'
      and public.service_norm_text_v1(coalesce(m.body_text,m.transcript,'')) ~ '(^| )(alterar|mudar|trocar|corrigir|cancelar|cancelamento|endereco|pagamento|produto|item|devolver|devolucao|reembolso)( |$)'
  );
$$;
revoke all on function public.is_whatsapp_confirmed_order_mutation_request_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.is_whatsapp_confirmed_order_mutation_request_v1(uuid,uuid) to service_role;

create or replace function public.evaluate_whatsapp_agent_action_preconditions_v5(
  p_conversation_id uuid,
  p_message_id uuid,
  p_action_key text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_base jsonb:=public.evaluate_whatsapp_agent_action_preconditions_v4(p_conversation_id,p_message_id,p_action_key,coalesce(p_input,'{}'::jsonb));
  v_missing jsonb:=coalesce(v_base->'missing','[]'::jsonb);
  v_checks jsonb:=coalesce(v_base->'checks','{}'::jsonb);
  v_post_sale_mutation boolean:=false;
  v_blocked_action boolean:=false;
begin
  v_post_sale_mutation:=public.is_whatsapp_confirmed_order_mutation_request_v1(p_conversation_id,p_message_id);
  v_blocked_action:=p_action_key=any(array[
    'wa_add_product','wa_set_quantity','wa_replace_product','wa_select_basket',
    'wa_start_basket_checkout','wa_start_order_checkout','wa_open_basket_storefront',
    'wa_create_basket_replacement','wa_add_more_products','wa_save_checkout_customer_data',
    'wa_set_delivery_locator','wa_request_address_flow','wa_cancel_address_flow',
    'wa_request_basket_payment','wa_prepare_basket_confirmation','wa_finalize_basket_order','wa_confirm_order'
  ]::text[]);

  if v_post_sale_mutation and v_blocked_action then
    if not (v_missing ? 'confirmed_order_requires_post_sale_handoff') then
      v_missing:=v_missing||jsonb_build_array('confirmed_order_requires_post_sale_handoff');
    end if;
  end if;

  v_checks:=v_checks||jsonb_build_object(
    'confirmed_order_mutation_request',v_post_sale_mutation,
    'post_sale_checkout_tool_blocked',v_post_sale_mutation and v_blocked_action
  );

  return v_base||jsonb_build_object(
    'ready',jsonb_array_length(v_missing)=0 and jsonb_array_length(coalesce(v_base->'unsupported','[]'::jsonb))=0,
    'missing',v_missing,
    'checks',v_checks,
    'precondition_semantics_version',5,
    'confirmed_order_mutations_require_post_sale_handoff',true,
    'model_is_execution_authority',false,
    'pii_returned',false
  );
end;
$$;
revoke all on function public.evaluate_whatsapp_agent_action_preconditions_v5(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.evaluate_whatsapp_agent_action_preconditions_v5(uuid,uuid,text,jsonb) to service_role;

create or replace function public.preview_whatsapp_agent_action_v2(
  p_conversation_id uuid,
  p_message_id uuid,
  p_action_key text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  base jsonb;
  pre jsonb;
  allowed boolean;
  decision text;
begin
  base:=public.preview_whatsapp_agent_action_v1(p_conversation_id,p_action_key,coalesce(p_input,'{}'::jsonb));
  if coalesce((base->>'allowed')::boolean,false) is not true then
    return base||jsonb_build_object('precondition_version',6,'state_preconditions',null);
  end if;

  pre:=public.evaluate_whatsapp_agent_action_preconditions_v5(
    p_conversation_id,p_message_id,p_action_key,coalesce(p_input,'{}'::jsonb)
  );
  allowed:=coalesce((pre->>'ready')::boolean,false);
  decision:=case when not allowed then 'blocked' else coalesce(base->>'decision','blocked') end;

  return base||jsonb_build_object(
    'allowed',allowed,
    'decision',decision,
    'reasons',coalesce(base->'reasons','[]'::jsonb)||coalesce(pre->'missing','[]'::jsonb)||coalesce(pre->'unsupported','[]'::jsonb),
    'precondition_version',6,
    'state_preconditions',pre
  );
end;
$$;
revoke all on function public.preview_whatsapp_agent_action_v2(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.preview_whatsapp_agent_action_v2(uuid,uuid,text,jsonb) to service_role;

create or replace function public.get_agent_core_order_context_readiness_v45()
returns jsonb
language sql
stable security definer
set search_path=''
as $$
  select jsonb_build_object(
    'ready',
      to_regprocedure('public.get_agent_core_order_state_compact_v1(uuid)') is not null
      and to_regprocedure('public.build_whatsapp_agent_core_packet_v3(uuid,uuid)') is not null
      and to_regprocedure('public.resolve_whatsapp_agent_core_topic_v5(text,text,text,text)') is not null
      and to_regprocedure('public.evaluate_whatsapp_agent_action_preconditions_v5(uuid,uuid,text,jsonb)') is not null,
    'packet_v3',true,
    'order_context_compact',true,
    'order_context_contains_pii',false,
    'confirmed_order_mutation_guard',true,
    'global_rollout_changed',false,
    'bling_changed',false
  );
$$;
revoke all on function public.get_agent_core_order_context_readiness_v45() from public,anon,authenticated;
grant execute on function public.get_agent_core_order_context_readiness_v45() to service_role;

commit;
