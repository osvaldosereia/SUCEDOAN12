begin;

-- Marketing Render Diagnostics V15 — read-only stuck lease/failure drill-down.
-- No rendering, retry, provider call, publication or paid side effect.

create or replace function public.marketing_render_diagnostics_read_model_v1(
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now(),
  p_stuck_after_seconds integer default 600,
  p_limit integer default 25
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_from timestamptz:=coalesce(p_from,now()-interval '30 days');
  v_to timestamptz:=coalesce(p_to,now());
  v_now timestamptz:=now();
  v_stuck integer:=greatest(60,least(coalesce(p_stuck_after_seconds,600),86400));
  v_limit integer:=greatest(1,least(coalesce(p_limit,25),100));
begin
  if v_to<=v_from or v_to-v_from>interval '366 days' then
    return jsonb_build_object('ok',false,'error','invalid_render_diagnostics_window','external_side_effect',false);
  end if;

  return jsonb_build_object(
    'ok',true,
    'window',jsonb_build_object('from',v_from,'to',v_to,'stuck_after_seconds',v_stuck),
    'summary',jsonb_build_object(
      'expired_leases',(select count(*) from public.marketing_render_jobs where status='processing' and lease_until is not null and lease_until<v_now and created_at>=v_from and created_at<v_to),
      'processing_without_lease',(select count(*) from public.marketing_render_jobs where status='processing' and lease_until is null and created_at>=v_from and created_at<v_to),
      'queued_over_threshold',(select count(*) from public.marketing_render_jobs where status='queued' and created_at<v_now-make_interval(secs=>v_stuck) and created_at>=v_from and created_at<v_to),
      'failed_recent',(select count(*) from public.marketing_render_jobs where status in ('failed','review_required') and created_at>=v_from and created_at<v_to)
    ),
    'potentially_stuck',coalesce((
      select jsonb_agg(to_jsonb(q) order by q.age_seconds desc)
      from (
        select id as job_id,asset_id,render_kind,status,attempt_count,
          greatest(0,extract(epoch from (v_now-created_at))::bigint) as age_seconds,
          lease_until,
          case
            when status='processing' and lease_until is null then 'processing_without_lease'
            when status='processing' and lease_until<v_now then 'expired_lease'
            when status='queued' and created_at<v_now-make_interval(secs=>v_stuck) then 'queued_over_threshold'
            else 'unknown'
          end as reason,
          created_at,updated_at
        from public.marketing_render_jobs
        where created_at>=v_from and created_at<v_to
          and ((status='processing' and (lease_until is null or lease_until<v_now))
            or (status='queued' and created_at<v_now-make_interval(secs=>v_stuck)))
        order by created_at asc
        limit v_limit
      ) q
    ),'[]'::jsonb),
    'recent_failures',coalesce((
      select jsonb_agg(to_jsonb(q) order by q.updated_at desc)
      from (
        select id as job_id,asset_id,render_kind,status,attempt_count,created_at,started_at,finished_at,updated_at,
          case
            when last_error is null or btrim(last_error)='' then 'unspecified'
            when lower(last_error) like '%timeout%' or lower(last_error) like '%timed out%' then 'timeout'
            when lower(last_error) like '%rate%limit%' or lower(last_error) like '%429%' then 'rate_limit'
            when lower(last_error) like '%auth%' or lower(last_error) like '%401%' or lower(last_error) like '%403%' then 'authentication'
            when lower(last_error) like '%storage%' or lower(last_error) like '%bucket%' then 'storage'
            when lower(last_error) like '%valid%' or lower(last_error) like '%schema%' then 'validation'
            when lower(last_error) like '%network%' or lower(last_error) like '%fetch%' then 'network'
            else 'other'
          end as error_class
        from public.marketing_render_jobs
        where created_at>=v_from and created_at<v_to and status in ('failed','review_required')
        order by updated_at desc
        limit v_limit
      ) q
    ),'[]'::jsonb),
    'redaction',jsonb_build_object('raw_error_exposed',false,'input_spec_exposed',false,'output_spec_exposed',false,'lease_owner_exposed',false),
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.marketing_render_diagnostics_read_model_v1(timestamptz,timestamptz,integer,integer) from public,anon,authenticated;
grant execute on function public.marketing_render_diagnostics_read_model_v1(timestamptz,timestamptz,integer,integer) to service_role;

comment on function public.marketing_render_diagnostics_read_model_v1(timestamptz,timestamptz,integer,integer) is 'Read-only Marketing renderer diagnostics: expired/missing leases, old queued jobs and redacted failure classes. No retry/provider/publication side effect.';

insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
values('runtime','1','render_diagnostics_v15_ready',jsonb_build_object('read_only',true,'raw_error_exposed',false,'external_side_effect',false),false);

commit;