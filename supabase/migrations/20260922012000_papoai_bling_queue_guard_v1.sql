begin;

alter table public.papoai_commerce_brain_config
  add column if not exists bling_queue_enabled boolean not null default false;

update public.papoai_commerce_brain_config
set bling_queue_enabled=false,
    updated_at=now()
where id=1;

create or replace function public.queue_order_for_bling()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(current_setting('app.suppress_bling_queue',true),'')='on' then
    return new;
  end if;

  if new.status='confirmed' and new.bling_order_id is null then
    insert into public.order_sync_jobs(order_id,external_key,status)
    values(new.id,'DA-'||replace(new.id::text,'-',''),'pending')
    on conflict(order_id) do nothing;

    update public.orders
       set sync_status='pending_bling',
           sync_error=null
     where id=new.id;
  end if;

  return new;
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
    'total',v_cart.total,
    'payment_method',v_method,
    'payment_label',public.whatsapp_basket_payment_label_v1(v_method),
    'bling_queued',exists(select 1 from public.order_sync_jobs where order_id=v_order_id),
    'bling_queue_enabled',coalesce(v_cfg.bling_queue_enabled,false),
    'external_side_effect',false
  );
end;
$$;

create or replace function public.queue_papoai_commerce_bling_v1(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_order public.orders%rowtype;
  v_result jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;

  if not coalesce(v_cfg.enabled,false) then
    return jsonb_build_object('ok',false,'reason','commerce_brain_disabled','queued',false);
  end if;
  if not coalesce(v_cfg.bling_queue_enabled,false) then
    return jsonb_build_object('ok',false,'reason','papoai_bling_queue_disabled','queued',false);
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','order_not_found','queued',false); end if;

  if v_order.source<>'papoai_external_agent' then
    return jsonb_build_object('ok',false,'reason','order_not_from_papoai','queued',false);
  end if;
  if v_order.status<>'confirmed' then
    return jsonb_build_object('ok',false,'reason','order_not_confirmed','queued',false,'status',v_order.status);
  end if;
  if v_order.bling_order_id is not null then
    return jsonb_build_object('ok',true,'reason','already_synced','queued',false,'bling_order_id',v_order.bling_order_id);
  end if;

  v_result:=public.queue_bling_order_backoffice_v1(
    v_order.id,
    'DA-PAPOAI-'||replace(v_order.id::text,'-','')
  );

  return jsonb_build_object(
    'ok',true,
    'queued',true,
    'order_id',v_order.id,
    'queue',v_result,
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.finalize_papoai_commerce_order_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finalize_papoai_commerce_order_v1(uuid,uuid) to service_role;
revoke all on function public.queue_papoai_commerce_bling_v1(uuid) from public,anon,authenticated;
grant execute on function public.queue_papoai_commerce_bling_v1(uuid) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'bling_queue_policy','explicit_papoai_gate_after_order_confirmation',
  'legacy_auto_queue_suppressed_for_papoai',true
),
updated_at=now()
where id=1;

commit;
