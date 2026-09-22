begin;

create or replace function public.promote_papoai_commerce_checkout_profile_v1(
  p_conversation_id uuid,
  p_cart_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_profile jsonb;
  v_conv public.conversations%rowtype;
  v_customer public.customers%rowtype;
  v_address public.customer_addresses%rowtype;
  v_name text;
  v_addr jsonb;
  v_city text;
begin
  v_profile:=public.get_papoai_commerce_checkout_profile_v1(p_conversation_id);
  if not coalesce((v_profile->>'complete')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'reason','checkout_profile_incomplete',
      'missing',coalesce(v_profile->'missing','[]'::jsonb)
    );
  end if;

  select * into v_conv
  from public.conversations
  where id=p_conversation_id
  for update;
  if not found then raise exception 'conversation_not_found'; end if;

  v_name:=nullif(trim(v_profile->>'name'),'');
  v_addr:=coalesce(v_profile->'address','{}'::jsonb);
  v_city:=public.normalize_local_delivery_city_v1(v_addr->>'city');

  if v_name is null
     or nullif(trim(coalesce(v_addr->>'street','')),'') is null
     or nullif(trim(coalesce(v_addr->>'number','')),'') is null
     or nullif(trim(coalesce(v_addr->>'neighborhood','')),'') is null
     or v_city is null
  then
    return jsonb_build_object(
      'ok',false,
      'reason','checkout_profile_invalid'
    );
  end if;

  if v_conv.customer_id is not null then
    select * into v_customer
    from public.customers
    where id=v_conv.customer_id
    for update;
  end if;

  if v_customer.id is null then
    insert into public.customers(
      name,
      primary_whatsapp_e164,
      is_active
    ) values(
      v_name,
      v_conv.wa_contact_e164,
      true
    )
    returning * into v_customer;

    update public.conversations
       set customer_id=v_customer.id,
           updated_at=now()
     where id=p_conversation_id;
  else
    update public.customers
       set name=v_name,
           primary_whatsapp_e164=coalesce(primary_whatsapp_e164,v_conv.wa_contact_e164),
           is_active=true,
           updated_at=now()
     where id=v_customer.id
     returning * into v_customer;
  end if;

  select * into v_address
  from public.customer_addresses
  where customer_id=v_customer.id
    and is_active=true
  order by is_default desc,updated_at desc
  limit 1
  for update;

  if v_address.id is null then
    insert into public.customer_addresses(
      customer_id,label,street,number,complement,neighborhood,city,state,
      postal_code,reference,is_default,is_active,last_confirmed_at
    ) values(
      v_customer.id,
      'Entrega',
      trim(v_addr->>'street'),
      trim(v_addr->>'number'),
      nullif(trim(coalesce(v_addr->>'complement','')),''),
      trim(v_addr->>'neighborhood'),
      v_city,
      'MT',
      nullif(regexp_replace(coalesce(v_addr->>'postal_code',''),'[^0-9]','','g'),''),
      nullif(trim(coalesce(v_addr->>'reference','')),''),
      true,
      true,
      now()
    )
    returning * into v_address;
  else
    update public.customer_addresses
       set street=trim(v_addr->>'street'),
           number=trim(v_addr->>'number'),
           complement=nullif(trim(coalesce(v_addr->>'complement','')),''),
           neighborhood=trim(v_addr->>'neighborhood'),
           city=v_city,
           state='MT',
           postal_code=nullif(regexp_replace(coalesce(v_addr->>'postal_code',''),'[^0-9]','','g'),''),
           reference=nullif(trim(coalesce(v_addr->>'reference','')),''),
           is_default=true,
           is_active=true,
           last_confirmed_at=now(),
           updated_at=now()
     where id=v_address.id
     returning * into v_address;
  end if;

  update public.carts
     set customer_id=v_customer.id,
         updated_at=now()
   where id=p_cart_id
     and conversation_id=p_conversation_id
     and status='draft';

  update public.whatsapp_sales_state
     set awaiting=null,
         last_action='checkout_profile_promoted',
         updated_at=now()
   where conversation_id=p_conversation_id;

  return jsonb_build_object(
    'ok',true,
    'customer_id',v_customer.id,
    'address_id',v_address.id,
    'name',v_customer.name,
    'address',jsonb_build_object(
      'street',v_address.street,
      'number',v_address.number,
      'complement',coalesce(v_address.complement,''),
      'neighborhood',v_address.neighborhood,
      'city',v_address.city,
      'state',coalesce(v_address.state,'MT'),
      'postal_code',coalesce(v_address.postal_code,''),
      'reference',coalesce(v_address.reference,'')
    )
  );
end;
$$;

create or replace function public.get_papoai_commerce_checkout_readiness_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cart jsonb;
  v_profile jsonb;
  v_summary jsonb;
  v_missing text[]:='{}'::text[];
begin
  v_cart:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);
  if not coalesce((v_cart->>'has_cart')::boolean,false) then
    return jsonb_build_object(
      'ready',false,
      'reason','cart_not_found',
      'missing',jsonb_build_array('cart')
    );
  end if;

  v_profile:=public.get_papoai_commerce_checkout_profile_v1(p_conversation_id);
  v_summary:=public.format_papoai_commerce_cart_summary_v1(p_conversation_id);

  if not coalesce((v_profile->>'complete')::boolean,false) then
    v_missing:=array_append(v_missing,'checkout_profile');
  end if;

  if coalesce((v_cart->>'pricing_status'),'')<>'ready' then
    v_missing:=array_append(v_missing,'pricing');
  end if;

  return jsonb_build_object(
    'ready',cardinality(v_missing)=0,
    'missing',to_jsonb(v_missing),
    'profile',v_profile,
    'cart',v_cart,
    'summary',v_summary,
    'writes_performed',false
  );
end;
$$;

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
  v_profile jsonb;
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

  v_profile:=v_readiness->'profile';
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
      'checkout_name',v_profile->>'name',
      'delivery_address',coalesce(v_profile->'address','{}'::jsonb),
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
  v_promoted jsonb;
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
     or nullif(trim(coalesce(v_action.payload->>'checkout_name','')),'') is null
  then
    return jsonb_build_object('ok',false,'reason','checkout_profile_invalid');
  end if;

  v_promoted:=public.promote_papoai_commerce_checkout_profile_v1(
    p_conversation_id,
    v_cart.id
  );
  if not coalesce((v_promoted->>'ok')::boolean,false) then
    return v_promoted;
  end if;

  select * into v_cart from public.carts where id=v_cart.id for update;

  v_key:='papoai-commerce:'||v_action.id::text;

  perform set_config('app.suppress_bling_queue','on',true);
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
         sync_status='local',
         sync_error=null,
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
           'checkout_profile_promoted',true,
           'bling_queue_suppressed',true,
           'confirmed_at',now()
         ),
         updated_at=now()
   where id=v_order_id;

  delete from public.order_sync_jobs
   where order_id=v_order_id
     and status='pending'
     and attempts=0;

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
    'customer_id',v_promoted->>'customer_id',
    'total',v_cart.total,
    'payment_method',v_method,
    'payment_label',public.whatsapp_basket_payment_label_v1(v_method),
    'bling_queued',exists(select 1 from public.order_sync_jobs where order_id=v_order_id),
    'bling_queue_enabled',coalesce(v_cfg.bling_queue_enabled,false),
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.promote_papoai_commerce_checkout_profile_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.promote_papoai_commerce_checkout_profile_v1(uuid,uuid) to service_role;

revoke all on function public.get_papoai_commerce_checkout_readiness_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_checkout_readiness_v1(uuid) to service_role;

revoke all on function public.prepare_papoai_commerce_order_confirmation_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_papoai_commerce_order_confirmation_v1(uuid,text) to service_role;

revoke all on function public.finalize_papoai_commerce_order_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finalize_papoai_commerce_order_v1(uuid,uuid) to service_role;

commit;
