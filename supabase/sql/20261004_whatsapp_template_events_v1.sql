-- Meta WhatsApp template status/quality audit.
-- Additive only: no campaign/runtime gate is changed here.

create table if not exists public.whatsapp_template_events_v1 (
  id uuid primary key default gen_random_uuid(),
  waba_id text not null,
  whatsapp_account_id uuid references public.whatsapp_accounts(id) on delete set null,
  meta_template_id text,
  template_name text,
  language text,
  event_type text not null,
  status text,
  quality_rating text,
  reason text,
  provider_event_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz,
  received_at timestamptz not null default now()
);

create index if not exists whatsapp_template_events_v1_account_received_idx
  on public.whatsapp_template_events_v1 (whatsapp_account_id, received_at desc);
create index if not exists whatsapp_template_events_v1_remote_template_idx
  on public.whatsapp_template_events_v1 (waba_id, meta_template_id, received_at desc);

alter table public.whatsapp_template_events_v1 enable row level security;
revoke all on table public.whatsapp_template_events_v1 from public, anon, authenticated;
grant select, insert on table public.whatsapp_template_events_v1 to service_role;

create or replace function public.whatsapp_apply_template_event_v1(
  p_waba_id text,
  p_meta_template_id text,
  p_template_name text,
  p_language text,
  p_event_type text,
  p_status text,
  p_quality_rating text,
  p_reason text,
  p_provider_event_key text,
  p_payload jsonb,
  p_occurred_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_event_id uuid;
  v_inserted boolean := false;
  v_updated integer := 0;
begin
  if coalesce(trim(p_waba_id), '') !~ '^\d{5,30}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_waba_id');
  end if;
  if coalesce(trim(p_provider_event_key), '') = '' or length(p_provider_event_key) > 500 then
    return jsonb_build_object('ok', false, 'error', 'invalid_provider_event_key');
  end if;
  if coalesce(trim(p_event_type), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_event_type');
  end if;

  select a.id
    into v_account_id
    from public.whatsapp_accounts a
   where a.waba_id = p_waba_id
     and a.is_active = true
   limit 1;

  insert into public.whatsapp_template_events_v1 (
    waba_id,
    whatsapp_account_id,
    meta_template_id,
    template_name,
    language,
    event_type,
    status,
    quality_rating,
    reason,
    provider_event_key,
    payload,
    occurred_at
  ) values (
    p_waba_id,
    v_account_id,
    nullif(trim(p_meta_template_id), ''),
    nullif(trim(p_template_name), ''),
    nullif(trim(p_language), ''),
    upper(trim(p_event_type)),
    nullif(upper(trim(p_status)), ''),
    nullif(upper(trim(p_quality_rating)), ''),
    nullif(trim(p_reason), ''),
    p_provider_event_key,
    coalesce(p_payload, '{}'::jsonb),
    p_occurred_at
  )
  on conflict (provider_event_key) do nothing
  returning id into v_event_id;

  v_inserted := v_event_id is not null;
  if not v_inserted then
    select e.id into v_event_id
      from public.whatsapp_template_events_v1 e
     where e.provider_event_key = p_provider_event_key
     limit 1;
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'event_id', v_event_id,
      'unmatched', v_account_id is null,
      'templates_updated', 0
    );
  end if;

  if v_account_id is null then
    return jsonb_build_object(
      'ok', true,
      'duplicate', false,
      'event_id', v_event_id,
      'unmatched', true,
      'templates_updated', 0
    );
  end if;

  update public.whatsapp_templates_v1 t
     set status = coalesce(nullif(upper(trim(p_status)), ''), t.status),
         quality_rating = coalesce(nullif(upper(trim(p_quality_rating)), ''), t.quality_rating),
         metadata = coalesce(t.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'rejected_reason', nullif(trim(p_reason), ''),
                'template_event_last_type', upper(trim(p_event_type)),
                'template_event_last_at', coalesce(p_occurred_at, now())
              ),
         updated_at = now()
   where t.whatsapp_account_id = v_account_id
     and (
       (nullif(trim(p_meta_template_id), '') is not null and t.meta_template_id = trim(p_meta_template_id))
       or
       (nullif(trim(p_meta_template_id), '') is null
        and t.name = trim(p_template_name)
        and (p_language is null or t.language = trim(p_language)))
     );

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'event_id', v_event_id,
    'unmatched', false,
    'templates_updated', v_updated
  );
end;
$$;

revoke all on function public.whatsapp_apply_template_event_v1(text,text,text,text,text,text,text,text,text,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.whatsapp_apply_template_event_v1(text,text,text,text,text,text,text,text,text,jsonb,timestamptz) to service_role;
