-- Dona Antônia — interoperabilidade entre checkout automático e envio manual do admin
-- A outbox compartilhada usa recipient_kind e idempotência por (order_id,message_kind,recipient_kind).

create or replace function public.ops2_enqueue_order_whatsapp_v1_base(
  p_order_id uuid,
  p_message_kind text default 'order_received'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_conversation public.conversations%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_phone text;
  v_kind text:=coalesce(nullif(btrim(p_message_kind),''),'order_received');
  v_channel_origin text;
  v_channel_phone_e164 text;
  v_checkout_origin text;
  v_payload jsonb;
  v_outbox public.ops2_whatsapp_outbox_v1%rowtype;
  v_reused boolean:=false;
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','order_id_required');
  end if;
  if v_kind <> 'order_received' then
    return jsonb_build_object('ok',false,'error','unsupported_message_kind');
  end if;

  select o.* into v_order from public.orders o where o.id=p_order_id;
  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  v_checkout_origin:=lower(coalesce(v_order.checkout_snapshot#>>'{customer,whatsapp_origin}',''));
  if v_checkout_origin not in ('0975','1018') then v_checkout_origin:=''; end if;

  if v_order.customer_id is not null then
    select c.* into v_customer from public.customers c where c.id=v_order.customer_id;
  end if;
  v_phone:=public.canonical_whatsapp_e164_br_v2(coalesce(v_order.phone_e164,v_customer.primary_whatsapp_e164));
  if v_phone is null then
    return jsonb_build_object('ok',false,'error','customer_phone_missing');
  end if;

  if v_order.conversation_id is not null then
    select c.* into v_conversation from public.conversations c where c.id=v_order.conversation_id limit 1;
  end if;
  if v_conversation.id is null then
    select c.* into v_conversation
    from public.conversations c
    where c.whatsapp_account_id is not null
      and ((v_order.customer_id is not null and c.customer_id=v_order.customer_id)
        or public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164)=v_phone)
    order by greatest(
      coalesce(c.last_inbound_at,'epoch'::timestamptz),
      coalesce(c.last_outbound_at,'epoch'::timestamptz),
      coalesce(c.updated_at,'epoch'::timestamptz),
      coalesce(c.created_at,'epoch'::timestamptz)
    ) desc
    limit 1;
  end if;

  if v_order.whatsapp_account_id is not null then
    select wa.* into v_account from public.whatsapp_accounts wa
    where wa.id=v_order.whatsapp_account_id and wa.is_active=true limit 1;
  end if;
  if v_account.id is null and v_conversation.whatsapp_account_id is not null then
    select wa.* into v_account from public.whatsapp_accounts wa
    where wa.id=v_conversation.whatsapp_account_id and wa.is_active=true limit 1;
  end if;

  v_channel_phone_e164:=public.canonical_whatsapp_e164_br_v2(v_account.phone_e164);
  if right(coalesce(v_channel_phone_e164,''),4)='1018' then
    v_channel_origin:='1018';
  elsif right(coalesce(v_channel_phone_e164,''),4)='0975' then
    v_channel_origin:='0975';
  elsif v_checkout_origin='1018' then
    v_channel_origin:='1018';
    select public.canonical_whatsapp_e164_br_v2(wa.phone_e164) into v_channel_phone_e164
    from public.whatsapp_accounts wa
    where wa.is_active=true and right(regexp_replace(coalesce(wa.phone_e164,''),'\D','','g'),4)='1018'
    order by wa.updated_at desc nulls last,wa.created_at desc nulls last limit 1;
    v_channel_phone_e164:=coalesce(v_channel_phone_e164,'+5565984491018');
  else
    v_channel_origin:='0975';
    select public.canonical_whatsapp_e164_br_v2(wa.phone_e164) into v_channel_phone_e164
    from public.whatsapp_accounts wa
    where wa.is_active=true and right(regexp_replace(coalesce(wa.phone_e164,''),'\D','','g'),4)='0975'
    order by wa.updated_at desc nulls last,wa.created_at desc nulls last limit 1;
    v_channel_phone_e164:=coalesce(v_channel_phone_e164,'+5565998150975');
  end if;

  v_payload:=jsonb_build_object(
    'kind',v_kind,
    'recipient_kind','customer',
    'order_id',v_order.id,
    'order_number',v_order.order_number,
    'phone_e164',v_phone,
    'channel_origin',v_channel_origin,
    'channel_phone_e164',v_channel_phone_e164,
    'delivery_mode','utility_template',
    'order',jsonb_build_object(
      'id',v_order.id,'order_number',v_order.order_number,'status',v_order.status,
      'total',v_order.total,'currency',v_order.currency,'payment_method',v_order.payment_method,
      'delivery',coalesce(v_order.checkout_snapshot->'delivery','{}'::jsonb)
    )
  );

  select exists(
    select 1 from public.ops2_whatsapp_outbox_v1 q
    where q.order_id=v_order.id and q.message_kind=v_kind and q.recipient_kind='customer'
  ) into v_reused;

  insert into public.ops2_whatsapp_outbox_v1 as q(
    order_id,customer_id,conversation_id,whatsapp_account_id,recipient_kind,
    phone_e164,channel_origin,channel_phone_e164,delivery_mode,message_kind,payload,status
  ) values (
    v_order.id,v_order.customer_id,coalesce(v_order.conversation_id,v_conversation.id),coalesce(v_order.whatsapp_account_id,v_account.id),'customer',
    v_phone,v_channel_origin,v_channel_phone_e164,'utility_template',v_kind,v_payload,'pending'
  )
  on conflict (order_id,message_kind,recipient_kind) do update
     set customer_id=excluded.customer_id,
         conversation_id=coalesce(excluded.conversation_id,q.conversation_id),
         whatsapp_account_id=coalesce(excluded.whatsapp_account_id,q.whatsapp_account_id),
         phone_e164=excluded.phone_e164,
         channel_origin=excluded.channel_origin,
         channel_phone_e164=excluded.channel_phone_e164,
         delivery_mode='utility_template',
         payload=excluded.payload,
         updated_at=now()
   where q.status in ('pending','retry')
  returning * into v_outbox;

  if not found then
    select existing.* into v_outbox from public.ops2_whatsapp_outbox_v1 existing
    where existing.order_id=v_order.id and existing.message_kind=v_kind and existing.recipient_kind='customer';
  end if;

  return jsonb_build_object(
    'ok',true,'outbox_id',v_outbox.id,'status',v_outbox.status,'recipient_kind',v_outbox.recipient_kind,
    'delivery_mode',v_outbox.delivery_mode,'channel_origin',v_outbox.channel_origin,
    'channel_phone_e164',v_outbox.channel_phone_e164,'phone_e164',v_outbox.phone_e164,'reused',v_reused
  );
end;
$$;

revoke all on function public.ops2_enqueue_order_whatsapp_v1_base(uuid,text) from public,anon,authenticated;
grant execute on function public.ops2_enqueue_order_whatsapp_v1_base(uuid,text) to service_role;

create or replace function public.ops2_claim_checkout_order_whatsapp_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_runtime_mode text;
  v_canary_order_id uuid;
  v_item public.ops2_whatsapp_outbox_v1%rowtype;
begin
  if p_order_id is null then return jsonb_build_object('ok',false,'error','order_id_required'); end if;

  select r.mode,r.canary_order_id into v_runtime_mode,v_canary_order_id
  from public.ops2_whatsapp_order_runtime_v1 r where r.id=1;
  v_runtime_mode:=coalesce(v_runtime_mode,'off');

  if v_runtime_mode='off' then
    return jsonb_build_object('ok',true,'found',false,'reason','runtime_off');
  end if;
  if v_runtime_mode='canary' and p_order_id is distinct from v_canary_order_id then
    return jsonb_build_object('ok',true,'found',false,'reason','not_canary_order');
  end if;

  update public.ops2_whatsapp_outbox_v1
     set status='retry',locked_at=null,updated_at=now(),last_error=coalesce(last_error,'stale_sending_recovered')
   where order_id=p_order_id and recipient_kind='customer'
     and status='sending' and locked_at<now()-interval '15 minutes' and attempt_count<5;

  with next_item as (
    select q.id from public.ops2_whatsapp_outbox_v1 q
    where q.order_id=p_order_id and q.recipient_kind='customer'
      and q.status in ('pending','retry') and q.delivery_mode='utility_template'
      and q.available_at<=now() and q.attempt_count<5
    order by q.available_at,q.created_at
    for update skip locked limit 1
  )
  update public.ops2_whatsapp_outbox_v1 q
     set status='sending',attempt_count=q.attempt_count+1,locked_at=now(),updated_at=now(),last_error=null
    from next_item n where q.id=n.id
  returning q.* into v_item;

  if not found then return jsonb_build_object('ok',true,'found',false); end if;
  return jsonb_build_object('ok',true,'found',true,'item',to_jsonb(v_item));
end;
$$;

revoke all on function public.ops2_claim_checkout_order_whatsapp_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_claim_checkout_order_whatsapp_v1(uuid) to service_role;
