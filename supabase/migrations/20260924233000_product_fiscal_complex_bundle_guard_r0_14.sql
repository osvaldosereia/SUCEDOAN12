begin;

insert into public.product_fiscal_evidence(
  evidence_key,
  product_id,
  evidence_type,
  source_name,
  source_url,
  gtin,
  ncm,
  cest,
  fiscal_description,
  evidence_confidence,
  observed_at,
  evidence_payload
)
select
  'web_product_catalog:7897042020324:comercial_souza:2026-09-24',
  p.id,
  'web_product_catalog',
  'Comercial Souza Atacado',
  'https://www.comercialsouzaatacado.com.br/marcas/skala/kit-skala-shampoo-325ml-condicionador-200ml-uva-cx-com-3-un-prd.html',
  '7897042020324',
  '33051000',
  '2001700',
  'Kit Skala Shampoo 325 ml + Condicionador 200 ml Uva',
  0.9500,
  now(),
  jsonb_build_object(
    'retrieved_on','2026-09-24',
    'source_kind','commercial_distributor_catalog',
    'source_reported_ean','7897042020324',
    'source_reported_ncm','3305.10.00',
    'source_reported_cest','2001700',
    'review_note','Evidência externa independente para kit/combo; não define origem tributária.'
  )
from public.products p
where regexp_replace(coalesce(p.gtin,''),'\D','','g')='7897042020324'
limit 1
on conflict (evidence_key) do update set
  source_url=excluded.source_url,
  ncm=excluded.ncm,
  cest=excluded.cest,
  fiscal_description=excluded.fiscal_description,
  evidence_confidence=excluded.evidence_confidence,
  observed_at=excluded.observed_at,
  evidence_payload=excluded.evidence_payload;

create or replace view public.product_fiscal_complex_bundle_v1
with (security_invoker = true)
as
select
  p.id as product_id,
  p.name,
  p.gtin,
  p.ncm as product_ncm,
  pf.ncm as fiscal_ncm,
  pf.cest as fiscal_cest,
  pf.review_status,
  pf.st_status,
  (
    public.fiscal_normalize_text_v1(p.name) ~ '(^| )kit( |$)'
    or public.fiscal_normalize_text_v1(p.name) ~ '(^| )combo( |$)'
  ) as is_complex_bundle,
  coalesce(ev.independent_evidence_count,0)::bigint as independent_evidence_count,
  coalesce(ev.matching_fiscal_evidence_count,0)::bigint as matching_fiscal_evidence_count,
  coalesce(ev.evidence_types,'{}'::text[]) as independent_evidence_types,
  (
    coalesce(ev.matching_fiscal_evidence_count,0)>0
  ) as independently_supported
from public.products p
join public.product_fiscal_profiles pf on pf.product_id=p.id
left join lateral (
  select
    count(*)::bigint as independent_evidence_count,
    count(*) filter (
      where e.ncm=pf.ncm
        and e.cest=pf.cest
    )::bigint as matching_fiscal_evidence_count,
    array_agg(distinct e.evidence_type order by e.evidence_type) as evidence_types
  from public.product_fiscal_evidence e
  where e.product_id=p.id
    and e.evidence_type in (
      'supplier_nfe_xml',
      'manufacturer_catalog',
      'web_product_catalog'
    )
) ev on true;

revoke all on table public.product_fiscal_complex_bundle_v1 from anon, authenticated;
grant select on table public.product_fiscal_complex_bundle_v1 to service_role;

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
    and (
      not (
        public.fiscal_normalize_text_v1(p.name) ~ '(^| )kit( |$)'
        or public.fiscal_normalize_text_v1(p.name) ~ '(^| )combo( |$)'
      )
      or exists (
        select 1
        from public.product_fiscal_evidence ce
        where ce.product_id=p.id
          and ce.evidence_type in ('supplier_nfe_xml','manufacturer_catalog','web_product_catalog')
          and ce.ncm=s.ncm
          and ce.cest=r.cest
      )
    )
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
          'legal_rule_ambiguous',
          'complex_bundle_needs_evidence'
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

create or replace function public.refresh_product_fiscal_complex_bundle_guard_v1()
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_opened integer:=0;
  v_downgraded integer:=0;
  v_resolved integer:=0;
begin
  insert into public.product_fiscal_review_items(
    product_id,issue_code,severity,status,title,details,detected_by
  )
  select
    c.product_id,
    'complex_bundle_needs_evidence',
    'warning',
    'open',
    'Kit/combo exige evidência fiscal independente',
    jsonb_build_object(
      'gtin',c.gtin,
      'ncm',c.fiscal_ncm,
      'cest_candidate',c.fiscal_cest,
      'independent_evidence_count',c.independent_evidence_count,
      'policy','complex_bundle_r0_14'
    ),
    'complex_bundle_r0_14'
  from public.product_fiscal_complex_bundle_v1 c
  join public.products p on p.id=c.product_id
  where p.is_active
    and c.is_complex_bundle
    and not c.independently_supported
    and c.review_status='auto_validated'
  on conflict (product_id,issue_code) where status in ('open','in_review')
  do update set
    severity=excluded.severity,
    title=excluded.title,
    details=excluded.details,
    detected_by=excluded.detected_by,
    updated_at=now();
  get diagnostics v_opened=row_count;

  with upd as (
    update public.product_fiscal_profiles pf
       set review_status='pending',
           st_status=case when pf.st_status='applicable' then 'candidate' else pf.st_status end,
           validated_at=null,
           classification_source='strict_validation_revoked_complex_bundle',
           classification_confidence=least(coalesce(pf.classification_confidence,0.8000),0.8000),
           metadata=coalesce(pf.metadata,'{}'::jsonb) || jsonb_build_object(
             'complex_bundle_guard','r0_14',
             'complex_bundle_guard_at',now(),
             'complex_bundle_requires_independent_evidence',true
           ),
           updated_at=now()
      from public.product_fiscal_complex_bundle_v1 c
     where pf.product_id=c.product_id
       and c.is_complex_bundle
       and not c.independently_supported
       and pf.review_status='auto_validated'
    returning pf.product_id
  )
  select count(*) into v_downgraded from upd;

  with resolved as (
    update public.product_fiscal_review_items r
       set status='resolved',
           resolved_at=now(),
           resolution_note='Kit/combo passou a ter evidência fiscal independente compatível.',
           updated_at=now()
     where r.issue_code='complex_bundle_needs_evidence'
       and r.detected_by='complex_bundle_r0_14'
       and r.status in ('open','in_review')
       and exists (
         select 1
         from public.product_fiscal_complex_bundle_v1 c
         where c.product_id=r.product_id
           and c.independently_supported
       )
    returning 1
  )
  select count(*) into v_resolved from resolved;

  return jsonb_build_object(
    'ok',true,
    'review_items_touched',v_opened,
    'profiles_downgraded',v_downgraded,
    'resolved_supported',v_resolved,
    'external_write',false
  );
end;
$$;

revoke all on function public.refresh_product_fiscal_complex_bundle_guard_v1() from public;
grant execute on function public.refresh_product_fiscal_complex_bundle_guard_v1() to service_role;

comment on view public.product_fiscal_complex_bundle_v1 is
  'Detects kits/combos and requires independent fiscal evidence before strict auto-validation.';
comment on function public.refresh_product_fiscal_complex_bundle_guard_v1() is
  'Downgrades unsupported auto-validated kits/combos to pending candidate status. Never mutates products or Bling.';

commit;
