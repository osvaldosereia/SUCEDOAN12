begin;

create or replace function public.refresh_product_fiscal_origin_consensus_v1()
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_updated integer:=0;
begin
  with consensus as (
    select
      c.product_id,
      c.origin_consensus,
      c.evidence_count,
      c.origin_variation
    from public.product_fiscal_evidence_consensus_v1 c
    join public.products p on p.id=c.product_id
    where p.is_active
      and c.evidence_count>0
      and c.origin_consensus is not null
      and coalesce(c.origin_variation,false)=false
  ),
  upd as (
    update public.product_fiscal_profiles pf
       set origin_code=c.origin_consensus,
           metadata=coalesce(pf.metadata,'{}'::jsonb) || jsonb_build_object(
             'origin_candidate_source','evidence_consensus_v1',
             'origin_candidate_evidence_count',c.evidence_count,
             'origin_candidate_at',now()
           ),
           updated_at=now()
      from consensus c
     where pf.product_id=c.product_id
       and pf.origin_code is null
       and pf.review_status<>'blocked'
    returning pf.product_id
  )
  select count(*) into v_updated from upd;

  return jsonb_build_object(
    'ok',true,
    'origin_profiles_updated',v_updated,
    'external_write',false
  );
end;
$$;

revoke all on function public.refresh_product_fiscal_origin_consensus_v1() from public;
grant execute on function public.refresh_product_fiscal_origin_consensus_v1() to service_role;

comment on function public.refresh_product_fiscal_origin_consensus_v1() is
  'Copies origin to fiscal profile only when all available evidence agrees. No product/Bling mutation.';

commit;
