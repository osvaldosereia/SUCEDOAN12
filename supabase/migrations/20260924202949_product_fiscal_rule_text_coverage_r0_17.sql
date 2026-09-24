begin;

-- R0.17: widen only textual qualifiers for two already-verified MT rules.
-- Legal NCM/CEST pairs are unchanged. This improves matching of normal catalog wording
-- while preserving fail-closed behavior for conflicting observed evidence.

with rs as (
  select id
  from public.fiscal_rule_sets
  where jurisdiction='MT'
    and tax_kind='ICMS_ST'
    and version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
)
update public.fiscal_st_rules_mt r
set
  qualifiers='{"include_any":["creme","locao","tonica","hidratante facial","creme hidratante"]}'::jsonb,
  metadata=coalesce(r.metadata,'{}'::jsonb) || jsonb_build_object(
    'rule_refresh','r0_17',
    'legal_source_verified_at','2026-09-24',
    'legal_source','SEFAZ-MT Anexo X/Tabela XIX',
    'source_url','https://app1.sefaz.mt.gov.br/Sistema/legislacao/legislacaotribut.nsf/07fa81bed2760c6b84256710004d3940/4c7283a0b4318486042584c4004436c1',
    'qualifier_rationale','NCM 3304.99.10 + descrição legal de cremes de beleza/nutritivos; cobre nomenclatura comercial hidratante facial sem ampliar NCM.'
  ),
  updated_at=now()
from rs
where r.rule_set_id=rs.id
  and r.cest='2001400'
  and r.ncm_prefix='33049910'
  and r.status='active';

with rs as (
  select id
  from public.fiscal_rule_sets
  where jurisdiction='MT'
    and tax_kind='ICMS_ST'
    and version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
)
update public.fiscal_st_rules_mt r
set
  qualifiers='{"include_any":["sabonete liquido","gel de limpeza","limpeza facial","agua micelar","solucao de limpeza"]}'::jsonb,
  metadata=coalesce(r.metadata,'{}'::jsonb) || jsonb_build_object(
    'rule_refresh','r0_17',
    'legal_source_verified_at','2026-09-24',
    'legal_source','SEFAZ-MT Anexo X/Tabela XIX',
    'source_url','https://app1.sefaz.mt.gov.br/Sistema/legislacao/legislacaotribut.nsf/07fa81bed2760c6b84256710004d3940/4c7283a0b4318486042584c4004436c1',
    'qualifier_rationale','NCM 3401.30.00 + descrição legal de preparação líquida/cremosa para lavagem da pele; cobre nomenclatura comercial água micelar/solução de limpeza.'
  ),
  updated_at=now()
from rs
where r.rule_set_id=rs.id
  and r.cest='2003700'
  and r.ncm_prefix='34013000'
  and r.status='active';

commit;
