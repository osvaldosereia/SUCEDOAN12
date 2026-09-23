
create table if not exists public.bling_hub_canary_allowlist_v2 (
  id uuid primary key default gen_random_uuid(),
  domain text not null check(domain in ('product','stock','customer','order','fiscal')),
  source_system text not null,
  source_id text not null,
  enabled boolean not null default true,
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(domain,source_system,source_id)
);

create index if not exists bling_hub_canary_allowlist_v2_active_idx
  on public.bling_hub_canary_allowlist_v2(domain,source_system,source_id)
  where enabled=true;

alter table public.bling_hub_canary_allowlist_v2 enable row level security;
revoke all on table public.bling_hub_canary_allowlist_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_hub_canary_allowlist_v2 to service_role;
drop policy if exists service_role_bling_hub_canary_allowlist_v2 on public.bling_hub_canary_allowlist_v2;
create policy service_role_bling_hub_canary_allowlist_v2
  on public.bling_hub_canary_allowlist_v2 for all to service_role
  using(true) with check(true);

create or replace function public.claim_bling_hub_jobs_v2(
  p_worker text,
  p_domains text[] default null,
  p_limit integer default 10,
  p_lease_seconds integer default 300
)
returns setof public.bling_hub_jobs_v2
language plpgsql
security definer
set search_path=''
as $$
declare
  v_runtime public.bling_hub_runtime_v2%rowtype;
  v_limit integer;
begin
  select * into v_runtime from public.bling_hub_runtime_v2 where id=1;
  if not found or v_runtime.hub_enabled is not true or v_runtime.mode not in ('homologation','live') then
    return;
  end if;
  if nullif(trim(coalesce(p_worker,'')),'') is null then raise exception 'worker_required'; end if;

  v_limit:=greatest(1,least(coalesce(p_limit,10),100));
  if v_runtime.mode='homologation' then
    v_limit:=least(v_limit,greatest(1,v_runtime.write_canary_limit));
  end if;

  update public.bling_hub_jobs_v2
  set status='retry',locked_at=null,locked_by=null,next_attempt_at=now(),updated_at=now(),
      error_code=coalesce(error_code,'lease_expired')
  where status='processing'
    and locked_at is not null
    and locked_at < now()-make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,300),1800)));

  return query
  with picked as (
    select j.id
    from public.bling_hub_jobs_v2 j
    where j.status in ('pending','retry')
      and j.next_attempt_at<=now()
      and j.attempts<j.max_attempts
      and (p_domains is null or cardinality(p_domains)=0 or j.domain=any(p_domains))
      and (
        (j.domain='product' and v_runtime.products_enabled)
        or (j.domain='stock' and v_runtime.stock_enabled)
        or (j.domain='customer' and v_runtime.customers_enabled)
        or (j.domain='order' and v_runtime.orders_enabled)
        or (j.domain='webhook' and v_runtime.webhooks_enabled)
        or (j.domain='fiscal' and v_runtime.fiscal_enabled)
      )
      and (
        v_runtime.mode='live'
        or (
          v_runtime.mode='homologation'
          and exists(
            select 1
            from public.bling_hub_canary_allowlist_v2 a
            where a.domain=j.domain
              and a.source_system=j.source_system
              and a.source_id=j.source_id
              and a.enabled=true
              and (a.expires_at is null or a.expires_at>now())
          )
        )
      )
    order by j.created_at,j.id
    for update skip locked
    limit v_limit
  )
  update public.bling_hub_jobs_v2 j
  set status='processing',attempts=j.attempts+1,locked_at=now(),locked_by=left(trim(p_worker),120),
      started_at=coalesce(j.started_at,now()),updated_at=now()
  from picked
  where j.id=picked.id
  returning j.*;
end
$$;

revoke all on function public.claim_bling_hub_jobs_v2(text,text[],integer,integer) from public,anon,authenticated;
grant execute on function public.claim_bling_hub_jobs_v2(text,text[],integer,integer) to service_role;
