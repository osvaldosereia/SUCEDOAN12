begin;

alter table public.papoai_commerce_pending_actions
  drop constraint if exists papoai_commerce_pending_actions_action_type_check;

alter table public.papoai_commerce_pending_actions
  add constraint papoai_commerce_pending_actions_action_type_check
  check(action_type in ('replace_basket_item','confirm_order'));

create or replace function public.papoai_commerce_cart_fingerprint_v1(p_cart_id uuid)
returns text
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select md5(coalesce(string_agg(
    ci.product_id::text||':'||ci.source||':'||
    trim(to_char(ci.quantity,'FM999999990.###'))||':'||
    trim(to_char(coalesce(ci.commercial_delta,0),'FM999999990.00'))||':'||
    trim(to_char(coalesce(ci.commercial_unit_price,ci.unit_price,0),'FM999999990.00')),
    '|' order by ci.product_id,ci.source,ci.created_at
  ),''))
  from public.cart_items ci
  where ci.cart_id=p_cart_id and ci.quantity>0;
$$;

revoke all on function public.papoai_commerce_cart_fingerprint_v1(uuid) from public,anon,authenticated;
grant execute on function public.papoai_commerce_cart_fingerprint_v1(uuid) to service_role;

create or replace function public.prepare_papoai_commerce_order_confirmation_v1(
  p_conversation_id uuid,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_method text;
  v_readiness jsonb;
  v_contact jsonb;
  v_cart public.carts%rowtype;
  v_action_id uuid;
  v_fingerprint text;
  v_payment_label text;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then raise exception 'papoai_commerce_brain_disabled'; end if;
  if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;

  v_method:=public.normalize_whatsapp_basket_payment_method_v1(p_payment_method);
  if v_method is null then
    return jsonb_build_object(
      'ok',false,
      'needs_payment_method',true,
      'allowed',jsonb_build_array('pix','cash','credit_card','food_card')
    );
  end if;

  v_readiness:=public.get_papoai_commerce_checkout_readiness_v1(p_conversation_id);
  if not coalesce((v_readiness->>'ready')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'checkout_not_ready',true,
      'missing',coalesce(v_readiness->'missing','[]'::jsonb),
      'readiness',v_readiness
    );
  end if;

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1
  for update;
  if not found then return jsonb_build_object('ok',false,'reason','cart_not_found'); end if;

  v_contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);
  v_fingerprint:=public.papoai_commerce_cart_fingerprint_v1(v_cart.id);
  v_payment_label:=public.whatsapp_basket_payment_label_v1(v_method);

  update public.papoai_commerce_pending_actions
     set status='cancelled',resolved_at=now(),updated_at=now()
   where conversation_id=p_conversation_id and status='pending';

  insert into public.papoai_commerce_pending_actions(
    conversation_id,action_type,status,payload,expires_at
  ) values(
    p_conversation_id,'confirm_order','pending',
    jsonb_build_object(
      'cart_id',v_cart.id,
      'cart_version',v_cart.version,
      'cart_fingerprint',v_fingerprint,
      'prepared_total',v_cart.total,
      'payment_method',v_method,
      'payment_label',v_payment_label,
      'delivery_address',coalesce(v_contact->'address','{}'::jsonb),
      'basket_id',v_cart.basket_id,
      'prepared_at',now()
    ),
    now()+interval '15 minutes'
  )
  returning id into v_action_id;

  return jsonb_build_object(
    'ok',true,
    'pending_action_id',v_action_id,
    'action_type','confirm_order',
    'payment_method',v_method,
    'payment_label',v_payment_label,
    'total',v_cart.total,
    'summary',v_readiness->'summary',
    'requires_confirmation',true,
    'expires_in_seconds',900,
    'writes_performed',false
  );
end;
$$;

create or replace function public.finalize_papoai_commerce_order_v1(
  p_conversation_id uuid,
  p_pending_action_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_action public.papoai_commerce_pending_actions%rowtype;
  v_cart public.carts%rowtype;
  v_conv public.conversations%rowtype;
  v_basket public.basket_templates%rowtype;
  v_current_fingerprint text;
  v_expected_fingerprint text;
  v_expected_total numeric;
  v_method text;
  v_address jsonb;
  v_confirmed jsonb;
  v_order_id uuid;
  v_order_number text;
  v_key text;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then raise exception 'papoai_commerce_brain_disabled'; end if;
  if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;

  select * into v_action
  from public.papoai_commerce_pending_actions
  where id=p_pending_action_id
    and conversation_id=p_conversation_id
    and action_type='confirm_order'
    and status='pending'
  for update;

  if not found then return jsonb_build_object('ok',false,'reason','pending_order_not_found'); end if;
  if v_action.expires_at<=now() then
    return jsonb_build_object('ok',false,'reason','pending_action_expired');
  end if;

  select * into v_cart
  from public.carts
  where id=(v_action.payload->>'cart_id')::uuid
    and conversation_id=p_conversation_id
    and status='draft'
  for update;
  if not found then return jsonb_build_object('ok',false,'reason','cart_not_confirmable'); end if;

  perform public.recalculate_papoai_commerce_cart_v1(v_cart.id);
  select * into v_cart from public.carts where id=v_cart.id for update;

  v_current_fingerprint:=public.papoai_commerce_cart_fingerprint_v1(v_cart.id);
  v_expected_fingerprint:=v_action.payload->>'cart_fingerprint';
  v_expected_total:=nullif(v_action.payload->>'prepared_total','')::numeric;

  if v_current_fingerprint is distinct from v_expected_fingerprint
     or abs(coalesce(v_cart.total,0)-coalesce(v_expected_total,0))>0.01
  then
    return jsonb_build_object(
      'ok',false,
      'reason','cart_changed_reconfirm',
      'prepared_total',v_expected_total,
      'current_total',v_cart.total,
      'summary',public.format_papoai_commerce_cart_summary_v1(p_conversation_id)
    );
  end if;

  v_method:=public.normalize_whatsapp_basket_payment_method_v1(v_action.payload->>'payment_method');
  if v_method is null then return jsonb_build_object('ok',false,'reason','payment_method_invalid'); end if;

  v_address:=coalesce(v_action.payload->'delivery_address','{}'::jsonb);
  if coalesce(v_address->>'street','')=''
     or coalesce(v_address->>'number','')=''
     or coalesce(v_address->>'neighborhood','')=''
     or public.normalize_local_delivery_city_v1(v_address->>'city') is null
  then
    return jsonb_build_object('ok',false,'reason','delivery_address_invalid');
  end if;

  v_key:='papoai-commerce:'||v_action.id::text;
  v_confirmed:=public.confirm_cart_order_v2(v_cart.id,v_address,v_key);
  v_order_id:=(v_confirmed->>'order_id')::uuid;

  select * into v_conv from public.conversations where id=p_conversation_id;
  if v_cart.basket_id is not null then
    select * into v_basket from public.basket_templates where id=v_cart.basket_id;
  end if;

  v_order_number:='DA-'||
    to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'||
    upper(substr(replace(v_order_id::text,'-',''),1,8));

  update public.orders
     set payment_method=v_method,
         phone_e164=v_conv.wa_contact_e164,
         source='papoai_external_agent',
         subtotal=total,
         order_number=coalesce(order_number,v_order_number),
         basket_name_snapshot=coalesce(basket_name_snapshot,v_basket.name),
         basket_hidden_adjustment=coalesce(v_cart.basket_hidden_adjustment,0),
         checkout_snapshot=coalesce(checkout_snapshot,'{}'::jsonb)||jsonb_build_object(
           'channel','whatsapp',
           'provider','papoai',
           'commerce_version','v1',
           'pending_action_id',v_action.id,
           'payment_method',v_method,
           'prepared_total',v_expected_total,
           'confirmed_total',v_cart.total,
           'confirmed_at',now()
         ),
         updated_at=now()
   where id=v_order_id;

  update public.conversations
     set stage='order_confirmed',
         status='waiting_customer',
         updated_at=now()
   where id=p_conversation_id;

  return jsonb_build_object(
    'ok',true,
    'order_id',v_order_id,
    'order_number',v_order_number,
    'status','confirmed',
    'total',v_cart.total,
    'payment_method',v_method,
    'payment_label',public.whatsapp_basket_payment_label_v1(v_method),
    'bling_queued',false,
    'external_side_effect',false
  );
end;
$$;

create or replace function public.confirm_papoai_commerce_pending_action_v1(
  p_conversation_id uuid,
  p_confirm boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_action public.papoai_commerce_pending_actions%rowtype;
  v_result jsonb;
begin
  select * into v_action
  from public.papoai_commerce_pending_actions
  where conversation_id=p_conversation_id and status='pending'
  order by created_at desc limit 1
  for update;

  if not found then return jsonb_build_object('ok',false,'reason','no_pending_action'); end if;

  if v_action.expires_at<=now() then
    update public.papoai_commerce_pending_actions
       set status='expired',resolved_at=now(),updated_at=now()
     where id=v_action.id;
    return jsonb_build_object('ok',false,'reason','pending_action_expired');
  end if;

  if not coalesce(p_confirm,false) then
    update public.papoai_commerce_pending_actions
       set status='cancelled',resolved_at=now(),updated_at=now()
     where id=v_action.id;
    return jsonb_build_object('ok',true,'cancelled',true,'action_type',v_action.action_type);
  end if;

  if v_action.action_type='replace_basket_item' then
    v_result:=public.replace_papoai_commerce_basket_item_v2(
      p_conversation_id,
      (v_action.payload#>>'{source,product_id}')::uuid,
      (v_action.payload#>>'{replacement,product_id}')::uuid,
      true
    );
  elsif v_action.action_type='confirm_order' then
    v_result:=public.finalize_papoai_commerce_order_v1(
      p_conversation_id,
      v_action.id
    );
  else
    raise exception 'unsupported_pending_action';
  end if;

  if not coalesce((v_result->>'ok')::boolean,false) then
    if v_result->>'reason'='cart_changed_reconfirm' then
      update public.papoai_commerce_pending_actions
         set status='failed',resolved_at=now(),updated_at=now()
       where id=v_action.id;
    end if;
    return v_result;
  end if;

  update public.papoai_commerce_pending_actions
     set status='confirmed',resolved_at=now(),updated_at=now()
   where id=v_action.id;

  return jsonb_build_object(
    'ok',true,
    'confirmed',true,
    'action_type',v_action.action_type,
    'result',v_result
  );
end;
$$;

create or replace function public.execute_papoai_commerce_command_v1(
  p_conversation_id uuid,
  p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_type text:=lower(trim(coalesce(p_command->>'type','')));
  v_result jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then raise exception 'papoai_commerce_brain_disabled'; end if;

  case v_type
    when 'list_baskets' then
      if not v_cfg.basket_reads_enabled then raise exception 'basket_reads_disabled'; end if;
      v_result:=jsonb_build_object('ok',true,'baskets',public.get_papoai_commerce_basket_catalog_v1());
    when 'basket_detail' then
      if not v_cfg.basket_reads_enabled then raise exception 'basket_reads_disabled'; end if;
      v_result:=public.format_papoai_commerce_basket_message_v1(p_command->>'basket');
    when 'customer_context' then
      v_result:=public.get_papoai_commerce_customer_snapshot_v2(p_conversation_id);
    when 'search_products' then
      v_result:=public.search_papoai_commerce_products_v1(p_command->>'query',nullif(p_command->>'limit','')::integer);
    when 'offers' then
      v_result:=public.get_papoai_commerce_offers_v1(p_conversation_id,coalesce(nullif(p_command->>'limit','')::integer,4));
    when 'cart_state' then
      v_result:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);
    when 'cart_summary' then
      v_result:=public.format_papoai_commerce_cart_summary_v1(p_conversation_id);
    when 'checkout_readiness' then
      v_result:=public.get_papoai_commerce_checkout_readiness_v1(p_conversation_id);
    when 'prepare_order_confirmation' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.prepare_papoai_commerce_order_confirmation_v1(
        p_conversation_id,p_command->>'payment_method'
      );
    when 'pending_action' then
      v_result:=public.get_papoai_commerce_pending_action_v1(p_conversation_id);
    when 'confirm_pending' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.confirm_papoai_commerce_pending_action_v1(
        p_conversation_id,coalesce((p_command->>'confirm')::boolean,true)
      );
    when 'start_basket' then
      v_result:=public.start_papoai_commerce_basket_v1(p_conversation_id,p_command->>'basket');
    when 'set_basket_quantity' then
      if coalesce(p_command->>'product_id','')<>'' then
        v_result:=public.set_papoai_commerce_basket_quantity_v1(
          p_conversation_id,(p_command->>'product_id')::uuid,(p_command->>'quantity')::numeric
        );
      else
        v_result:=public.set_papoai_commerce_basket_quantity_by_query_v1(
          p_conversation_id,p_command->>'source_query',(p_command->>'quantity')::numeric
        );
      end if;
    when 'set_addon_quantity' then
      if coalesce(p_command->>'product_id','')<>'' then
        v_result:=public.set_papoai_commerce_addon_quantity_v1(
          p_conversation_id,(p_command->>'product_id')::uuid,(p_command->>'quantity')::numeric
        );
      else
        v_result:=public.set_papoai_commerce_addon_by_query_v1(
          p_conversation_id,p_command->>'query',(p_command->>'quantity')::numeric
        );
      end if;
    when 'replacement_candidates' then
      v_result:=public.resolve_papoai_commerce_replacement_candidates_v1(
        p_conversation_id,p_command->>'source_query',p_command->>'replacement_query',
        coalesce(nullif(p_command->>'limit','')::integer,5)
      );
    when 'propose_replacement' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.propose_papoai_commerce_replacement_v1(
        p_conversation_id,p_command->>'source_query',p_command->>'replacement_query'
      );
    when 'replace_basket_item' then
      v_result:=public.replace_papoai_commerce_basket_item_v2(
        p_conversation_id,
        (p_command->>'source_product_id')::uuid,
        (p_command->>'replacement_product_id')::uuid,
        coalesce((p_command->>'customer_confirmed')::boolean,false)
      );
    else
      raise exception 'unsupported_commerce_command:%',v_type;
  end case;

  insert into public.papoai_commerce_command_audit(conversation_id,command_type,command,outcome,result_summary)
  values(
    p_conversation_id,v_type,coalesce(p_command,'{}'::jsonb),'ok',
    jsonb_build_object(
      'ok',coalesce((v_result->>'ok')::boolean,true),
      'ready',v_result->>'ready',
      'found',v_result->>'found',
      'order_id',v_result->>'order_id',
      'needs_clarification',v_result->>'needs_clarification'
    )
  );

  return v_result;
exception when others then
  begin
    insert into public.papoai_commerce_command_audit(conversation_id,command_type,command,outcome,result_summary)
    values(
      p_conversation_id,coalesce(nullif(v_type,''),'unknown'),coalesce(p_command,'{}'::jsonb),'error',
      jsonb_build_object('error',sqlerrm)
    );
  exception when others then null;
  end;
  raise;
end;
$$;

revoke all on function public.prepare_papoai_commerce_order_confirmation_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_papoai_commerce_order_confirmation_v1(uuid,text) to service_role;
revoke all on function public.finalize_papoai_commerce_order_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finalize_papoai_commerce_order_v1(uuid,uuid) to service_role;
revoke all on function public.confirm_papoai_commerce_pending_action_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.confirm_papoai_commerce_pending_action_v1(uuid,boolean) to service_role;
revoke all on function public.execute_papoai_commerce_command_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.execute_papoai_commerce_command_v1(uuid,jsonb) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'order_confirmation_policy','two_step_pending_snapshot',
  'bling_queue_on_confirm',false,
  'stale_cart_policy','reject_and_reconfirm'
),
updated_at=now()
where id=1;

commit;
