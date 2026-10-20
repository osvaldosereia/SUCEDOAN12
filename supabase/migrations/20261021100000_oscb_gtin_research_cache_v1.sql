-- Keep one durable OSCBR result per GTIN so a rescanned or corrected capture
-- cannot trigger a second paid/quota-consuming query for a completed EAN.
create table if not exists public.oscb_gtin_research_cache_v1 (
  gtin text primary key check (gtin ~ '^[0-9]{8,14}$'),
  status text not null check (status in ('researching','review','not_found','error')),
  proposal jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  last_http_status integer,
  last_error text,
  attempted_at timestamptz,
  researched_at timestamptz,
  researched_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists oscb_gtin_research_cache_status_idx
  on public.oscb_gtin_research_cache_v1(status, attempted_at desc);

create table if not exists public.oscb_gtin_research_attempts_v1 (
  id uuid primary key default gen_random_uuid(),
  gtin text not null check (gtin ~ '^[0-9]{8,14}$'),
  capture_id uuid references public.ean_capture_records_v1(id) on delete set null,
  actor_id uuid,
  attempted_at timestamptz not null default now(),
  outcome text,
  http_status integer
);

create index if not exists oscb_gtin_research_attempts_time_idx
  on public.oscb_gtin_research_attempts_v1(attempted_at desc);

create or replace function public.oscb_reserve_gtin_lookup_v1(
  p_gtin text,
  p_capture_id uuid,
  p_actor_id uuid,
  p_daily_limit integer default 45
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cache public.oscb_gtin_research_cache_v1%rowtype;
  v_used integer;
  v_limit integer := greatest(1, least(45, coalesce(p_daily_limit, 45)));
  v_attempt uuid;
begin
  if p_gtin !~ '^[0-9]{8,14}$' then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_gtin');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('oscb_gtin_quota', 0));
  select * into v_cache from public.oscb_gtin_research_cache_v1 where gtin = p_gtin for update;
  if found and v_cache.status in ('review', 'not_found') and v_cache.researched_at is not null then
    return jsonb_build_object('allowed', false, 'reason', 'cached', 'cache', to_jsonb(v_cache));
  end if;
  if found and v_cache.status = 'researching' and v_cache.attempted_at > now() - interval '3 minutes' then
    return jsonb_build_object('allowed', false, 'reason', 'in_progress');
  end if;
  if found and v_cache.status = 'error' and v_cache.attempted_at > now() - interval '5 minutes' then
    return jsonb_build_object('allowed', false, 'reason', 'retry_later');
  end if;
  select count(*) into v_used from public.oscb_gtin_research_attempts_v1
   where attempted_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'used', v_used, 'limit', v_limit);
  end if;
  if exists (select 1 from public.oscb_gtin_research_attempts_v1
      where attempted_at > now() - interval '30 seconds') then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limit');
  end if;
  insert into public.oscb_gtin_research_attempts_v1(gtin, capture_id, actor_id)
  values (p_gtin, p_capture_id, p_actor_id) returning id into v_attempt;
  insert into public.oscb_gtin_research_cache_v1(gtin, status, proposal, response_summary, attempted_at, researched_by, updated_at)
  values (p_gtin, 'researching', '{}'::jsonb, jsonb_build_object('source','oscb'), now(), p_actor_id, now())
  on conflict (gtin) do update set status='researching', proposal='{}'::jsonb,
    response_summary=jsonb_build_object('source','oscb'), last_http_status=null, last_error=null,
    attempted_at=now(), researched_at=null, researched_by=p_actor_id, updated_at=now();
  return jsonb_build_object('allowed', true, 'attempt_id', v_attempt, 'used', v_used + 1, 'limit', v_limit);
end;
$$;

revoke all on function public.oscb_reserve_gtin_lookup_v1(text, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.oscb_reserve_gtin_lookup_v1(text, uuid, uuid, integer) to service_role;

-- Preserve completed results already present in the original per-capture cache.
insert into public.oscb_gtin_research_cache_v1
  (gtin, status, proposal, response_summary, last_http_status, last_error, attempted_at, researched_at, researched_by)
select distinct on (gtin) gtin, status, coalesce(proposal,'{}'::jsonb), coalesce(response_summary,'{}'::jsonb),
       last_http_status, last_error, attempted_at, researched_at, researched_by
  from public.cosmos_ean_capture_research_v1
 where status in ('review','not_found') and researched_at is not null
 order by gtin, researched_at desc
on conflict (gtin) do nothing;

insert into public.oscb_gtin_research_attempts_v1(gtin,capture_id,actor_id,attempted_at,outcome,http_status)
select gtin,capture_id,researched_by,attempted_at,status,last_http_status
  from public.cosmos_ean_capture_research_v1
 where attempted_at is not null
on conflict do nothing;

alter table public.oscb_gtin_research_cache_v1 enable row level security;
alter table public.oscb_gtin_research_attempts_v1 enable row level security;
revoke all on public.oscb_gtin_research_cache_v1 from public, anon, authenticated;
revoke all on public.oscb_gtin_research_attempts_v1 from public, anon, authenticated;
grant select, insert, update, delete on public.oscb_gtin_research_cache_v1 to service_role;
grant select, insert, update, delete on public.oscb_gtin_research_attempts_v1 to service_role;

-- Leave the automation switch off. The runtime applies a conservative ceiling
-- of 45/day, reserving five of the visible Bronze quota.
