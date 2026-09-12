begin;

-- V16 hardening: one canonical eligibility evaluator, stale-approval protection,
-- and explicit execution_mode requirement for actual requeue.

create or replace function public.marketing_render_requeue_eligibility_v1(
  p_job_id uuid,
  p_stuck_after_seconds integer default 600,
  p_ignore_request_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_job public.marketing_render_jobs%rowtype;
  v_asset public.marketing_assets%rowtype;
  v_now timestamptz:=now();
  v_stuck integer:=greatest(60,least(coalesce(p_stuck_after_seconds,600),86400));
  v_age bigint;
  v_eligible boolean:=false;
  v_reason text:='not_eligible';
  v_spec_version integer;
  v_existing uuid;
begin
  select * into v_job from public.marketing_render_jobs where id=p_job_id;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found','eligible',false,'external_side_effect',false); end if;
  select * into v_asset from public.marketing_assets where id=v_job.asset_id;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','eligible',false,'external_side_effect',false); end if;

  v_age:=greatest(0,extract(epoch from (v_now-v_job.created_at))::bigint);
  if v_job.output_spec ? 'asset_version' and coalesce(v_job.output_spec->>'asset_version','') ~ '^[0-9]+$' then
    v_spec_version:=(v_job.output_spec->>'asset_version')::integer;
  elsif coalesce(v_job.input_spec #>> '{metadata,asset_version}','') ~ '^[0-9]+$' then
    v_spec_version:=(v_job.input_spec #>> '{metadata,asset_version}')::integer;
  end if;

  if v_asset.status='archived' then v_reason:='asset_archived';
  elsif v_spec_version is not null and v_spec_version<>v_asset.version then v_reason:='asset_version_mismatch';
  elsif v_job.attempt_count>=20 then v_reason:='attempt_limit_reached';
  elsif v_job.status='processing' and v_job.lease_until is not null and v_job.lease_until>=v_now then v_reason:='active_lease';
  elsif v_job.status='processing' and v_job.lease_until is null then v_eligible:=true; v_reason:='processing_without_lease';
  elsif v_job.status='processing' and v_job.lease_until<v_now then v_eligible:=true; v_reason:='expired_lease';
  elsif v_job.status='queued' and v_job.created_at<v_now-make_interval(secs=>v_stuck) then v_eligible:=true; v_reason:='queued_over_threshold';
  elsif v_job.status='failed' then v_eligible:=true; v_reason:='failed';
  elsif v_job.status='review_required' then v_eligible:=true; v_reason:='review_required';
  elsif v_job.status in ('rendered','cancelled') then v_reason:='terminal_status';
  else v_reason:='job_not_stuck_or_failed'; end if;

  select id into v_existing from public.marketing_render_triage_requests
    where job_id=p_job_id and status in ('pending_review','approved')
      and (p_ignore_request_id is null or id<>p_ignore_request_id)
    order by created_at desc limit 1;
  if v_existing is not null then v_eligible:=false; v_reason:='open_triage_exists'; end if;

  return jsonb_build_object(
    'ok',true,'job_id',v_job.id,'asset_id',v_job.asset_id,'render_kind',v_job.render_kind,
    'job_status',v_job.status,'attempt_count',v_job.attempt_count,'age_seconds',v_age,
    'eligible',v_eligible,'reason',v_reason,'existing_request_id',v_existing,
    'asset_version',v_asset.version,'job_asset_version',v_spec_version,
    'external_side_effect',false
  );
end;
$$;

create or replace function public.preview_marketing_render_requeue_v1(p_job_id uuid,p_stuck_after_seconds integer default 600)
returns jsonb language sql security invoker set search_path=public,pg_temp as $$
  select public.marketing_render_requeue_eligibility_v1(p_job_id,p_stuck_after_seconds,null)
$$;

create or replace function public.approve_marketing_render_requeue_v1(
  p_request_id uuid,
  p_actor uuid default null,
  p_stuck_after_seconds integer default 600
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare
  v_runtime public.marketing_runtime_config%rowtype;
  v_req public.marketing_render_triage_requests%rowtype;
  v_job public.marketing_render_jobs%rowtype;
  v_preview jsonb;
begin
  select * into v_runtime from public.marketing_runtime_config where id=1;
  if not found then return jsonb_build_object('ok',false,'error','runtime_missing','external_side_effect',false); end if;
  if v_runtime.render_triage_kill_switch or not v_runtime.render_triage_enabled then return jsonb_build_object('ok',false,'error','render_triage_disabled','external_side_effect',false); end if;
  select * into v_req from public.marketing_render_triage_requests where id=p_request_id for update;
  if not found then return jsonb_build_object('ok',false,'error','triage_request_not_found','external_side_effect',false); end if;
  if v_req.status='approved' then return jsonb_build_object('ok',true,'request_id',v_req.id,'status','approved','idempotent',true,'external_side_effect',false); end if;
  if v_req.status<>'pending_review' then return jsonb_build_object('ok',false,'error','triage_request_not_pending','status',v_req.status,'external_side_effect',false); end if;
  select * into v_job from public.marketing_render_jobs where id=v_req.job_id for update;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found','external_side_effect',false); end if;
  v_preview:=public.marketing_render_requeue_eligibility_v1(v_req.job_id,p_stuck_after_seconds,v_req.id);
  if coalesce((v_preview->>'eligible')::boolean,false) is false then
    update public.marketing_render_triage_requests set status='blocked',reviewed_by=p_actor,reviewed_at=now(),updated_at=now(),result_snapshot=v_preview where id=v_req.id;
    return jsonb_build_object('ok',false,'error','requeue_no_longer_eligible','reason',v_preview->>'reason','external_side_effect',false);
  end if;
  update public.marketing_render_triage_requests set status='approved',reviewed_by=p_actor,reviewed_at=now(),updated_at=now(),result_snapshot=v_preview where id=v_req.id;
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('render_triage',v_req.id::text,'requeue_approved',p_actor,jsonb_build_object('job_id',v_req.job_id,'asset_id',v_req.asset_id,'reason',v_preview->>'reason'),false);
  return jsonb_build_object('ok',true,'request_id',v_req.id,'status','approved','idempotent',false,'external_side_effect',false);
end;
$$;

create or replace function public.execute_marketing_render_requeue_v1(
  p_request_id uuid,
  p_actor uuid default null,
  p_stuck_after_seconds integer default 600
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare
  v_runtime public.marketing_runtime_config%rowtype;
  v_req public.marketing_render_triage_requests%rowtype;
  v_job public.marketing_render_jobs%rowtype;
  v_asset public.marketing_assets%rowtype;
  v_preview jsonb;
begin
  select * into v_runtime from public.marketing_runtime_config where id=1 for update;
  if not found then return jsonb_build_object('ok',false,'error','runtime_missing','external_side_effect',false); end if;
  if v_runtime.render_triage_kill_switch or not v_runtime.render_triage_enabled or not v_runtime.render_requeue_enabled then return jsonb_build_object('ok',false,'error','render_requeue_disabled','external_side_effect',false); end if;
  if v_runtime.kill_switch or not v_runtime.enabled or not v_runtime.generation_enabled then return jsonb_build_object('ok',false,'error','marketing_generation_disabled','external_side_effect',false); end if;
  if v_runtime.execution_mode not in ('homologation','canary','live') then return jsonb_build_object('ok',false,'error','marketing_execution_mode_disabled','external_side_effect',false); end if;

  select * into v_req from public.marketing_render_triage_requests where id=p_request_id for update;
  if not found then return jsonb_build_object('ok',false,'error','triage_request_not_found','external_side_effect',false); end if;
  if v_req.status='executed' then return jsonb_build_object('ok',true,'request_id',v_req.id,'job_id',v_req.job_id,'status','executed','idempotent',true,'external_side_effect',false); end if;
  if v_req.status<>'approved' then return jsonb_build_object('ok',false,'error','triage_request_not_approved','status',v_req.status,'external_side_effect',false); end if;
  select * into v_job from public.marketing_render_jobs where id=v_req.job_id for update;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found','external_side_effect',false); end if;
  select * into v_asset from public.marketing_assets where id=v_job.asset_id for update;
  if not found or v_asset.id<>v_req.asset_id then return jsonb_build_object('ok',false,'error','asset_scope_mismatch','external_side_effect',false); end if;

  if v_job.render_kind in ('deterministic_image','economical_video') and not v_runtime.deterministic_render_enabled then return jsonb_build_object('ok',false,'error','deterministic_render_disabled','external_side_effect',false); end if;
  if v_job.render_kind='ai_image' and not v_runtime.ai_image_enabled then return jsonb_build_object('ok',false,'error','ai_image_disabled','external_side_effect',false); end if;
  if v_job.render_kind='ai_video' and not v_runtime.ai_video_enabled then return jsonb_build_object('ok',false,'error','ai_video_disabled','external_side_effect',false); end if;

  v_preview:=public.marketing_render_requeue_eligibility_v1(v_req.job_id,p_stuck_after_seconds,v_req.id);
  if coalesce((v_preview->>'eligible')::boolean,false) is false then
    update public.marketing_render_triage_requests set status='blocked',updated_at=now(),result_snapshot=v_preview where id=v_req.id;
    return jsonb_build_object('ok',false,'error','requeue_no_longer_eligible','reason',v_preview->>'reason','external_side_effect',false);
  end if;

  update public.marketing_render_jobs set status='queued',lease_owner=null,lease_until=null,last_error=null,finished_at=null,updated_at=now() where id=v_job.id;
  update public.marketing_assets set status='render_queued',updated_at=now() where id=v_asset.id and status<>'archived';
  update public.marketing_render_triage_requests set status='executed',executed_at=now(),updated_at=now(),result_snapshot=jsonb_build_object('job_status','queued','requeued_at',now(),'eligibility',v_preview) where id=v_req.id;
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('render_triage',v_req.id::text,'requeue_executed',p_actor,jsonb_build_object('job_id',v_job.id,'asset_id',v_asset.id,'render_kind',v_job.render_kind,'eligibility_reason',v_preview->>'reason'),false);
  return jsonb_build_object('ok',true,'request_id',v_req.id,'job_id',v_job.id,'status','executed','job_status','queued','idempotent',false,'external_side_effect',false);
end;
$$;

revoke all on function public.marketing_render_requeue_eligibility_v1(uuid,integer,uuid) from public,anon,authenticated;
revoke all on function public.preview_marketing_render_requeue_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.approve_marketing_render_requeue_v1(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.execute_marketing_render_requeue_v1(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.marketing_render_requeue_eligibility_v1(uuid,integer,uuid) to service_role;
grant execute on function public.preview_marketing_render_requeue_v1(uuid,integer) to service_role;
grant execute on function public.approve_marketing_render_requeue_v1(uuid,uuid,integer) to service_role;
grant execute on function public.execute_marketing_render_requeue_v1(uuid,uuid,integer) to service_role;

commit;