-- Dona Antonia Operations 2.0
-- PapoAI Phase 1.5: transport-neutral outbound intents.
-- IMPORTANT: no outbound HTTP/send is implemented here.

create table if not exists public.ops2_papoai_outbound_runtime_v1 (
  id smallint primary key default 1 check (id=1),
  dispatch_enabled boolean not null default false,
  transport_verified boolean not null default false,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

insert into public.ops2_papoai_outbound_runtime_v1(id,dispatch_enabled,transport_verified,metadata)
values (1,false,false,jsonb_build_object('reason','papoai_transport_contract_unverified'))
on conflict (id) do nothing;

alter table public.ops2_papoai_outbound_runtime_v1 enable row level security;
drop policy if exists ops2_papoai_outbound_runtime_service_only_v1 on public.ops2_papoai_outbound_runtime_v1;
create policy ops2_papoai_outbound_runtime_service_only_v1
  on public.ops2_papoai_outbound_runtime_v1
  for all to service_role
  using (true) with check (true);
revoke all on table public.ops2_papoai_outbound_runtime_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.ops2_papoai_outbound_runtime_v1 to service_role;

create table if not exists public.ops2_papoai_outbound_intents_v1 (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  purpose text not null check (purpose in ('registration_flow')),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  whatsapp_account_id uuid references public.whatsapp_accounts(id) on delete set null,
  channel_phone_e164 text,
  papoai_session_uid text,
  papoai_contact_id text,
  papoai_agentbot_id text,
  transition_seq integer not null check (transition_seq>0),
  status text not null check (status in ('waiting_route','blocked_transport','cancelled','sent','failed')),
  reason text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  cancelled_at timestamptz,
  sent_at timestamptz,
  last_error text
);

create unique index if not exists ops2_papoai_outbound_intents_idempotency_uidx
  on public.ops2_papoai_outbound_intents_v1(idempotency_key);
create index if not exists ops2_papoai_outbound_intents_status_idx
  on public.ops2_papoai_outbound_intents_v1(status,created_at);
create index if not exists ops2_papoai_outbound_intents_order_idx
  on public.ops2_papoai_outbound_intents_v1(order_id,created_at desc);

alter table public.ops2_papoai_outbound_intents_v1 enable row level security;
drop policy if exists ops2_papoai_outbound_intents_service_only_v1 on public.ops2_papoai_outbound_intents_v1;
create policy ops2_papoai_outbound_intents_service_only_v1
  on public.ops2_papoai_outbound_intents_v1
  for all to service_role
  using (true) with check (true);
revoke all on table public.ops2_papoai_outbound_intents_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.ops2_papoai_outbound_intents_v1 to service_role;

create or replace function public.ops2_papoai_route_context_v1(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_inbox public.papoai_webhook_inbox_v2%rowtype;
  v_phone text;
  v_account_id uuid;
  v_conversation_id uuid;
  v_session_uid text;
  v_contact_id text;
  v_agentbot_id text;
  v_channel_phone text;
begin
  select o.* into v_order from public.orders o where o.id=p_order_id;
  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found','order_id',p_order_id);
  end if;

  if v_order.customer_id is null then
    return jsonb_build_object('ok',false,'error','customer_missing','order_id',p_order_id);
  end if;

  select c.* into v_customer from public.customers c where c.id=v_order.customer_id;
  v_phone:=coalesce(nullif(v_order.phone_e164,''),nullif(v_customer.primary_whatsapp_e164,''));

  if v_order.conversation_id is not null then
    select i.* into v_inbox
    from public.papoai_webhook_inbox_v2 i
    where nullif(i.metadata->>'conversation_id','')=v_order.conversation_id::text
    order by i.received_at desc
    limit 1;
  end if;

  if v_inbox.id is null then
    select i.* into v_inbox
    from public.papoai_webhook_inbox_v2 i
    where nullif(i.metadata->>'customer_id','')=v_order.customer_id::text
      and i.received_at>=greatest(v_order.created_at-interval '2 hours',now()-interval '31 days')
    order by i.received_at desc
    limit 1;
  end if;

  if v_inbox.id is null then
    return jsonb_build_object(
      'ok',true,'route_available',false,'order_id',p_order_id,'customer_id',v_order.customer_id,
      'reason','no_linked_papoai_session'
    );
  end if;

  v_session_uid:=coalesce(nullif(v_inbox.payload#>>'{data,session,uid}',''),nullif(v_inbox.conversation_ref,''));
  v_contact_id:=coalesce(nullif(v_inbox.payload#>>'{data,session,contact_id}',''),nullif(v_inbox.payload#>>'{data,contact,id}',''));
  v_agentbot_id:=nullif(v_inbox.payload#>>'{data,session,agentbot_id}','');
  v_channel_phone:=nullif(v_inbox.metadata->>'business_phone_e164','');
  v_conversation_id:=nullif(v_inbox.metadata->>'conversation_id','')::uuid;
  v_account_id:=nullif(v_inbox.metadata->>'whatsapp_account_id','')::uuid;

  if v_session_uid is null or v_contact_id is null or v_agentbot_id is null or v_account_id is null or v_conversation_id is null then
    return jsonb_build_object(
      'ok',true,'route_available',false,'order_id',p_order_id,'customer_id',v_order.customer_id,
      'reason','linked_session_missing_identifiers',
      'conversation_id',v_conversation_id,'whatsapp_account_id',v_account_id,
      'channel_phone_e164',v_channel_phone,'papoai_session_uid',v_session_uid,
      'papoai_contact_id',v_contact_id,'papoai_agentbot_id',v_agentbot_id
    );
  end if;

  return jsonb_build_object(
    'ok',true,'route_available',true,'order_id',p_order_id,'customer_id',v_order.customer_id,
    'conversation_id',v_conversation_id,'whatsapp_account_id',v_account_id,
    'channel_phone_e164',v_channel_phone,'papoai_session_uid',v_session_uid,
    'papoai_contact_id',v_contact_id,'papoai_agentbot_id',v_agentbot_id,
    'source_event_received_at',v_inbox.received_at,
    'source_external_message_id',v_inbox.external_message_id
  );
end;
$$;
revoke all on function public.ops2_papoai_route_context_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_papoai_route_context_v1(uuid) to service_role;

create or replace function public.ops2_plan_registration_flow_intent_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_journey public.ops2_customer_registration_journeys_v1%rowtype;
  v_route jsonb;
  v_status text;
  v_reason text;
  v_key text;
  v_intent public.ops2_papoai_outbound_intents_v1%rowtype;
  v_dispatch boolean;
  v_verified boolean;
begin
  select j.* into v_journey
  from public.ops2_customer_registration_journeys_v1 j
  where j.order_id=p_order_id;

  if not found then
    return jsonb_build_object('ok',false,'error','registration_journey_missing','order_id',p_order_id);
  end if;

  if v_journey.registration_state<>'pending' or v_journey.workflow_open=false then
    update public.ops2_papoai_outbound_intents_v1
    set status='cancelled',reason='registration_not_pending',cancelled_at=coalesce(cancelled_at,now()),updated_at=now()
    where order_id=p_order_id and purpose='registration_flow' and status in ('waiting_route','blocked_transport');
    return jsonb_build_object('ok',true,'planned',false,'cancelled',true,'order_id',p_order_id);
  end if;

  v_route:=public.ops2_papoai_route_context_v1(p_order_id);
  select r.dispatch_enabled,r.transport_verified into v_dispatch,v_verified
  from public.ops2_papoai_outbound_runtime_v1 r where r.id=1;

  if coalesce((v_route->>'route_available')::boolean,false)=false then
    v_status:='waiting_route';
    v_reason:=coalesce(v_route->>'reason','route_unavailable');
  else
    v_status:='blocked_transport';
    v_reason:=case
      when coalesce(v_verified,false)=false then 'transport_unverified'
      when coalesce(v_dispatch,false)=false then 'dispatch_disabled'
      else 'dispatcher_not_implemented'
    end;
  end if;

  v_key:=format('registration_flow:%s:%s',p_order_id,v_journey.transition_seq);

  insert into public.ops2_papoai_outbound_intents_v1(
    purpose,order_id,customer_id,conversation_id,whatsapp_account_id,channel_phone_e164,
    papoai_session_uid,papoai_contact_id,papoai_agentbot_id,transition_seq,status,reason,idempotency_key,payload
  ) values (
    'registration_flow',p_order_id,v_journey.customer_id,
    nullif(v_route->>'conversation_id','')::uuid,
    nullif(v_route->>'whatsapp_account_id','')::uuid,
    nullif(v_route->>'channel_phone_e164',''),
    nullif(v_route->>'papoai_session_uid',''),
    nullif(v_route->>'papoai_contact_id',''),
    nullif(v_route->>'papoai_agentbot_id',''),
    v_journey.transition_seq,v_status,v_reason,v_key,
    jsonb_build_object('route_available',coalesce((v_route->>'route_available')::boolean,false),'planned_at',now())
  )
  on conflict (idempotency_key) do update
  set conversation_id=coalesce(excluded.conversation_id,public.ops2_papoai_outbound_intents_v1.conversation_id),
      whatsapp_account_id=coalesce(excluded.whatsapp_account_id,public.ops2_papoai_outbound_intents_v1.whatsapp_account_id),
      channel_phone_e164=coalesce(excluded.channel_phone_e164,public.ops2_papoai_outbound_intents_v1.channel_phone_e164),
      papoai_session_uid=coalesce(excluded.papoai_session_uid,public.ops2_papoai_outbound_intents_v1.papoai_session_uid),
      papoai_contact_id=coalesce(excluded.papoai_contact_id,public.ops2_papoai_outbound_intents_v1.papoai_contact_id),
      papoai_agentbot_id=coalesce(excluded.papoai_agentbot_id,public.ops2_papoai_outbound_intents_v1.papoai_agentbot_id),
      status=case when public.ops2_papoai_outbound_intents_v1.status in ('sent','cancelled') then public.ops2_papoai_outbound_intents_v1.status else excluded.status end,
      reason=case when public.ops2_papoai_outbound_intents_v1.status in ('sent','cancelled') then public.ops2_papoai_outbound_intents_v1.reason else excluded.reason end,
      updated_at=now()
  returning * into v_intent;

  return jsonb_build_object(
    'ok',true,'planned',true,'intent_id',v_intent.id,'status',v_intent.status,'reason',v_intent.reason,
    'order_id',p_order_id,'transition_seq',v_journey.transition_seq,
    'route_available',coalesce((v_route->>'route_available')::boolean,false),
    'channel_phone_e164',v_intent.channel_phone_e164,'papoai_agentbot_id',v_intent.papoai_agentbot_id
  );
end;
$$;
revoke all on function public.ops2_plan_registration_flow_intent_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_plan_registration_flow_intent_v1(uuid) to service_role;

create or replace function public.ops2_registration_journey_outbound_intent_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.ops2_plan_registration_flow_intent_v1(new.order_id);
  return new;
end;
$$;
revoke all on function public.ops2_registration_journey_outbound_intent_trigger_v1() from public,anon,authenticated;

drop trigger if exists trg_ops2_registration_journey_outbound_intent_v1 on public.ops2_customer_registration_journeys_v1;
create trigger trg_ops2_registration_journey_outbound_intent_v1
after insert or update of registration_state,workflow_open,transition_seq on public.ops2_customer_registration_journeys_v1
for each row
execute function public.ops2_registration_journey_outbound_intent_trigger_v1();

do $$
declare
  v_order_id uuid;
begin
  for v_order_id in
    select j.order_id
    from public.ops2_customer_registration_journeys_v1 j
    where j.registration_state='pending' and j.workflow_open=true
  loop
    perform public.ops2_plan_registration_flow_intent_v1(v_order_id);
  end loop;
end;
$$;

create or replace function public.ops2_papoai_outbound_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
select jsonb_build_object(
  'dispatch_enabled',(select dispatch_enabled from public.ops2_papoai_outbound_runtime_v1 where id=1),
  'transport_verified',(select transport_verified from public.ops2_papoai_outbound_runtime_v1 where id=1),
  'total',(select count(*) from public.ops2_papoai_outbound_intents_v1),
  'waiting_route',(select count(*) from public.ops2_papoai_outbound_intents_v1 where status='waiting_route'),
  'blocked_transport',(select count(*) from public.ops2_papoai_outbound_intents_v1 where status='blocked_transport'),
  'cancelled',(select count(*) from public.ops2_papoai_outbound_intents_v1 where status='cancelled'),
  'sent',(select count(*) from public.ops2_papoai_outbound_intents_v1 where status='sent'),
  'failed',(select count(*) from public.ops2_papoai_outbound_intents_v1 where status='failed'),
  'with_route',(select count(*) from public.ops2_papoai_outbound_intents_v1 where papoai_session_uid is not null and papoai_contact_id is not null and papoai_agentbot_id is not null),
  'generated_at',now()
);
$$;
revoke all on function public.ops2_papoai_outbound_summary_v1() from public,anon,authenticated;
grant execute on function public.ops2_papoai_outbound_summary_v1() to service_role;