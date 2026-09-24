begin;

insert into public.product_fiscal_review_items (
  product_id,issue_code,severity,status,title,details,detected_by
)
select
  c.product_id,
  'ncm_evidence_conflict',
  'blocker',
  'open',
  'NCM do cadastro diverge da evidência fiscal',
  jsonb_build_object(
    'profile_ncm',c.profile_ncm,
    'evidence_ncm_consensus',c.ncm_consensus,
    'evidence_count',c.evidence_count,
    'document_count',c.document_count,
    'last_evidence_at',c.last_evidence_at
  ),
  'evidence_consensus_r0_2'
from public.product_fiscal_evidence_consensus_v1 c
where c.is_active and c.ncm_conflict
on conflict (product_id,issue_code) where status in ('open','in_review')
do update set
  severity='blocker',
  title=excluded.title,
  details=excluded.details,
  detected_by=excluded.detected_by,
  updated_at=now();

insert into public.product_fiscal_review_items (
  product_id,issue_code,severity,status,title,details,detected_by
)
select
  c.product_id,
  'cest_evidence_conflict',
  'blocker',
  'open',
  'CEST possui evidências conflitantes',
  jsonb_build_object(
    'profile_cest',c.profile_cest,
    'evidence_cest_consensus',c.cest_consensus,
    'evidence_count',c.evidence_count,
    'document_count',c.document_count,
    'last_evidence_at',c.last_evidence_at
  ),
  'evidence_consensus_r0_2'
from public.product_fiscal_evidence_consensus_v1 c
where c.is_active and c.cest_conflict
on conflict (product_id,issue_code) where status in ('open','in_review')
do update set
  severity='blocker',
  title=excluded.title,
  details=excluded.details,
  detected_by=excluded.detected_by,
  updated_at=now();

update public.product_fiscal_review_items r
set status='resolved',resolved_at=now(),resolution_note='Conflito deixou de existir no consenso de evidências.',updated_at=now()
where r.status in ('open','in_review')
  and r.detected_by='evidence_consensus_r0_2'
  and r.issue_code='ncm_evidence_conflict'
  and not exists (
    select 1 from public.product_fiscal_evidence_consensus_v1 c
    where c.product_id=r.product_id and c.is_active and c.ncm_conflict
  );

update public.product_fiscal_review_items r
set status='resolved',resolved_at=now(),resolution_note='Conflito deixou de existir no consenso de evidências.',updated_at=now()
where r.status in ('open','in_review')
  and r.detected_by='evidence_consensus_r0_2'
  and r.issue_code='cest_evidence_conflict'
  and not exists (
    select 1 from public.product_fiscal_evidence_consensus_v1 c
    where c.product_id=r.product_id and c.is_active and c.cest_conflict
  );

commit;
