begin;

update public.fiscal_st_rules_mt r
set
  ncm='34025000',
  ncm_legal_text='3402.50.00',
  ncm_prefix='34025000',
  match_mode='exact',
  legal_description='Detergentes em pó, flocos, palhetas, grânulos ou outras formas semelhantes, inclusive adicionados de propriedades desinfetantes ou sanitizantes.',
  qualifiers='{"include_any":["detergente em po","detergente em pó","detergente granulado","detergente em flocos","sabao em po","sabão em pó"]}'::jsonb,
  metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object(
    'legal_source_verified_at','2026-09-24',
    'legal_update','Convênio ICMS 66/2022 - efeitos desde 02/05/2022'
  ),
  updated_at=now()
from public.fiscal_rule_sets rs
where r.rule_set_id=rs.id
  and rs.version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
  and r.cest='1100400';

update public.fiscal_st_rules_mt r
set
  ncm='34025000',
  ncm_legal_text='3402.50.00',
  ncm_prefix='34025000',
  match_mode='exact',
  legal_description='Detergentes líquidos, exceto para lavar roupa.',
  qualifiers='{"include_all":["detergente"],"exclude_any":["lava roupa","lava roupas","sabao liquido","sabão líquido","detergente em po","detergente em pó"]}'::jsonb,
  metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object(
    'legal_source_verified_at','2026-09-24',
    'legal_update','Convênio ICMS 66/2022 - efeitos desde 02/05/2022'
  ),
  updated_at=now()
from public.fiscal_rule_sets rs
where r.rule_set_id=rs.id
  and rs.version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
  and r.cest='1100500';

update public.fiscal_st_rules_mt r
set
  ncm='34025000',
  ncm_legal_text='3402.50.00',
  ncm_prefix='34025000',
  match_mode='exact',
  legal_description='Detergente líquido para lavar roupa, inclusive adicionado de propriedades desinfetantes ou sanitizantes.',
  qualifiers='{"include_any":["lava roupa liquido","lava roupas liquido","lava-roupas liquido","lava-roupas líquido","detergente liquido para lavar roupa","detergente líquido para lavar roupa","sabao liquido lavagem","sabão líquido lavagem","sabao liquido para roupa","sabão líquido para roupa"]}'::jsonb,
  metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object(
    'legal_source_verified_at','2026-09-24',
    'legal_update','Convênio ICMS 66/2022 - efeitos desde 02/05/2022'
  ),
  updated_at=now()
from public.fiscal_rule_sets rs
where r.rule_set_id=rs.id
  and rs.version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
  and r.cest='1100600';

update public.fiscal_st_rules_mt r
set
  qualifiers='{"include_any":["limpador","multiuso","limpeza","tira manchas","tira-manchas"],"exclude_any":["detergente","lava roupa","lava roupas","sabao em po","sabão em pó","sabao liquido","sabão líquido","amaciante","suavizante","agua sanitaria","água sanitária","alvejante","branqueador"]}'::jsonb,
  metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object(
    'legal_source_verified_at','2026-09-24'
  ),
  updated_at=now()
from public.fiscal_rule_sets rs
where r.rule_set_id=rs.id
  and rs.version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
  and r.cest='1100700';

with rs as (
  select id from public.fiscal_rule_sets
  where jurisdiction='MT'
    and tax_kind='ICMS_ST'
    and version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
)
insert into public.fiscal_st_rules_mt(
  rule_set_id,segment_code,segment_name,cest,ncm,ncm_legal_text,ncm_prefix,
  match_mode,legal_description,qualifiers,status,metadata
)
select
  rs.id,'20','Perfumaria, higiene pessoal e cosméticos',
  '2000600',null,'3301','3301','prefix',
  'Óleos essenciais e demais produtos da posição 3301, em embalagens de conteúdo inferior ou igual a 500 ml.',
  '{"include_any":["oleo","óleo"]}'::jsonb,
  'active',
  jsonb_build_object(
    'seed','r0_8_curated',
    'legal_source_verified_at','2026-09-24'
  )
from rs
on conflict (
  rule_set_id,
  coalesce(segment_code,''),
  cest,
  coalesce(ncm_prefix,''),
  md5(legal_description)
) do update set
  qualifiers=excluded.qualifiers,
  status=excluded.status,
  metadata=excluded.metadata,
  updated_at=now();

commit;
