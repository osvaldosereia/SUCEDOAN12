-- Marketing Admin / Organic Social — Round 10 observability foundation.
-- Deterministic, read-only health/confidence model. No external activation.

create or replace function public.marketing_observability_read_model_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_runtime public.marketing_runtime_config%rowtype;
  v_jobs integer := 0;
  v_published integer := 0;
  v_failed integer := 0;
  v_touchpoints integer := 0;
  v_external integer := 0;
  v_stale integer := 0;
  v_channels jsonb := '[]'::jsonb;
begin
  select * into v_runtime from public.marketing_runtime_config where id=1;

  select count(*),
         count(*) filter(where status='published'),
         count(*) filter(where status in ('failed','review_required')),
         count(*) filter(where status='scheduled' and scheduled_for < now()-interval '15 minutes')
    into v_jobs,v_published,v_failed,v_stale
  from public.marketing_publication_jobs;

  select count(*) into v_touchpoints from public.marketing_attribution_touchpoints;

  select count(*) into v_external
  from public.marketing_events
  where external_side_effect=true;

  with c as (
    select channel,
           count(*)::integer jobs,
           count(*) filter(where status='published')::integer published,
           count(*) filter(where status in ('failed','review_required'))::integer attention
    from public.marketing_publication_jobs
    group by channel
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel',channel,'jobs',jobs,'published',published,'attention',attention,
    'evidence',case when published>=3 then 'observational' else 'insufficient' end,
    'auto_action',false
  ) order by channel),'[]'::jsonb) into v_channels from c;

  return jsonb_build_object(
    'ok',true,
    'mode','observe_only',
    'runtime',jsonb_build_object(
      'enabled',coalesce(v_runtime.enabled,false),
      'execution_mode',coalesce(v_runtime.execution_mode,'off'),
      'kill_switch',coalesce(v_runtime.kill_switch,true),
      'publishing_enabled',coalesce(v_runtime.publishing_enabled,false),
      'max_daily_publications',coalesce(v_runtime.max_daily_publications,0)
    ),
    'counts',jsonb_build_object(
      'publication_jobs',v_jobs,'published',v_published,'attention',v_failed,
      'stale_scheduled',v_stale,'touchpoints',v_touchpoints,'external_side_effect_events',v_external
    ),
    'channels',v_channels,
    'confidence',jsonb_build_object(
      'status',case when v_published>=3 and v_touchpoints>=5 then 'observational' else 'insufficient_data' end,
      'minimum_publications',3,'minimum_touchpoints',5,
      'performance_claims_allowed',v_published>=3 and v_touchpoints>=5
    ),
    'policy',jsonb_build_object(
      'deterministic_only',true,'ai_used',false,'auto_action',false,
      'auto_schedule',false,'auto_publish',false
    ),
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.marketing_observability_read_model_v1() from public,anon,authenticated;
grant execute on function public.marketing_observability_read_model_v1() to service_role;

comment on function public.marketing_observability_read_model_v1()
is 'Round 10: deterministic observe-only health/confidence model; never mutates marketing state.';
