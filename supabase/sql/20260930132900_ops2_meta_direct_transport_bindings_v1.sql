-- Dona Antonia Operations 2.0
-- Direct Meta WhatsApp transport metadata. No HTTP send is performed here.

create table if not exists public.ops2_meta_whatsapp_senders_v1 (
  whatsapp_account_id uuid primary key references public.whatsapp_accounts(id) on delete cascade,
  meta_phone_number_id text not null,
  source text not null,
  is_verified boolean not null default false,
  is_send_enabled boolean not null default false,
  evidence_at timestamptz,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint ops2_meta_whatsapp_senders_phone_number_id_check check (meta_phone_number_id ~ '^[0-9]{6,32}$')
);

alter table public.ops2_meta_whatsapp_senders_v1 enable row level security;
drop policy if exists ops2_meta_whatsapp_senders_service_only_v1 on public.ops2_meta_whatsapp_senders_v1;
create policy ops2_meta_whatsapp_senders_service_only_v1
  on public.ops2_meta_whatsapp_senders_v1
  for all to service_role using (true) with check (true);
revoke all on table public.ops2_meta_whatsapp_senders_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.ops2_meta_whatsapp_senders_v1 to service_role;

-- 1018 has historical proof of a successful Meta Graph /messages send on 2026-09-11.
-- It is intentionally NOT marked currently verified or enabled until a controlled homologation test.
insert into public.ops2_meta_whatsapp_senders_v1(
  whatsapp_account_id,meta_phone_number_id,source,is_verified,is_send_enabled,evidence_at,metadata
)
select w.id,'1218939807961094','historical_meta_http_200',false,false,'2026-09-11T10:35:08Z'::timestamptz,
       jsonb_build_object('slug',w.slug,'evidence','make_execution_5eb1d2c721324160a70924f36a73d5a3')
from public.whatsapp_accounts w
where w.slug='dona-antonia-1018'
on conflict (whatsapp_account_id) do update
set meta_phone_number_id=excluded.meta_phone_number_id,
    source=excluded.source,
    evidence_at=excluded.evidence_at,
    metadata=excluded.metadata,
    updated_at=now();

create table if not exists public.ops2_meta_whatsapp_flow_bindings_v1 (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  purpose text not null check (purpose in ('registration_flow')),
  meta_flow_id text not null,
  flow_message_version text not null default '3',
  flow_cta text not null default 'Preencher cadastro',
  flow_action text not null default 'data_exchange' check (flow_action in ('data_exchange','navigate')),
  flow_mode text not null default 'published' check (flow_mode in ('draft','published')),
  body_text text not null default 'Para concluir seu cadastro, toque no botão abaixo.',
  is_verified boolean not null default false,
  is_send_enabled boolean not null default false,
  source text not null default 'manual_verification_required',
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (whatsapp_account_id,purpose),
  constraint ops2_meta_whatsapp_flow_bindings_flow_id_check check (meta_flow_id ~ '^[0-9]{6,32}$')
);

alter table public.ops2_meta_whatsapp_flow_bindings_v1 enable row level security;
drop policy if exists ops2_meta_whatsapp_flow_bindings_service_only_v1 on public.ops2_meta_whatsapp_flow_bindings_v1;
create policy ops2_meta_whatsapp_flow_bindings_service_only_v1
  on public.ops2_meta_whatsapp_flow_bindings_v1
  for all to service_role using (true) with check (true);
revoke all on table public.ops2_meta_whatsapp_flow_bindings_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.ops2_meta_whatsapp_flow_bindings_v1 to service_role;

create or replace function public.ops2_meta_dispatch_readiness_v1(p_intent_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_intent public.ops2_papoai_outbound_intents_v1%rowtype;
  v_route jsonb;
  v_guard jsonb;
  v_account_id uuid;
  v_sender public.ops2_meta_whatsapp_senders_v1%rowtype;
  v_flow public.ops2_meta_whatsapp_flow_bindings_v1%rowtype;
  v_route_available boolean:=false;
  v_ready boolean:=false;
begin
  select i.* into v_intent
  from public.ops2_papoai_outbound_intents_v1 i
  where i.id=p_intent_id;
  if not found then
    return jsonb_build_object('ok',false,'error','intent_not_found','ready',false);
  end if;

  v_route:=public.ops2_papoai_route_context_v1(v_intent.order_id);
  v_route_available:=coalesce((v_route->>'route_available')::boolean,false);
  if v_route_available then
    v_account_id:=nullif(v_route->>'whatsapp_account_id','')::uuid;
  end if;

  if v_account_id is not null then
    select s.* into v_sender
    from public.ops2_meta_whatsapp_senders_v1 s
    where s.whatsapp_account_id=v_account_id;

    select f.* into v_flow
    from public.ops2_meta_whatsapp_flow_bindings_v1 f
    where f.whatsapp_account_id=v_account_id
      and f.purpose=v_intent.purpose;
  end if;

  v_guard:=public.ops2_papoai_dispatch_guard_v1(p_intent_id);

  v_ready:=v_route_available
    and v_sender.whatsapp_account_id is not null
    and coalesce(v_sender.is_verified,false)
    and coalesce(v_sender.is_send_enabled,false)
    and v_flow.id is not null
    and coalesce(v_flow.is_verified,false)
    and coalesce(v_flow.is_send_enabled,false)
    and coalesce((v_guard->>'allowed')::boolean,false);

  return jsonb_build_object(
    'ok',true,
    'intent_id',p_intent_id,
    'purpose',v_intent.purpose,
    'ready',v_ready,
    'guard_allowed',coalesce((v_guard->>'allowed')::boolean,false),
    'guard_reason',v_guard->>'reason',
    'route_available',v_route_available,
    'whatsapp_account_id',v_account_id,
    'sender_present',v_sender.whatsapp_account_id is not null,
    'sender_verified',coalesce(v_sender.is_verified,false),
    'sender_send_enabled',coalesce(v_sender.is_send_enabled,false),
    'flow_binding_present',v_flow.id is not null,
    'flow_verified',coalesce(v_flow.is_verified,false),
    'flow_send_enabled',coalesce(v_flow.is_send_enabled,false)
  );
end;
$$;

revoke all on function public.ops2_meta_dispatch_readiness_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_meta_dispatch_readiness_v1(uuid) to service_role;
