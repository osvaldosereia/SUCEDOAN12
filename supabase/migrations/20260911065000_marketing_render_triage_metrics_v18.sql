begin;

-- Marketing Render Triage V18 — compact, redacted, read-only counters.
-- No mutation, retry, requeue, provider call or publisher is introduced here.

create or replace function public.marketing_render_triage_metrics_v1()
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_now timestamptz := now();
  v_total bigint := 0;
  v_pending bigint := 0;
  v_approved bigint := 0;
  v_blocked bigint := 0;
  v_executed bigint := 0;
  v_cancelled bigint := 0;
  v_pending_lt_15m bigint := 0;
  v_pending_15_60m bigint := 0;
  v_pending_1_6h bigint := 0;
  v_pending_6_24h bigint := 0;
  v_pending_gt_24h bigint := 0;
  v_oldest_pending_seconds bigint := 0;
  v_oldest_approved_seconds bigint := 0;
begin
  select
    count(*),
    count(*) filter (where status='pending_review'),
    count(*) filter (where status='approved'),
    count(*) filter (where status='blocked'),
    count(*) filter (where status='executed'),
    count(*) filter (where status='cancelled'),
    count(*) filter (where status='pending_review' and requested_at > v_now - interval '15 minutes'),
    count(*) filter (where status='pending_review' and requested_at <= v_now - interval '15 minutes' and requested_at > v_now - interval '1 hour'),
    count(*) filter (where status='pending_review' and requested_at <= v_now - interval '1 hour' and requested_at > v_now - interval '6 hours'),
    count(*) filter (where status='pending_review' and requested_at <= v_now - interval '6 hours' and requested_at > v_now - interval '24 hours'),
    count(*) filter (where status='pending_review' and requested_at <= v_now - interval '24 hours')
  into
    v_total,v_pending,v_approved,v_blocked,v_executed,v_cancelled,
    v_pending_lt_15m,v_pending_15_60m,v_pending_1_6h,v_pending_6_24h,v_pending_gt_24h
  from public.marketing_render_triage_requests;

  select coalesce(max(extract(epoch from (v_now-requested_at)))::bigint,0)
    into v_oldest_pending_seconds
  from public.marketing_render_triage_requests
  where status='pending_review';

  select coalesce(max(extract(epoch from (v_now-coalesce(reviewed_at,requested_at))))::bigint,0)
    into v_oldest_approved_seconds
  from public.marketing_render_triage_requests
  where status='approved';

  return jsonb_build_object(
    'ok',true,
    'summary',jsonb_build_object(
      'total',v_total,
      'pending_review',v_pending,
      'approved',v_approved,
      'blocked',v_blocked,
      'executed',v_executed,
      'cancelled',v_cancelled
    ),
    'pending_age_buckets',jsonb_build_object(
      'lt_15m',v_pending_lt_15m,
      'm15_to_60m',v_pending_15_60m,
      'h1_to_6h',v_pending_1_6h,
      'h6_to_24h',v_pending_6_24h,
      'gt_24h',v_pending_gt_24h
    ),
    'oldest_pending_seconds',v_oldest_pending_seconds,
    'oldest_approved_seconds',v_oldest_approved_seconds,
    'redaction',jsonb_build_object(
      'eligibility_snapshot_exposed',false,
      'result_snapshot_exposed',false,
      'idempotency_key_exposed',false,
      'actor_ids_exposed',false,
      'raw_error_exposed',false,
      'job_payload_exposed',false
    ),
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.marketing_render_triage_metrics_v1() from public,anon,authenticated;
grant execute on function public.marketing_render_triage_metrics_v1() to service_role;

commit;
