-- SI5 Global: segunda fonte de evidencia em paralelo ao Cosmos.
-- Sem alteracoes em products, stock, pedidos, perfis fiscais ou Bling.
create table if not exists public.si5_research_config (
 id boolean primary key default true check (id),
 enabled boolean not null default false,
 daily_limit smallint not null default 100 check(daily_limit between 1 and 100),
 max_batch smallint not null default 5 check(max_batch between 1 and 5),
 research_mode text not null default 'representatives_only'
    check(research_mode in ('representatives_only','full')),
 updated_at timestamptz not null default now()
);
insert into public.si5_research_config(id,enabled,daily_limit,max_batch,research_mode)
values(true,false,100,5,'representatives_only')
on conflict(id) do nothing;

create table if not exists public.si5_product_research (
 product_id uuid primary key references public.products(id) on delete cascade,
 gtin text not null,
 status text not null default 'pending'
    check(status in ('pending','reserved','review','not_found','retry','blocked')),
 identity_verified boolean not null default false,
 source_license_confirmed boolean not null default false,
 observed_fields text[] not null default '{}',
 proposed_attributes jsonb not null default '{}'::jsonb,
 response_summary jsonb not null default '{}'::jsonb,
 last_http_status int,
 last_error text,
 last_attempt_at timestamptz,
 retry_after timestamptz,
 researched_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists si5_product_research_status_idx
 on public.si5_product_research(status,retry_after,created_at);

create table if not exists public.si5_research_requests (
 id bigint generated always as identity primary key,
 quota_date date not null,
 quota_slot smallint not null check (quota_slot between 1 and 100),
 product_id uuid not null references public.products(id) on delete cascade,
 gtin text not null,
 state text not null default 'reserved'
    check(state in ('reserved','found','not_found','http_error','rate_limited','invalid_identity','network_error')),
 http_status integer,
 completed_at timestamptz,
 error_code text,
 created_at timestamptz not null default now(),
 unique(quota_date,quota_slot)
);
create index if not exists si5_research_requests_product_idx
 on public.si5_research_requests(product_id,created_at desc);

alter table public.si5_research_config enable row level security;
alter table public.si5_product_research enable row level security;
alter table public.si5_research_requests enable row level security;
revoke all on public.si5_research_config from public,anon,authenticated;
revoke all on public.si5_product_research from public,anon,authenticated;
revoke all on public.si5_research_requests from public,anon,authenticated;
grant select,insert,update on public.si5_research_config to service_role;
grant select,insert,update on public.si5_product_research to service_role;
grant select,insert,update on public.si5_research_requests to service_role;
grant usage,select on sequence public.si5_research_requests_id_seq to service_role;

create or replace function public.si5_research_reserve_next()
returns table(request_id bigint, selected_product_id uuid, selected_gtin text)
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
 cfg record;
 slot_count integer;
 chosen record;
 today_brasilia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
 select enabled,daily_limit,research_mode into cfg
 from public.si5_research_config where id=true for update;
 if not found or not cfg.enabled then return; end if;
 select count(*) into slot_count
 from public.si5_research_requests where quota_date=today_brasilia;
 if slot_count>=cfg.daily_limit then return; end if;

 -- Recolocar em espera reservas abandonadas sem devolver a franquia consumida.
 update public.si5_product_research r
 set status='retry',retry_after=now()+interval '24 hours',
     last_error='abandoned_reservation',updated_at=now()
 where r.status='reserved'
   and r.last_attempt_at<now()-interval '45 minutes';

 select r.product_id,r.gtin into chosen
 from public.si5_product_research r
 join public.products p on p.id=r.product_id
 left join public.cosmos_family_representatives_v2 rep
   on rep.representative_product_id=r.product_id
 where p.is_active and trim(p.gtin)=r.gtin
   and public.cosmos_gtin_valid(r.gtin)
   and (cfg.research_mode='full' or rep.representative_product_id is not null)
   and r.status in ('pending','retry')
   and (r.retry_after is null or r.retry_after<=now())
 order by case when rep.representative_product_id is not null then 0 else 1 end,
          r.created_at,r.product_id
 for update of r skip locked limit 1;
 if not found then return; end if;

 insert into public.si5_research_requests(quota_date,quota_slot,product_id,gtin)
 values(today_brasilia,slot_count+1,chosen.product_id,chosen.gtin)
 returning id into request_id;
 update public.si5_product_research set status='reserved',
    last_attempt_at=now(),updated_at=now()
 where product_id=chosen.product_id;
 selected_product_id:=chosen.product_id;
 selected_gtin:=chosen.gtin;
 return next;
end $$;
revoke all on function public.si5_research_reserve_next() from public,anon,authenticated;
grant execute on function public.si5_research_reserve_next() to service_role;

create or replace view public.si5_catalog_research_progress_v1
with (security_invoker=true)
as
select
 (select enabled from public.si5_research_config where id=true) as enabled,
 (select research_mode from public.si5_research_config where id=true) as research_mode,
 (select count(*) from public.si5_product_research)::integer as queue_total,
 (select count(*) from public.si5_product_research where status='pending')::integer as pending,
 (select count(*) from public.si5_product_research where status='review')::integer as ready_for_review,
 (select count(*) from public.si5_research_requests where quota_date=(now() at time zone 'America/Sao_Paulo')::date)::integer as api_attempts_today,
 (select count(*) from public.si5_research_requests)::integer as api_attempts_total;
revoke all on public.si5_catalog_research_progress_v1 from public,anon,authenticated;
grant select on public.si5_catalog_research_progress_v1 to service_role;

-- Visualizar divergências entre duas fontes, sem escolher vencedor automaticamente.
create or replace view public.catalog_external_evidence_compare_v1
with (security_invoker=true)
as
select s.product_id,p.name,p.gtin,
 s.status as si5_status,c.status as cosmos_status,
 s.proposed_attributes->>'ncm_candidate' si5_ncm,
 c.proposed_attributes->>'ncm_candidate' cosmos_ncm,
 s.proposed_attributes->>'cest_candidate' si5_cest,
 case when s.status='review' and c.status='review'
   and s.proposed_attributes->>'ncm_candidate'
       is distinct from c.proposed_attributes->>'ncm_candidate'
   then true else false end as ncm_conflict,
 false as fiscal_auto_approved
from public.si5_product_research s
join public.products p on p.id=s.product_id
left join public.cosmos_product_research c on c.product_id=s.product_id;
revoke all on public.catalog_external_evidence_compare_v1 from public,anon,authenticated;
grant select on public.catalog_external_evidence_compare_v1 to service_role;
