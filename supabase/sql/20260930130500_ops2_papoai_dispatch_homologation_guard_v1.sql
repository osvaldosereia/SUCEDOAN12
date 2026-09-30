-- Dona Antonia Operations 2.0
-- PapoAI Phase 1.5: fail-closed dispatch guard and homologation allowlist.
-- No outbound HTTP/send is implemented by this migration.

alter table public.ops2_papoai_outbound_runtime_v1
  add column if not exists dispatch_mode text not null default 'disabled';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.ops2_papoai_outbound_runtime_v1'::regclass
      and conname='ops2_papoai_outbound_runtime_dispatch_mode_check'
  ) then
    alter table public.ops2_papoai_outbound_runtime_v1
      add constraint ops2_papoai_outbound_runtime_dispatch_mode_check
      check (dispatch_mode in ('disabled','homologation','production'));
  end if;
end
$$;

update public.ops2_papoai_outbound_runtime_v1
set dispatch_mode='disabled', updated_at=now()
where id=1 and dispatch_mode is distinct from 'disabled';

create table if not exists public.ops2_papoai_channel_bindings_v1 (
  whatsapp_account_id uuid primary key references public.whatsapp_accounts(id) on delete cascade,
  papoai_agentbot_id text not null unique,
  expected_phone_e164 text not null,
  source text not null default 'observed',
  is_active boolean not null default true,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

insert into public.ops2_papoai_channel_bindings_v1(
  whatsapp_account_id,papoai_agentbot_id,expected_phone_e164,source,is_active,metadata
)
select w.id,'2796',w.phone_e164,'observed',true,jsonb_build_object('slug',w.slug)
from public.whatsapp_accounts w
where w.slug='dona-antonia-0975'
on conflict (whatsapp_account_id) do update
set papoai_agentbot_id=excluded.papoai_agentbot_id,
    expected_phone_e164=excluded.expected_phone_e164,
    source=excluded.source,
    is_active=true,
    observed_at=now(),
    metadata=excluded.metadata;

insert into public.ops2_papoai_channel_bindings_v1(
  whatsapp_account_id,papoai_agentbot_id,expected_phone_e164,source,is_active,metadata
)
select w.id,'2501',w.phone_e164,'observed',true,jsonb_build_object('slug',w.slug)
from public.whatsapp_accounts w
where w.slug='dona-antonia-1018'
on conflict (whatsapp_account_id) do update
set papoai_agentbot_id=excluded.papoai_agentbot_id,
    expected_phone_e164=excluded.expected_phone_e164,
    source=excluded.source,
    is_active=true,
    observed_at=now(),
    metadata=excluded.metadata;

alter table public.ops2_papoai_channel_bindings_v1 enable row level security;
drop policy if exists ops2_papoai_channel_bindings_service_only_v1 on public.ops2_papoai_channel_bindings_v1;
create policy ops2_papoai_channel_bindings_service_only_v1
  on public.ops2_papoai_channel_bindings_v1
  for all to service_role using (true) with check (true);
revoke all on table public.ops2_papoai_channel_bindings_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.ops2_papoai_channel_bindings_v1 to service_role;

create table if not exists public.ops2_papoai_homologation_targets_v1 (
  target_phone_e164 text primary key,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint ops2_papoai_homologation_target_phone_check
    check (target_phone_e164 ~ '^\+55[0-9]{10,11}$')
);

alter table public.ops2_papoai_homologation_targets_v1 enable row level security;
drop policy if exists ops2_papoai_homologation_targets_service_only_v1 on public.ops2_papoai_homologation_targets_v1;
create policy ops2_papoai_homologation_targets_service_only_v1
  on public.ops2_papoai_homologation_targets_v1
  for all to service_role using (true) with check (true);
revoke all on table public.ops2_papoai_homologation_targets_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.ops2_papoai_homologation_targets_v1 to service_role;

create or replace function public.ops2_papoai_dispatch_guard_v1(p_intent_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_intent public.ops2_papoai_outbound_intents_v1%rowtype;
  v_runtime public.ops2_papoai_outbound_runtime_v1%rowtype;
  v_journey public.ops2_customer_registration_journeys_v1%rowtype;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_route jsonb;
  v_route_account uuid;
  v_route_conversation uuid;
  v_route_agentbot text;
  v_route_channel text;
  v_route_session text;
  v_route_contact text;
  v_binding public.ops2_papoai_channel_bindings_v1%rowtype;
  v_target_phone text;
begin
  select i.* into v_intent
  from public.ops2_papoai_outbound_intents_v1 i
  where i.id=p_intent_id;
  if not found then
    return jsonb_build_object('ok',false,'allowed',false,'reason','intent_not_found','intent_id',p_intent_id);
  end if;

  if v_intent.purpose<>'registration_flow' then
    return jsonb_build_object('ok',true,'allowed',false,'reason','unsupported_purpose','intent_id',p_intent_id);
  end if;

  if v_intent.status in ('sent','cancelled') then
    return jsonb_build_object('ok',true,'allowed',false,'reason','intent_terminal','intent_id',p_intent_id,'status',v_intent.status);
  end if;

  select r.* into v_runtime from public.ops2_papoai_outbound_runtime_v1 r where r.id=1;
  if not found then
    return jsonb_build_object('ok',false,'allowed',false,'reason','runtime_missing','intent_id',p_intent_id);
  end if;

  if coalesce(v_runtime.transport_verified,false)=false then
    return jsonb_build_object('ok',true,'allowed',false,'reason','transport_unverified','intent_id',p_intent_id,'dispatch_mode',v_runtime.dispatch_mode);
  end if;

  if coalesce(v_runtime.dispatch_enabled,false)=false then
    return jsonb_build_object('ok',true,'allowed',false,'reason','dispatch_disabled','intent_id',p_intent_id,'dispatch_mode',v_runtime.dispatch_mode);
  end if;

  if v_runtime.dispatch_mode='disabled' then
    return jsonb_build_object('ok',true,'allowed',false,'reason','dispatch_mode_disabled','intent_id',p_intent_id);
  end if;

  select j.* into v_journey
  from public.ops2_customer_registration_journeys_v1 j
  where j.order_id=v_intent.order_id;
  if not found or v_journey.registration_state<>'pending' or v_journey.workflow_open=false then
    return jsonb_build_object('ok',true,'allowed',false,'reason','registration_not_pending','intent_id',p_intent_id);
  end if;

  if v_journey.transition_seq<>v_intent.transition_seq then
    return jsonb_build_object('ok',true,'allowed',false,'reason','stale_transition','intent_id',p_intent_id,'current_transition_seq',v_journey.transition_seq,'intent_transition_seq',v_intent.transition_seq);
  end if;

  v_route:=public.ops2_papoai_route_context_v1(v_intent.order_id);
  if coalesce((v_route->>'route_available')::boolean,false)=false then
    return jsonb_build_object('ok',true,'allowed',false,'reason',coalesce(v_route->>'reason','route_unavailable'),'intent_id',p_intent_id);
  end if;

  v_route_account:=nullif(v_route->>'whatsapp_account_id','')::uuid;
  v_route_conversation:=nullif(v_route->>'conversation_id','')::uuid;
  v_route_agentbot:=nullif(v_route->>'papoai_agentbot_id','');
  v_route_channel:=nullif(v_route->>'channel_phone_e164','');
  v_route_session:=nullif(v_route->>'papoai_session_uid','');
  v_route_contact:=nullif(v_route->>'papoai_contact_id','');

  select b.* into v_binding
  from public.ops2_papoai_channel_bindings_v1 b
  where b.whatsapp_account_id=v_route_account
    and b.is_active=true;
  if not found then
    return jsonb_build_object('ok',true,'allowed',false,'reason','channel_binding_missing','intent_id',p_intent_id);
  end if;

  if v_binding.papoai_agentbot_id is distinct from v_route_agentbot then
    return jsonb_build_object('ok',true,'allowed',false,'reason','agentbot_binding_mismatch','intent_id',p_intent_id);
  end if;

  if v_binding.expected_phone_e164 is distinct from v_route_channel then
    return jsonb_build_object('ok',true,'allowed',false,'reason','channel_phone_mismatch','intent_id',p_intent_id);
  end if;

  select o.* into v_order from public.orders o where o.id=v_intent.order_id;
  select c.* into v_customer from public.customers c where c.id=v_order.customer_id;
  v_target_phone:=public.canonical_whatsapp_e164_br_v2(coalesce(nullif(v_order.phone_e164,''),nullif(v_customer.primary_whatsapp_e164,'')));
  if v_target_phone is null then
    return jsonb_build_object('ok',true,'allowed',false,'reason','target_phone_missing','intent_id',p_intent_id);
  end if;

  if v_runtime.dispatch_mode='homologation' and not exists (
    select 1 from public.ops2_papoai_homologation_targets_v1 h
    where h.target_phone_e164=v_target_phone and h.is_active=true
  ) then
    return jsonb_build_object('ok',true,'allowed',false,'reason','target_not_allowlisted','intent_id',p_intent_id,'target_phone_e164',v_target_phone);
  end if;

  if v_runtime.dispatch_mode not in ('homologation','production') then
    return jsonb_build_object('ok',true,'allowed',false,'reason','invalid_dispatch_mode','intent_id',p_intent_id);
  end if;

  return jsonb_build_object(
    'ok',true,
    'allowed',true,
    'reason','guard_passed',
    'intent_id',p_intent_id,
    'order_id',v_intent.order_id,
    'dispatch_mode',v_runtime.dispatch_mode,
    'target_phone_e164',v_target_phone,
    'conversation_id',v_route_conversation,
    'whatsapp_account_id',v_route_account,
    'channel_phone_e164',v_route_channel,
    'papoai_session_uid',v_route_session,
    'papoai_contact_id',v_route_contact,
    'papoai_agentbot_id',v_route_agentbot,
    'transition_seq',v_journey.transition_seq
  );
end;
$$;

revoke all on function public.ops2_papoai_dispatch_guard_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_papoai_dispatch_guard_v1(uuid) to service_role;
