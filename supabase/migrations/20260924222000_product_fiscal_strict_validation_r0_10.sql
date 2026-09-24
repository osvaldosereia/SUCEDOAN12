begin;

create table if not exists public.fiscal_rule_validation_policy (
  rule_id uuid primary key references public.fiscal_st_rules_mt(id) on delete cascade,
  validation_tier text not null default 'manual_only'
    check (validation_tier in ('strict_auto','manual_only')),
  allowed_categories text[] not null default '{}'::text[],
  verified_on date,
  source_url text,
  rationale text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fiscal_rule_validation_policy enable row level security;
revoke all on table public.fiscal_rule_validation_policy from anon, authenticated;
grant select,insert,update,delete on table public.fiscal_rule_validation_policy to service_role;

with wanted(cest,categories,rationale) as (
  values
  ('2001700',array['SHAMPOO E CONDICIONADOR','BEBÊ','HIGIENE','BELEZA']::text[],'NCM exato e descrição específica de xampu.'),
  ('2002000',array['BELEZA']::text[],'NCM exato e descrição específica de máscara/finalizador/tratamento capilar.'),
  ('2002100',array['SHAMPOO E CONDICIONADOR','BEBÊ']::text[],'NCM exato e descrição específica de condicionador.'),
  ('2002300',array['HIGIENE']::text[],'NCM exato e descrição específica de dentifrício.'),
  ('2002700',array['DESODORANTE']::text[],'NCM exato com exclusão explícita de antiperspirante/hidratante.'),
  ('2002800',array['DESODORANTE','HIGIENE PESSOAL']::text[],'NCM exato e descrição específica de antiperspirante líquido.'),
  ('2002900',array['DESODORANTE']::text[],'NCM exato e descrição específica de outros desodorantes.'),
  ('2003000',array['DESODORANTE']::text[],'NCM exato e descrição específica de outros antiperspirantes.'),
  ('2003400',array['SABONETE','BEBÊ']::text[],'NCM exato e descrição de sabonete de toucador, excluindo lenços.'),
  ('2003401',array['BEBÊ']::text[],'NCM exato e descrição específica de lenços umedecidos.'),
  ('2003700',array['SABONETE','BEBÊ','BELEZA']::text[],'NCM exato e descrição específica de lavagem da pele líquida/creme.'),
  ('2004200',array['HIGIENE']::text[],'NCM exato e descrição específica de papel higiênico folha simples.'),
  ('2004300',array['HIGIENE']::text[],'NCM exato e descrição específica de papel higiênico folha dupla/tripla.'),
  ('2005000',array['HIGIENE']::text[],'NCM exato e descrição específica de absorvente higiênico externo.'),
  ('2005800',array['HIGIENE']::text[],'NCM exato e descrição específica de escova dental.'),
  ('1701200',array['CAFÉ DA MANHÃ']::text[],'Descrição específica de leite em pó e categoria coerente.'),
  ('1706500',array['MERCEARIA BÁSICA']::text[],'NCM exato de óleo de soja refinado e descrição específica.'),
  ('1709800',array['CAFÉ DA MANHÃ']::text[],'Posição NCM de mate com descrição específica.'),
  ('2001600',array['BELEZA']::text[],'NCM exato e descrição específica de preparação solar/antissolar.')
)
insert into public.fiscal_rule_validation_policy(
  rule_id,validation_tier,allowed_categories,verified_on,source_url,rationale,metadata
)
select
  r.id,
  'strict_auto',
  w.categories,
  date '2026-09-24',
  'https://app1.sefaz.mt.gov.br/Sistema/legislacao/legislacaotribut.nsf/07fa81bed2760c6b84256710004d3940/4c7283a0b4318486042584c4004436c1',
  w.rationale,
  jsonb_build_object(
    'policy_version','r0_10',
    'requires_bling_ncm_evidence',true,
    'requires_valid_gtin',true,
    'requires_origin_consensus',true,
    'requires_unique_legal_match',true,
    'external_write',false
  )
from wanted w
join public.fiscal_rule_sets rs
  on rs.jurisdiction='MT'
 and rs.tax_kind='ICMS_ST'
 and rs.version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
join public.fiscal_st_rules_mt r
  on r.rule_set_id=rs.id
 and r.cest=w.cest
on conflict (rule_id) do update set
  validation_tier=excluded.validation_tier,
  allowed_categories=excluded.allowed_categories,
  verified_on=excluded.verified_on,
  source_url=excluded.source_url,
  rationale=excluded.rationale,
  metadata=excluded.metadata,
  updated_at=now();

create or replace view public.product_fiscal_strict_validation_preview_v1
with (security_invoker = true)
as
select
  p.id as product_id,
  p.name,
  p.category,
  p.gtin,
  s.ncm,
  pf.origin_code,
  r.id as rule_id,
  r.cest as rule_cest,
  r.segment_code,
  r.segment_name,
  r.legal_description,
  rs.version_key as rule_version,
  vp.source_url,
  vp.rationale,
  s.cest_consensus as evidence_cest,
  s.ncm_consensus as evidence_ncm,
  s.bling_evidence_count,
  s.supplier_xml_cest_count,
  s.open_blockers,
  s.gtin_status,
  (
    p.is_active
    and vp.validation_tier='strict_auto'
    and s.legal_rule_match_count=1
    and s.open_blockers=0
    and s.gtin_status='valid'
    and s.bling_evidence_count>0
    and s.ncm_consensus=s.ncm
    and pf.origin_code is not null
    and (s.cest_consensus is null or s.cest_consensus=r.cest)
    and upper(trim(coalesce(p.category,'')))=any(vp.allowed_categories)
    and not exists (
      select 1
      from public.product_fiscal_review_items ri
      where ri.product_id=p.id
        and ri.status in ('open','in_review')
        and ri.issue_code in (
          'ncm_evidence_conflict',
          'cest_evidence_conflict',
          'cest_rule_mismatch',
          'origin_evidence_conflict',
          'gtin_invalid',
          'legal_rule_ambiguous'
        )
    )
  ) as validation_eligible
from public.products p
join public.product_fiscal_profiles pf on pf.product_id=p.id
join public.product_fiscal_catalog_scan_v1 s on s.product_id=p.id
join public.fiscal_rule_sets rs
  on rs.jurisdiction='MT'
 and rs.tax_kind='ICMS_ST'
 and rs.status in ('draft','active')
join public.fiscal_st_rules_mt r
  on r.rule_set_id=rs.id
 and r.status='active'
 and r.ncm_prefix is not null
 and s.ncm is not null
 and left(s.ncm,length(r.ncm_prefix))=r.ncm_prefix
 and public.fiscal_rule_description_matches_v1(
   coalesce(nullif(pf.fiscal_description,''),nullif(p.description_long,''),nullif(p.description_short,''),p.name),
   r.qualifiers
 )
join public.fiscal_rule_validation_policy vp
  on vp.rule_id=r.id
 and vp.validation_tier='strict_auto'
where s.legal_rule_match_count=1;

revoke all on table public.product_fiscal_strict_validation_preview_v1 from anon, authenticated;
grant select on table public.product_fiscal_strict_validation_preview_v1 to service_role;

create or replace function public.apply_product_fiscal_strict_validation_v1()
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_evidence integer:=0;
  v_profiles integer:=0;
begin
  insert into public.product_fiscal_evidence(
    evidence_key,
    product_id,
    evidence_type,
    source_name,
    source_url,
    gtin,
    ncm,
    cest,
    origin_code,
    fiscal_description,
    evidence_confidence,
    observed_at,
    evidence_payload
  )
  select
    'official_mt_rule:'||v.rule_id::text||':'||v.product_id::text,
    v.product_id,
    'official_mt_legal_rule',
    'SEFAZ-MT - RICMS/MT Anexo X',
    v.source_url,
    regexp_replace(coalesce(v.gtin,''),'\D','','g'),
    v.ncm,
    v.rule_cest,
    v.origin_code,
    v.name,
    0.9900,
    now(),
    jsonb_build_object(
      'rule_id',v.rule_id,
      'rule_version',v.rule_version,
      'segment_code',v.segment_code,
      'segment_name',v.segment_name,
      'legal_description',v.legal_description,
      'validation_policy','strict_auto_r0_10',
      'category',v.category,
      'bling_evidence_count',v.bling_evidence_count,
      'supplier_xml_cest_count',v.supplier_xml_cest_count,
      'external_write',false
    )
  from public.product_fiscal_strict_validation_preview_v1 v
  where v.validation_eligible
  on conflict (evidence_key) do update set
    source_url=excluded.source_url,
    ncm=excluded.ncm,
    cest=excluded.cest,
    origin_code=excluded.origin_code,
    fiscal_description=excluded.fiscal_description,
    evidence_confidence=excluded.evidence_confidence,
    observed_at=excluded.observed_at,
    evidence_payload=excluded.evidence_payload;
  get diagnostics v_evidence=row_count;

  with eligible as (
    select *
    from public.product_fiscal_strict_validation_preview_v1
    where validation_eligible
  ),
  upd as (
    update public.product_fiscal_profiles pf
       set cest=e.rule_cest,
           st_status='applicable',
           matched_st_rule_id=e.rule_id,
           tax_segment_code=e.segment_code,
           tax_segment_name=e.segment_name,
           fiscal_description=coalesce(nullif(pf.fiscal_description,''),e.name),
           classification_source='official_mt_rule+bling_ncm+origin_consensus',
           classification_confidence=0.9900,
           review_status='auto_validated',
           validated_at=now(),
           rule_version=e.rule_version,
           metadata=coalesce(pf.metadata,'{}'::jsonb) || jsonb_build_object(
             'strict_validation_policy','r0_10',
             'strict_validation_at',now(),
             'strict_validation_rule_id',e.rule_id,
             'strict_validation_source_url',e.source_url
           ),
           updated_at=now()
      from eligible e
     where pf.product_id=e.product_id
       and pf.review_status not in ('blocked','human_validated')
    returning pf.product_id
  )
  select count(*) into v_profiles from upd;

  return jsonb_build_object(
    'ok',true,
    'evidence_rows_upserted',v_evidence,
    'profiles_auto_validated',v_profiles,
    'external_write',false,
    'bling_mutations',0
  );
end;
$$;

revoke all on function public.apply_product_fiscal_strict_validation_v1() from public;
grant execute on function public.apply_product_fiscal_strict_validation_v1() to service_role;

comment on table public.fiscal_rule_validation_policy is
  'Allowlist for fiscal auto-validation. Rules not explicitly strict_auto remain manual-only.';
comment on view public.product_fiscal_strict_validation_preview_v1 is
  'Fail-closed preview for strict fiscal auto-validation. Requires unique legal rule, valid GTIN, matching Bling NCM, stable origin, coherent category and zero blockers.';
comment on function public.apply_product_fiscal_strict_validation_v1() is
  'Validates only allowlisted strict fiscal profiles internally. Never writes to products or Bling.';

commit;
