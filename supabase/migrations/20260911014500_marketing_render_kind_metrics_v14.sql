begin;

-- Marketing Render Metrics V14 — read-only renderer observability by render_kind.
-- No provider calls, publication, rendering, AI invocation or paid side effects.

create or replace function public.marketing_render_metrics_read_model_v1(
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_from timestamptz:=coalesce(p_from,now()-interval '30 days');
  v_to timestamptz:=coalesce(p_to,now());
begin
  if v_to<=v_from or v_to-v_from>interval '366 days' then
    return jsonb_build_object('ok',false,'error','invalid_render_metrics_window','external_side_effect',false);
  end if;

  return jsonb_build_object(
    'ok',true,
    'window',jsonb_build_object('from',v_from,'to',v_to),
    'jobs',jsonb_build_object(
      'total',(select count(*) from public.marketing_render_jobs where created_at>=v_from and created_at<v_to),
      'queued',(select count(*) from public.marketing_render_jobs where status='queued' and created_at>=v_from and created_at<v_to),
      'processing',(select count(*) from public.marketing_render_jobs where status='processing' and created_at>=v_from and created_at<v_to),
      'rendered',(select count(*) from public.marketing_render_jobs where status='rendered' and created_at>=v_from and created_at<v_to),
      'failed',(select count(*) from public.marketing_render_jobs where status='failed' and created_at>=v_from and created_at<v_to),
      'review_required',(select count(*) from public.marketing_render_jobs where status='review_required' and created_at>=v_from and created_at<v_to),
      'cancelled',(select count(*) from public.marketing_render_jobs where status='cancelled' and created_at>=v_from and created_at<v_to),
      'by_status',coalesce((select jsonb_object_agg(status,cnt) from (select status,count(*) cnt from public.marketing_render_jobs where created_at>=v_from and created_at<v_to group by status) q),'{}'::jsonb),
      'by_kind',coalesce((select jsonb_object_agg(render_kind,cnt) from (select render_kind,count(*) cnt from public.marketing_render_jobs where created_at>=v_from and created_at<v_to group by render_kind) q),'{}'::jsonb),
      'by_kind_detail',coalesce((
        select jsonb_object_agg(render_kind,jsonb_build_object(
          'total',total,
          'rendered',rendered,
          'failed',failed,
          'review_required',review_required,
          'jobs_retried',jobs_retried,
          'attempts_total',attempts_total,
          'success_rate_percent',case when completed=0 then 0 else round(100.0*rendered/completed,2) end
        ))
        from (
          select render_kind,
            count(*)::bigint total,
            count(*) filter(where status='rendered')::bigint rendered,
            count(*) filter(where status='failed')::bigint failed,
            count(*) filter(where status='review_required')::bigint review_required,
            count(*) filter(where attempt_count>1)::bigint jobs_retried,
            coalesce(sum(attempt_count),0)::bigint attempts_total,
            count(*) filter(where status in ('rendered','failed','review_required'))::bigint completed
          from public.marketing_render_jobs
          where created_at>=v_from and created_at<v_to
          group by render_kind
        ) q
      ),'{}'::jsonb)
    ),
    'latency_ms',jsonb_build_object(
      'avg_queue_wait',coalesce((select round(avg(extract(epoch from (started_at-created_at))*1000))::bigint from public.marketing_render_jobs where created_at>=v_from and created_at<v_to and started_at is not null and started_at>=created_at),0),
      'p95_queue_wait',coalesce((select round(percentile_cont(0.95) within group (order by extract(epoch from (started_at-created_at))*1000))::bigint from public.marketing_render_jobs where created_at>=v_from and created_at<v_to and started_at is not null and started_at>=created_at),0),
      'avg_render',coalesce((select round(avg(extract(epoch from (finished_at-started_at))*1000))::bigint from public.marketing_render_jobs where created_at>=v_from and created_at<v_to and started_at is not null and finished_at is not null and finished_at>=started_at),0),
      'p95_render',coalesce((select round(percentile_cont(0.95) within group (order by extract(epoch from (finished_at-started_at))*1000))::bigint from public.marketing_render_jobs where created_at>=v_from and created_at<v_to and started_at is not null and finished_at is not null and finished_at>=started_at),0)
    ),
    'quality',jsonb_build_object(
      'attempts_total',coalesce((select sum(attempt_count)::bigint from public.marketing_render_jobs where created_at>=v_from and created_at<v_to),0),
      'jobs_retried',(select count(*) from public.marketing_render_jobs where created_at>=v_from and created_at<v_to and attempt_count>1),
      'success_rate_percent',case when (select count(*) from public.marketing_render_jobs where created_at>=v_from and created_at<v_to and status in ('rendered','failed','review_required'))=0 then 0 else round(100.0*(select count(*) from public.marketing_render_jobs where created_at>=v_from and created_at<v_to and status='rendered')/(select count(*) from public.marketing_render_jobs where created_at>=v_from and created_at<v_to and status in ('rendered','failed','review_required')),2) end
    ),
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.marketing_render_metrics_read_model_v1(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.marketing_render_metrics_read_model_v1(timestamptz,timestamptz) to service_role;

comment on function public.marketing_render_metrics_read_model_v1(timestamptz,timestamptz) is 'Read-only Marketing renderer metrics including deterministic per-render_kind failure/retry breakdown; no provider or publication side effect.';

insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
values('runtime','1','render_kind_metrics_v14_ready',jsonb_build_object('read_only',true,'external_side_effect',false),false);

commit;
