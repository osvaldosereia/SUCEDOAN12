begin;

-- Marketing Render Triage V19 — read-only SLA observability.
-- Fixed operational thresholds only; no retry, requeue, provider call or publication.

create or replace function public.marketing_render_triage_sla_v1()
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_now timestamptz := now();
  v_pending_warning bigint := 0;
  v_pending_critical bigint := 0;
  v_approved_warning bigint := 0;
  v_approved_critical bigint := 0;
  v_status text := 'healthy';
begin
  select
    count(*) filter (
      where status='pending_review'
        and requested_at <= v_now - interval '1 hour'
        and requested_at > v_now - interval '6 hours'
    ),
    count(*) filter (
      where status='pending_review'
        and requested_at <= v_now - interval '6 hours'
    ),
    count(*) filter (
      where status='approved'
        and coalesce(reviewed_at,requested_at) <= v_now - interval '1 hour'
        and coalesce(reviewed_at,requested_at) > v_now - interval '6 hours'
    ),
    count(*) filter (
      where status='approved'
        and coalesce(reviewed_at,requested_at) <= v_now - interval '6 hours'
    )
  into v_pending_warning,v_pending_critical,v_approved_warning,v_approved_critical
  from public.marketing_render_triage_requests;

  if v_pending_critical > 0 or v_approved_critical > 0 then
    v_status := 'critical';
  elsif v_pending_warning > 0 or v_approved_warning > 0 then
    v_status := 'warning';
  end if;

  return jsonb_build_object(
    'ok',true,
    'status',v_status,
    'thresholds_seconds',jsonb_build_object(
      'warning',3600,
      'critical',21600
    ),
    'pending_review',jsonb_build_object(
      'warning',v_pending_warning,
      'critical',v_pending_critical
    ),
    'approved_waiting_execution',jsonb_build_object(
      'warning',v_approved_warning,
      'critical',v_approved_critical
    ),
    'redaction',jsonb_build_object(
      'request_ids_exposed',false,
      'job_ids_exposed',false,
      'actor_ids_exposed',false,
      'idempotency_key_exposed',false,
      'raw_error_exposed',false,
      'job_payload_exposed',false
    ),
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.marketing_render_triage_sla_v1() from public,anon,authenticated;
grant execute on function public.marketing_render_triage_sla_v1() to service_role;

commit;
