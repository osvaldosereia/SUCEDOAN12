begin;

create or replace view public.product_fiscal_bling_diff_v1
with (security_invoker = true)
as
with latest_bling as (
  select distinct on (e.product_id)
    e.product_id,
    e.document_key as bling_product_id_evidence,
    e.ncm as bling_ncm,
    e.cest as bling_cest,
    e.origin_code as bling_origin_code,
    e.observed_at as bling_observed_at,
    e.evidence_payload as bling_payload
  from public.product_fiscal_evidence e
  where e.evidence_type='bling_product_detail'
  order by e.product_id,e.observed_at desc nulls last,e.created_at desc
)
select
  p.id as product_id,
  p.name,
  p.gtin,
  coalesce(p.bling_product_id,l.bling_id) as bling_product_id,
  pf.ncm as proposed_ncm,
  pf.cest as proposed_cest,
  pf.origin_code as proposed_origin_code,
  pf.review_status,
  pf.st_status,
  pf.rule_version,
  pf.classification_source,
  lb.bling_ncm,
  lb.bling_cest,
  lb.bling_origin_code,
  lb.bling_observed_at,
  case
    when not s.sync_eligible then 'not_sync_eligible'
    when lb.product_id is null then 'bling_not_audited'
    when lb.bling_ncm is distinct from pf.ncm then 'ncm_diff'
    when lb.bling_origin_code is distinct from pf.origin_code then 'origin_diff'
    when lb.bling_cest is not null and lb.bling_cest<>pf.cest then 'cest_diff'
    when lb.bling_cest=pf.cest then 'aligned'
    when lb.bling_cest is null and pf.cest is not null then 'cest_missing'
    else 'review_required'
  end as diff_status,
  (
    s.sync_eligible
    and lb.product_id is not null
    and lb.bling_ncm=pf.ncm
    and lb.bling_origin_code=pf.origin_code
    and lb.bling_cest is null
    and pf.cest is not null
    and lb.bling_observed_at >= now()-interval '24 hours'
  ) as canary_eligible,
  jsonb_build_object(
    'tributacao',
    jsonb_build_object(
      'ncm',pf.ncm,
      'cest',pf.cest,
      'origem',pf.origin_code
    )
  ) as proposed_patch,
  lb.bling_payload as current_bling_snapshot
from public.products p
join public.product_fiscal_profiles pf on pf.product_id=p.id
join public.product_fiscal_bling_sync_preview_v1 s on s.product_id=p.id
left join public.bling_hub_entity_links_v2 l
  on l.entity_type='product'
 and l.source_id=p.id::text
 and l.status='matched'
left join latest_bling lb on lb.product_id=p.id
where p.is_active;

revoke all on table public.product_fiscal_bling_diff_v1 from anon, authenticated;
grant select on table public.product_fiscal_bling_diff_v1 to service_role;

create or replace function public.get_product_fiscal_bling_diff_summary_v1()
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
  select jsonb_build_object(
    'ok',true,
    'validated_sync_eligible',count(*) filter (where diff_status<>'not_sync_eligible'),
    'already_aligned',count(*) filter (where diff_status='aligned'),
    'cest_missing',count(*) filter (where diff_status='cest_missing'),
    'cest_diff',count(*) filter (where diff_status='cest_diff'),
    'ncm_diff',count(*) filter (where diff_status='ncm_diff'),
    'origin_diff',count(*) filter (where diff_status='origin_diff'),
    'bling_not_audited',count(*) filter (where diff_status='bling_not_audited'),
    'canary_eligible',count(*) filter (where canary_eligible),
    'external_write',false
  )
  from public.product_fiscal_bling_diff_v1;
$$;

revoke all on function public.get_product_fiscal_bling_diff_summary_v1() from public;
grant execute on function public.get_product_fiscal_bling_diff_summary_v1() to service_role;

comment on view public.product_fiscal_bling_diff_v1 is
  'Read-only diff between validated canonical fiscal profile and latest Bling product taxation. Canary allowed only when NCM+origin already match and remote CEST is blank.';
comment on function public.get_product_fiscal_bling_diff_summary_v1() is
  'Read-only summary for fiscal product synchronization planning.';

commit;
