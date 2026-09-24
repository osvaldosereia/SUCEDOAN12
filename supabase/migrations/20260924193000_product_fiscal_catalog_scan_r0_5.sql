begin;

with rs as (
  select id from public.fiscal_rule_sets
  where jurisdiction='MT' and tax_kind='ICMS_ST'
    and version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
),
seed(segment_code,segment_name,cest,ncm_legal_text,ncm_prefix,legal_description,qualifiers) as (
  values
  ('11','Materiais de limpeza','1100100','2828.90.11 / 2828.90.19 / 3206.41.00 / 3402.20.00 / 3808.94.19','3402',
   'Água sanitária, branqueador e outros alvejantes.',
   '{"include_any":["agua sanitaria","alvejante","branqueador"]}'::jsonb),
  ('11','Materiais de limpeza','1100400','3402.20.00','3402',
   'Detergentes em pó, flocos, palhetas, grânulos ou outras formas semelhantes.',
   '{"include_all":["detergente"],"include_any":["po","pó","granulado","flocos"]}'::jsonb),
  ('11','Materiais de limpeza','1100500','3402.20.00','3402',
   'Detergentes líquidos, exceto para lavar roupa.',
   '{"include_all":["detergente"],"exclude_any":["lava roupa","lava roupas","roupa","roupas","em po","em pó"]}'::jsonb),
  ('11','Materiais de limpeza','1100600','3402.20.00','3402',
   'Detergente líquido para lavar roupa.',
   '{"include_all":["detergente"],"include_any":["lava roupa","lava roupas","roupa","roupas"]}'::jsonb),
  ('11','Materiais de limpeza','1100800','3809.91.90','38099190',
   'Amaciante/suavizante.',
   '{"include_any":["amaciante","suavizante"]}'::jsonb),

  ('20','Perfumaria, higiene pessoal e cosméticos','2001500','3304.99.90','33049990',
   'Outros produtos de beleza ou de maquiagem preparados e preparações para conservação ou cuidados da pele, exceto preparações solares e antissolares.',
   '{"exclude_any":["protetor solar","antissolar","solar","bronzeador"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2001600','3304.99.90','33049990',
   'Preparações solares e antissolares.',
   '{"include_any":["protetor solar","antissolar","solar","bronzeador"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2002700','3307.20.10','33072010',
   'Desodorantes corporais líquidos, exceto loções/óleos desodorantes hidratantes.',
   '{"include_any":["desodorante"],"exclude_any":["antiperspirante","antitranspirante","hidratante"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2002900','3307.20.90','33072090',
   'Outros desodorantes corporais, exceto loções/óleos desodorantes hidratantes.',
   '{"include_any":["desodorante"],"exclude_any":["antiperspirante","antitranspirante","hidratante"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2003000','3307.20.90','33072090',
   'Outros antiperspirantes.',
   '{"include_any":["antiperspirante","antitranspirante"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2003400','3401.11.90','34011190',
   'Sabões de toucador em barras, pedaços ou figuras moldados, exceto lenços umedecidos.',
   '{"include_any":["sabonete","sabao de toucador","sabão de toucador"],"exclude_any":["lenco umedecido","lenço umedecido"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2003401','3401.11.90','34011190',
   'Lenços umedecidos.',
   '{"include_any":["lenco umedecido","lenço umedecido"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2004300','4818.10.00','48181000',
   'Papel higiênico - folha dupla e tripla.',
   '{"include_all":["papel higienico"],"include_any":["folha dupla","folha tripla","dupla","tripla"]}'::jsonb)
)
insert into public.fiscal_st_rules_mt (
  rule_set_id,segment_code,segment_name,cest,ncm,ncm_legal_text,ncm_prefix,
  match_mode,legal_description,qualifiers,status,metadata
)
select
  rs.id,s.segment_code,s.segment_name,s.cest,
  case when length(s.ncm_prefix)=8 then s.ncm_prefix else null end,
  s.ncm_legal_text,s.ncm_prefix,
  case when length(s.ncm_prefix)=8 then 'exact' else 'prefix' end,
  s.legal_description,s.qualifiers,'active',
  jsonb_build_object('seed','r0_5_curated','legal_source_verified_at','2026-09-24')
from rs cross join seed s
on conflict (
  rule_set_id,
  coalesce(segment_code,''),
  cest,
  coalesce(ncm_prefix,''),
  md5(legal_description)
) do update set
  segment_name=excluded.segment_name,
  ncm=excluded.ncm,
  ncm_legal_text=excluded.ncm_legal_text,
  match_mode=excluded.match_mode,
  qualifiers=excluded.qualifiers,
  status=excluded.status,
  metadata=excluded.metadata,
  updated_at=now();

create or replace function public.fiscal_valid_gtin_v1(p_gtin text)
returns boolean
language plpgsql
immutable
parallel safe
as $$
declare
  g text:=regexp_replace(coalesce(p_gtin,''),'\D','','g');
  i integer;
  offset_idx integer:=0;
  total integer:=0;
  expected integer;
begin
  if length(g) not in (8,12,13,14) then return false; end if;
  expected:=substring(g from length(g) for 1)::integer;
  i:=length(g)-1;
  while i>=1 loop
    total:=total + substring(g from i for 1)::integer * case when mod(offset_idx,2)=0 then 3 else 1 end;
    offset_idx:=offset_idx+1;
    i:=i-1;
  end loop;
  return mod(10-mod(total,10),10)=expected;
end;
$$;

revoke all on function public.fiscal_valid_gtin_v1(text) from public;
grant execute on function public.fiscal_valid_gtin_v1(text) to service_role;

create or replace view public.product_fiscal_catalog_scan_v1
with (security_invoker = true)
as
select
  p.id as product_id,
  p.name,
  p.is_active,
  p.gtin,
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
    when not public.fiscal_valid_gtin_v1(p.gtin)
      then 'gtin_missing_or_invalid'
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
    when coalesce(c.evidence_count,0)=0
      then 'no_fiscal_evidence'
    else 'review_low_risk'
  end as risk_code,
  case
    when coalesce(blockers.open_blockers,0)>0 or pf.review_status='blocked' or coalesce(c.ncm_conflict,false) or coalesce(c.cest_conflict,false) then 100
    when not public.fiscal_valid_gtin_v1(p.gtin) then 90
    when pf.ncm is null then 90
    when coalesce(lm.rule_match_count,0)>1 then 85
    when c.cest_consensus is not null and coalesce(lm.rule_match_count,0)=0 then 80
    when pf.st_status='candidate' then 70
    when coalesce(lm.rule_match_count,0)=1 and coalesce(c.evidence_count,0)=0 then 65
    when coalesce(c.evidence_count,0)>0 and c.origin_consensus is null then 55
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

revoke all on table public.product_fiscal_catalog_scan_v1 from anon, authenticated;
grant select on table public.product_fiscal_catalog_scan_v1 to service_role;

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
    'gtin_missing_or_invalid',count(*) filter (where is_active and risk_code='gtin_missing_or_invalid'),
    'legal_rule_ambiguous',count(*) filter (where is_active and risk_code='legal_rule_ambiguous'),
    'cest_evidence_unmapped',count(*) filter (where is_active and risk_code='cest_evidence_unmapped'),
    'candidate_needs_validation',count(*) filter (where is_active and risk_code='candidate_needs_validation'),
    'legal_match_needs_evidence',count(*) filter (where is_active and risk_code='legal_match_needs_evidence'),
    'no_fiscal_evidence',count(*) filter (where is_active and risk_code='no_fiscal_evidence')
  )
  from public.product_fiscal_catalog_scan_v1;
$$;

revoke all on function public.get_product_fiscal_catalog_scan_summary_v1() from public;
grant execute on function public.get_product_fiscal_catalog_scan_summary_v1() to service_role;

comment on view public.product_fiscal_catalog_scan_v1 is
  'Read-only risk-prioritized fiscal scan for the entire catalog. Does not validate or change product taxation.';
comment on function public.get_product_fiscal_catalog_scan_summary_v1() is
  'Read-only summary for catalog fiscal sanitation prioritization.';

commit;
