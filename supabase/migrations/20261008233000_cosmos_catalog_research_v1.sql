-- Cosmos: pesquisa por GTIN sem atualizar produtos ou fiscal automaticamente.
-- Instalar somente depois de revisar o PR, a licença e os segredos de acesso.
-- Todas as tabelas são privadas por RLS e o serviço opera por service_role.
create table if not exists public.cosmos_research_config (
 id boolean primary key default true check (id),
 enabled boolean not null default false,
 daily_limit smallint not null default 25 check (daily_limit between 1 and 25),
 max_batch smallint not null default 5 check (max_batch between 1 and 5),
 updated_at timestamptz not null default now()
);
insert into public.cosmos_research_config(id,enabled,daily_limit,max_batch)
values (true,false,25,5) on conflict (id) do nothing;

create table if not exists public.cosmos_catalog_families (
 id uuid primary key default gen_random_uuid(),
 brand text,
 product_type text,
 product_line text,
 presentation_key text,
 shared_attributes jsonb not null default '{}'::jsonb,
 evidence jsonb not null default '{}'::jsonb,
 verification_status text not null default 'candidate'
   check (verification_status in ('candidate','verified','rejected')),
 verified_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.cosmos_catalog_family_members (
 product_id uuid primary key references public.products(id) on delete cascade,
 family_id uuid not null references public.cosmos_catalog_families(id) on delete cascade,
 variant_attributes jsonb not null default '{}'::jsonb,
 status text not null default 'candidate'
   check (status in ('candidate','confirmed','rejected')),
 evidence jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists cosmos_family_members_by_family_idx
 on public.cosmos_catalog_family_members(family_id);

create table if not exists public.cosmos_product_research (
 product_id uuid primary key references public.products(id) on delete cascade,
 gtin text not null,
 candidate_cohort_key text, -- SOMENTE agrupamento exploratório, não equivale a família confirmada
 status text not null default 'pending'
   check (status in ('pending','reserved','review','not_found','retry','blocked')),
 response_summary jsonb not null default '{}'::jsonb,
 proposed_attributes jsonb not null default '{}'::jsonb,
 identity_verified boolean not null default false,
 source_license_confirmed boolean not null default false,
 last_http_status int,
 last_error text,
 last_attempt_at timestamptz,
 retry_after timestamptz,
 researched_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists cosmos_product_research_status_idx
 on public.cosmos_product_research(status, retry_after, created_at);

create table if not exists public.cosmos_research_requests (
 id bigint generated always as identity primary key,
 quota_date date not null,
 quota_slot smallint not null check (quota_slot between 1 and 25),
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
create index if not exists cosmos_research_requests_product_idx
 on public.cosmos_research_requests(product_id, created_at desc);

alter table public.cosmos_research_config enable row level security;
alter table public.cosmos_catalog_families enable row level security;
alter table public.cosmos_catalog_family_members enable row level security;
alter table public.cosmos_product_research enable row level security;
alter table public.cosmos_research_requests enable row level security;
revoke all on public.cosmos_research_config from anon, authenticated;
revoke all on public.cosmos_catalog_families from anon, authenticated;
revoke all on public.cosmos_catalog_family_members from anon, authenticated;
revoke all on public.cosmos_product_research from anon, authenticated;
revoke all on public.cosmos_research_requests from anon, authenticated;

-- Regras explícitas para que só o backend privilegiado acesse estas filas.
grant select,insert,update,delete on public.cosmos_research_config to service_role;
grant select,insert,update,delete on public.cosmos_catalog_families to service_role;
grant select,insert,update,delete on public.cosmos_catalog_family_members to service_role;
grant select,insert,update,delete on public.cosmos_product_research to service_role;
grant select,insert,update,delete on public.cosmos_research_requests to service_role;
grant usage,select on sequence public.cosmos_research_requests_id_seq to service_role;

-- Visualização da herança apenas dos atributos previamente homologados.
-- É uma sugestão de leitura, não faz qualquer UPDATE em produtos.
create or replace view public.cosmos_family_attribute_preview_v1
with (security_invoker=true)
as
select m.product_id, f.id as family_id,
  jsonb_strip_nulls(jsonb_build_object(
    'brand',f.shared_attributes->'brand',
    'product_type',f.shared_attributes->'product_type',
    'product_line',f.shared_attributes->'product_line',
    'category',f.shared_attributes->'category',
    'subcategory',f.shared_attributes->'subcategory',
    'packaging_type',f.shared_attributes->'packaging_type',
    'gpc',f.shared_attributes->'gpc'
  )) as shared_proposal,
  case when m.evidence->>'presentation_verified'='true'
       then f.shared_attributes->'dimensions_raw'
       else null end as dimensions_proposal,
  m.evidence as membership_evidence
from public.cosmos_catalog_families f
join public.cosmos_catalog_family_members m on m.family_id=f.id
where f.verification_status='verified' and m.status='confirmed';
revoke all on public.cosmos_family_attribute_preview_v1 from public,anon,authenticated;
grant select on public.cosmos_family_attribute_preview_v1 to service_role;

-- A chave de consulta da API é diferente da chave de autorização fiscal:
-- não há UPDATE em products, product_fiscal_profiles ou Bling nesta migração.
create or replace function public.cosmos_research_reserve_next()
returns table(request_id bigint, selected_product_id uuid, selected_gtin text)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
 cfg record;
 used_slots int;
 next_record record;
 local_day date := (now() at time zone 'America/Cuiaba')::date;
begin
 select enabled,daily_limit into cfg
 from public.cosmos_research_config where id=true for update;
 if not found or not cfg.enabled then return; end if;

 -- Refazer fila somente para produtos ativos com GTIN numérico de formato válido.
 -- Nenhum match é assumido usando apenas a semelhança dos nomes.
 insert into public.cosmos_product_research(product_id,gtin,candidate_cohort_key)
 select p.id,trim(p.gtin),
        lower(concat_ws('|',nullif(trim(p.brand),''),
          nullif(trim(coalesce(p.customer_subsubcategory,p.subcategory,'')),''),
          regexp_replace(coalesce(p.packaging,''),'\s+','','g')))
 from public.products p
 where p.is_active and trim(coalesce(p.gtin,'')) ~ '^[0-9]{8}([0-9]{4}([0-9]{1,2})?)?$'
   and not exists (select 1 from public.cosmos_product_research r where r.product_id=p.id)
 order by p.id limit 150
 on conflict (product_id) do nothing;

 -- Se a função caiu no meio da chamada, liberar o item para nova tentativa futura.
 update public.cosmos_product_research r set status='retry',
   retry_after=now()+interval '24 hours', updated_at=now(),last_error='abandoned_reservation'
 where r.status='reserved' and r.last_attempt_at<now()-interval '45 minutes';

 select count(*) into used_slots from public.cosmos_research_requests
 where quota_date=local_day;
 if used_slots >= cfg.daily_limit then return; end if;

 select r.product_id,r.gtin into next_record
 from public.cosmos_product_research r
 join public.products p on p.id=r.product_id
 where p.is_active and trim(p.gtin)=r.gtin
   and r.status in ('pending','retry')
   and (r.retry_after is null or r.retry_after <= now())
 order by case when p.is_active then 0 else 1 end, r.created_at, r.product_id
 for update of r skip locked limit 1;
 if not found then return; end if;

 insert into public.cosmos_research_requests(quota_date,quota_slot,product_id,gtin)
 values (local_day,used_slots+1,next_record.product_id,next_record.gtin)
 returning id into request_id;
 update public.cosmos_product_research
 set status='reserved',last_attempt_at=now(),updated_at=now()
 where product_id=next_record.product_id;
 selected_product_id:=next_record.product_id;
 selected_gtin:=next_record.gtin;
 return next;
end $$;
revoke all on function public.cosmos_research_reserve_next() from public, anon, authenticated;
grant execute on function public.cosmos_research_reserve_next() to service_role;

comment on table public.cosmos_catalog_families is
 'Famílias candidatas/validadas. Campos físicos só podem ser herdados mediante equivalência comprovada. NCM e CEST jamais são herdados automaticamente.';
comment on column public.cosmos_product_research.candidate_cohort_key is
 'Agrupamento fraco para revisão; não prova identidade de produto nem apresentação física.';