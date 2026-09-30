create table if not exists public.marketing_repurchase_state_v1 (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  last_purchase_order_id uuid references public.orders(id) on delete set null,
  last_purchase_order_number text,
  last_purchase_at timestamptz,
  due_at timestamptz,
  status text not null default 'no_purchase' check (status in ('no_purchase','not_eligible','blocked_opt_out','scheduled','ready','sent')),
  marketing_opt_in boolean not null default false,
  phone_e164 text,
  send_channel_e164 text not null default '+5565998150975',
  template_name text not null default 'recompradonaantonia10dias',
  last_sent_at timestamptz,
  last_sent_order_id uuid references public.orders(id) on delete set null,
  blocked_reason text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists marketing_repurchase_state_v1_due_idx
  on public.marketing_repurchase_state_v1(due_at)
  where status in ('scheduled','ready');

create table if not exists public.marketing_optout_events_v1 (
  capture_id uuid primary key references public.papoai_webhook_inbox_v2(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  phone_e164 text,
  source text not null default 'papoai_inbound',
  reason_code text not null default 'customer_optout',
  occurred_at timestamptz not null default now()
);

create or replace function public.marketing_repurchase_recalc_v1(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer record;
  v_order record;
  v_existing public.marketing_repurchase_state_v1%rowtype;
  v_due timestamptz;
  v_status text;
  v_reason text;
begin
  if p_customer_id is null then
    return jsonb_build_object('ok',false,'error','customer_required');
  end if;

  select id, primary_whatsapp_e164, coalesce(marketing_opt_in,false) as marketing_opt_in
    into v_customer
  from public.customers
  where id = p_customer_id;

  if not found then
    return jsonb_build_object('ok',false,'error','customer_not_found');
  end if;

  select * into v_existing
  from public.marketing_repurchase_state_v1
  where customer_id = p_customer_id;

  select o.id,o.order_number,o.confirmed_at
    into v_order
  from public.orders o
  where o.customer_id = p_customer_id
    and o.confirmed_at is not null
    and coalesce(o.status,'') <> 'cancelled'
    and o.cancelled_at is null
  order by o.confirmed_at desc, o.updated_at desc, o.id desc
  limit 1;

  if not found then
    v_status := 'no_purchase';
    v_reason := 'no_confirmed_purchase';
    v_due := null;
  elsif coalesce(v_customer.marketing_opt_in,false) is not true then
    v_status := 'blocked_opt_out';
    v_reason := 'marketing_opt_out';
    v_due := v_order.confirmed_at + interval '10 days';
  elsif nullif(btrim(coalesce(v_customer.primary_whatsapp_e164,'')),'') is null then
    v_status := 'not_eligible';
    v_reason := 'phone_missing';
    v_due := v_order.confirmed_at + interval '10 days';
  elsif v_existing.last_sent_order_id is not null and v_existing.last_sent_order_id = v_order.id then
    v_status := 'sent';
    v_reason := null;
    v_due := v_order.confirmed_at + interval '10 days';
  else
    v_due := v_order.confirmed_at + interval '10 days';
    v_status := case when v_due <= now() then 'ready' else 'scheduled' end;
    v_reason := null;
  end if;

  insert into public.marketing_repurchase_state_v1(
    customer_id,last_purchase_order_id,last_purchase_order_number,last_purchase_at,due_at,status,
    marketing_opt_in,phone_e164,send_channel_e164,template_name,last_sent_at,last_sent_order_id,
    blocked_reason,metadata,updated_at
  ) values (
    p_customer_id,
    case when v_order.id is null then null else v_order.id end,
    case when v_order.order_number is null then null else v_order.order_number end,
    case when v_order.confirmed_at is null then null else v_order.confirmed_at end,
    v_due,v_status,coalesce(v_customer.marketing_opt_in,false),v_customer.primary_whatsapp_e164,
    '+5565998150975','recompradonaantonia10dias',v_existing.last_sent_at,v_existing.last_sent_order_id,
    v_reason,
    jsonb_build_object('purchase_source','canonical_orders','purchase_channels',jsonb_build_array('0975','1018'),'delay_days',10),
    now()
  )
  on conflict (customer_id) do update set
    last_purchase_order_id=excluded.last_purchase_order_id,
    last_purchase_order_number=excluded.last_purchase_order_number,
    last_purchase_at=excluded.last_purchase_at,
    due_at=excluded.due_at,
    status=excluded.status,
    marketing_opt_in=excluded.marketing_opt_in,
    phone_e164=excluded.phone_e164,
    send_channel_e164=excluded.send_channel_e164,
    template_name=excluded.template_name,
    blocked_reason=excluded.blocked_reason,
    metadata=excluded.metadata,
    updated_at=now();

  return jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id,
    'status',v_status,
    'last_purchase_order_id',case when v_order.id is null then null else v_order.id end,
    'last_purchase_at',case when v_order.confirmed_at is null then null else v_order.confirmed_at end,
    'due_at',v_due,
    'send_channel_e164','+5565998150975',
    'template_name','recompradonaantonia10dias'
  );
end
$$;

create or replace function public.marketing_repurchase_order_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.customer_id is not null and new.confirmed_at is not null then
      perform public.marketing_repurchase_recalc_v1(new.customer_id);
    end if;
    return new;
  end if;

  if old.customer_id is distinct from new.customer_id then
    if old.customer_id is not null then perform public.marketing_repurchase_recalc_v1(old.customer_id); end if;
    if new.customer_id is not null then perform public.marketing_repurchase_recalc_v1(new.customer_id); end if;
  elsif new.customer_id is not null and (
    old.confirmed_at is distinct from new.confirmed_at or
    old.cancelled_at is distinct from new.cancelled_at or
    old.status is distinct from new.status
  ) then
    perform public.marketing_repurchase_recalc_v1(new.customer_id);
  end if;
  return new;
end
$$;

drop trigger if exists trg_marketing_repurchase_order_v1 on public.orders;
create trigger trg_marketing_repurchase_order_v1
after insert or update of customer_id,confirmed_at,cancelled_at,status on public.orders
for each row execute function public.marketing_repurchase_order_trigger_v1();

create or replace function public.marketing_repurchase_customer_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.marketing_opt_in is distinct from new.marketing_opt_in
     or old.primary_whatsapp_e164 is distinct from new.primary_whatsapp_e164 then
    perform public.marketing_repurchase_recalc_v1(new.id);
  end if;
  return new;
end
$$;

drop trigger if exists trg_marketing_repurchase_customer_v1 on public.customers;
create trigger trg_marketing_repurchase_customer_v1
after update of marketing_opt_in,primary_whatsapp_e164 on public.customers
for each row execute function public.marketing_repurchase_customer_trigger_v1();

create or replace function public.marketing_capture_optout_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text;
  v_norm text;
  v_customer_id uuid;
  v_is_optout boolean := false;
begin
  if new.event_name is distinct from 'message.received' or new.status is distinct from 'normalized' then
    return new;
  end if;

  if exists(select 1 from public.marketing_optout_events_v1 where capture_id=new.id) then
    return new;
  end if;

  v_text := coalesce(new.payload#>>'{data,message,content}',new.payload#>>'{data,message,text}',new.payload#>>'{data,message,body}','');
  v_norm := lower(translate(v_text,'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn'));
  v_norm := regexp_replace(v_norm,'[^a-z0-9 ]+',' ','g');
  v_norm := regexp_replace(v_norm,'\s+',' ','g');
  v_norm := btrim(v_norm);

  v_is_optout :=
    v_norm = 'sair'
    or (v_norm ~ '(nao quero|nao me envie|nao envie|nao mandar|pare de|parar|cancelar|remover)' and v_norm ~ '(promoc|oferta|marketing)')
    or v_norm ~ 'nao quero mais mensagens promocionais'
    or v_norm ~ 'pare de mandar ofertas';

  if not v_is_optout then return new; end if;

  select l.customer_id into v_customer_id
  from public.lookup_customer_by_phone(new.phone_candidate) l
  limit 1;

  insert into public.marketing_optout_events_v1(capture_id,customer_id,phone_e164,source,reason_code,occurred_at)
  values(new.id,v_customer_id,new.phone_candidate,'papoai_inbound','customer_optout',coalesce(new.received_at,now()))
  on conflict (capture_id) do nothing;

  if v_customer_id is not null then
    update public.customers
      set marketing_opt_in=false,
          marketing_consent_updated_at=now()
    where id=v_customer_id
      and coalesce(marketing_opt_in,false) is true;

    perform public.marketing_repurchase_recalc_v1(v_customer_id);
  end if;

  return new;
end
$$;

drop trigger if exists trg_marketing_capture_optout_v1 on public.papoai_webhook_inbox_v2;
create trigger trg_marketing_capture_optout_v1
after insert or update of status,event_name,phone_candidate,payload on public.papoai_webhook_inbox_v2
for each row execute function public.marketing_capture_optout_v1();

create or replace function public.marketing_repurchase_mark_sent_v1(p_customer_id uuid,p_order_id uuid,p_sent_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.marketing_repurchase_state_v1%rowtype;
begin
  select * into v_state from public.marketing_repurchase_state_v1 where customer_id=p_customer_id for update;
  if not found then return jsonb_build_object('ok',false,'error','state_not_found'); end if;
  if v_state.last_purchase_order_id is distinct from p_order_id then return jsonb_build_object('ok',false,'error','stale_order'); end if;
  if v_state.marketing_opt_in is not true then return jsonb_build_object('ok',false,'error','opted_out'); end if;
  update public.marketing_repurchase_state_v1
    set status='sent',last_sent_at=coalesce(p_sent_at,now()),last_sent_order_id=p_order_id,blocked_reason=null,updated_at=now()
  where customer_id=p_customer_id;
  return jsonb_build_object('ok',true,'customer_id',p_customer_id,'order_id',p_order_id,'sent_at',coalesce(p_sent_at,now()));
end
$$;

create or replace view public.marketing_repurchase_ready_v1 as
select s.*
from public.marketing_repurchase_state_v1 s
join public.customers c on c.id=s.customer_id
where s.last_purchase_order_id is not null
  and s.due_at is not null
  and s.due_at <= now()
  and s.status in ('scheduled','ready')
  and s.marketing_opt_in is true
  and coalesce(c.marketing_opt_in,false) is true
  and s.phone_e164 is not null
  and s.last_sent_order_id is distinct from s.last_purchase_order_id;

select public.marketing_repurchase_recalc_v1(x.customer_id)
from (
  select distinct customer_id
  from public.orders
  where customer_id is not null and confirmed_at is not null
) x;
