begin;

alter table public.fiscal_st_rules_mt
  alter column ncm drop not null;

alter table public.fiscal_st_rules_mt
  drop constraint if exists fiscal_st_rules_mt_ncm_check;

alter table public.fiscal_st_rules_mt
  add column if not exists ncm_legal_text text,
  add column if not exists ncm_prefix text,
  add column if not exists match_mode text not null default 'prefix';

alter table public.fiscal_st_rules_mt
  drop constraint if exists fiscal_st_rules_mt_match_mode_check;
alter table public.fiscal_st_rules_mt
  add constraint fiscal_st_rules_mt_match_mode_check
  check (match_mode in ('exact','prefix'));

alter table public.fiscal_st_rules_mt
  drop constraint if exists fiscal_st_rules_mt_ncm_prefix_check;
alter table public.fiscal_st_rules_mt
  add constraint fiscal_st_rules_mt_ncm_prefix_check
  check (ncm_prefix is null or ncm_prefix ~ '^[0-9]{2,8}$');

drop index if exists public.fiscal_st_rules_mt_identity_uidx;
create unique index if not exists fiscal_st_rules_mt_identity_uidx
  on public.fiscal_st_rules_mt (
    rule_set_id,
    coalesce(segment_code,''),
    cest,
    coalesce(ncm_prefix,''),
    md5(legal_description)
  );

drop index if exists public.fiscal_st_rules_mt_lookup_idx;
create index if not exists fiscal_st_rules_mt_lookup_idx
  on public.fiscal_st_rules_mt (ncm_prefix, cest, status);

create or replace function public.fiscal_normalize_text_v1(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(regexp_replace(
    translate(
      lower(coalesce(p_text,'')),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  ));
$$;

create or replace function public.fiscal_rule_description_matches_v1(
  p_description text,
  p_qualifiers jsonb
)
returns boolean
language sql
immutable
parallel safe
as $$
  with q as (
    select
      public.fiscal_normalize_text_v1(p_description) as d,
      case when jsonb_typeof(coalesce(p_qualifiers,'{}'::jsonb)->'include_all')='array'
        then coalesce(p_qualifiers,'{}'::jsonb)->'include_all' else '[]'::jsonb end as include_all,
      case when jsonb_typeof(coalesce(p_qualifiers,'{}'::jsonb)->'include_any')='array'
        then coalesce(p_qualifiers,'{}'::jsonb)->'include_any' else '[]'::jsonb end as include_any,
      case when jsonb_typeof(coalesce(p_qualifiers,'{}'::jsonb)->'exclude_any')='array'
        then coalesce(p_qualifiers,'{}'::jsonb)->'exclude_any' else '[]'::jsonb end as exclude_any
  )
  select
    not exists (
      select 1 from q, jsonb_array_elements_text(q.include_all) t(term)
      where position(public.fiscal_normalize_text_v1(t.term) in q.d)=0
    )
    and (
      jsonb_array_length((select include_any from q))=0
      or exists (
        select 1 from q, jsonb_array_elements_text(q.include_any) t(term)
        where position(public.fiscal_normalize_text_v1(t.term) in q.d)>0
      )
    )
    and not exists (
      select 1 from q, jsonb_array_elements_text(q.exclude_any) t(term)
      where position(public.fiscal_normalize_text_v1(t.term) in q.d)>0
    );
$$;

revoke all on function public.fiscal_normalize_text_v1(text) from public;
revoke all on function public.fiscal_rule_description_matches_v1(text,jsonb) from public;
grant execute on function public.fiscal_normalize_text_v1(text) to service_role;
grant execute on function public.fiscal_rule_description_matches_v1(text,jsonb) to service_role;

insert into public.fiscal_rule_sets (
  jurisdiction,tax_kind,version_key,status,source_title,source_url,legal_reference,
  valid_from,metadata
)
values (
  'MT',
  'ICMS_ST',
  'mt-ricms-anexo-x-snapshot-2026-09-24-r0-3',
  'draft',
  'RICMS/MT - Anexo X - Substituição Tributária',
  'https://www.sefaz.mt.gov.br/legislacao/SubIndice.aspx?ID=212',
  'RICMS/MT, Anexo X e Apêndice, regras vigentes consultadas em 24/09/2026',
  date '2026-09-24',
  jsonb_build_object(
    'classification_mode','candidate_only',
    'scope','curated_rules_for_existing_product_evidence',
    'source_snapshot_url','https://app1.sefaz.mt.gov.br/Sistema/legislacao/legislacaotribut.nsf/07fa81bed2760c6b84256710004d3940/4c7283a0b4318486042584c4004436c1',
    'verified_at','2026-09-24',
    'note','Conjunto inicial não exaustivo. Nenhuma regra draft autoriza emissão fiscal automaticamente.'
  )
)
on conflict (jurisdiction,tax_kind,version_key)
do update set
  source_title=excluded.source_title,
  source_url=excluded.source_url,
  legal_reference=excluded.legal_reference,
  metadata=excluded.metadata,
  updated_at=now();

with rs as (
  select id from public.fiscal_rule_sets
  where jurisdiction='MT' and tax_kind='ICMS_ST'
    and version_key='mt-ricms-anexo-x-snapshot-2026-09-24-r0-3'
),
seed(segment_code,segment_name,cest,ncm_legal_text,ncm_prefix,legal_description,qualifiers) as (
  values
  ('11','Materiais de limpeza','1100700','3402','3402',
   'Outros agentes orgânicos de superfície; preparações para lavagem e limpeza, inclusive multiuso e limpadores, nas condições da Tabela XII.',
   '{"include_any":["limpador","multiuso","limpeza"]}'::jsonb),
  ('11','Materiais de limpeza','1100900','6805.30.90','68053090',
   'Esponjas para limpeza.',
   '{"include_any":["esponja","bucha"]}'::jsonb),

  ('17','Produtos alimentícios','1701200','0402.1 / 0402.2 / 0402.9','0402',
   'Leite em pó, blocos ou grânulos, exceto creme de leite.',
   '{"include_any":["leite em po","leite po"]}'::jsonb),
  ('17','Produtos alimentícios','1701600','0401.10.10 / 0401.20.10','0401',
   'Leite longa vida UHT em recipiente de conteúdo inferior ou igual a 2 litros.',
   '{"include_any":["leite","uht","longa vida"]}'::jsonb),
  ('17','Produtos alimentícios','1703100','1905.90.90','19059090',
   'Salgadinhos diversos, exceto os classificados no CEST específico indicado na Tabela XVII.',
   '{"include_any":["salgadinho"]}'::jsonb),
  ('17','Produtos alimentícios','1703400','2103.20.10','21032010',
   'Catchup em embalagens imediatas de conteúdo inferior ou igual a 650 g, observadas as exceções legais.',
   '{"include_any":["ketchup","catchup"]}'::jsonb),
  ('17','Produtos alimentícios','1703500','2103.90.21','21039021',
   'Condimentos e temperos compostos, incluindo molho de pimenta e outros molhos, nas condições da Tabela XVII.',
   '{"include_any":["tempero","condimento","molho de pimenta"]}'::jsonb),
  ('17','Produtos alimentícios','1703500','2103.90.91','21039091',
   'Condimentos e temperos compostos, incluindo molho de pimenta e outros molhos, nas condições da Tabela XVII.',
   '{"include_any":["tempero","condimento","molho de pimenta"]}'::jsonb),
  ('17','Produtos alimentícios','1704411','1101.00.10','11010010',
   'Farinha de trigo comum, em embalagem inferior ou igual a 1 kg.',
   '{"include_all":["farinha","trigo"]}'::jsonb),
  ('17','Produtos alimentícios','1704906','1902.11.00','19021100',
   'Massas alimentícias do tipo comum, não cozidas, nem recheadas, que contenham ovos, derivadas de farinha de trigo.',
   '{"include_any":["macarrao","massa"],"include_all":["ovos"]}'::jsonb),
  ('17','Produtos alimentícios','1706500','1507.90.11','15079011',
   'Óleo de soja refinado, em recipientes com capacidade inferior ou igual a 5 litros, observadas as exceções legais.',
   '{"include_all":["oleo","soja"]}'::jsonb),
  ('17','Produtos alimentícios','1706700','1509','1509',
   'Azeites de oliva, em recipientes com capacidade inferior a 2 litros, observadas as exceções legais.',
   '{"include_any":["azeite"]}'::jsonb),
  ('17','Produtos alimentícios','1709600','0901','0901',
   'Café torrado e moído, em embalagens de conteúdo inferior ou igual a 2 kg, observadas as exceções legais.',
   '{"include_any":["cafe"]}'::jsonb),
  ('17','Produtos alimentícios','1709800','0903.00','0903',
   'Mate.',
   '{"include_any":["erva mate","mate"]}'::jsonb),

  ('20','Perfumaria, higiene pessoal e cosméticos','2001400','3304.99.10','33049910',
   'Cremes de beleza, cremes nutritivos e loções tônicas.',
   '{"include_any":["creme","locao","tonica"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2001700','3305.10.00','33051000',
   'Xampus para o cabelo.',
   '{"include_any":["shampoo","xampu"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2002000','3305.90.00','33059000',
   'Outras preparações capilares, incluindo máscaras e finalizadores.',
   '{"include_any":["mascara","finalizador","serum","tratamento","leave in"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2002100','3305.90.00','33059000',
   'Condicionadores.',
   '{"include_any":["condicionador"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2002300','3306.10.00','33061000',
   'Dentifrícios.',
   '{"include_any":["creme dental","pasta dental","dentifricio"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2002800','3307.20.10','33072010',
   'Antiperspirantes líquidos.',
   '{"include_any":["antiperspirante","antitranspirante"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2003700','3401.30.00','34013000',
   'Produtos e preparações orgânicos tensoativos para lavagem da pele, líquidos ou em creme, para venda a retalho.',
   '{"include_any":["sabonete liquido","gel de limpeza","limpeza facial"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2004200','4818.10.00','48181000',
   'Papel higiênico - folha simples.',
   '{"include_any":["papel higienico"],"exclude_any":["folha dupla","folha tripla"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2005000','9619.00.00','96190000',
   'Absorventes higiênicos externos.',
   '{"include_any":["absorvente"]}'::jsonb),
  ('20','Perfumaria, higiene pessoal e cosméticos','2005800','9603.21.00','96032100',
   'Escovas de dentes, incluídas as escovas para dentaduras.',
   '{"include_any":["escova de dentes","escova dental"]}'::jsonb)
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
  jsonb_build_object('seed','r0_3_curated','legal_source_verified_at','2026-09-24')
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

create or replace view public.product_fiscal_rule_candidates_v1
with (security_invoker = true)
as
select
  c.product_id,
  p.is_active,
  p.name,
  c.profile_ncm,
  c.ncm_consensus,
  c.cest_consensus,
  c.evidence_count,
  c.document_count,
  latest.fiscal_description as evidence_description,
  r.id as rule_id,
  r.segment_code,
  r.segment_name,
  r.cest as rule_cest,
  r.ncm_legal_text,
  r.ncm_prefix,
  r.legal_description,
  rs.version_key as rule_version,
  rs.status as rule_set_status,
  public.fiscal_rule_description_matches_v1(
    coalesce(latest.fiscal_description,p.name),
    r.qualifiers
  ) as description_matches
from public.product_fiscal_evidence_consensus_v1 c
join public.products p on p.id=c.product_id
join public.fiscal_rule_sets rs
  on rs.jurisdiction='MT'
 and rs.tax_kind='ICMS_ST'
 and rs.status in ('draft','active')
join public.fiscal_st_rules_mt r
  on r.rule_set_id=rs.id
 and r.status='active'
 and r.cest=c.cest_consensus
 and c.ncm_consensus is not null
 and r.ncm_prefix is not null
 and left(c.ncm_consensus,length(r.ncm_prefix))=r.ncm_prefix
left join lateral (
  select e.fiscal_description,e.observed_at
  from public.product_fiscal_evidence e
  where e.product_id=c.product_id
    and e.evidence_type='supplier_nfe_xml'
  order by e.observed_at desc nulls last,e.created_at desc
  limit 1
) latest on true
where
  c.is_active
  and c.evidence_count>0
  and c.cest_consensus is not null
  and not c.ncm_conflict
  and not c.cest_conflict
  and not exists (
    select 1
    from public.product_fiscal_review_items ri
    where ri.product_id=c.product_id
      and ri.status in ('open','in_review')
      and ri.severity='blocker'
  );

revoke all on table public.product_fiscal_rule_candidates_v1 from anon, authenticated;
grant select on table public.product_fiscal_rule_candidates_v1 to service_role;

create or replace function public.refresh_product_fiscal_candidates_r0_3()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_candidates integer:=0;
  v_ambiguous integer:=0;
begin
  with matched as (
    select *
    from public.product_fiscal_rule_candidates_v1
    where description_matches
  ),
  unique_match as (
    select product_id,min(rule_id::text)::uuid as rule_id
    from matched
    group by product_id
    having count(*)=1
  ),
  chosen as (
    select m.*
    from matched m
    join unique_match u on u.product_id=m.product_id and u.rule_id=m.rule_id
  ),
  upd as (
    update public.product_fiscal_profiles pf
    set
      cest=ch.rule_cest,
      matched_st_rule_id=ch.rule_id,
      tax_segment_code=ch.segment_code,
      tax_segment_name=ch.segment_name,
      st_status='candidate',
      classification_source='supplier_xml+mt_legal_rule',
      classification_confidence=case when ch.document_count>=2 then 0.92 else 0.88 end,
      fiscal_description=coalesce(nullif(pf.fiscal_description,''),ch.evidence_description),
      rule_version=ch.rule_version,
      review_status=case when pf.review_status='blocked' then pf.review_status else 'pending' end,
      updated_at=now()
    from chosen ch
    where pf.product_id=ch.product_id
      and pf.review_status<>'blocked'
    returning pf.product_id
  )
  select count(*) into v_candidates from upd;

  select count(*) into v_ambiguous
  from (
    select product_id
    from public.product_fiscal_rule_candidates_v1
    where description_matches
    group by product_id
    having count(*)>1
  ) x;

  return jsonb_build_object(
    'ok',true,
    'candidate_profiles_updated',v_candidates,
    'ambiguous_products',v_ambiguous,
    'validated_profiles',0,
    'external_write',false
  );
end;
$$;

revoke all on function public.refresh_product_fiscal_candidates_r0_3() from public;
grant execute on function public.refresh_product_fiscal_candidates_r0_3() to service_role;

comment on view public.product_fiscal_rule_candidates_v1 is
  'Candidate-only MT ICMS-ST matching. Requires supplier evidence CEST + NCM prefix + legal-description qualifier; draft rules never validate a product automatically.';
comment on function public.refresh_product_fiscal_candidates_r0_3() is
  'Promotes only unique legal/evidence matches to st_status=candidate. Does not mark human/auto validated and never writes to Bling/products.';

commit;
