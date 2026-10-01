-- Dona Antônia — confirmação transacional do checkout via WhatsApp
-- 2026-10-01
-- O pedido continua sendo criado exclusivamente pelo motor canônico do site.
-- A entrega usa somente template utilitário aprovado pelo PapoAI/Meta.

create table if not exists public.ops2_whatsapp_outbox_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  whatsapp_account_id uuid references public.whatsapp_accounts(id) on delete set null,
  phone_e164 text not null,
  channel_origin text not null check (channel_origin in ('0975','1018')),
  channel_phone_e164 text not null,
  delivery_mode text not null default 'utility_template' check (delivery_mode='utility_template'),
  message_kind text not null default 'order_received',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sending','sent','retry','failed','suppressed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  external_message_id text,
  last_error text,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, message_kind)
);

create index if not exists ops2_whatsapp_outbox_v1_dispatch_idx
  on public.ops2_whatsapp_outbox_v1(status, channel_origin, available_at, created_at)
  where status in ('pending','retry');

alter table public.ops2_whatsapp_outbox_v1 enable row level security;
revoke all on table public.ops2_whatsapp_outbox_v1 from public,anon,authenticated;
grant all on table public.ops2_whatsapp_outbox_v1 to service_role;

create or replace function public.ops2_enqueue_order_whatsapp_v1(
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

  select o.* into v_order
  from public.orders o
  where o.id=p_order_id;

  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  v_checkout_origin:=lower(coalesce(v_order.checkout_snapshot#>>'{customer,whatsapp_origin}',''));
  if v_checkout_origin not in ('0975','1018') then
    v_checkout_origin:='';
  end if;

  if v_order.customer_id is not null then
    select c.* into v_customer
    from public.customers c
    where c.id=v_order.customer_id;
  end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(
    coalesce(v_order.phone_e164,v_customer.primary_whatsapp_e164)
  );

  if v_phone is null then
    return jsonb_build_object('ok',false,'error','customer_phone_missing');
  end if;

  -- A conversa serve apenas para preservar o canal de origem.
  if v_order.conversation_id is not null then
    select c.* into v_conversation
    from public.conversations c
    where c.id=v_order.conversation_id
    limit 1;
  end if;

  if v_conversation.id is null then
    select c.* into v_conversation
    from public.conversations c
    where c.whatsapp_account_id is not null
      and (
        (v_order.customer_id is not null and c.customer_id=v_order.customer_id)
        or public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164)=v_phone
      )
    order by greatest(
      coalesce(c.last_inbound_at,'epoch'::timestamptz),
      coalesce(c.last_outbound_at,'epoch'::timestamptz),
      coalesce(c.updated_at,'epoch'::timestamptz),
      coalesce(c.created_at,'epoch'::timestamptz)
    ) desc
    limit 1;
  end if;

  if v_order.whatsapp_account_id is not null then
    select wa.* into v_account
    from public.whatsapp_accounts wa
    where wa.id=v_order.whatsapp_account_id
      and wa.is_active=true
    limit 1;
  end if;

  if v_account.id is null and v_conversation.whatsapp_account_id is not null then
    select wa.* into v_account
    from public.whatsapp_accounts wa
    where wa.id=v_conversation.whatsapp_account_id
      and wa.is_active=true
    limit 1;
  end if;

  v_channel_phone_e164:=public.canonical_whatsapp_e164_br_v2(v_account.phone_e164);

  if right(coalesce(v_channel_phone_e164,''),4)='1018' then
    -- O vínculo real da conversa/conta tem prioridade sobre qualquer origem enviada pelo navegador.
    v_channel_origin:='1018';
  elsif right(coalesce(v_channel_phone_e164,''),4)='0975' then
    v_channel_origin:='0975';
  elsif v_checkout_origin='1018' then
    v_channel_origin:='1018';
    select public.canonical_whatsapp_e164_br_v2(wa.phone_e164)
      into v_channel_phone_e164
    from public.whatsapp_accounts wa
    where wa.is_active=true
      and right(regexp_replace(coalesce(wa.phone_e164,''),'\D','','g'),4)='1018'
    order by wa.updated_at desc nulls last,wa.created_at desc nulls last
    limit 1;
    v_channel_phone_e164:=coalesce(v_channel_phone_e164,'+5565984491018');
  elsif v_checkout_origin='0975' then
    v_channel_origin:='0975';
    select public.canonical_whatsapp_e164_br_v2(wa.phone_e164)
      into v_channel_phone_e164
    from public.whatsapp_accounts wa
    where wa.is_active=true
      and right(regexp_replace(coalesce(wa.phone_e164,''),'\D','','g'),4)='0975'
    order by wa.updated_at desc nulls last,wa.created_at desc nulls last
    limit 1;
    v_channel_phone_e164:=coalesce(v_channel_phone_e164,'+5565998150975');
  else
    -- Entrada direta sem conversa nem origem reconhecida usa o 0975 como canal operacional padrão.
    v_channel_origin:='0975';
    select public.canonical_whatsapp_e164_br_v2(wa.phone_e164)
      into v_channel_phone_e164
    from public.whatsapp_accounts wa
    where wa.is_active=true
      and right(regexp_replace(coalesce(wa.phone_e164,''),'\D','','g'),4)='0975'
    order by wa.updated_at desc nulls last,wa.created_at desc nulls last
    limit 1;
    v_channel_phone_e164:=coalesce(v_channel_phone_e164,'+5565998150975');
  end if;

  v_payload:=jsonb_build_object(
    'kind',v_kind,
    'order_id',v_order.id,
    'order_number',v_order.order_number,
    'phone_e164',v_phone,
    'channel_origin',v_channel_origin,
    'channel_phone_e164',v_channel_phone_e164,
    'delivery_mode','utility_template',
    'order',jsonb_build_object(
      'id',v_order.id,
      'order_number',v_order.order_number,
      'status',v_order.status,
      'total',v_order.total,
      'currency',v_order.currency,
      'payment_method',v_order.payment_method,
      'delivery',coalesce(v_order.checkout_snapshot->'delivery','{}'::jsonb)
    )
  );

  select exists(
    select 1 from public.ops2_whatsapp_outbox_v1 q
    where q.order_id=v_order.id and q.message_kind=v_kind
  ) into v_reused;

  insert into public.ops2_whatsapp_outbox_v1 as q(
    order_id,customer_id,conversation_id,whatsapp_account_id,
    phone_e164,channel_origin,channel_phone_e164,delivery_mode,message_kind,payload,status
  ) values (
    v_order.id,v_order.customer_id,coalesce(v_order.conversation_id,v_conversation.id),
    coalesce(v_order.whatsapp_account_id,v_account.id),
    v_phone,v_channel_origin,v_channel_phone_e164,'utility_template',v_kind,v_payload,'pending'
  )
  on conflict (order_id,message_kind) do update
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
    select existing.* into v_outbox
    from public.ops2_whatsapp_outbox_v1 existing
    where existing.order_id=v_order.id
      and existing.message_kind=v_kind;
  end if;

  return jsonb_build_object(
    'ok',true,
    'outbox_id',v_outbox.id,
    'status',v_outbox.status,
    'delivery_mode',v_outbox.delivery_mode,
    'channel_origin',v_outbox.channel_origin,
    'channel_phone_e164',v_outbox.channel_phone_e164,
    'phone_e164',v_outbox.phone_e164,
    'reused',v_reused
  );
end;
$$;

revoke all on function public.ops2_enqueue_order_whatsapp_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.ops2_enqueue_order_whatsapp_v1(uuid,text) to service_role;

create or replace function public.ops2_enqueue_storefront_order_whatsapp_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.source not in ('vitrine','storefront_v2') then
    return new;
  end if;

  begin
    perform public.ops2_enqueue_order_whatsapp_v1(new.id,'order_received');
  exception when others then
    raise warning 'ops2_enqueue_storefront_order_whatsapp_v1 failed for order %: %',new.id,sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.ops2_enqueue_storefront_order_whatsapp_v1() from public,anon,authenticated;
grant execute on function public.ops2_enqueue_storefront_order_whatsapp_v1() to service_role;

drop trigger if exists trg_ops2_enqueue_storefront_order_whatsapp_v1 on public.orders;
create trigger trg_ops2_enqueue_storefront_order_whatsapp_v1
after insert on public.orders
for each row
execute function public.ops2_enqueue_storefront_order_whatsapp_v1();

create or replace function public.ops2_refresh_storefront_order_whatsapp_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.source not in ('vitrine','storefront_v2') then
    return new;
  end if;

  if new.conversation_id is not distinct from old.conversation_id
     and new.whatsapp_account_id is not distinct from old.whatsapp_account_id
     and new.customer_id is not distinct from old.customer_id
     and new.phone_e164 is not distinct from old.phone_e164 then
    return new;
  end if;

  begin
    perform public.ops2_enqueue_order_whatsapp_v1(new.id,'order_received');
  exception when others then
    raise warning 'ops2_refresh_storefront_order_whatsapp_v1 failed for order %: %',new.id,sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.ops2_refresh_storefront_order_whatsapp_v1() from public,anon,authenticated;
grant execute on function public.ops2_refresh_storefront_order_whatsapp_v1() to service_role;

drop trigger if exists trg_ops2_refresh_storefront_order_whatsapp_v1 on public.orders;
create trigger trg_ops2_refresh_storefront_order_whatsapp_v1
after update of conversation_id,whatsapp_account_id,customer_id,phone_e164 on public.orders
for each row
execute function public.ops2_refresh_storefront_order_whatsapp_v1();

create or replace function public.ops2_claim_whatsapp_outbox_v1(
  p_channel_origin text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item public.ops2_whatsapp_outbox_v1%rowtype;
  v_channel text:=nullif(btrim(coalesce(p_channel_origin,'')),'');
begin
  update public.ops2_whatsapp_outbox_v1
     set status='retry',locked_at=null,updated_at=now(),last_error=coalesce(last_error,'stale_sending_recovered')
   where status='sending'
     and locked_at < now()-interval '15 minutes'
     and attempt_count < 5;

  with next_item as (
    select q.id
    from public.ops2_whatsapp_outbox_v1 q
    where q.status in ('pending','retry')
      and q.delivery_mode='utility_template'
      and q.available_at <= now()
      and q.attempt_count < 5
      and (v_channel is null or q.channel_origin=v_channel)
    order by q.available_at,q.created_at
    for update skip locked
    limit 1
  )
  update public.ops2_whatsapp_outbox_v1 q
     set status='sending',
         attempt_count=q.attempt_count+1,
         locked_at=now(),
         updated_at=now(),
         last_error=null
    from next_item n
   where q.id=n.id
  returning q.* into v_item;

  if not found then
    return jsonb_build_object('ok',true,'found',false);
  end if;

  return jsonb_build_object('ok',true,'found',true,'item',to_jsonb(v_item));
end;
$$;

revoke all on function public.ops2_claim_whatsapp_outbox_v1(text) from public,anon,authenticated;
grant execute on function public.ops2_claim_whatsapp_outbox_v1(text) to service_role;

create or replace function public.ops2_finish_whatsapp_outbox_v1(
  p_outbox_id uuid,
  p_status text,
  p_external_message_id text default null,
  p_last_error text default null,
  p_retry_after_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text:=lower(coalesce(btrim(p_status),''));
  v_item public.ops2_whatsapp_outbox_v1%rowtype;
begin
  if p_outbox_id is null then
    return jsonb_build_object('ok',false,'error','outbox_id_required');
  end if;
  if v_status not in ('sent','retry','failed','suppressed') then
    return jsonb_build_object('ok',false,'error','invalid_finish_status');
  end if;

  update public.ops2_whatsapp_outbox_v1
     set status=v_status,
         external_message_id=case when v_status='sent' then nullif(btrim(p_external_message_id),'') else external_message_id end,
         last_error=case when v_status='sent' then null else nullif(left(coalesce(p_last_error,''),500),'') end,
         sent_at=case when v_status='sent' then now() else sent_at end,
         available_at=case when v_status='retry' then now()+make_interval(secs=>greatest(60,least(coalesce(p_retry_after_seconds,300),3600))) else available_at end,
         locked_at=null,
         updated_at=now()
   where id=p_outbox_id
     and status='sending'
  returning * into v_item;

  if not found then
    return jsonb_build_object('ok',false,'error','outbox_not_sending');
  end if;

  return jsonb_build_object('ok',true,'outbox_id',v_item.id,'status',v_item.status,'attempt_count',v_item.attempt_count,'external_message_id',v_item.external_message_id);
end;
$$;

revoke all on function public.ops2_finish_whatsapp_outbox_v1(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.ops2_finish_whatsapp_outbox_v1(uuid,text,text,text,integer) to service_role;
