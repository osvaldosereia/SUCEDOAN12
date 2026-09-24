begin;

-- R0.16: fill only narrow MT Anexo X gaps independently confirmed in the official SEFAZ-MT table.
-- XMLs remain observed evidence; legal rules below are sourced from SEFAZ-MT and fail closed.

with rs as (
  select id
  from public.fiscal_rule_sets
  where jurisdiction='MT'
    and tax_kind='ICMS_ST'
    and version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
)
insert into public.fiscal_st_rules_mt(
  rule_set_id,segment_code,segment_name,cest,ncm,ncm_legal_text,ncm_prefix,
  match_mode,legal_description,qualifiers,status,metadata
)
select
  rs.id,'03','Cervejas, chopes, refrigerantes, águas e outras bebidas',
  '0301500','22029900','2106.90 / 2202.99.00','22029900','exact',
  'Bebidas hidroeletrolíticas (isotônicas) em embalagem com capacidade inferior a 600 ml.',
  '{"include_all":["500 ml"],"include_any":["isotonico","isotônico","isotonica","isotônica","gatorade"]}'::jsonb,
  'active',
  jsonb_build_object(
    'seed','r0_16_curated',
    'legal_source_verified_at','2026-09-24',
    'legal_source','SEFAZ-MT Anexo X/Tabela IV',
    'source_url','https://app1.sefaz.mt.gov.br/sistema/legislacao/legislacaotribut.nsf/7c7b6a9347c50f55032569140065ebbf/e5f1b349942b011a0425849b0043212a'
  )
from rs
on conflict (
  rule_set_id,coalesce(segment_code,''),cest,coalesce(ncm_prefix,''),md5(legal_description)
) do update set
  ncm=excluded.ncm,
  ncm_legal_text=excluded.ncm_legal_text,
  match_mode=excluded.match_mode,
  qualifiers=excluded.qualifiers,
  metadata=excluded.metadata,
  status='active',
  updated_at=now();

with rs as (
  select id
  from public.fiscal_rule_sets
  where jurisdiction='MT'
    and tax_kind='ICMS_ST'
    and version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
)
insert into public.fiscal_st_rules_mt(
  rule_set_id,segment_code,segment_name,cest,ncm,ncm_legal_text,ncm_prefix,
  match_mode,legal_description,qualifiers,status,metadata
)
select
  rs.id,'11','Materiais de limpeza',
  '1100200','38089419','3401.20.90 / 3808.94.19','38089419','exact',
  'Sabões, desinfetantes e sanitizantes, todos em pó, flocos, palhetas, grânulos ou formas semelhantes, para lavar roupas.',
  '{"include_any":["sabao em po","sabão em pó","sanitiza","higieniza"],"exclude_any":["liquido","líquido"]}'::jsonb,
  'active',
  jsonb_build_object(
    'seed','r0_16_curated',
    'legal_source_verified_at','2026-09-24',
    'legal_source','SEFAZ-MT Anexo X/Tabela XII',
    'source_url','https://app1.sefaz.mt.gov.br/sistema/legislacao/legislacaotribut.nsf/7c7b6a9347c50f55032569140065ebbf/e5f1b349942b011a0425849b0043212a'
  )
from rs
on conflict (
  rule_set_id,coalesce(segment_code,''),cest,coalesce(ncm_prefix,''),md5(legal_description)
) do update set
  ncm=excluded.ncm,
  ncm_legal_text=excluded.ncm_legal_text,
  match_mode=excluded.match_mode,
  qualifiers=excluded.qualifiers,
  metadata=excluded.metadata,
  status='active',
  updated_at=now();

-- Existing 11.006.00 rule was legally correct but too narrow for normal catalog wording
-- such as "Sabão Líquido Lava-Roupas".
with rs as (
  select id
  from public.fiscal_rule_sets
  where jurisdiction='MT'
    and tax_kind='ICMS_ST'
    and version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
)
update public.fiscal_st_rules_mt r
set
  ncm='34025000',
  ncm_legal_text='3402.50.00',
  ncm_prefix='34025000',
  match_mode='exact',
  legal_description='Detergente líquido para lavar roupa, inclusive adicionado de propriedades desinfetantes ou sanitizantes.',
  qualifiers='{"include_all":["liquido"],"include_any":["lava roupa","lava roupas","lava-roupas","sabao liquido","sabão líquido"]}'::jsonb,
  metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object(
    'legal_source_verified_at','2026-09-24',
    'legal_source','SEFAZ-MT Anexo X/Tabela XII',
    'source_url','https://app1.sefaz.mt.gov.br/sistema/legislacao/legislacaotribut.nsf/7c7b6a9347c50f55032569140065ebbf/e5f1b349942b011a0425849b0043212a',
    'rule_refresh','r0_16'
  ),
  updated_at=now()
from rs
where r.rule_set_id=rs.id
  and r.cest='1100600'
  and r.ncm_prefix='34025000';

with rs as (
  select id
  from public.fiscal_rule_sets
  where jurisdiction='MT'
    and tax_kind='ICMS_ST'
    and version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
)
insert into public.fiscal_st_rules_mt(
  rule_set_id,segment_code,segment_name,cest,ncm,ncm_legal_text,ncm_prefix,
  match_mode,legal_description,qualifiers,status,metadata
)
select
  rs.id,'17','Produtos alimentícios',
  '1704100','21032010','2103.20.10','21032010','exact',
  'Molhos de tomate em embalagens imediatas de conteúdo inferior ou igual a 1 kg.',
  '{"include_all":["molho","tomate"]}'::jsonb,
  'active',
  jsonb_build_object(
    'seed','r0_16_curated',
    'legal_source_verified_at','2026-09-24',
    'legal_source','SEFAZ-MT Anexo X/Tabela XVII',
    'source_url','https://app1.sefaz.mt.gov.br/sistema/legislacao/legislacaotribut.nsf/7c7b6a9347c50f55032569140065ebbf/e5f1b349942b011a0425849b0043212a'
  )
from rs
on conflict (
  rule_set_id,coalesce(segment_code,''),cest,coalesce(ncm_prefix,''),md5(legal_description)
) do update set
  ncm=excluded.ncm,
  ncm_legal_text=excluded.ncm_legal_text,
  match_mode=excluded.match_mode,
  qualifiers=excluded.qualifiers,
  metadata=excluded.metadata,
  status='active',
  updated_at=now();

-- Strict-auto remains an explicit allowlist. These four rules are narrow:
-- exact NCM + specific product wording + exact catalog category + independent observed evidence gates.
insert into public.fiscal_rule_validation_policy(
  rule_id,validation_tier,allowed_categories,verified_on,source_url,rationale,metadata
)
select
  r.id,
  'strict_auto',
  case r.cest
    when '0301500' then array['SUCOS, REFRI E ENERGÉTICOS']::text[]
    when '1100200' then array['LAVANDERIA']::text[]
    when '1100600' then array['LAVANDERIA']::text[]
    when '1704100' then array['MACARRÃO E MOLHOS']::text[]
  end,
  date '2026-09-24',
  'https://app1.sefaz.mt.gov.br/sistema/legislacao/legislacaotribut.nsf/7c7b6a9347c50f55032569140065ebbf/e5f1b349942b011a0425849b0043212a',
  case r.cest
    when '0301500' then 'NCM exato 22029900, descrição de isotônico 500 ml, categoria de bebidas e evidência fiscal observada compatível.'
    when '1100200' then 'NCM exato 38089419, descrição de sanitizante/sabão em pó para roupas, categoria lavanderia e evidência fiscal observada compatível.'
    when '1100600' then 'NCM exato 34025000, descrição de produto líquido para lavar roupas, categoria lavanderia e evidência fiscal observada compatível.'
    when '1704100' then 'NCM exato 21032010, descrição específica de molho de tomate, categoria de molhos e evidência fiscal observada compatível.'
  end,
  jsonb_build_object(
    'policy_version','r0_16',
    'requires_bling_ncm_evidence',true,
    'requires_valid_gtin',true,
    'requires_origin_consensus',true,
    'requires_unique_legal_match',true,
    'requires_observed_evidence_no_conflict',true,
    'external_write',false
  )
from public.fiscal_st_rules_mt r
join public.fiscal_rule_sets rs on rs.id=r.rule_set_id
where rs.version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
  and (
    (r.cest='0301500' and r.ncm_prefix='22029900')
    or (r.cest='1100200' and r.ncm_prefix='38089419')
    or (r.cest='1100600' and r.ncm_prefix='34025000')
    or (r.cest='1704100' and r.ncm_prefix='21032010')
  )
on conflict (rule_id) do update set
  validation_tier=excluded.validation_tier,
  allowed_categories=excluded.allowed_categories,
  verified_on=excluded.verified_on,
  source_url=excluded.source_url,
  rationale=excluded.rationale,
  metadata=excluded.metadata,
  updated_at=now();

commit;
