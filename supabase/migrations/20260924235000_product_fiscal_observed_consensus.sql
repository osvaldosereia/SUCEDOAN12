begin;

create or replace view public.product_fiscal_evidence_consensus_v1
with (security_invoker = true)
as
select
  p.id as product_id,
  p.is_active,
  p.name,
  p.gtin as product_gtin,
  pf.ncm as profile_ncm,
  pf.cest as profile_cest,
  pf.origin_code as profile_origin_code,
  count(e.id)::bigint as evidence_count,
  count(distinct e.document_key) filter (where e.document_key is not null)::bigint as document_count,
  count(distinct e.ncm) filter (where e.ncm is not null)::bigint as ncm_distinct_count,
  case when count(distinct e.ncm) filter (where e.ncm is not null)=1
       then min(e.ncm) filter (where e.ncm is not null) end as ncm_consensus,
  count(distinct e.cest) filter (where e.cest is not null)::bigint as cest_distinct_count,
  case when count(distinct e.cest) filter (where e.cest is not null)=1
       then min(e.cest) filter (where e.cest is not null) end as cest_consensus,
  count(distinct e.origin_code) filter (where e.origin_code is not null)::bigint as origin_distinct_count,
  case when count(distinct e.origin_code) filter (where e.origin_code is not null)=1
       then min(e.origin_code) filter (where e.origin_code is not null) end as origin_consensus,
  max(coalesce(e.observed_at,e.created_at)) as last_evidence_at,
  (
    count(distinct e.ncm) filter (where e.ncm is not null)>1
    or (
      pf.ncm is not null
      and exists (
        select 1
        from public.product_fiscal_evidence ex
        where ex.product_id=p.id
          and ex.evidence_type<>'official_mt_legal_rule'
          and ex.ncm is not null
          and ex.ncm<>pf.ncm
      )
    )
  ) as ncm_conflict,
  (count(distinct e.cest) filter (where e.cest is not null)>1) as cest_conflict,
  (count(distinct e.origin_code) filter (where e.origin_code is not null)>1) as origin_variation
from public.products p
left join public.product_fiscal_profiles pf on pf.product_id=p.id
left join public.product_fiscal_evidence e
  on e.product_id=p.id
 and e.evidence_type<>'official_mt_legal_rule'
group by p.id,p.is_active,p.name,p.gtin,pf.ncm,pf.cest,pf.origin_code;

revoke all on table public.product_fiscal_evidence_consensus_v1 from anon, authenticated;
grant select on table public.product_fiscal_evidence_consensus_v1 to service_role;

create or replace function public.reconcile_product_fiscal_strict_validation_v1()
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_demoted integer:=0;
  v_validated integer:=0;
  v_blocked integer:=0;
begin
  with ineligible as (
    select pf.product_id
    from public.product_fiscal_profiles pf
    where pf.review_status='auto_validated'
      and coalesce(pf.metadata->>'strict_validation_policy','')='r0_10'
      and not exists (
        select 1
        from public.product_fiscal_strict_validation_preview_v1 v
        where v.product_id=pf.product_id
          and v.validation_eligible
      )
  ),
  upd as (
    update public.product_fiscal_profiles pf
       set review_status='pending',
           validated_at=null,
           classification_confidence=least(coalesce(pf.classification_confidence,0.88),0.92),
           metadata=coalesce(pf.metadata,'{}'::jsonb) || jsonb_build_object(
             'strict_validation_revoked_at',now(),
             'strict_validation_revoked_reason','new_or_changed_observed_evidence'
           ),
           updated_at=now()
      from ineligible i
     where pf.product_id=i.product_id
    returning pf.product_id
  )
  select count(*) into v_demoted from upd;

  perform public.refresh_product_fiscal_review_state_v1();

  select count(*) into v_blocked
  from public.product_fiscal_profiles
  where review_status='blocked';

  with applied as (
    select public.apply_product_fiscal_strict_validation_v1() as result
  )
  select coalesce((result->>'profiles_auto_validated')::integer,0)
    into v_validated
  from applied;

  return jsonb_build_object(
    'ok',true,
    'auto_validated_demoted',v_demoted,
    'auto_validated_applied',v_validated,
    'blocked_profiles',v_blocked,
    'external_write',false
  );
end;
$$;

revoke all on function public.reconcile_product_fiscal_strict_validation_v1() from public;
grant execute on function public.reconcile_product_fiscal_strict_validation_v1() to service_role;

comment on view public.product_fiscal_evidence_consensus_v1 is
  'Observed-evidence consensus only. Excludes official_mt_legal_rule to avoid circular validation.';
comment on function public.reconcile_product_fiscal_strict_validation_v1() is
  'Revokes strict auto-validation when observed evidence no longer satisfies gates, then re-applies strict validation where eligible. No Bling/products write.';

commit;
