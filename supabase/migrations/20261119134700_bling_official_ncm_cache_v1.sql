-- Persist the official Siscomex NCM catalog so fiscal previews do not
-- consume the public download endpoint's strict per-hour request quota.
create table if not exists public.bling_official_ncm_catalog_cache_v1 (
  id boolean primary key default true check (id),
  source_url text not null default 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json',
  source_revision text,
  codes text[] not null default array[]::text[],
  code_count integer not null default 0,
  fetched_at timestamptz,
  refresh_lease_until timestamptz,
  next_refresh_after timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint bling_official_ncm_catalog_cache_count_matches
    check (code_count = cardinality(codes))
);

insert into public.bling_official_ncm_catalog_cache_v1 (id)
values (true)
on conflict (id) do nothing;

alter table public.bling_official_ncm_catalog_cache_v1 enable row level security;
revoke all on table public.bling_official_ncm_catalog_cache_v1 from public, anon, authenticated;
grant select, insert, update on table public.bling_official_ncm_catalog_cache_v1 to service_role;

create or replace function public.claim_bling_official_ncm_catalog_refresh_v1(
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean := false;
begin
  update public.bling_official_ncm_catalog_cache_v1
     set refresh_lease_until = clock_timestamp()
         + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 180), 300))),
         updated_at = clock_timestamp()
   where id = true
     and (refresh_lease_until is null or refresh_lease_until < clock_timestamp())
     and (next_refresh_after is null or next_refresh_after <= clock_timestamp())
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_bling_official_ncm_catalog_refresh_v1(integer) from public, anon, authenticated;
grant execute on function public.claim_bling_official_ncm_catalog_refresh_v1(integer) to service_role;
