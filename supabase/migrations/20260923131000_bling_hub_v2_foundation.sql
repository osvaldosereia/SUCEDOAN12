create table if not exists public.bling_hub_runtime_v2 (
  id smallint primary key default 1 check(id=1),
  mode text not null default 'observe' check(mode in ('off','observe','homologation','live')),
  hub_enabled boolean not null default false,
  legacy_queues_frozen boolean not null default true,
  products_enabled boolean not null default false,
  stock_enabled boolean not null default false,
  customers_enabled boolean not null default false,
  orders_enabled boolean not null default false,
  webhooks_enabled boolean not null default false,
  fiscal_enabled boolean not null default false,
  write_canary_limit integer not null default 1 check(write_canary_limit between 1 and 100),
  min_request_interval_ms integer not null default 420 check(min_request_interval_ms between 350 and 5000),
  max_attempts integer not null default 5 check(max_attempts between 1 and 20),
  oauth_lock_owner uuid,
  oauth_locked_until timestamptz,
  last_oauth_check_at timestamptz,
  last_oauth_ok_at timestamptz,
  last_oauth_error text,
  last_readonly_check_at timestamptz,
  last_readonly_ok_at timestamptz,
  last_readonly_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.bling_hub_runtime_v2(id) values(1) on conflict(id) do nothing;

alter table public.bling_hub_runtime_v2 enable row level security;
revoke all on table public.bling_hub_runtime_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_hub_runtime_v2 to service_role;
drop policy if exists service_role_bling_hub_runtime_v2 on public.bling_hub_runtime_v2;
create policy service_role_bling_hub_runtime_v2 on public.bling_hub_runtime_v2 for all to service_role using(true) with check(true);

create table if not exists public.bling_hub_jobs_v2 (
  id uuid primary key default gen_random_uuid(),
  domain text not null check(domain in ('product','stock','customer','order','webhook','fiscal')),
  operation text not null,
  source_system text not null,
  source_id text not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check(status in ('pending','processing','retry','review_required','synced','failed','cancelled')),
  payload_version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  provider_id text,
  attempts integer not null default 0,
  max_attempts integer not null default 5 check(max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  result jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  last_http_status integer,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bling_hub_jobs_v2_claim_idx on public.bling_hub_jobs_v2(status,next_attempt_at,created_at);
create index if not exists bling_hub_jobs_v2_source_idx on public.bling_hub_jobs_v2(source_system,domain,source_id,created_at desc);
create index if not exists bling_hub_jobs_v2_correlation_idx on public.bling_hub_jobs_v2(correlation_id);

alter table public.bling_hub_jobs_v2 enable row level security;
revoke all on table public.bling_hub_jobs_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_hub_jobs_v2 to service_role;
drop policy if exists service_role_bling_hub_jobs_v2 on public.bling_hub_jobs_v2;
create policy service_role_bling_hub_jobs_v2 on public.bling_hub_jobs_v2 for all to service_role using(true) with check(true);

create table if not exists public.bling_hub_entity_links_v2 (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  entity_type text not null check(entity_type in ('product','customer','order','invoice')),
  source_id text not null,
  bling_id bigint,
  identity_kind text,
  identity_value text,
  status text not null default 'unresolved' check(status in ('unresolved','matched','not_found','ambiguous','review_required','inactive')),
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_system,entity_type,source_id)
);

create index if not exists bling_hub_entity_links_v2_bling_idx on public.bling_hub_entity_links_v2(entity_type,bling_id) where bling_id is not null;
create index if not exists bling_hub_entity_links_v2_identity_idx on public.bling_hub_entity_links_v2(entity_type,identity_kind,identity_value) where identity_value is not null;

alter table public.bling_hub_entity_links_v2 enable row level security;
revoke all on table public.bling_hub_entity_links_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_hub_entity_links_v2 to service_role;
drop policy if exists service_role_bling_hub_entity_links_v2 on public.bling_hub_entity_links_v2;
create policy service_role_bling_hub_entity_links_v2 on public.bling_hub_entity_links_v2 for all to service_role using(true) with check(true);

create table if not exists public.bling_hub_audit_v2 (
  id bigint generated by default as identity primary key,
  event_type text not null,
  severity text not null default 'info' check(severity in ('info','warning','error')),
  domain text,
  job_id uuid references public.bling_hub_jobs_v2(id) on delete set null,
  source_system text,
  source_id text,
  correlation_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bling_hub_audit_v2_created_idx on public.bling_hub_audit_v2(created_at desc);
create index if not exists bling_hub_audit_v2_job_idx on public.bling_hub_audit_v2(job_id) where job_id is not null;

alter table public.bling_hub_audit_v2 enable row level security;
revoke all on table public.bling_hub_audit_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_hub_audit_v2 to service_role;
drop policy if exists service_role_bling_hub_audit_v2 on public.bling_hub_audit_v2;
create policy service_role_bling_hub_audit_v2 on public.bling_hub_audit_v2 for all to service_role using(true) with check(true);

create table if not exists public.bling_hub_rate_limit_v2 (
  id smallint primary key default 1 check(id=1),
  next_allowed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.bling_hub_rate_limit_v2(id) values(1) on conflict(id) do nothing;
alter table public.bling_hub_rate_limit_v2 enable row level security;
revoke all on table public.bling_hub_rate_limit_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_hub_rate_limit_v2 to service_role;
drop policy if exists service_role_bling_hub_rate_limit_v2 on public.bling_hub_rate_limit_v2;
create policy service_role_bling_hub_rate_limit_v2 on public.bling_hub_rate_limit_v2 for all to service_role using(true) with check(true);

create or replace function public.enqueue_bling_hub_job_v2(
  p_domain text,p_operation text,p_source_system text,p_source_id text,p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb,p_payload_version integer default 1
) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_max integer;
begin
  if p_domain not in ('product','stock','customer','order','webhook','fiscal') then raise exception 'invalid_domain'; end if;
  if nullif(trim(coalesce(p_operation,'')),'') is null then raise exception 'operation_required'; end if;
  if nullif(trim(coalesce(p_source_system,'')),'') is null then raise exception 'source_system_required'; end if;
  if nullif(trim(coalesce(p_source_id,'')),'') is null then raise exception 'source_id_required'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'idempotency_key_required'; end if;
  select max_attempts into v_max from public.bling_hub_runtime_v2 where id=1;
  insert into public.bling_hub_jobs_v2(domain,operation,source_system,source_id,idempotency_key,payload_version,payload,max_attempts)
  values(p_domain,trim(p_operation),trim(p_source_system),trim(p_source_id),trim(p_idempotency_key),greatest(1,coalesce(p_payload_version,1)),coalesce(p_payload,'{}'::jsonb),coalesce(v_max,5))
  on conflict(idempotency_key) do update set payload=excluded.payload,payload_version=excluded.payload_version,updated_at=now()
  where public.bling_hub_jobs_v2.status in ('pending','retry','review_required','failed')
  returning id into v_id;
  if v_id is null then select id into v_id from public.bling_hub_jobs_v2 where idempotency_key=trim(p_idempotency_key); end if;
  return v_id;
end $$;

create or replace function public.claim_bling_hub_jobs_v2(
  p_worker text,p_domains text[] default null,p_limit integer default 10,p_lease_seconds integer default 300
) returns setof public.bling_hub_jobs_v2
language plpgsql security definer set search_path='' as $$
declare v_runtime public.bling_hub_runtime_v2%rowtype;v_limit integer;
begin
  select * into v_runtime from public.bling_hub_runtime_v2 where id=1;
  if not found or v_runtime.hub_enabled is not true or v_runtime.mode not in ('homologation','live') then return; end if;
  if nullif(trim(coalesce(p_worker,'')),'') is null then raise exception 'worker_required'; end if;
  v_limit:=greatest(1,least(coalesce(p_limit,10),100));
  update public.bling_hub_jobs_v2
  set status='retry',locked_at=null,locked_by=null,next_attempt_at=now(),updated_at=now(),error_code=coalesce(error_code,'lease_expired')
  where status='processing' and locked_at is not null
    and locked_at<now()-make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,300),1800)));
  return query
  with picked as (
    select j.id from public.bling_hub_jobs_v2 j
    where j.status in ('pending','retry') and j.next_attempt_at<=now() and j.attempts<j.max_attempts
      and (p_domains is null or cardinality(p_domains)=0 or j.domain=any(p_domains))
      and (
        (j.domain='product' and v_runtime.products_enabled) or
        (j.domain='stock' and v_runtime.stock_enabled) or
        (j.domain='customer' and v_runtime.customers_enabled) or
        (j.domain='order' and v_runtime.orders_enabled) or
        (j.domain='webhook' and v_runtime.webhooks_enabled) or
        (j.domain='fiscal' and v_runtime.fiscal_enabled)
      )
    order by j.created_at,j.id for update skip locked limit v_limit
  )
  update public.bling_hub_jobs_v2 j
  set status='processing',attempts=j.attempts+1,locked_at=now(),locked_by=left(trim(p_worker),120),
      started_at=coalesce(j.started_at,now()),updated_at=now()
  from picked where j.id=picked.id returning j.*;
end $$;

create or replace function public.finish_bling_hub_job_v2(
  p_job_id uuid,p_status text,p_result jsonb default '{}'::jsonb,p_error_code text default null,
  p_error_message text default null,p_http_status integer default null,p_retry_seconds integer default 120,
  p_provider_id text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_job public.bling_hub_jobs_v2%rowtype;v_status text:=lower(trim(coalesce(p_status,'')));
begin
  if v_status not in ('synced','retry','review_required','failed','cancelled') then raise exception 'invalid_finish_status'; end if;
  update public.bling_hub_jobs_v2
  set status=v_status,result=coalesce(p_result,'{}'::jsonb),error_code=nullif(trim(coalesce(p_error_code,'')),''),
      error_message=nullif(left(trim(coalesce(p_error_message,'')),1500),''),
      last_http_status=p_http_status,provider_id=coalesce(nullif(trim(coalesce(p_provider_id,'')),''),provider_id),
      next_attempt_at=case when v_status='retry' then now()+make_interval(secs=>greatest(5,least(coalesce(p_retry_seconds,120),86400))) else next_attempt_at end,
      finished_at=case when v_status in ('synced','review_required','failed','cancelled') then now() else null end,
      locked_at=null,locked_by=null,updated_at=now()
  where id=p_job_id returning * into v_job;
  if not found then raise exception 'job_not_found'; end if;
  insert into public.bling_hub_audit_v2(event_type,severity,domain,job_id,source_system,source_id,correlation_id,details)
  values('job_'||v_status,case when v_status in ('failed','review_required') then 'warning' else 'info' end,
    v_job.domain,v_job.id,v_job.source_system,v_job.source_id,v_job.correlation_id,
    jsonb_build_object('operation',v_job.operation,'attempts',v_job.attempts,'http_status',p_http_status,'error_code',p_error_code));
  return jsonb_build_object('id',v_job.id,'status',v_job.status,'attempts',v_job.attempts,'provider_id',v_job.provider_id);
end $$;

create or replace function public.reserve_bling_hub_rate_slot_v2(p_min_interval_ms integer default null)
returns integer language plpgsql security definer set search_path='' as $$
declare v_interval integer;v_now timestamptz:=clock_timestamp();v_slot timestamptz;v_next timestamptz;v_wait integer;
begin
  select coalesce(p_min_interval_ms,min_request_interval_ms) into v_interval from public.bling_hub_runtime_v2 where id=1;
  v_interval:=greatest(350,least(coalesce(v_interval,420),5000));
  select next_allowed_at into v_next from public.bling_hub_rate_limit_v2 where id=1 for update;
  v_slot:=greatest(v_now,coalesce(v_next,v_now));
  v_wait:=greatest(0,ceil(extract(epoch from (v_slot-v_now))*1000)::integer);
  update public.bling_hub_rate_limit_v2
  set next_allowed_at=v_slot+(v_interval::text||' milliseconds')::interval,updated_at=now()
  where id=1;
  return v_wait;
end $$;

create or replace function public.claim_bling_hub_oauth_lock_v2(p_owner uuid,p_ttl_seconds integer default 60)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_claimed boolean:=false;
begin
  if p_owner is null then raise exception 'owner_required'; end if;
  update public.bling_hub_runtime_v2
  set oauth_lock_owner=p_owner,oauth_locked_until=now()+make_interval(secs=>greatest(15,least(coalesce(p_ttl_seconds,60),300))),updated_at=now()
  where id=1 and (oauth_locked_until is null or oauth_locked_until<now() or oauth_lock_owner=p_owner)
  returning true into v_claimed;
  return coalesce(v_claimed,false);
end $$;

create or replace function public.release_bling_hub_oauth_lock_v2(p_owner uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.bling_hub_runtime_v2 set oauth_lock_owner=null,oauth_locked_until=null,updated_at=now()
  where id=1 and oauth_lock_owner=p_owner;
  return found;
end $$;

create or replace function public.bling_hub_readiness_v2()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_runtime public.bling_hub_runtime_v2%rowtype;v_creds jsonb;
begin
  select * into v_runtime from public.bling_hub_runtime_v2 where id=1;
  select public.get_bling_api_credentials_v1() into v_creds;
  return jsonb_build_object(
    'mode',v_runtime.mode,'hub_enabled',v_runtime.hub_enabled,'legacy_queues_frozen',v_runtime.legacy_queues_frozen,
    'domains',jsonb_build_object('products',v_runtime.products_enabled,'stock',v_runtime.stock_enabled,'customers',v_runtime.customers_enabled,'orders',v_runtime.orders_enabled,'webhooks',v_runtime.webhooks_enabled,'fiscal',v_runtime.fiscal_enabled),
    'credentials',jsonb_build_object(
      'client_id',nullif(v_creds->>'client_id','') is not null,
      'client_secret',nullif(v_creds->>'client_secret','') is not null,
      'refresh_token',nullif(v_creds->>'refresh_token','') is not null,
      'ready',nullif(v_creds->>'client_id','') is not null and nullif(v_creds->>'client_secret','') is not null and nullif(v_creds->>'refresh_token','') is not null
    ),
    'legacy',jsonb_build_object(
      'bling_commands_pending',(select count(*) from public.bling_commands where status='pending'),
      'bling_commands_processing',(select count(*) from public.bling_commands where status='processing'),
      'order_sync_pending_or_error',(select count(*) from public.order_sync_jobs where status in ('pending','error')),
      'order_sync_processing',(select count(*) from public.order_sync_jobs where status='processing')
    ),
    'hub_queue',jsonb_build_object(
      'pending',(select count(*) from public.bling_hub_jobs_v2 where status='pending'),
      'processing',(select count(*) from public.bling_hub_jobs_v2 where status='processing'),
      'review_required',(select count(*) from public.bling_hub_jobs_v2 where status='review_required'),
      'failed',(select count(*) from public.bling_hub_jobs_v2 where status='failed')
    ),
    'last_oauth_check_at',v_runtime.last_oauth_check_at,'last_oauth_ok_at',v_runtime.last_oauth_ok_at,
    'last_readonly_check_at',v_runtime.last_readonly_check_at,'last_readonly_ok_at',v_runtime.last_readonly_ok_at
  );
end $$;

create or replace function public.claim_bling_commands_by_types(p_worker text,p_types text[],p_limit integer default 20)
returns table(id uuid,command_type text,product_id uuid,payload jsonb,attempts integer)
language plpgsql security definer set search_path='' as $$
declare v_frozen boolean;
begin
  select legacy_queues_frozen into v_frozen from public.bling_hub_runtime_v2 where id=1;
  if coalesce(v_frozen,true) then return; end if;
  if coalesce(trim(p_worker),'')='' then raise exception 'worker_required'; end if;
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'invalid_limit'; end if;
  if p_types is null or cardinality(p_types)=0 then raise exception 'types_required'; end if;
  update public.bling_commands
     set status='pending',locked_at=null,locked_by=null,updated_at=now(),
         error_message=coalesce(error_message,'processing_timeout_requeued')
   where status='processing' and locked_at is not null and locked_at<now()-interval '20 minutes';
  return query
  with picked as (
    select c.id from public.bling_commands c
    where c.status='pending' and c.available_at<=now() and c.attempts<c.max_attempts and c.command_type=any(p_types)
    order by c.created_at for update skip locked limit p_limit
  ),claimed as (
    update public.bling_commands c
       set status='processing',attempts=c.attempts+1,locked_at=now(),locked_by=p_worker,updated_at=now()
      from picked where c.id=picked.id
    returning c.id,c.command_type,c.product_id,c.payload,c.attempts
  )
  select claimed.id,claimed.command_type,claimed.product_id,claimed.payload,claimed.attempts from claimed;
end $$;

create or replace function public.claim_order_sync_jobs(p_worker text,p_limit integer default 10)
returns setof public.order_sync_jobs
language plpgsql security definer set search_path='' as $$
declare c public.automation_config%rowtype;lim integer;v_frozen boolean;
begin
  select legacy_queues_frozen into v_frozen from public.bling_hub_runtime_v2 where id=1;
  if coalesce(v_frozen,true) then return; end if;
  select * into c from public.automation_config where id=1;
  if not found or not c.bling_order_sync_enabled or not c.whatsapp_sales_bling_submit_enabled then return; end if;
  lim:=greatest(1,least(coalesce(p_limit,10),coalesce(c.bling_order_max_per_run,1),10));
  return query
  with picked as (
    select j.id from public.order_sync_jobs j join public.orders o on o.id=j.order_id
    where j.status in ('pending','error') and j.next_attempt_at<=now() and j.attempts<j.max_attempts
      and o.status='confirmed' and o.bling_order_id is null
      and (not c.bling_order_homologation_only or exists(
        select 1 from public.bling_order_homologation_allowlist a
        where a.order_id=o.id and a.enabled and (a.expires_at is null or a.expires_at>now())
      ))
    order by j.created_at for update of j skip locked limit lim
  ),upd as (
    update public.order_sync_jobs j
       set status='processing',worker_id=left(coalesce(p_worker,'unknown'),120),locked_at=now(),attempts=j.attempts+1,updated_at=now()
      from picked where j.id=picked.id returning j.*
  )
  select * from upd;
end $$;

revoke all on function public.enqueue_bling_hub_job_v2(text,text,text,text,text,jsonb,integer) from public,anon,authenticated;
revoke all on function public.claim_bling_hub_jobs_v2(text,text[],integer,integer) from public,anon,authenticated;
revoke all on function public.finish_bling_hub_job_v2(uuid,text,jsonb,text,text,integer,integer,text) from public,anon,authenticated;
revoke all on function public.reserve_bling_hub_rate_slot_v2(integer) from public,anon,authenticated;
revoke all on function public.claim_bling_hub_oauth_lock_v2(uuid,integer) from public,anon,authenticated;
revoke all on function public.release_bling_hub_oauth_lock_v2(uuid) from public,anon,authenticated;
revoke all on function public.bling_hub_readiness_v2() from public,anon,authenticated;
revoke all on function public.claim_bling_commands_by_types(text,text[],integer) from public,anon,authenticated;
revoke all on function public.claim_order_sync_jobs(text,integer) from public,anon,authenticated;

grant execute on function public.enqueue_bling_hub_job_v2(text,text,text,text,text,jsonb,integer) to service_role;
grant execute on function public.claim_bling_hub_jobs_v2(text,text[],integer,integer) to service_role;
grant execute on function public.finish_bling_hub_job_v2(uuid,text,jsonb,text,text,integer,integer,text) to service_role;
grant execute on function public.reserve_bling_hub_rate_slot_v2(integer) to service_role;
grant execute on function public.claim_bling_hub_oauth_lock_v2(uuid,integer) to service_role;
grant execute on function public.release_bling_hub_oauth_lock_v2(uuid) to service_role;
grant execute on function public.bling_hub_readiness_v2() to service_role;
grant execute on function public.claim_bling_commands_by_types(text,text[],integer) to service_role;
grant execute on function public.claim_order_sync_jobs(text,integer) to service_role;

update public.automation_config
set bling_order_sync_enabled=false,whatsapp_sales_bling_submit_enabled=false,bling_order_homologation_only=true,updated_at=now()
where id=1;

insert into public.bling_hub_audit_v2(event_type,severity,details)
values('hub_v2_foundation_created','warning',jsonb_build_object('mode','observe','hub_enabled',false,'legacy_queues_frozen',true,'external_write_enabled',false,'make_touched',false));
