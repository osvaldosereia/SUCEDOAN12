begin;

create or replace function public.refresh_product_fiscal_observed_conflicts_v1()
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_ncm integer:=0;
  v_cest integer:=0;
  v_origin integer:=0;
  v_resolved integer:=0;
begin
  insert into public.product_fiscal_review_items(
    product_id,issue_code,severity,status,title,details,detected_by
  )
  select
    c.product_id,
    'ncm_evidence_conflict',
    'blocker',
    'open',
    'NCM diverge entre perfil fiscal e/ou evidências observadas',
    jsonb_build_object(
      'profile_ncm',c.profile_ncm,
      'evidence_ncm_consensus',c.ncm_consensus,
      'evidence_ncm_distinct_count',c.ncm_distinct_count,
      'evidence_count',c.evidence_count
    ),
    'observed_evidence_guard_r0_15'
  from public.product_fiscal_evidence_consensus_v1 c
  join public.products p on p.id=c.product_id and p.is_active
  where coalesce(c.ncm_conflict,false)
  on conflict (product_id,issue_code) where status in ('open','in_review')
  do update set
    severity='blocker',
    title=excluded.title,
    details=excluded.details,
    detected_by=excluded.detected_by,
    updated_at=now();
  get diagnostics v_ncm=row_count;

  insert into public.product_fiscal_review_items(
    product_id,issue_code,severity,status,title,details,detected_by
  )
  select
    c.product_id,
    'cest_evidence_conflict',
    'blocker',
    'open',
    'CEST diverge entre evidências observadas',
    jsonb_build_object(
      'profile_cest',c.profile_cest,
      'evidence_cest_consensus',c.cest_consensus,
      'evidence_cest_distinct_count',c.cest_distinct_count,
      'evidence_count',c.evidence_count
    ),
    'observed_evidence_guard_r0_15'
  from public.product_fiscal_evidence_consensus_v1 c
  join public.products p on p.id=c.product_id and p.is_active
  where coalesce(c.cest_conflict,false)
  on conflict (product_id,issue_code) where status in ('open','in_review')
  do update set
    severity='blocker',
    title=excluded.title,
    details=excluded.details,
    detected_by=excluded.detected_by,
    updated_at=now();
  get diagnostics v_cest=row_count;

  insert into public.product_fiscal_review_items(
    product_id,issue_code,severity,status,title,details,detected_by
  )
  select
    c.product_id,
    'origin_evidence_conflict',
    'blocker',
    'open',
    'Origem diverge entre perfil fiscal e/ou evidências observadas',
    jsonb_build_object(
      'profile_origin',c.profile_origin_code,
      'evidence_origin_consensus',c.origin_consensus,
      'evidence_origin_distinct_count',c.origin_distinct_count,
      'origin_variation',c.origin_variation,
      'evidence_count',c.evidence_count
    ),
    'observed_evidence_guard_r0_15'
  from public.product_fiscal_evidence_consensus_v1 c
  join public.products p on p.id=c.product_id and p.is_active
  where coalesce(c.origin_variation,false)
     or (
       c.origin_consensus is not null
       and c.profile_origin_code is not null
       and c.origin_consensus<>c.profile_origin_code
     )
  on conflict (product_id,issue_code) where status in ('open','in_review')
  do update set
    severity='blocker',
    title=excluded.title,
    details=excluded.details,
    detected_by=excluded.detected_by,
    updated_at=now();
  get diagnostics v_origin=row_count;

  with current_conditions as (
    select c.product_id,'ncm_evidence_conflict'::text issue_code
    from public.product_fiscal_evidence_consensus_v1 c
    join public.products p on p.id=c.product_id and p.is_active
    where coalesce(c.ncm_conflict,false)

    union all

    select c.product_id,'cest_evidence_conflict'::text
    from public.product_fiscal_evidence_consensus_v1 c
    join public.products p on p.id=c.product_id and p.is_active
    where coalesce(c.cest_conflict,false)

    union all

    select c.product_id,'origin_evidence_conflict'::text
    from public.product_fiscal_evidence_consensus_v1 c
    join public.products p on p.id=c.product_id and p.is_active
    where coalesce(c.origin_variation,false)
       or (
         c.origin_consensus is not null
         and c.profile_origin_code is not null
         and c.origin_consensus<>c.profile_origin_code
       )
  ),
  resolved as (
    update public.product_fiscal_review_items r
       set status='resolved',
           resolved_at=now(),
           resolution_note='Conflito entre evidências observadas deixou de existir.',
           updated_at=now()
     where r.detected_by='observed_evidence_guard_r0_15'
       and r.status in ('open','in_review')
       and r.issue_code in ('ncm_evidence_conflict','cest_evidence_conflict','origin_evidence_conflict')
       and not exists (
         select 1
         from current_conditions c
         where c.product_id=r.product_id
           and c.issue_code=r.issue_code
       )
    returning 1
  )
  select count(*) into v_resolved from resolved;

  perform public.refresh_product_fiscal_review_state_v1();

  return jsonb_build_object(
    'ok',true,
    'ncm_conflicts_touched',v_ncm,
    'cest_conflicts_touched',v_cest,
    'origin_conflicts_touched',v_origin,
    'resolved_stale',v_resolved,
    'external_write',false
  );
end;
$$;

revoke all on function public.refresh_product_fiscal_observed_conflicts_v1() from public;
grant execute on function public.refresh_product_fiscal_observed_conflicts_v1() to service_role;

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
    and coalesce(c.ncm_conflict,false)=false
    and coalesce(c.cest_conflict,false)=false
    and pf.origin_code is not null
    and c.origin_consensus is not null
    and coalesce(c.origin_variation,false)=false
    and c.origin_consensus=pf.origin_code
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
join public.product_fiscal_evidence_consensus_v1 c on c.product_id=p.id
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

comment on function public.refresh_product_fiscal_observed_conflicts_v1() is
  'Creates fail-closed review blockers for NCM, CEST and origin disagreements across observed fiscal evidence. Never mutates Bling.';
comment on view public.product_fiscal_strict_validation_preview_v1 is
  'Strict fiscal validation preview. R0.15 additionally requires non-conflicting observed evidence and origin consensus equal to the canonical profile.';

commit;
