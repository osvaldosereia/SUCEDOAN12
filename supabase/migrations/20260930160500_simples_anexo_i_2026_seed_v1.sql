-- Dona Antonia · Simples Nacional Anexo I 2026 seed v1
-- Official-only rule set for commerce. No PGDAS filing/payment side effects.
-- Legal basis: Resolução CGSN nº 140/2018, Anexo I, as applicable in 2026.
-- 2026 ICMS/ISS sublimite: R$ 3.600.000,00 for all states and DF.

insert into public.simples_rule_sets (
  code,name,annex_code,effective_from,effective_to,status,
  brackets,tax_shares,legal_basis,metadata
)
values (
  'SN-ANEXO-I-2026',
  'Simples Nacional - Anexo I Comércio - 2026',
  'I',
  date '2026-01-01',
  date '2026-12-31',
  'active',
  jsonb_build_array(
    jsonb_build_object('min',0.01,'max',180000.00,'nominalRate',0.04,'deduction',0,'shares',jsonb_build_object('irpj',0.055,'csll',0.035,'cofins',0.1274,'pis',0.0276,'cpp',0.415,'icms',0.34)),
    jsonb_build_object('min',180000.01,'max',360000.00,'nominalRate',0.073,'deduction',5940,'shares',jsonb_build_object('irpj',0.055,'csll',0.035,'cofins',0.1274,'pis',0.0276,'cpp',0.415,'icms',0.34)),
    jsonb_build_object('min',360000.01,'max',720000.00,'nominalRate',0.095,'deduction',13860,'shares',jsonb_build_object('irpj',0.055,'csll',0.035,'cofins',0.1274,'pis',0.0276,'cpp',0.42,'icms',0.335)),
    jsonb_build_object('min',720000.01,'max',1800000.00,'nominalRate',0.107,'deduction',22500,'shares',jsonb_build_object('irpj',0.055,'csll',0.035,'cofins',0.1274,'pis',0.0276,'cpp',0.42,'icms',0.335)),
    jsonb_build_object('min',1800000.01,'max',3600000.00,'nominalRate',0.143,'deduction',87300,'shares',jsonb_build_object('irpj',0.055,'csll',0.035,'cofins',0.1274,'pis',0.0276,'cpp',0.42,'icms',0.335)),
    jsonb_build_object('min',3600000.01,'max',4800000.00,'nominalRate',0.19,'deduction',378000,'shares',jsonb_build_object('irpj',0.135,'csll',0.10,'cofins',0.2827,'pis',0.0613,'cpp',0.421,'icms',0.0))
  ),
  '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'source','Receita Federal - Resolução CGSN nº 140/2018, Anexo I',
      'url','https://normas.receita.fazenda.gov.br/sijut2consulta/anexoOutros.action?idArquivoBinario=48430'
    ),
    jsonb_build_object(
      'source','Portal do Simples Nacional - Sublimite para 2026',
      'url','https://www8.receita.fazenda.gov.br/simplesnacional/noticias/NoticiaCompleta.aspx?id=94c10cc2-7eb5-4ef0-bfb2-5479e72caff8'
    )
  ),
  jsonb_build_object(
    'scope','commerce_annex_i_2026',
    'source_policy','official_only',
    'sublimit_icms_iss',3600000,
    'faixa6_requires_sublimit_attention',true,
    'verified_at','2026-09-30'
  )
)
on conflict (code) do update set
  name=excluded.name,
  annex_code=excluded.annex_code,
  effective_from=excluded.effective_from,
  effective_to=excluded.effective_to,
  status=excluded.status,
  brackets=excluded.brackets,
  tax_shares=excluded.tax_shares,
  legal_basis=excluded.legal_basis,
  metadata=excluded.metadata,
  updated_at=now();
