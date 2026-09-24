begin;

create or replace view public.product_fiscal_bling_sync_preview_v1
with (security_invoker = true)
as
select
  p.id as product_id,
  p.is_active,
  p.name,
  p.gtin,
  coalesce(p.bling_product_id,l.bling_id) as bling_product_id,
  pf.ncm,
  pf.cest,
  pf.origin_code,
  pf.st_status,
  pf.review_status,
  pf.rule_version,
  pf.classification_source,
  pf.classification_confidence,
  case
    when not p.is_active then 'inactive_product'
    when pf.review_status='blocked' then 'fiscal_review_blocked'
    when pf.review_status not in ('auto_validated','human_validated') then 'fiscal_profile_not_validated'
    when pf.ncm is null then 'ncm_missing'
    when pf.origin_code is null then 'origin_missing'
    when pf.st_status not in ('applicable','not_applicable') then 'st_decision_unresolved'
    when pf.st_status='applicable' and pf.cest is null then 'cest_required_for_st'
    when coalesce(p.bling_product_id,l.bling_id) is null then 'bling_product_not_linked'
    else 'ready'
  end as sync_gate,
  (
    p.is_active
    and pf.review_status in ('auto_validated','human_validated')
    and pf.ncm is not null
    and pf.origin_code is not null
    and pf.st_status in ('applicable','not_applicable')
    and (pf.st_status<>'applicable' or pf.cest is not null)
    and coalesce(p.bling_product_id,l.bling_id) is not null
  ) as sync_eligible,
  jsonb_strip_nulls(jsonb_build_object(
    'tributacao',
    jsonb_strip_nulls(jsonb_build_object(
      'ncm',pf.ncm,
      'cest',case when pf.st_status='applicable' then pf.cest else null end,
      'origem',pf.origin_code
    ))
  )) as proposed_bling_payload,
  false as external_write
from public.products p
join public.product_fiscal_profiles pf on pf.product_id=p.id
left join public.bling_hub_entity_links_v2 l
  on l.entity_type='product'
 and l.source_id=p.id::text
 and l.status='matched';

revoke all on table public.product_fiscal_bling_sync_preview_v1 from anon, authenticated;
grant select on table public.product_fiscal_bling_sync_preview_v1 to service_role;

create or replace function public.get_product_fiscal_bling_sync_summary_v1()
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
  select jsonb_build_object(
    'ok',true,
    'external_write',false,
    'total',count(*),
    'eligible',count(*) filter (where sync_eligible),
    'blocked',count(*) filter (where sync_gate='fiscal_review_blocked'),
    'not_validated',count(*) filter (where sync_gate='fiscal_profile_not_validated'),
    'origin_missing',count(*) filter (where sync_gate='origin_missing'),
    'st_unresolved',count(*) filter (where sync_gate='st_decision_unresolved'),
    'bling_link_missing',count(*) filter (where sync_gate='bling_product_not_linked')
  )
  from public.product_fiscal_bling_sync_preview_v1
  where is_active;
$$;

revoke all on function public.get_product_fiscal_bling_sync_summary_v1() from public;
grant execute on function public.get_product_fiscal_bling_sync_summary_v1() to service_role;

comment on view public.product_fiscal_bling_sync_preview_v1 is
  'Fail-closed preview for future fiscal product sync to Bling. No external writes; candidates are never eligible.';
comment on function public.get_product_fiscal_bling_sync_summary_v1() is
  'Read-only summary of fiscal-to-Bling sync gates.';

commit;
