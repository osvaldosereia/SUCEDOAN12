begin;

alter table public.product_fiscal_evidence
  add column if not exists evidence_key text;

update public.product_fiscal_evidence
set evidence_key='legacy_existing:'||id::text
where evidence_key is null;

alter table public.product_fiscal_evidence
  alter column evidence_key set not null;

create unique index if not exists product_fiscal_evidence_key_uidx
  on public.product_fiscal_evidence (evidence_key);

insert into public.product_fiscal_evidence (
  evidence_key,
  product_id,
  evidence_type,
  source_name,
  gtin,
  ncm,
  cest,
  origin_code,
  cfop,
  fiscal_description,
  observed_at,
  evidence_payload
)
select
  'legacy_product_snapshot:'||p.id::text,
  p.id,
  'legacy_product_snapshot',
  'firebase_snapshot',
  case
    when regexp_replace(coalesce(p.gtin,''),'\D','','g') ~ '^[0-9]{8}$'
      or regexp_replace(coalesce(p.gtin,''),'\D','','g') ~ '^[0-9]{12,14}$'
      then regexp_replace(p.gtin,'\D','','g')
    else null
  end,
  case
    when regexp_replace(coalesce(p.firebase_snapshot->>'ncm',p.ncm,''),'\D','','g') ~ '^[0-9]{8}$'
      then regexp_replace(coalesce(p.firebase_snapshot->>'ncm',p.ncm),'\D','','g')
    else null
  end,
  case
    when regexp_replace(coalesce(p.firebase_snapshot->>'cest',''),'\D','','g') ~ '^[0-9]{7}$'
      then regexp_replace(p.firebase_snapshot->>'cest','\D','','g')
    else null
  end,
  case
    when coalesce(p.firebase_snapshot->>'origem_tributaria','') ~ '^[0-8]$'
      then (p.firebase_snapshot->>'origem_tributaria')::smallint
    else null
  end,
  case
    when regexp_replace(coalesce(p.firebase_snapshot->>'cfop',''),'\D','','g') ~ '^[0-9]{4}$'
      then regexp_replace(p.firebase_snapshot->>'cfop','\D','','g')
    else null
  end,
  nullif(coalesce(p.firebase_snapshot->>'descricao_fiscal',p.firebase_snapshot->>'descricao',p.description_long,p.description_short,p.name),''),
  coalesce(p.updated_at,p.created_at,now()),
  jsonb_strip_nulls(jsonb_build_object(
    'source','legacy_firebase_snapshot',
    'legacy_cest',nullif(p.firebase_snapshot->>'cest',''),
    'legacy_cfop',nullif(p.firebase_snapshot->>'cfop',''),
    'legacy_origin',nullif(p.firebase_snapshot->>'origem_tributaria',''),
    'legacy_ncm',nullif(p.firebase_snapshot->>'ncm','')
  ))
from public.products p
where
  regexp_replace(coalesce(p.firebase_snapshot->>'cest',''),'\D','','g') ~ '^[0-9]{7}$'
  or coalesce(p.firebase_snapshot->>'origem_tributaria','') ~ '^[0-8]$'
  or regexp_replace(coalesce(p.firebase_snapshot->>'cfop',''),'\D','','g') ~ '^[0-9]{4}$'
on conflict (evidence_key) do nothing;

create or replace view public.product_fiscal_evidence_consensus_v1
with (security_invoker = true)
as
select
  p.id as product_id,
  p.is_active,
  p.name,
  p.gtin as product_gtin,
  pf.ncm as profile_ncm,
  pf.cest as profile_cest,
  pf.origin_code as profile_origin_code,
  count(e.id)::bigint as evidence_count,
  count(distinct e.document_key) filter (where e.document_key is not null)::bigint as document_count,
  count(distinct e.ncm) filter (where e.ncm is not null)::bigint as ncm_distinct_count,
  case when count(distinct e.ncm) filter (where e.ncm is not null)=1
       then min(e.ncm) filter (where e.ncm is not null) end as ncm_consensus,
  count(distinct e.cest) filter (where e.cest is not null)::bigint as cest_distinct_count,
  case when count(distinct e.cest) filter (where e.cest is not null)=1
       then min(e.cest) filter (where e.cest is not null) end as cest_consensus,
  count(distinct e.origin_code) filter (where e.origin_code is not null)::bigint as origin_distinct_count,
  case when count(distinct e.origin_code) filter (where e.origin_code is not null)=1
       then min(e.origin_code) filter (where e.origin_code is not null) end as origin_consensus,
  max(coalesce(e.observed_at,e.created_at)) as last_evidence_at,
  (
    count(distinct e.ncm) filter (where e.ncm is not null) > 1
    or (
      pf.ncm is not null
      and exists (
        select 1 from public.product_fiscal_evidence ex
        where ex.product_id=p.id and ex.ncm is not null and ex.ncm<>pf.ncm
      )
    )
  ) as ncm_conflict,
  (count(distinct e.cest) filter (where e.cest is not null) > 1) as cest_conflict,
  (count(distinct e.origin_code) filter (where e.origin_code is not null) > 1) as origin_variation
from public.products p
left join public.product_fiscal_profiles pf on pf.product_id=p.id
left join public.product_fiscal_evidence e on e.product_id=p.id
group by p.id,p.is_active,p.name,p.gtin,pf.ncm,pf.cest,pf.origin_code;

revoke all on table public.product_fiscal_evidence_consensus_v1 from anon, authenticated;
grant select on table public.product_fiscal_evidence_consensus_v1 to service_role;

comment on column public.product_fiscal_evidence.evidence_key is
  'Deterministic idempotency key for fiscal evidence ingestion.';
comment on view public.product_fiscal_evidence_consensus_v1 is
  'Read-only evidence consensus. Consensus is evidence, not automatic fiscal truth.';

commit;
