begin;

create or replace function public.refresh_product_fiscal_evidence_quality_v1()
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_gtin_blockers integer:=0;
  v_ambiguities integer:=0;
  v_unmapped_cest integer:=0;
  v_bling_cest_missing integer:=0;
  v_origin_conflicts integer:=0;
  v_bling_link_missing integer:=0;
  v_origin_enriched integer:=0;
  v_resolved integer:=0;
begin
  insert into public.product_fiscal_review_items(
    product_id,issue_code,severity,status,title,details,detected_by
  )
  select
    s.product_id,'gtin_invalid','blocker','open',
    'GTIN informado é inválido',
    jsonb_build_object(
      'gtin',s.gtin,
      'ncm',s.ncm,
      'risk_score',s.risk_score,
      'note','Bloqueia validação/sincronização fiscal do produto; não bloqueia venda no catálogo.'
    ),
    'catalog_fiscal_r0_6'
  from public.product_fiscal_catalog_scan_v1 s
  where s.is_active and s.risk_code='gtin_invalid'
  on conflict (product_id,issue_code) where status in ('open','in_review')
  do update set severity=excluded.severity,title=excluded.title,details=excluded.details,
                detected_by=excluded.detected_by,updated_at=now();
  get diagnostics v_gtin_blockers = row_count;

  insert into public.product_fiscal_review_items(
    product_id,issue_code,severity,status,title,details,detected_by
  )
  select
    s.product_id,'legal_rule_ambiguous','warning','open',
    'Mais de uma regra fiscal legal é candidata',
    jsonb_build_object(
      'ncm',s.ncm,
      'candidate_cests',s.candidate_cests,
      'legal_rule_match_count',s.legal_rule_match_count
    ),
    'catalog_fiscal_r0_6'
  from public.product_fiscal_catalog_scan_v1 s
  where s.is_active and s.risk_code='legal_rule_ambiguous'
  on conflict (product_id,issue_code) where status in ('open','in_review')
  do update set severity=excluded.severity,title=excluded.title,details=excluded.details,
                detected_by=excluded.detected_by,updated_at=now();
  get diagnostics v_ambiguities = row_count;

  insert into public.product_fiscal_review_items(
    product_id,issue_code,severity,status,title,details,detected_by
  )
  select
    s.product_id,'cest_evidence_unmapped','warning','open',
    'CEST da evidência ainda não foi confirmado pelo classificador legal',
    jsonb_build_object(
      'ncm',s.ncm,
      'ncm_consensus',s.ncm_consensus,
      'cest_consensus',s.cest_consensus,
      'evidence_count',s.evidence_count
    ),
    'catalog_fiscal_r0_6'
  from public.product_fiscal_catalog_scan_v1 s
  where s.is_active and s.risk_code='cest_evidence_unmapped'
  on conflict (product_id,issue_code) where status in ('open','in_review')
  do update set severity=excluded.severity,title=excluded.title,details=excluded.details,
                detected_by=excluded.detected_by,updated_at=now();
  get diagnostics v_unmapped_cest = row_count;

  with bling_latest as (
    select distinct on (product_id)
      product_id,cest,origin_code,ncm,observed_at
    from public.product_fiscal_evidence
    where evidence_type='bling_product_detail'
    order by product_id,observed_at desc,created_at desc
  ),
  xml as (
    select
      product_id,
      case when count(distinct cest) filter (where cest is not null)=1
           then min(cest) filter (where cest is not null) end as xml_cest,
      case when count(distinct origin_code) filter (where origin_code is not null)=1
           then min(origin_code) filter (where origin_code is not null) end as xml_origin,
      count(*) as xml_rows
    from public.product_fiscal_evidence
    where evidence_type='supplier_nfe_xml'
    group by product_id
  )
  insert into public.product_fiscal_review_items(
    product_id,issue_code,severity,status,title,details,detected_by
  )
  select
    b.product_id,'bling_cest_missing_vs_xml','warning','open',
    'CEST existe no XML do fornecedor e está vazio no Bling',
    jsonb_build_object(
      'xml_cest',x.xml_cest,
      'bling_cest',b.cest,
      'bling_ncm',b.ncm,
      'xml_evidence_rows',x.xml_rows,
      'bling_observed_at',b.observed_at
    ),
    'catalog_fiscal_r0_6'
  from bling_latest b
  join xml x on x.product_id=b.product_id
  join public.products p on p.id=b.product_id and p.is_active
  where x.xml_cest is not null and b.cest is null
  on conflict (product_id,issue_code) where status in ('open','in_review')
  do update set severity=excluded.severity,title=excluded.title,details=excluded.details,
                detected_by=excluded.detected_by,updated_at=now();
  get diagnostics v_bling_cest_missing = row_count;

  with bling_latest as (
    select distinct on (product_id)
      product_id,origin_code,observed_at
    from public.product_fiscal_evidence
    where evidence_type='bling_product_detail'
    order by product_id,observed_at desc,created_at desc
  ),
  xml as (
    select
      product_id,
      case when count(distinct origin_code) filter (where origin_code is not null)=1
           then min(origin_code) filter (where origin_code is not null) end as xml_origin,
      count(distinct origin_code) filter (where origin_code is not null) as xml_origin_count
    from public.product_fiscal_evidence
    where evidence_type='supplier_nfe_xml'
    group by product_id
  )
  insert into public.product_fiscal_review_items(
    product_id,issue_code,severity,status,title,details,detected_by
  )
  select
    b.product_id,'origin_evidence_conflict','blocker','open',
    'Origem da mercadoria diverge entre Bling e XML do fornecedor',
    jsonb_build_object(
      'bling_origin',b.origin_code,
      'xml_origin',x.xml_origin,
      'bling_observed_at',b.observed_at
    ),
    'catalog_fiscal_r0_6'
  from bling_latest b
  join xml x on x.product_id=b.product_id
  join public.products p on p.id=b.product_id and p.is_active
  where x.xml_origin_count=1
    and x.xml_origin is not null
    and b.origin_code is not null
    and x.xml_origin<>b.origin_code
  on conflict (product_id,issue_code) where status in ('open','in_review')
  do update set severity=excluded.severity,title=excluded.title,details=excluded.details,
                detected_by=excluded.detected_by,updated_at=now();
  get diagnostics v_origin_conflicts = row_count;

  insert into public.product_fiscal_review_items(
    product_id,issue_code,severity,status,title,details,detected_by
  )
  select
    s.product_id,'bling_product_not_linked','warning','open',
    'Produto de risco fiscal não está vinculado ao Bling',
    jsonb_build_object(
      'gtin',s.gtin,'ncm',s.ncm,'risk_code',s.risk_code,'risk_score',s.risk_score
    ),
    'catalog_fiscal_r0_6'
  from public.product_fiscal_catalog_scan_v1 s
  join public.products p on p.id=s.product_id
  left join public.bling_hub_entity_links_v2 l
    on l.entity_type='product' and l.source_id=p.id::text and l.status='matched'
  where s.is_active
    and (
      s.risk_score>=70
      or (s.legal_rule_match_count=1 and s.cest_consensus is null)
    )
    and p.bling_product_id is null
    and l.bling_id is null
  on conflict (product_id,issue_code) where status in ('open','in_review')
  do update set severity=excluded.severity,title=excluded.title,details=excluded.details,
                detected_by=excluded.detected_by,updated_at=now();
  get diagnostics v_bling_link_missing = row_count;

  with supplier_origin as (
    select
      e.product_id,
      case when count(distinct e.origin_code) filter (where e.origin_code is not null)=1
           then min(e.origin_code) filter (where e.origin_code is not null) end as origin_consensus,
      count(*) filter (where e.origin_code is not null)::bigint as evidence_count
    from public.product_fiscal_evidence e
    join public.products p on p.id=e.product_id and p.is_active
    where e.evidence_type='supplier_nfe_xml'
    group by e.product_id
  ),
  upd as (
    update public.product_fiscal_profiles pf
    set
      origin_code=s.origin_consensus,
      metadata=coalesce(pf.metadata,'{}'::jsonb) || jsonb_build_object(
        'origin_candidate_source','supplier_xml_consensus_r0_9',
        'origin_candidate_evidence_count',s.evidence_count,
        'origin_candidate_at',now()
      ),
      updated_at=now()
    from supplier_origin s
    where pf.product_id=s.product_id
      and s.origin_consensus is not null
      and pf.origin_code is null
      and pf.review_status<>'blocked'
    returning pf.product_id
  )
  select count(*) into v_origin_enriched from upd;

  with current_conditions as (
    select p.id as product_id,'gtin_invalid'::text issue_code
    from public.products p
    where p.is_active
      and nullif(regexp_replace(coalesce(p.gtin,''),'\\D','','g'),'') is not null
      and not public.fiscal_valid_gtin_v1(p.gtin)
    union all
    select s.product_id,'legal_rule_ambiguous'
    from public.product_fiscal_catalog_scan_v1 s
    where s.is_active and s.risk_code='legal_rule_ambiguous'
    union all
    select s.product_id,'cest_evidence_unmapped'
    from public.product_fiscal_catalog_scan_v1 s
    where s.is_active and s.risk_code='cest_evidence_unmapped'
    union all
    select b.product_id,'bling_cest_missing_vs_xml'
    from (
      select distinct on (product_id) product_id,cest
      from public.product_fiscal_evidence
      where evidence_type='bling_product_detail'
      order by product_id,observed_at desc,created_at desc
    ) b
    join (
      select product_id,
        case when count(distinct cest) filter (where cest is not null)=1
             then min(cest) filter (where cest is not null) end xml_cest
      from public.product_fiscal_evidence
      where evidence_type='supplier_nfe_xml'
      group by product_id
    ) x on x.product_id=b.product_id
    where x.xml_cest is not null and b.cest is null
    union all
    select b.product_id,'origin_evidence_conflict'
    from (
      select distinct on (product_id) product_id,origin_code
      from public.product_fiscal_evidence
      where evidence_type='bling_product_detail'
      order by product_id,observed_at desc,created_at desc
    ) b
    join (
      select product_id,
        case when count(distinct origin_code) filter (where origin_code is not null)=1
             then min(origin_code) filter (where origin_code is not null) end xml_origin,
        count(distinct origin_code) filter (where origin_code is not null) origin_count
      from public.product_fiscal_evidence
      where evidence_type='supplier_nfe_xml'
      group by product_id
    ) x on x.product_id=b.product_id
    where x.origin_count=1 and x.xml_origin is not null and b.origin_code is not null and x.xml_origin<>b.origin_code
  ),
  resolved as (
    update public.product_fiscal_review_items r
    set
      status='resolved',
      resolved_at=now(),
      resolution_note='Condição automática deixou de existir.',
      updated_at=now()
    where r.detected_by='catalog_fiscal_r0_6'
      and r.status in ('open','in_review')
      and r.issue_code<>'bling_product_not_linked'
      and not exists (
        select 1 from current_conditions c
        where c.product_id=r.product_id and c.issue_code=r.issue_code
      )
    returning 1
  )
  select count(*) into v_resolved from resolved;

  perform public.refresh_product_fiscal_review_state_v1();

  return jsonb_build_object(
    'ok',true,
    'gtin_blockers_touched',v_gtin_blockers,
    'legal_ambiguities_touched',v_ambiguities,
    'unmapped_cest_touched',v_unmapped_cest,
    'bling_cest_missing_touched',v_bling_cest_missing,
    'origin_conflicts_touched',v_origin_conflicts,
    'bling_link_missing_touched',v_bling_link_missing,
    'origin_profiles_enriched',v_origin_enriched,
    'resolved_stale',v_resolved,
    'external_write',false
  );
end;
$$;

revoke all on function public.refresh_product_fiscal_evidence_quality_v1() from public;
grant execute on function public.refresh_product_fiscal_evidence_quality_v1() to service_role;

commit;
