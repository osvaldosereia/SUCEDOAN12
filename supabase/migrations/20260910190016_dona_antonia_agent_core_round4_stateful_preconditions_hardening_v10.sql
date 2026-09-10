begin;

create or replace function public.evaluate_whatsapp_agent_action_preconditions_v1(
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
  a public.ai_action_registry%rowtype;
  c public.conversations%rowtype;
  st public.whatsapp_sales_state%rowtype;
  m public.messages%rowtype;
  base_s public.catalog_sessions%rowtype;
  cart_row public.carts%rowtype;
  pre text;
  ok boolean;
  checks jsonb:='{}'::jsonb;
  missing jsonb:='[]'::jsonb;
  unsupported jsonb:='[]'::jsonb;
  customer_status jsonb:='{}'::jsonb;
  iid text:='';
  norm text:='';
  v_product_id uuid;
  v_source_product_id uuid;
  v_original_product_id uuid;
  v_replacement_product_id uuid;
  v_basket_id uuid;
  v_base_basket_id uuid;
  v_payment text;
  v_address jsonb:='{}'::jsonb;
  v_quantity numeric;
  v_customer_confirmed boolean:=false;
  v_basket_session_active boolean:=false;
  v_cart_valid boolean:=false;
  v_customer_valid boolean:=false;
  v_current_message boolean:=false;
  v_address_flow_pending boolean:=false;
  v_service_window_open boolean:=false;
  v_human_clear boolean:=false;
  v_uuid_pattern text:='^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  select * into a from public.ai_action_registry where action_key=p_action_key and enabled=true;
  if not found then
    return jsonb_build_object('ready',false,'action_key',p_action_key,'missing',jsonb_build_array('unknown_action'),'unsupported','[]'::jsonb,'checks','{}'::jsonb,'pii_returned',false);
  end if;

  select * into c from public.conversations where id=p_conversation_id;
  if found then
    v_service_window_open:=c.service_window_expires_at is not null and c.service_window_expires_at>now();
    v_human_clear:=coalesce(c.mode,'ai')<>'human' and not coalesce(c.human_required,false)
      and not exists(select 1 from public.human_handoffs h where h.conversation_id=c.id and h.status in ('open','claimed'));
  end if;

  if p_message_id is not null then
    select * into m from public.messages where id=p_message_id and conversation_id=p_conversation_id and direction='inbound';
    v_current_message:=found;
    if v_current_message then
      iid:=coalesce(m.ai_interpretation->>'id','');
      norm:=public.service_norm_text_v1(coalesce(m.body_text,m.transcript,''));
    end if;
  end if;

  select * into st from public.whatsapp_sales_state where conversation_id=p_conversation_id;

  select * into base_s
  from public.catalog_sessions
  where conversation_id=p_conversation_id and metadata->>'flow'='basket_basic_v1'
  order by created_at desc limit 1;
  v_basket_session_active:=base_s.id is not null and base_s.status='open'
    and (base_s.expires_at is null or base_s.expires_at>now());

  if coalesce(base_s.metadata->>'basket_id','') ~* v_uuid_pattern then
    v_base_basket_id:=(base_s.metadata->>'basket_id')::uuid;
  end if;

  if base_s.cart_id is not null then
    select * into cart_row from public.carts where id=base_s.cart_id;
  else
    select * into cart_row from public.carts
    where conversation_id=p_conversation_id and status='draft'
    order by updated_at desc limit 1;
  end if;
  v_cart_valid:=cart_row.id is not null and cart_row.status='draft'
    and coalesce(cart_row.pricing_status,'ready')='ready'
    and exists(select 1 from public.cart_items ci where ci.cart_id=cart_row.id and ci.quantity>0);

  begin customer_status:=public.get_agent_core_basket_customer_status_compact_v1(p_conversation_id); exception when others then customer_status:='{}'::jsonb; end;
  v_customer_valid:=coalesce((customer_status->>'registered')::boolean,false);

  v_address_flow_pending:=exists(
    select 1 from public.whatsapp_address_flow_sessions af
    where af.conversation_id=p_conversation_id and af.status='open'
      and (af.expires_at is null or af.expires_at>now())
  );

  if coalesce(p_input->>'product_id','') ~* v_uuid_pattern then v_product_id:=(p_input->>'product_id')::uuid; end if;
  if coalesce(p_input->>'source_product_id','') ~* v_uuid_pattern then v_source_product_id:=(p_input->>'source_product_id')::uuid; end if;
  if coalesce(p_input->>'original_product_id','') ~* v_uuid_pattern then v_original_product_id:=(p_input->>'original_product_id')::uuid; end if;
  if coalesce(p_input->>'replacement_product_id','') ~* v_uuid_pattern then v_replacement_product_id:=(p_input->>'replacement_product_id')::uuid; end if;
  if coalesce(p_input->>'basket_id','') ~* v_uuid_pattern then v_basket_id:=(p_input->>'basket_id')::uuid; end if;
  if coalesce(p_input->>'quantity','') ~ '^[0-9]+([.][0-9]+)?$' then v_quantity:=(p_input->>'quantity')::numeric; end if;
  if lower(coalesce(p_input->>'customer_confirmed','')) in ('true','false') then v_customer_confirmed:=(p_input->>'customer_confirmed')::boolean; end if;
  v_payment:=public.normalize_whatsapp_basket_payment_method_v1(p_input->>'payment_method');
  if jsonb_typeof(p_input->'delivery_address')='object' then v_address:=p_input->'delivery_address'; end if;

  for pre in select jsonb_array_elements_text(coalesce(a.preconditions,'[]'::jsonb)) loop
    ok:=false;
    case pre
      when 'address_change_requested' then
        ok:=v_current_message and (iid='da_basket_change_address' or norm in ('alterar endereco','mudar endereco','trocar endereco'));
      when 'address_flow_pending' then ok:=v_address_flow_pending;
      when 'basket_exists' then
        ok:=v_basket_id is not null and exists(select 1 from public.basket_templates b where b.id=v_basket_id);
      when 'basket_active' then
        ok:=v_basket_id is not null and exists(select 1 from public.basket_templates b where b.id=v_basket_id and b.is_active=true and b.is_whatsapp_active=true);
      when 'basket_session_active' then ok:=v_basket_session_active;
      when 'basket_checkout_ready' then
        ok:=v_basket_session_active and v_customer_valid and v_cart_valid and v_service_window_open and v_human_clear;
      when 'basket_valid' then
        ok:=v_basket_session_active and v_cart_valid and v_base_basket_id is not null
          and exists(select 1 from public.basket_templates b where b.id=v_base_basket_id and b.is_active=true and b.is_whatsapp_active=true);
      when 'cart_item_exists' then
        ok:=v_product_id is not null and cart_row.id is not null
          and exists(select 1 from public.cart_items ci where ci.cart_id=cart_row.id and ci.product_id=v_product_id and ci.quantity>0);
      when 'cart_valid' then ok:=v_cart_valid;
      when 'checkout_customer_data_requested' then
        ok:=coalesce(st.awaiting,'') in ('basket_customer_base_data','order_customer_base_data');
      when 'current_message_present' then ok:=v_current_message;
      when 'customer_valid' then ok:=v_customer_valid;
      when 'explicit_customer_confirmation' then
        ok:=v_current_message and (iid in ('da_basket_confirm_order','da_confirm_order') or norm in ('confirmar pedido','confirmo o pedido','pode confirmar o pedido'));
      when 'locator_requested' then
        ok:=coalesce(st.awaiting,'') in ('basket_locator_confirmation','order_locator_confirmation');
      when 'payment_method_valid' then ok:=v_payment is not null;
      when 'product_validated' then
        ok:=v_product_id is not null and coalesce(v_quantity,0)>0
          and exists(select 1 from public.products p where p.id=v_product_id and p.physically_verified=true and p.is_active=true and p.is_whatsapp_active=true and p.price is not null and p.price>=0 and coalesce(p.stock,0)>0);
      when 'replacement_validated' then
        ok:=v_original_product_id is not null and v_replacement_product_id is not null and v_customer_confirmed
          and cart_row.id is not null
          and exists(select 1 from public.cart_items ci where ci.cart_id=cart_row.id and ci.product_id=v_original_product_id and ci.quantity>0)
          and exists(select 1 from public.products p where p.id=v_replacement_product_id and p.physically_verified=true and p.is_active=true and p.is_whatsapp_active=true and p.price is not null and p.price>=0 and coalesce(p.stock,0)>0);
      when 'source_product_in_basket' then
        ok:=v_source_product_id is not null and base_s.id is not null
          and exists(select 1 from public.catalog_session_items i where i.catalog_session_id=base_s.id and i.product_id=v_source_product_id and i.quantity>0);
      when 'valid_address' then
        ok:=nullif(trim(coalesce(v_address->>'street','')),'') is not null
          and nullif(trim(coalesce(v_address->>'number','')),'') is not null
          and nullif(trim(coalesce(v_address->>'neighborhood','')),'') is not null
          and public.normalize_local_delivery_city_v1(v_address->>'city') is not null;
      else
        unsupported:=unsupported||jsonb_build_array(pre);
        ok:=false;
    end case;
    checks:=checks||jsonb_build_object(pre,ok);
    if not ok then missing:=missing||jsonb_build_array(pre); end if;
  end loop;

  return jsonb_build_object(
    'ready',jsonb_array_length(missing)=0 and jsonb_array_length(unsupported)=0,
    'action_key',a.action_key,
    'risk_class',a.risk_class,
    'missing',missing,
    'unsupported',unsupported,
    'checks',checks,
    'state',jsonb_build_object(
      'conversation_exists',c.id is not null,
      'service_window_open',v_service_window_open,
      'human_clear',v_human_clear,
      'current_message_present',v_current_message,
      'basket_session_active',v_basket_session_active,
      'cart_valid',v_cart_valid,
      'customer_valid',v_customer_valid,
      'address_flow_pending',v_address_flow_pending,
      'awaiting',coalesce(st.awaiting,'')
    ),
    'pii_returned',false
  );
end
$$;

revoke all on function public.evaluate_whatsapp_agent_action_preconditions_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.evaluate_whatsapp_agent_action_preconditions_v1(uuid,uuid,text,jsonb) to service_role;

commit;