begin;

-- Marketing render worker hardening V3.
-- Internal queue safety only: no publication, provider call, AI call, or rollout activation.

create or replace function public.claim_marketing_render_jobs_v3(
  p_worker text,
  p_limit integer default 5,
  p_lease_seconds integer default 300,
  p_max_attempts integer default 5
) returns setof public.marketing_render_jobs
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_runtime public.marketing_runtime_config%rowtype;
  v_max_attempts integer:=greatest(1,least(coalesce(p_max_attempts,5),20));
begin
  select * into v_runtime from public.marketing_runtime_config where id=1;
  if not found or v_runtime.kill_switch or not v_runtime.enabled or not v_runtime.generation_enabled then return; end if;

  update public.marketing_render_jobs j
  set status='review_required',
      lease_owner=null,
      lease_until=null,
      last_error=coalesce(nullif(j.last_error,''),'max_attempts_exhausted'),
      updated_at=now()
  where (j.status='queued' or (j.status='processing' and j.lease_until<now()))
    and j.attempt_count>=v_max_attempts;

  return query
  with picked as (
    select j.id
    from public.marketing_render_jobs j
    where (j.status='queued' or (j.status='processing' and j.lease_until<now()))
      and j.attempt_count<v_max_attempts
      and j.render_kind in ('deterministic_image','economical_video','ai_image','ai_video')
    order by j.created_at,j.id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,5),20))
  )
  update public.marketing_render_jobs j
  set status='processing',
      lease_owner=left(coalesce(nullif(trim(p_worker),''),'worker'),120),
      lease_until=now()+make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,300),1800))),
      attempt_count=j.attempt_count+1,
      started_at=coalesce(j.started_at,now()),
      updated_at=now()
  from picked
  where j.id=picked.id
  returning j.*;
end;
$$;

create or replace function public.complete_marketing_render_v3(
  p_job_id uuid,
  p_worker text,
  p_success boolean,
  p_output_spec jsonb default '{}'::jsonb,
  p_error text default null,
  p_actual_cost_cents integer default 0
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_job public.marketing_render_jobs%rowtype;
  v_status text;
  v_cost integer:=greatest(0,coalesce(p_actual_cost_cents,0));
begin
  select * into v_job from public.marketing_render_jobs where id=p_job_id for update;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found','external_side_effect',false); end if;

  if v_job.status in ('rendered','failed','review_required','cancelled') and v_job.lease_owner is null then
    return jsonb_build_object('ok',true,'job_id',p_job_id,'status',v_job.status,'idempotent',true,'external_side_effect',false);
  end if;

  if v_job.status<>'processing' or coalesce(v_job.lease_owner,'')<>coalesce(p_worker,'') then
    return jsonb_build_object('ok',false,'error','lease_mismatch','external_side_effect',false);
  end if;

  v_status:=case when p_success then 'rendered' else 'failed' end;
  update public.marketing_render_jobs
  set status=v_status,
      output_spec=case when p_success then coalesce(p_output_spec,'{}'::jsonb) else output_spec end,
      actual_cost_cents=v_cost,
      last_error=case when p_success then null else left(coalesce(nullif(p_error,''),'render_failed'),2000) end,
      lease_owner=null,
      lease_until=null,
      finished_at=now(),
      updated_at=now()
  where id=p_job_id;

  update public.marketing_assets
  set status=v_status,
      output_spec=case when p_success then coalesce(p_output_spec,'{}'::jsonb) else output_spec end,
      actual_cost_cents=greatest(0,coalesce(actual_cost_cents,0)-greatest(0,coalesce(v_job.actual_cost_cents,0))+v_cost),
      updated_at=now()
  where id=v_job.asset_id;

  insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
  values(
    'render_job',p_job_id::text,
    case when p_success then 'render_completed' else 'render_failed' end,
    jsonb_build_object('asset_id',v_job.asset_id,'render_kind',v_job.render_kind,'actual_cost_cents',v_cost,'worker',left(coalesce(p_worker,''),120)),
    false
  );

  return jsonb_build_object('ok',true,'job_id',p_job_id,'status',v_status,'idempotent',false,'external_side_effect',false);
end;
$$;

revoke all on function public.claim_marketing_render_jobs_v3(text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.complete_marketing_render_v3(uuid,text,boolean,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.claim_marketing_render_jobs_v3(text,integer,integer,integer) to service_role;
grant execute on function public.complete_marketing_render_v3(uuid,text,boolean,jsonb,text,integer) to service_role;

commit;
