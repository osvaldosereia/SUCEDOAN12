begin;

create or replace function public.refresh_product_fiscal_candidates_r0_3()
returns jsonb
language plpgsql
security invoker
set search_path=public
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
      updated_at=now()
    from chosen ch
    where pf.product_id=ch.product_id
      and pf.review_status='pending'
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
    'preserves_validated_profiles',true,
    'external_write',false
  );
end;
$$;

revoke all on function public.refresh_product_fiscal_candidates_r0_3() from public;
grant execute on function public.refresh_product_fiscal_candidates_r0_3() to service_role;

comment on function public.refresh_product_fiscal_candidates_r0_3() is
  'Promotes only pending profiles to candidate. Never downgrades blocked, auto_validated or human_validated profiles.';

commit;
