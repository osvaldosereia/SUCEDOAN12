alter table public.dispatch_fiscal_jobs
  alter column bling_order_id drop not null;

alter table public.dispatch_fiscal_jobs
  add column if not exists next_attempt_at timestamptz;

alter table public.dispatch_fiscal_jobs
  alter column next_attempt_at set default now();

update public.dispatch_fiscal_jobs
set next_attempt_at = case
  when status in ('authorized','review_required','failed','cancelled') then null
  else coalesce(next_attempt_at, updated_at, created_at, now())
end
where next_attempt_at is null;

create index if not exists dispatch_fiscal_jobs_auto_due_v1_idx
  on public.dispatch_fiscal_jobs (next_attempt_at, created_at)
  where status in ('held','generated','generating','authorizing');

alter table public.fiscal_runtime_config
  add column if not exists dispatch_fiscal_auto_issue_enabled boolean not null default false;

alter table public.fiscal_runtime_config
  add column if not exists dispatch_fiscal_auto_issue_since timestamptz;

update public.fiscal_runtime_config
set dispatch_fiscal_auto_issue_enabled = false,
    dispatch_fiscal_auto_issue_since = coalesce(
      dispatch_fiscal_auto_issue_since,
      timestamptz '2026-11-19 12:14:17.327607+00'
    ),
    updated_at = now()
where id = 1;

create or replace function public.dispatch_bling_hub_cycle_v2()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_request_id bigint;
  v_ean_recovery_id bigint;
  v_fiscal_request_id bigint;
begin
  if not exists(
    select 1
    from public.bling_hub_runtime_v2
    where id=1
      and hub_enabled=true
      and mode in ('homologation','live')
  ) then
    return null;
  end if;

  select net.http_post(
    url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-dona-antonia-bling-hub-key',public.get_bling_hub_key_v2()
    ),
    body := jsonb_build_object(
      'action','vitrine_bling_hub_internal',
      'subaction','process_cycle',
      'limit',3
    ),
    timeout_milliseconds := 55000
  ) into v_request_id;

  select net.http_post(
    url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-products-live-v1?action=ops2_recover_ean_verified',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-dona-antonia-bling-hub-key',public.get_bling_hub_key_v2()
    ),
    body := jsonb_build_object('limit',3),
    timeout_milliseconds := 55000
  ) into v_ean_recovery_id;

  if exists(
    select 1
    from public.fiscal_runtime_config f
    where f.id=1
      and f.enabled=true
      and f.execution_mode='live'
      and f.bling_invoice_send_enabled=true
      and f.dispatch_gate_mode='enforce'
      and f.dispatch_fiscal_auto_issue_enabled=true
  ) and exists(
    select 1
    from public.bling_hub_runtime_v2 h
    where h.id=1
      and h.hub_enabled=true
      and h.orders_enabled=true
      and h.mode='live'
  ) then
    select net.http_post(
      url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-dona-antonia-bling-hub-key',public.get_bling_hub_key_v2()
      ),
      body := jsonb_build_object(
        'action','vitrine_bling_hub_internal',
        'subaction','fiscal_dispatch_auto_process',
        'limit',1
      ),
      timeout_milliseconds := 55000
    ) into v_fiscal_request_id;
  end if;

  return v_request_id;
end;
$function$;
