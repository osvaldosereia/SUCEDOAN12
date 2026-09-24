begin;

update public.fiscal_st_rules_mt r
set
  qualifiers='{"include_any":["detergente em po","detergente em pó","detergente granulado","detergente em flocos"]}'::jsonb,
  updated_at=now()
from public.fiscal_rule_sets rs
where r.rule_set_id=rs.id
  and rs.version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
  and r.cest='1100400';

update public.fiscal_st_rules_mt r
set
  qualifiers='{"include_all":["detergente"],"exclude_any":["lava roupa","lava roupas","detergente em po","detergente em pó","detergente granulado","detergente em flocos"]}'::jsonb,
  updated_at=now()
from public.fiscal_rule_sets rs
where r.rule_set_id=rs.id
  and rs.version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
  and r.cest='1100500';

update public.fiscal_st_rules_mt r
set
  qualifiers='{"include_any":["lava roupa liquido","lava roupas liquido","lava-roupas liquido","lava-roupas líquido","detergente liquido para lavar roupa","detergente líquido para lavar roupa"]}'::jsonb,
  updated_at=now()
from public.fiscal_rule_sets rs
where r.rule_set_id=rs.id
  and rs.version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
  and r.cest='1100600';

update public.fiscal_st_rules_mt r
set
  qualifiers='{"include_any":["limpador","multiuso","limpeza"],"exclude_any":["detergente","lava roupa","lava roupas","sabao","sabão","amaciante","suavizante","agua sanitaria","água sanitária","alvejante","branqueador"]}'::jsonb,
  updated_at=now()
from public.fiscal_rule_sets rs
where r.rule_set_id=rs.id
  and rs.version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
  and r.cest='1100700';

create or replace view public.product_fiscal_catalog_scan_v1
with (security_invoker = true)
as
select
  p.id as product_id,
  p.name,
  p.is_active,
  p.gtin,
  case
    when nullif(regexp_replace(coalesce(p.gtin,''),'\D','','g'),'') is null then 'missing'
    when public.fiscal_valid_gtin_v1(p.gtin) then 'valid'
    else 'invalid'
  end as gtin_status,
  pf.ncm,
  pf.cest,
  pf.origin_code,
  pf.st_status,
  pf.review_status,
  coalesce(c.evidence_count,0)::bigint as evidence_count,
  c.ncm_consensus,
  c.cest_consensus,
  c.origin_consensus,
  c.ncm_conflict,
  c.cest_conflict,
  coalesce(blockers.open_blockers,0)::bigint as open_blockers,
  coalesce(lm.rule_match_count,0)::bigint as legal_rule_match_count,
  lm.candidate_cests,
  case
    when coalesce(blockers.open_blockers,0)>0 or pf.review_status='blocked' or coalesce(c.ncm_conflict,false) or coalesce(c.cest_conflict,false)
      then 'blocker_conflict'
    when nullif(regexp_replace(coalesce(p.gtin,''),'\D','','g'),'') is not null
      and not public.fiscal_valid_gtin_v1(p.gtin)
      then 'gtin_invalid'
    when pf.ncm is null
      then 'ncm_missing'
    when coalesce(lm.rule_match_count,0)>1
      then 'legal_rule_ambiguous'
    when c.cest_consensus is not null and coalesce(lm.rule_match_count,0)=0
      then 'cest_evidence_unmapped'
    when pf.st_status='candidate'
      then 'candidate_needs_validation'
    when coalesce(lm.rule_match_count,0)=1 and coalesce(c.evidence_count,0)=0
      then 'legal_match_needs_evidence'
    when coalesce(c.evidence_count,0)>0 and c.origin_consensus is null
      then 'origin_evidence_missing'
    when nullif(regexp_replace(coalesce(p.gtin,''),'\D','','g'),'') is null
      then 'gtin_missing'
    when coalesce(c.evidence_count,0)=0
      then 'no_fiscal_evidence'
    else 'review_low_risk'
  end as risk_code,
  case
    when coalesce(blockers.open_blockers,0)>0 or pf.review_status='blocked' or coalesce(c.ncm_conflict,false) or coalesce(c.cest_conflict,false) then 100
    when nullif(regexp_replace(coalesce(p.gtin,''),'\D','','g'),'') is not null
      and not public.fiscal_valid_gtin_v1(p.gtin) then 90
    when pf.ncm is null then 90
    when coalesce(lm.rule_match_count,0)>1 then 85
    when c.cest_consensus is not null and coalesce(lm.rule_match_count,0)=0 then 80
    when pf.st_status='candidate' then 70
    when coalesce(lm.rule_match_count,0)=1 and coalesce(c.evidence_count,0)=0 then 65
    when coalesce(c.evidence_count,0)>0 and c.origin_consensus is null then 55
    when nullif(regexp_replace(coalesce(p.gtin,''),'\D','','g'),'') is null then 45
    when coalesce(c.evidence_count,0)=0 then 40
    else 20
  end as risk_score
from public.products p
join public.product_fiscal_profiles pf on pf.product_id=p.id
left join public.product_fiscal_evidence_consensus_v1 c on c.product_id=p.id
left join lateral (
  select count(*)::bigint as open_blockers
  from public.product_fiscal_review_items r
  where r.product_id=p.id
    and r.status in ('open','in_review')
    and r.severity='blocker'
) blockers on true
left join lateral (
  select
    count(*)::bigint as rule_match_count,
    array_agg(distinct r.cest order by r.cest) as candidate_cests
  from public.fiscal_rule_sets rs
  join public.fiscal_st_rules_mt r on r.rule_set_id=rs.id and r.status='active'
  where rs.jurisdiction='MT'
    and rs.tax_kind='ICMS_ST'
    and rs.status in ('draft','active')
    and pf.ncm is not null
    and r.ncm_prefix is not null
    and left(pf.ncm,length(r.ncm_prefix))=r.ncm_prefix
    and public.fiscal_rule_description_matches_v1(
      coalesce(nullif(pf.fiscal_description,''),nullif(p.description_long,''),nullif(p.description_short,''),p.name),
      r.qualifiers
    )
) lm on true;

create or replace function public.get_product_fiscal_catalog_scan_summary_v1()
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
  select jsonb_build_object(
    'ok',true,
    'active_products',count(*) filter (where is_active),
    'blocker_conflict',count(*) filter (where is_active and risk_code='blocker_conflict'),
    'gtin_invalid',count(*) filter (where is_active and risk_code='gtin_invalid'),
    'gtin_missing',count(*) filter (where is_active and risk_code='gtin_missing'),
    'legal_rule_ambiguous',count(*) filter (where is_active and risk_code='legal_rule_ambiguous'),
    'cest_evidence_unmapped',count(*) filter (where is_active and risk_code='cest_evidence_unmapped'),
    'candidate_needs_validation',count(*) filter (where is_active and risk_code='candidate_needs_validation'),
    'legal_match_needs_evidence',count(*) filter (where is_active and risk_code='legal_match_needs_evidence'),
    'no_fiscal_evidence',count(*) filter (where is_active and risk_code='no_fiscal_evidence')
  )
  from public.product_fiscal_catalog_scan_v1;
$$;

commit;
