begin;

create table if not exists public.fiscal_rule_sets (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null default 'MT',
  tax_kind text not null default 'ICMS_ST',
  version_key text not null,
  status text not null default 'draft'
    check (status in ('draft','active','retired')),
  source_title text,
  source_url text,
  legal_reference text,
  content_sha256 text,
  valid_from date,
  valid_to date,
  published_at timestamptz,
  activated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jurisdiction, tax_kind, version_key),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create table if not exists public.fiscal_st_rules_mt (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.fiscal_rule_sets(id) on delete cascade,
  segment_code text,
  segment_name text,
  cest text not null check (cest ~ '^[0-9]{7}$'),
  ncm text not null check (ncm ~ '^[0-9]{8}$'),
  legal_description text not null,
  qualifiers jsonb not null default '{}'::jsonb,
  valid_from date,
  valid_to date,
  status text not null default 'active'
    check (status in ('active','inactive','review_required')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create unique index if not exists fiscal_st_rules_mt_identity_uidx
  on public.fiscal_st_rules_mt (
    rule_set_id,
    coalesce(segment_code,''),
    cest,
    ncm,
    md5(legal_description)
  );

create index if not exists fiscal_st_rules_mt_lookup_idx
  on public.fiscal_st_rules_mt (ncm, cest, status);

create table if not exists public.product_fiscal_profiles (
  product_id uuid primary key references public.products(id) on delete cascade,
  ncm text check (ncm is null or ncm ~ '^[0-9]{8}$'),
  cest text check (cest is null or cest ~ '^[0-9]{7}$'),
  origin_code smallint check (origin_code is null or origin_code between 0 and 8),
  commercial_gtin text check (
    commercial_gtin is null
    or commercial_gtin ~ '^[0-9]{8}$'
    or commercial_gtin ~ '^[0-9]{12,14}$'
  ),
  tax_gtin text check (
    tax_gtin is null
    or tax_gtin ~ '^[0-9]{8}$'
    or tax_gtin ~ '^[0-9]{12,14}$'
  ),
  commercial_unit text,
  tax_unit text,
  fiscal_description text,
  tax_segment_code text,
  tax_segment_name text,
  tax_group_key text,
  st_status text not null default 'unknown'
    check (st_status in ('unknown','not_applicable','candidate','applicable','conflict')),
  matched_st_rule_id uuid references public.fiscal_st_rules_mt(id) on delete set null,
  classification_source text,
  classification_confidence numeric(5,4)
    check (
      classification_confidence is null
      or (classification_confidence >= 0 and classification_confidence <= 1)
    ),
  review_status text not null default 'pending'
    check (review_status in ('pending','auto_validated','human_validated','blocked','not_required')),
  validated_at timestamptz,
  validated_by uuid,
  rule_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_fiscal_profiles_ncm_idx
  on public.product_fiscal_profiles (ncm);

create index if not exists product_fiscal_profiles_cest_idx
  on public.product_fiscal_profiles (cest)
  where cest is not null;

create index if not exists product_fiscal_profiles_review_idx
  on public.product_fiscal_profiles (review_status, st_status);

create table if not exists public.product_fiscal_evidence (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  evidence_type text not null,
  source_name text,
  source_url text,
  document_key text,
  supplier_document text,
  gtin text,
  ncm text check (ncm is null or ncm ~ '^[0-9]{8}$'),
  cest text check (cest is null or cest ~ '^[0-9]{7}$'),
  origin_code smallint check (origin_code is null or origin_code between 0 and 8),
  cfop text check (cfop is null or cfop ~ '^[0-9]{4}$'),
  tax_code text,
  fiscal_description text,
  evidence_confidence numeric(5,4)
    check (
      evidence_confidence is null
      or (evidence_confidence >= 0 and evidence_confidence <= 1)
    ),
  observed_at timestamptz,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (length(trim(evidence_type)) > 0)
);

create index if not exists product_fiscal_evidence_product_idx
  on public.product_fiscal_evidence (product_id, observed_at desc nulls last, created_at desc);

create index if not exists product_fiscal_evidence_document_idx
  on public.product_fiscal_evidence (document_key)
  where document_key is not null;

create index if not exists product_fiscal_evidence_gtin_idx
  on public.product_fiscal_evidence (gtin)
  where gtin is not null;

create table if not exists public.product_fiscal_review_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  issue_code text not null,
  severity text not null default 'warning'
    check (severity in ('info','warning','blocker')),
  status text not null default 'open'
    check (status in ('open','in_review','resolved','dismissed')),
  title text not null,
  details jsonb not null default '{}'::jsonb,
  detected_by text not null default 'system',
  detected_at timestamptz not null default now(),
  assigned_to uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(issue_code)) > 0),
  check (length(trim(title)) > 0)
);

create unique index if not exists product_fiscal_review_items_open_uidx
  on public.product_fiscal_review_items (product_id, issue_code)
  where status in ('open','in_review');

create index if not exists product_fiscal_review_items_queue_idx
  on public.product_fiscal_review_items (status, severity, detected_at desc);

insert into public.product_fiscal_profiles (
  product_id,
  ncm,
  commercial_gtin,
  classification_source,
  review_status,
  st_status,
  metadata
)
select
  p.id,
  case
    when regexp_replace(coalesce(p.ncm,''), '\\D', '', 'g') ~ '^[0-9]{8}$'
      then regexp_replace(p.ncm, '\\D', '', 'g')
    else null
  end,
  case
    when regexp_replace(coalesce(p.gtin,''), '\\D', '', 'g') ~ '^[0-9]{8}$'
      or regexp_replace(coalesce(p.gtin,''), '\\D', '', 'g') ~ '^[0-9]{12,14}$'
      then regexp_replace(p.gtin, '\\D', '', 'g')
    else null
  end,
  'products_seed_r0_1',
  'pending',
  'unknown',
  jsonb_build_object(
    'seeded_from','products',
    'source_system',coalesce(p.source_system,'unknown')
  )
from public.products p
on conflict (product_id) do nothing;

create or replace view public.product_fiscal_readiness_v1
with (security_invoker = true)
as
select
  p.id as product_id,
  p.is_active,
  p.name,
  p.gtin as product_gtin,
  p.ncm as product_ncm,
  pf.ncm as fiscal_ncm,
  pf.cest,
  pf.origin_code,
  pf.commercial_gtin,
  pf.tax_gtin,
  pf.commercial_unit,
  pf.tax_unit,
  pf.st_status,
  pf.review_status,
  pf.classification_source,
  pf.classification_confidence,
  pf.validated_at,
  coalesce(ev.evidence_count,0)::bigint as evidence_count,
  ev.last_evidence_at,
  coalesce(rv.open_issue_count,0)::bigint as open_issue_count,
  (pf.ncm is not null) as ncm_present,
  (pf.origin_code is not null) as origin_present,
  (pf.cest is not null) as cest_present,
  (pf.st_status in ('not_applicable','applicable')) as st_decision_present,
  (
    pf.review_status in ('human_validated','not_required')
    and pf.st_status in ('not_applicable','applicable')
    and (pf.st_status <> 'applicable' or pf.cest is not null)
    and pf.origin_code is not null
  ) as fiscal_profile_validated
from public.products p
left join public.product_fiscal_profiles pf on pf.product_id = p.id
left join (
  select product_id, count(*) as evidence_count, max(coalesce(observed_at,created_at)) as last_evidence_at
  from public.product_fiscal_evidence
  group by product_id
) ev on ev.product_id = p.id
left join (
  select product_id, count(*) as open_issue_count
  from public.product_fiscal_review_items
  where status in ('open','in_review')
  group by product_id
) rv on rv.product_id = p.id;

alter table public.fiscal_rule_sets enable row level security;
alter table public.fiscal_st_rules_mt enable row level security;
alter table public.product_fiscal_profiles enable row level security;
alter table public.product_fiscal_evidence enable row level security;
alter table public.product_fiscal_review_items enable row level security;

revoke all on table public.fiscal_rule_sets from anon, authenticated;
revoke all on table public.fiscal_st_rules_mt from anon, authenticated;
revoke all on table public.product_fiscal_profiles from anon, authenticated;
revoke all on table public.product_fiscal_evidence from anon, authenticated;
revoke all on table public.product_fiscal_review_items from anon, authenticated;
revoke all on table public.product_fiscal_readiness_v1 from anon, authenticated;

grant select, insert, update, delete on table public.fiscal_rule_sets to service_role;
grant select, insert, update, delete on table public.fiscal_st_rules_mt to service_role;
grant select, insert, update, delete on table public.product_fiscal_profiles to service_role;
grant select, insert, update, delete on table public.product_fiscal_evidence to service_role;
grant select, insert, update, delete on table public.product_fiscal_review_items to service_role;
grant select on table public.product_fiscal_readiness_v1 to service_role;

comment on table public.product_fiscal_profiles is
  'Canonical per-product fiscal identity and classification for Dona Antonia. Operational CFOP/CSOSN remain transaction/Natureza-de-Operacao concerns.';
comment on table public.product_fiscal_evidence is
  'Evidence ledger for fiscal classification. Evidence never overwrites product fiscal truth by itself.';
comment on table public.product_fiscal_review_items is
  'Human/system review queue for fiscal conflicts and incomplete classifications.';
comment on table public.fiscal_rule_sets is
  'Versioned legal rule-set registry. No rule becomes active merely by being inserted.';
comment on table public.fiscal_st_rules_mt is
  'Versioned Mato Grosso ICMS-ST classification rows keyed by rule set, NCM, CEST, segment and legal description.';

commit;
