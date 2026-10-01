-- Dona Antônia — confirmação transacional do checkout via WhatsApp
-- 2026-10-01
-- O pedido continua sendo criado exclusivamente pelo motor canônico do site.
-- Esta outbox apenas registra uma intenção de comunicação posterior e idempotente.

create table if not exists public.ops2_whatsapp_outbox_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  whatsapp_account_id uuid references public.whatsapp_accounts(id) on delete set null,
  phone_e164 text not null,
  channel_origin text not null check (channel_origin in ('0975','1018')),
  channel_phone_e164 text not null,
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
  on public.ops2_whatsapp_outbox_v1(status, available_at, created_at)
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

  if v_order.whatsapp_account_id is not null then
    select wa.* into v_account
    from public.whatsapp_accounts wa
    where wa.id=v_order.whatsapp_account_id
      and wa.is_active=true
    limit 1;
  end if;

  if v_account.id is null and v_order.conversation_id is not null then
    select c.* into v_conversation
    from public.conversations c
    where c.id=v_order.conversation_id
    limit 1;

    if v_conversation.whatsapp_account_id is not null then
      select wa.* into v_account
      from public.whatsapp_accounts wa
      where wa.id=v_conversation.whatsapp_account_id
        and wa.is_active=true
      limit 1;
    end if;
  end if;

  if v_account.id is null then
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

    if v_conversation.whatsapp_account_id is not null then
      select wa.* into v_account
      from public.whatsapp_accounts wa
      where wa.id=v_conversation.whatsapp_account_id
        and wa.is_active=true
      limit 1;
    end if;
  end if;

  v_channel_phone_e164:=public.canonical_whatsapp_e164_br_v2(v_account.phone_e164);

  if right(coalesce(v_channel_phone_e164,''),4)='1018' then
    v_channel_origin:='1018';
  elsif right(coalesce(v_channel_phone_e164,''),4)='0975' then
    v_channel_origin:='0975';
  else
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
    'customer_id',v_order.customer_id,
    'phone_e164',v_phone,
    'channel_origin',v_channel_origin,
    'channel_phone_e164',v_channel_phone_e164,
    'order_snapshot',to_jsonb(v_order)
  );

  insert into public.ops2_whatsapp_outbox_v1(
    order_id,customer_id,conversation_id,whatsapp_account_id,
    phone_e164,channel_origin,channel_phone_e164,message_kind,payload,status
  ) values (
    v_order.id,v_order.customer_id,coalesce(v_order.conversation_id,v_conversation.id),
    coalesce(v_order.whatsapp_account_id,v_account.id),
    v_phone,v_channel_origin,v_channel_phone_e164,v_kind,v_payload,'pending'
  )
  on conflict (order_id,message_kind) do nothing
  returning * into v_outbox;

  if not found then
    v_reused:=true;
    select q.* into v_outbox
    from public.ops2_whatsapp_outbox_v1 q
    where q.order_id=v_order.id
      and q.message_kind=v_kind;
  end if;

  return jsonb_build_object(
    'ok',true,
    'outbox_id',v_outbox.id,
    'status',v_outbox.status,
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
