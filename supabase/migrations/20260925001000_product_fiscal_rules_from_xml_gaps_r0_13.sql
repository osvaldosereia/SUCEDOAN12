begin;

with rs as (
  select id from public.fiscal_rule_sets
  where jurisdiction='MT' and tax_kind='ICMS_ST'
    and version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
)
update public.fiscal_st_rules_mt r
set
  ncm='34025000',
  ncm_legal_text='2828.90.11 / 2828.90.19 / 3206.41.00 / 3402.50.00 / 3808.94.19',
  ncm_prefix='34025000',
  match_mode='exact',
  legal_description='Água sanitária, branqueador e outros alvejantes.',
  qualifiers='{"include_any":["agua sanitaria","água sanitária","alvejante","branqueador"]}'::jsonb,
  metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object(
    'legal_source_verified_at','2026-09-24',
    'legal_source','SEFAZ-MT Anexo X/Tabela XII',
    'rule_refresh','r0_13'
  ),
  updated_at=now()
from rs
where r.rule_set_id=rs.id
  and r.cest='1100100'
  and r.ncm_prefix='3402';

with rs as (
  select id from public.fiscal_rule_sets
  where jurisdiction='MT' and tax_kind='ICMS_ST'
    and version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
),
seed(ncm_prefix,ncm_legal_text) as (
  values
    ('28289011','2828.90.11'),
    ('28289019','2828.90.19'),
    ('32064100','3206.41.00'),
    ('38089419','3808.94.19')
)
insert into public.fiscal_st_rules_mt(
  rule_set_id,segment_code,segment_name,cest,ncm,ncm_legal_text,ncm_prefix,
  match_mode,legal_description,qualifiers,status,metadata
)
select
  rs.id,'11','Materiais de limpeza','1100100',s.ncm_prefix,s.ncm_legal_text,s.ncm_prefix,
  'exact','Água sanitária, branqueador e outros alvejantes.',
  '{"include_any":["agua sanitaria","água sanitária","alvejante","branqueador"]}'::jsonb,
  'active',
  jsonb_build_object(
    'seed','r0_13_curated',
    'legal_source_verified_at','2026-09-24',
    'legal_source','SEFAZ-MT Anexo X/Tabela XII'
  )
from rs cross join seed s
on conflict (
  rule_set_id,
  coalesce(segment_code,''),
  cest,
  coalesce(ncm_prefix,''),
  md5(legal_description)
) do update set
  ncm=excluded.ncm,
  ncm_legal_text=excluded.ncm_legal_text,
  match_mode=excluded.match_mode,
  qualifiers=excluded.qualifiers,
  metadata=excluded.metadata,
  status='active',
  updated_at=now();

with rs as (
  select id from public.fiscal_rule_sets
  where jurisdiction='MT' and tax_kind='ICMS_ST'
    and version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
)
insert into public.fiscal_st_rules_mt(
  rule_set_id,segment_code,segment_name,cest,ncm,ncm_legal_text,ncm_prefix,
  match_mode,legal_description,qualifiers,status,metadata
)
select
  rs.id,'20','Perfumaria, higiene pessoal e cosméticos',
  '2001200','33043000','3304.30.00','33043000','exact',
  'Preparações para manicuros e pedicuros, incluindo removedores de esmalte à base de acetona.',
  '{"include_any":["esmalte","manicure","pedicure","removedor de esmalte","removedor esmalte"]}'::jsonb,
  'active',
  jsonb_build_object(
    'seed','r0_13_curated',
    'legal_source_verified_at','2026-09-24',
    'legal_source','SEFAZ-MT Anexo X/Tabela XIX'
  )
from rs
on conflict (
  rule_set_id,
  coalesce(segment_code,''),
  cest,
  coalesce(ncm_prefix,''),
  md5(legal_description)
) do update set
  ncm=excluded.ncm,
  ncm_legal_text=excluded.ncm_legal_text,
  match_mode=excluded.match_mode,
  qualifiers=excluded.qualifiers,
  metadata=excluded.metadata,
  status='active',
  updated_at=now();

insert into public.fiscal_rule_validation_policy(
  rule_id,validation_tier,allowed_categories,verified_on,source_url,rationale,metadata
)
select
  r.id,
  'strict_auto',
  array['BELEZA']::text[],
  date '2026-09-24',
  'https://app1.sefaz.mt.gov.br/sistema/legislacao/legislacaotribut.nsf/7c7b6a9347c50f55032569140065ebbf/e5f1b349942b011a0425849b0043212a',
  'NCM exato 33043000, descrição específica de esmalte/manicure/pedicure e categoria de beleza.',
  jsonb_build_object(
    'policy_version','r0_13',
    'requires_bling_ncm_evidence',true,
    'requires_valid_gtin',true,
    'requires_origin_consensus',true,
    'requires_unique_legal_match',true,
    'external_write',false
  )
from public.fiscal_st_rules_mt r
join public.fiscal_rule_sets rs on rs.id=r.rule_set_id
where rs.version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
  and r.cest='2001200'
  and r.ncm_prefix='33043000'
on conflict (rule_id) do update set
  validation_tier=excluded.validation_tier,
  allowed_categories=excluded.allowed_categories,
  verified_on=excluded.verified_on,
  source_url=excluded.source_url,
  rationale=excluded.rationale,
  metadata=excluded.metadata,
  updated_at=now();

commit;
