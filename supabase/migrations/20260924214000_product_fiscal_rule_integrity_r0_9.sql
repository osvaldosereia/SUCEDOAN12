begin;

create or replace view public.product_fiscal_rule_integrity_v1
with (security_invoker = true)
as
with matches as (
  select
    s.product_id,
    r.id as rule_id,
    r.cest as rule_cest,
    r.ncm_prefix,
    r.legal_description,
    rs.version_key,
    count(*) over(partition by s.product_id) as rule_match_count
  from public.product_fiscal_catalog_scan_v1 s
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
     coalesce(
       (select pf.fiscal_description
          from public.product_fiscal_profiles pf
         where pf.product_id=s.product_id),
       s.name
     ),
     r.qualifiers
   )
  where s.is_active
)
select
  m.product_id,
  m.rule_id,
  m.rule_cest,
  c.cest_consensus as evidence_cest,
  m.ncm_prefix,
  m.legal_description,
  m.version_key,
  (m.rule_match_count=1) as unique_legal_rule,
  (
    m.rule_match_count=1
    and c.cest_consensus is not null
    and c.cest_consensus<>m.rule_cest
  ) as cest_rule_mismatch
from matches m
left join public.product_fiscal_evidence_consensus_v1 c
  on c.product_id=m.product_id
where m.rule_match_count=1;

revoke all on table public.product_fiscal_rule_integrity_v1 from anon, authenticated;
grant select on table public.product_fiscal_rule_integrity_v1 to service_role;

create or replace function public.refresh_product_fiscal_rule_integrity_v1()
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_opened integer:=0;
  v_resolved integer:=0;
begin
  insert into public.product_fiscal_review_items(
    product_id,issue_code,severity,status,title,details,detected_by
  )
  select
    i.product_id,
    'cest_rule_mismatch',
    'blocker',
    'open',
    'CEST da evidência diverge da regra legal candidata',
    jsonb_build_object(
      'rule_cest',i.rule_cest,
      'evidence_cest',i.evidence_cest,
      'rule_id',i.rule_id,
      'rule_version',i.version_key,
      'ncm_prefix',i.ncm_prefix,
      'legal_description',i.legal_description
    ),
    'rule_integrity_r0_9'
  from public.product_fiscal_rule_integrity_v1 i
  where i.cest_rule_mismatch
  on conflict (product_id,issue_code) where status in ('open','in_review')
  do update set
    severity='blocker',
    title=excluded.title,
    details=excluded.details,
    detected_by=excluded.detected_by,
    updated_at=now();
  get diagnostics v_opened=row_count;

  with resolved as (
    update public.product_fiscal_review_items r
       set status='resolved',
           resolved_at=now(),
           resolution_note='Divergência CEST x regra legal deixou de existir.',
           updated_at=now()
     where r.detected_by='rule_integrity_r0_9'
       and r.issue_code='cest_rule_mismatch'
       and r.status in ('open','in_review')
       and not exists (
         select 1
         from public.product_fiscal_rule_integrity_v1 i
         where i.product_id=r.product_id
           and i.cest_rule_mismatch
       )
    returning 1
  )
  select count(*) into v_resolved from resolved;

  perform public.refresh_product_fiscal_review_state_v1();

  return jsonb_build_object(
    'ok',true,
    'mismatches_touched',v_opened,
    'resolved_stale',v_resolved,
    'external_write',false
  );
end;
$$;

revoke all on function public.refresh_product_fiscal_rule_integrity_v1() from public;
grant execute on function public.refresh_product_fiscal_rule_integrity_v1() to service_role;

comment on view public.product_fiscal_rule_integrity_v1 is
  'Compares single legal CEST candidate against material CEST evidence. Mismatch is fail-closed.';
comment on function public.refresh_product_fiscal_rule_integrity_v1() is
  'Creates/removes blocker reviews for legal-rule versus evidence CEST mismatch. No Bling/products writes.';

commit;
