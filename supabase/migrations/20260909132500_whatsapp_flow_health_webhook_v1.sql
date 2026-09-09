-- WhatsApp Flow health webhook foundation.
-- Keeps commercial Flow gates untouched/off. The webhook is only for Meta health monitoring.

create table if not exists public.whatsapp_flow_health_events (
  id uuid primary key default gen_random_uuid(),
  event_fingerprint text not null unique,
  event_name text not null,
  flow_id text,
  availability numeric,
  threshold numeric,
  alert_state text,
  signature_verified boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

alter table public.whatsapp_flow_health_events enable row level security;
revoke all on public.whatsapp_flow_health_events from anon, authenticated;
grant select, insert on public.whatsapp_flow_health_events to service_role;

comment on table public.whatsapp_flow_health_events is
  'Normalized, append-only Meta WhatsApp Flow endpoint-health events. No commercial write authority.';

-- Generate an opaque verification token once and keep it in Vault.
do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'dona_antonia_whatsapp_flow_health_verify_token_v1'
  ) then
    perform vault.create_secret(
      replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      'dona_antonia_whatsapp_flow_health_verify_token_v1',
      'Meta webhook verification token for Dona Antonia WhatsApp Flow health monitoring'
    );
  end if;
end $$;

create or replace function public.get_whatsapp_flow_health_verify_token_v1()
returns text
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'dona_antonia_whatsapp_flow_health_verify_token_v1'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_whatsapp_flow_health_verify_token_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_health_verify_token_v1() to service_role;

-- The App Secret is intentionally NOT created with a placeholder.
-- Once installed securely in Vault under this exact name, the Edge Function can verify X-Hub-Signature-256.
create or replace function public.get_dona_antonia_meta_app_secret_v1()
returns text
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'dona_antonia_meta_app_secret_v1'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_dona_antonia_meta_app_secret_v1() from public, anon, authenticated;
grant execute on function public.get_dona_antonia_meta_app_secret_v1() to service_role;

-- Event payloads are append-only. Existing records cannot be rewritten/deleted by ordinary API roles.
create or replace function public.prevent_whatsapp_flow_health_event_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'whatsapp_flow_health_events is append-only';
end;
$$;

drop trigger if exists trg_whatsapp_flow_health_events_append_only on public.whatsapp_flow_health_events;
create trigger trg_whatsapp_flow_health_events_append_only
before update or delete on public.whatsapp_flow_health_events
for each row execute function public.prevent_whatsapp_flow_health_event_mutation_v1();
