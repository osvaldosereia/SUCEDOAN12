begin;

create table if not exists public.channel_provider_capability_evidence (
  id uuid primary key default gen_random_uuid(),
  adapter_id uuid not null references public.channel_provider_adapters(id) on delete cascade,
  capability_key text not null,
  state text not null default 'unknown' check(state in ('unknown','observed_ui','observed_payload','verified_lab','verified_production','unsupported','manual_setup_required')),
  evidence_source text,
  evidence jsonb not null default '{}'::jsonb,
  observed_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(adapter_id,capability_key)
);

create table if not exists public.channel_provider_agent_labs (
  adapter_id uuid primary key references public.channel_provider_adapters(id) on delete cascade,
  enabled boolean not null default false,
  fixed_response_text text not null default 'Teste Dona Antônia concluído. Recebi sua mensagem corretamente.',
  burst_window_seconds smallint not null default 20 check(burst_window_seconds between 0 and 60),
  response_timeout_seconds smallint not null default 20 check(response_timeout_seconds between 1 and 55),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channel_provider_agent_lab_sessions (
  id uuid primary key default gen_random_uuid(),
  adapter_id uuid not null references public.channel_provider_adapters(id) on delete cascade,
  provider_session_key text not null,
  phone_e164 text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'active' check(status in ('active','paused','closed')),
  paused_until timestamptz,
  message_count integer not null default 0 check(message_count>=0),
  last_correlation_id uuid,
  last_external_message_id text,
  last_external_event_id text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(adapter_id,provider_session_key)
);

create table if not exists public.channel_provider_agent_lab_calls (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null unique,
  adapter_id uuid not null references public.channel_provider_adapters(id) on delete cascade,
  lab_session_id uuid references public.channel_provider_agent_lab_sessions(id) on delete set null,
  provider_event_key text not null,
  external_message_id text,
  external_event_id text,
  request_hash text,
  processing_status text not null default 'received' check(processing_status in ('received','duplicate','normalized','responded','handoff','silent','protocol_error','internal_error')),
  response_kind text check(response_kind is null or response_kind in ('text','handoff','silent','protocol_error','internal_error')),
  http_status smallint check(http_status is null or (http_status between 100 and 599)),
  duration_ms integer check(duration_ms is null or duration_ms>=0),
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  response_body jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(adapter_id,provider_event_key)
);

create index if not exists channel_provider_agent_lab_calls_adapter_created_idx
  on public.channel_provider_agent_lab_calls(adapter_id,created_at desc);
create index if not exists channel_provider_agent_lab_sessions_phone_idx
  on public.channel_provider_agent_lab_sessions(phone_e164,last_seen_at desc);

alter table public.channel_provider_capability_evidence enable row level security;
alter table public.channel_provider_agent_labs enable row level security;
alter table public.channel_provider_agent_lab_sessions enable row level security;
alter table public.channel_provider_agent_lab_calls enable row level security;

revoke all on table public.channel_provider_capability_evidence from public,anon,authenticated;
revoke all on table public.channel_provider_agent_labs from public,anon,authenticated;
revoke all on table public.channel_provider_agent_lab_sessions from public,anon,authenticated;
revoke all on table public.channel_provider_agent_lab_calls from public,anon,authenticated;
grant all on table public.channel_provider_capability_evidence to service_role;
grant all on table public.channel_provider_agent_labs to service_role;
grant all on table public.channel_provider_agent_lab_sessions to service_role;
grant all on table public.channel_provider_agent_lab_calls to service_role;

with papo as (
  select id from public.channel_provider_adapters where provider_key='papoai' and channel='whatsapp'
), caps(capability_key,state,evidence_source,evidence) as (
  values
    ('agent_external.request','observed_ui','owner_ui_screenshot','{"source":"papoai_agent_creation_ui"}'::jsonb),
    ('agent_external.text_reply','unknown',null,'{}'::jsonb),
    ('agent_external.session','unknown',null,'{}'::jsonb),
    ('agent_external.handoff','unknown',null,'{}'::jsonb),
    ('agent_external.silent','unknown',null,'{}'::jsonb),
    ('agent_external.media_reply','unknown',null,'{}'::jsonb),
    ('agent_external.button_reply','unknown',null,'{}'::jsonb),
    ('agent_external.list_reply','unknown',null,'{}'::jsonb),
    ('agent_external.flow_reply','unknown',null,'{}'::jsonb),
    ('contact.custom_field_write','unknown',null,'{}'::jsonb),
    ('tag.assign','unknown',null,'{}'::jsonb),
    ('tag.remove','unknown',null,'{}'::jsonb),
    ('funnel.move','unknown',null,'{}'::jsonb),
    ('campaign.create','unknown',null,'{}'::jsonb),
    ('campaign.send','unknown',null,'{}'::jsonb),
    ('automation.create','unknown',null,'{}'::jsonb)
)
insert into public.channel_provider_capability_evidence(adapter_id,capability_key,state,evidence_source,evidence,observed_at)
select p.id,c.capability_key,c.state,c.evidence_source,c.evidence,
       case when c.state like 'observed_%' then now() else null end
from papo p cross join caps c
on conflict(adapter_id,capability_key) do nothing;

insert into public.channel_provider_agent_labs(adapter_id,enabled)
select id,false from public.channel_provider_adapters where provider_key='papoai' and channel='whatsapp'
on conflict(adapter_id) do nothing;

do $$
begin
  if not exists (
    select 1 from vault.secrets
    where name='dona_antonia_papoai_agent_external_lab_key_v1'
  ) then
    perform vault.create_secret(
      replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      'dona_antonia_papoai_agent_external_lab_key_v1',
      'Shared secret for PapoAI Agent External laboratory webhook'
    );
  end if;
end $$;

create or replace function public.get_papoai_agent_external_lab_key_v1()
returns text
language sql
stable
security definer
set search_path=public,vault,pg_temp
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='dona_antonia_papoai_agent_external_lab_key_v1'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_papoai_agent_external_lab_key_v1() from public,anon,authenticated;
grant execute on function public.get_papoai_agent_external_lab_key_v1() to service_role;

create or replace function public.get_papoai_agent_external_lab_config_v1(p_adapter_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'adapter_id',l.adapter_id,
    'enabled',l.enabled,
    'fixed_response_text',l.fixed_response_text,
    'burst_window_seconds',l.burst_window_seconds,
    'response_timeout_seconds',l.response_timeout_seconds,
    'metadata',l.metadata
  )
  from public.channel_provider_agent_labs l
  where l.adapter_id=p_adapter_id;
$$;

revoke all on function public.get_papoai_agent_external_lab_config_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_agent_external_lab_config_v1(uuid) to service_role;

create or replace function public.set_papoai_agent_external_lab_enabled_v1(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_count integer;
begin
  update public.channel_provider_agent_labs l
     set enabled=coalesce(p_enabled,false),updated_at=now()
   where exists (
     select 1 from public.channel_provider_adapters a
     where a.id=l.adapter_id and a.provider_key='papoai' and a.channel='whatsapp'
   );
  get diagnostics v_count=row_count;
  return jsonb_build_object('ok',true,'enabled',coalesce(p_enabled,false),'updated',v_count);
end;
$$;

revoke all on function public.set_papoai_agent_external_lab_enabled_v1(boolean) from public,anon,authenticated;
grant execute on function public.set_papoai_agent_external_lab_enabled_v1(boolean) to service_role;

create or replace function public.set_channel_provider_capability_state_v1(
  p_adapter_id uuid,
  p_capability_key text,
  p_state text,
  p_evidence_source text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_current text;
  v_now timestamptz:=now();
begin
  if p_state not in ('unknown','observed_ui','observed_payload','verified_lab','verified_production','unsupported','manual_setup_required') then
    raise exception 'invalid_capability_state';
  end if;
  select state into v_current
  from public.channel_provider_capability_evidence
  where adapter_id=p_adapter_id and capability_key=p_capability_key
  for update;

  if v_current is null then
    raise exception 'capability_not_registered';
  end if;
  if p_state='verified_production' and v_current<>'verified_lab' then
    raise exception 'capability_transition_not_allowed';
  end if;

  update public.channel_provider_capability_evidence
     set state=p_state,
         evidence_source=coalesce(nullif(p_evidence_source,''),evidence_source),
         evidence=coalesce(evidence,'{}'::jsonb)||coalesce(p_evidence,'{}'::jsonb),
         observed_at=case when p_state like 'observed_%' and observed_at is null then v_now else observed_at end,
         verified_at=case when p_state in ('verified_lab','verified_production') then v_now else verified_at end,
         updated_at=v_now
   where adapter_id=p_adapter_id and capability_key=p_capability_key;

  return jsonb_build_object('ok',true,'capability_key',p_capability_key,'previous_state',v_current,'state',p_state,'updated_at',v_now);
end;
$$;

revoke all on function public.set_channel_provider_capability_state_v1(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.set_channel_provider_capability_state_v1(uuid,text,text,text,jsonb) to service_role;

commit;
