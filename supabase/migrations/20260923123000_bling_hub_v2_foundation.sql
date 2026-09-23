-- Bling Hub V2 foundation.
-- Legacy queues are preserved and explicitly isolated.
-- All external writes remain disabled by default.

create table if not exists public.bling_integration_runtime_v2 (
  id smallint primary key default 1 check (id=1),
  master_enabled boolean not null default false,
  reads_enabled boolean not null default true,
  product_writes_enabled boolean not null default false,
  stock_writes_enabled boolean not null default false,
  customer_writes_enabled boolean not null default false,
  order_writes_enabled boolean not null default false,
  webhook_enabled boolean not null default false,
  fiscal_enabled boolean not null default false,
  invoice_issue_enabled boolean not null default false,
  homologation_only boolean not null default true,
  legacy_writers_blocked boolean not null default true,
  max_requests_per_second numeric not null default 2.0 check (max_requests_per_second > 0 and max_requests_per_second <= 3),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.bling_integration_runtime_v2(id) values(1) on conflict(id) do nothing;

alter table public.bling_integration_runtime_v2 enable row level security;
revoke all on table public.bling_integration_runtime_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_integration_runtime_v2 to service_role;
drop policy if exists service_role_bling_integration_runtime_v2 on public.bling_integration_runtime_v2;
create policy service_role_bling_integration_runtime_v2
  on public.bling_integration_runtime_v2 for all to service_role using (true) with check (true);

create table if not exists public.bling_integration_jobs_v2 (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('product','stock','customer','order','invoice','webhook')),
  entity_id text not null,
  operation text not null,
  idempotency_key text not null unique,
  payload_version integer not null default 1 check (payload_version >= 1),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','synced','retry','review_required','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts >= 1 and max_attempts <= 20),
  not_before timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  correlation_id uuid not null default gen_random_uuid(),
  provider_id text,
  response_summary jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists bling_integration_jobs_v2_status_idx on public.bling_integration_jobs_v2(status,not_before,created_at);
create index if not exists bling_integration_jobs_v2_entity_idx on public.bling_integration_jobs_v2(entity_type,entity_id,created_at desc);
create index if not exists bling_integration_jobs_v2_lock_idx on public.bling_integration_jobs_v2(locked_until) where status='processing';
alter table public.bling_integration_jobs_v2 enable row level security;
revoke all on table public.bling_integration_jobs_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_integration_jobs_v2 to service_role;
drop policy if exists service_role_bling_integration_jobs_v2 on public.bling_integration_jobs_v2;
create policy service_role_bling_integration_jobs_v2 on public.bling_integration_jobs_v2 for all to service_role using (true) with check (true);

create table if not exists public.bling_integration_state_v2 (
  entity_type text not null check (entity_type in ('product','stock','customer','order','invoice','webhook')),
  entity_id text not null,
  local_version text,
  desired_operation text,
  sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced','pending','processing','synced','divergent','review_required','failed','blocked')),
  bling_id text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  needs_action boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(entity_type,entity_id)
);
create index if not exists bling_integration_state_v2_status_idx on public.bling_integration_state_v2(sync_status,needs_action,updated_at desc);
alter table public.bling_integration_state_v2 enable row level security;
revoke all on table public.bling_integration_state_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_integration_state_v2 to service_role;
drop policy if exists service_role_bling_integration_state_v2 on public.bling_integration_state_v2;
create policy service_role_bling_integration_state_v2 on public.bling_integration_state_v2 for all to service_role using (true) with check (true);

create table if not exists public.bling_rate_limit_v2 (
  id smallint primary key default 1 check(id=1),
  next_request_at timestamptz not null default now(),
  last_request_at timestamptz,
  last_http_status integer,
  last_retry_after_seconds integer,
  updated_at timestamptz not null default now()
);
insert into public.bling_rate_limit_v2(id) values(1) on conflict(id) do nothing;
alter table public.bling_rate_limit_v2 enable row level security;
revoke all on table public.bling_rate_limit_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_rate_limit_v2 to service_role;
drop policy if exists service_role_bling_rate_limit_v2 on public.bling_rate_limit_v2;
create policy service_role_bling_rate_limit_v2 on public.bling_rate_limit_v2 for all to service_role using (true) with check (true);

create table if not exists public.bling_oauth_runtime_v2 (
  id smallint primary key default 1 check(id=1),
  refresh_locked_by text,
  refresh_locked_until timestamptz,
  last_refresh_at timestamptz,
  last_refresh_status text,
  last_refresh_error text,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.bling_oauth_runtime_v2(id) values(1) on conflict(id) do nothing;
alter table public.bling_oauth_runtime_v2 enable row level security;
revoke all on table public.bling_oauth_runtime_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_oauth_runtime_v2 to service_role;
drop policy if exists service_role_bling_oauth_runtime_v2 on public.bling_oauth_runtime_v2;
create policy service_role_bling_oauth_runtime_v2 on public.bling_oauth_runtime_v2 for all to service_role using (true) with check (true);

create table if not exists public.bling_legacy_queue_snapshot_v2 (
  id smallint primary key default 1 check(id=1),
  captured_at timestamptz not null default now(),
  legacy_bling_commands_pending integer not null default 0,
  legacy_order_sync_pending integer not null default 0,
  legacy_order_sync_error integer not null default 0,
  legacy_writers_blocked boolean not null default true,
  notes text not null default 'Legacy queues preserved for audit; Hub V2 must never claim them.'
);
insert into public.bling_legacy_queue_snapshot_v2(
  id,captured_at,legacy_bling_commands_pending,legacy_order_sync_pending,legacy_order_sync_error,legacy_writers_blocked
)
select 1,now(),
  (select count(*)::int from public.bling_commands where status='pending'),
  (select count(*)::int from public.order_sync_jobs where status='pending'),
  (select count(*)::int from public.order_sync_jobs where status='error'),
  true
on conflict(id) do update set
  captured_at=excluded.captured_at,
  legacy_bling_commands_pending=excluded.legacy_bling_commands_pending,
  legacy_order_sync_pending=excluded.legacy_order_sync_pending,
  legacy_order_sync_error=excluded.legacy_order_sync_error,
  legacy_writers_blocked=true;
alter table public.bling_legacy_queue_snapshot_v2 enable row level security;
revoke all on table public.bling_legacy_queue_snapshot_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_legacy_queue_snapshot_v2 to service_role;
drop policy if exists service_role_bling_legacy_queue_snapshot_v2 on public.bling_legacy_queue_snapshot_v2;
create policy service_role_bling_legacy_queue_snapshot_v2 on public.bling_legacy_queue_snapshot_v2 for all to service_role using (true) with check (true);

create or replace function public.claim_bling_integration_jobs_v2(p_worker text,p_limit integer default 10,p_lease_seconds integer default 120)
returns setof public.bling_integration_jobs_v2
language plpgsql security definer set search_path=''
as $$
declare v_cfg public.bling_integration_runtime_v2%rowtype;
begin
  select * into v_cfg from public.bling_integration_runtime_v2 where id=1;
  if not found or v_cfg.master_enabled is not true then return; end if;
  return query
  with picked as (
    select j.id from public.bling_integration_jobs_v2 j
    where j.status in ('pending','retry') and j.not_before<=now() and j.attempt_count<j.max_attempts
      and (
        (j.entity_type='product' and v_cfg.product_writes_enabled) or
        (j.entity_type='stock' and v_cfg.stock_writes_enabled) or
        (j.entity_type='customer' and v_cfg.customer_writes_enabled) or
        (j.entity_type='order' and v_cfg.order_writes_enabled) or
        (j.entity_type='invoice' and v_cfg.fiscal_enabled and v_cfg.invoice_issue_enabled) or
        (j.entity_type='webhook' and v_cfg.webhook_enabled)
      )
    order by j.not_before,j.created_at,j.id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,10),50))
  )
  update public.bling_integration_jobs_v2 j
  set status='processing',attempt_count=j.attempt_count+1,
      locked_by=left(coalesce(nullif(trim(p_worker),''),'bling-hub-v2'),120),
      locked_until=now()+make_interval(secs=>greatest(30,least(coalesce(p_lease_seconds,120),900))),
      updated_at=now()
  from picked where j.id=picked.id returning j.*;
end;
$$;
revoke all on function public.claim_bling_integration_jobs_v2(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_bling_integration_jobs_v2(text,integer,integer) to service_role;

create or replace function public.bling_hub_readiness_v2()
returns jsonb language sql stable security definer set search_path=''
as $$
select jsonb_build_object(
  'runtime',to_jsonb(r),'legacy',to_jsonb(l),
  'queue',jsonb_build_object(
    'pending',(select count(*) from public.bling_integration_jobs_v2 where status='pending'),
    'processing',(select count(*) from public.bling_integration_jobs_v2 where status='processing'),
    'retry',(select count(*) from public.bling_integration_jobs_v2 where status='retry'),
    'review_required',(select count(*) from public.bling_integration_jobs_v2 where status='review_required'),
    'failed',(select count(*) from public.bling_integration_jobs_v2 where status='failed')
  ),
  'oauth',to_jsonb(o),'checked_at',now()
)
from public.bling_integration_runtime_v2 r
cross join public.bling_legacy_queue_snapshot_v2 l
cross join public.bling_oauth_runtime_v2 o
where r.id=1 and l.id=1 and o.id=1
$$;
revoke all on function public.bling_hub_readiness_v2() from public,anon,authenticated;
grant execute on function public.bling_hub_readiness_v2() to service_role;

create or replace function public.acquire_bling_refresh_lock_v2(p_worker text,p_lease_seconds integer default 60)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_ok boolean:=false;
begin
  update public.bling_oauth_runtime_v2
  set refresh_locked_by=left(coalesce(nullif(trim(p_worker),''),'bling-hub-v2'),120),
      refresh_locked_until=now()+make_interval(secs=>greatest(15,least(coalesce(p_lease_seconds,60),300))),
      updated_at=now()
  where id=1 and (refresh_locked_until is null or refresh_locked_until<now() or refresh_locked_by=p_worker)
  returning true into v_ok;
  return coalesce(v_ok,false);
end;
$$;
revoke all on function public.acquire_bling_refresh_lock_v2(text,integer) from public,anon,authenticated;
grant execute on function public.acquire_bling_refresh_lock_v2(text,integer) to service_role;

create or replace function public.release_bling_refresh_lock_v2(p_worker text,p_status text,p_error text default null,p_token_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path=''
as $$
begin
  update public.bling_oauth_runtime_v2
  set refresh_locked_by=null,refresh_locked_until=null,last_refresh_at=now(),
      last_refresh_status=left(coalesce(p_status,'unknown'),40),
      last_refresh_error=left(p_error,800),
      token_expires_at=coalesce(p_token_expires_at,token_expires_at),updated_at=now()
  where id=1 and (refresh_locked_by=p_worker or refresh_locked_by is null);
end;
$$;
revoke all on function public.release_bling_refresh_lock_v2(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.release_bling_refresh_lock_v2(text,text,text,timestamptz) to service_role;

create or replace function public.get_bling_vault_secret_v2(p_name text)
returns text language sql security definer set search_path=''
as $$
  select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name=p_name limit 1
$$;
revoke all on function public.get_bling_vault_secret_v2(text) from public,anon,authenticated;
grant execute on function public.get_bling_vault_secret_v2(text) to service_role;

update public.automation_config
set bling_order_sync_enabled=false,whatsapp_sales_bling_submit_enabled=false,updated_at=now()
where id=1;

update public.fiscal_runtime_config
set enabled=false,execution_mode='off',bling_invoice_prepare_enabled=false,
    bling_invoice_send_enabled=false,canary_percent=0,updated_at=now()
where id=1;
