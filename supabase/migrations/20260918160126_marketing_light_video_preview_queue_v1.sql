create or replace function public.queue_marketing_light_video_preview_v1(
  p_asset_id uuid,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_asset public.marketing_assets%rowtype;
  v_runtime public.marketing_runtime_config%rowtype;
  v_poster public.marketing_media_objects%rowtype;
  v_job public.marketing_render_jobs%rowtype;
  v_key text;
  v_target text;
begin
  if p_asset_id is null then return jsonb_build_object('ok',false,'error','asset_required','external_side_effect',false); end if;
  select * into v_runtime from public.marketing_runtime_config where id=1;
  if not found or coalesce((v_runtime.metadata->>'draft_preview_render_enabled')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error','preview_render_disabled','external_side_effect',false);
  end if;
  select * into v_asset from public.marketing_assets where id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if v_asset.media_kind<>'video' or v_asset.generation_mode<>'no_ai' then
    return jsonb_build_object('ok',false,'error','light_video_no_ai_only','external_side_effect',false);
  end if;
  if v_asset.status not in ('draft','failed','rendered') then
    return jsonb_build_object('ok',false,'error','asset_not_preview_renderable','status',v_asset.status,'external_side_effect',false);
  end if;
  if coalesce((v_asset.render_spec->>'duration_ms')::integer,0)<>10000
     or coalesce((v_asset.render_spec->>'generative_video')::boolean,false) is true then
    return jsonb_build_object('ok',false,'error','invalid_light_video_contract','external_side_effect',false);
  end if;
  select * into v_poster
  from public.marketing_media_objects
  where asset_id=v_asset.id and version=v_asset.version and role='poster' and mime_type in ('image/webp','image/png','image/jpeg')
  order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok',false,'error','poster_required','external_side_effect',false); end if;

  v_key:='light-video-preview:'||v_asset.id::text||':v'||v_asset.version::text;
  v_target:=v_asset.id::text||'/v'||v_asset.version::text||'/preview-10s.mp4';

  insert into public.marketing_render_jobs(
    asset_id,render_kind,status,idempotency_key,input_spec,output_spec,
    estimated_cost_cents,actual_cost_cents,ai_used,created_by
  )
  values(
    v_asset.id,'economical_video','queued',v_key,
    jsonb_build_object(
      'preview_only',true,'asset_id',v_asset.id,'asset_version',v_asset.version,
      'poster_media_id',v_poster.id,'poster_object_path',v_poster.object_path,
      'duration_ms',10000,'width',1080,'height',1920,'fps',30,
      'motion',coalesce(v_asset.edit_spec->'motion','[]'::jsonb),
      'timeline',coalesce(v_asset.render_spec->'timeline','[]'::jsonb),
      'ai_used',false,'generative_video',false
    ),
    jsonb_build_object(
      'bucket_name','marketing-private','object_path',v_target,'mime_type','video/mp4',
      'duration_ms',10000,'width',1080,'height',1920,'fps',30,'preview_only',true
    ),
    0,0,false,p_actor
  )
  on conflict(idempotency_key) do nothing;

  select * into v_job from public.marketing_render_jobs where idempotency_key=v_key;
  if not found then return jsonb_build_object('ok',false,'error','queue_failed','external_side_effect',false); end if;

  if v_job.status in ('failed','cancelled','review_required') then
    update public.marketing_render_jobs
    set status='queued',attempt_count=0,lease_owner=null,lease_until=null,last_error=null,updated_at=now()
    where id=v_job.id
    returning * into v_job;
  end if;

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('render_job',v_job.id::text,'light_video_preview_queued',p_actor,
    jsonb_build_object('asset_id',v_asset.id,'duration_ms',10000,'ai_used',false,'estimated_cost_cents',0),false);

  return jsonb_build_object('ok',true,'job_id',v_job.id,'status',v_job.status,'asset_id',v_asset.id,'ai_used',false,'external_side_effect',false);
end;
$$;

create or replace function public.claim_marketing_light_video_preview_job_v1(
  p_worker_id text,
  p_lease_seconds integer default 600
)
returns setof public.marketing_render_jobs
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_runtime public.marketing_runtime_config%rowtype;
begin
  select * into v_runtime from public.marketing_runtime_config where id=1;
  if not found or coalesce((v_runtime.metadata->>'draft_preview_render_enabled')::boolean,false) is not true then return; end if;
  return query
  with picked as (
    select j.id
    from public.marketing_render_jobs j
    where j.render_kind='economical_video'
      and j.ai_used=false
      and coalesce((j.input_spec->>'preview_only')::boolean,false)=true
      and (j.status='queued' or (j.status='processing' and j.lease_until<now()))
      and j.attempt_count<3
    order by j.created_at,j.id
    for update skip locked
    limit 1
  )
  update public.marketing_render_jobs j
  set status='processing',
      lease_owner=left(coalesce(nullif(trim(p_worker_id),''),'marketing-light-video-worker'),120),
      lease_until=now()+make_interval(secs=>greatest(120,least(coalesce(p_lease_seconds,600),1800))),
      attempt_count=j.attempt_count+1,
      started_at=coalesce(j.started_at,now()),
      updated_at=now()
  from picked
  where j.id=picked.id
  returning j.*;
end;
$$;

create or replace function public.complete_marketing_light_video_preview_v1(
  p_job_id uuid,
  p_worker_id text,
  p_object_path text,
  p_byte_size bigint,
  p_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_job public.marketing_render_jobs%rowtype;
  v_asset public.marketing_assets%rowtype;
  v_media jsonb;
  v_media_id uuid;
begin
  select * into v_job from public.marketing_render_jobs where id=p_job_id for update;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found','external_side_effect',false); end if;
  if v_job.status='rendered' and v_job.lease_owner is null then
    return jsonb_build_object('ok',true,'job_id',p_job_id,'status','rendered','idempotent',true,'external_side_effect',false);
  end if;
  if v_job.status<>'processing' or coalesce(v_job.lease_owner,'')<>coalesce(p_worker_id,'') then
    return jsonb_build_object('ok',false,'error','lease_mismatch','external_side_effect',false);
  end if;
  if coalesce((v_job.input_spec->>'preview_only')::boolean,false) is not true or v_job.render_kind<>'economical_video' or v_job.ai_used then
    return jsonb_build_object('ok',false,'error','invalid_preview_job','external_side_effect',false);
  end if;
  select * into v_asset from public.marketing_assets where id=v_job.asset_id;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if p_object_path<>v_asset.id::text||'/v'||v_asset.version::text||'/preview-10s.mp4' then
    return jsonb_build_object('ok',false,'error','object_path_mismatch','external_side_effect',false);
  end if;
  select public.register_marketing_private_media_v2(
    v_asset.id,v_asset.version,'preview',p_object_path,'video/mp4',
    1080,1920,10000,p_byte_size,p_sha256,
    jsonb_build_object('bucket_name','marketing-private','renderer','ffmpeg_github_actions','preview_only',true,'ai_used',false,'fps',30),
    null
  ) into v_media;
  if coalesce((v_media->>'ok')::boolean,false) is not true then return coalesce(v_media,jsonb_build_object('ok',false,'error','media_registration_failed')); end if;
  v_media_id:=(v_media->>'media_id')::uuid;

  update public.marketing_render_jobs
  set status='rendered',
      output_spec=coalesce(output_spec,'{}'::jsonb)||jsonb_build_object('media_id',v_media_id,'object_path',p_object_path,'preview_only',true),
      actual_cost_cents=0,last_error=null,lease_owner=null,lease_until=null,finished_at=now(),updated_at=now()
  where id=v_job.id;

  update public.marketing_assets
  set output_spec=coalesce(output_spec,'{}'::jsonb)||jsonb_build_object(
        'preview_ready',true,'mp4_ready',true,'preview_video_media_id',v_media_id,
        'duration_ms',10000,'fps',30,'video_renderer','ffmpeg_github_actions','ai_used',false
      ),
      updated_at=now()
  where id=v_asset.id;

  insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
  values('render_job',v_job.id::text,'light_video_preview_completed',
    jsonb_build_object('asset_id',v_asset.id,'media_id',v_media_id,'duration_ms',10000,'actual_cost_cents',0,'ai_used',false),false);

  return jsonb_build_object('ok',true,'job_id',v_job.id,'asset_id',v_asset.id,'media_id',v_media_id,'status','rendered','actual_cost_cents',0,'external_side_effect',false);
end;
$$;

create or replace function public.fail_marketing_light_video_preview_v1(
  p_job_id uuid,
  p_worker_id text,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_job public.marketing_render_jobs%rowtype;
begin
  select * into v_job from public.marketing_render_jobs where id=p_job_id for update;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found','external_side_effect',false); end if;
  if v_job.status<>'processing' or coalesce(v_job.lease_owner,'')<>coalesce(p_worker_id,'') then
    return jsonb_build_object('ok',false,'error','lease_mismatch','external_side_effect',false);
  end if;
  update public.marketing_render_jobs
  set status=case when attempt_count>=3 then 'review_required' else 'failed' end,
      last_error=left(coalesce(nullif(trim(p_error),''),'video_preview_failed'),1000),
      lease_owner=null,lease_until=null,finished_at=now(),updated_at=now()
  where id=p_job_id
  returning * into v_job;
  insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
  values('render_job',p_job_id::text,'light_video_preview_failed',
    jsonb_build_object('asset_id',v_job.asset_id,'attempt_count',v_job.attempt_count,'status',v_job.status),false);
  return jsonb_build_object('ok',true,'job_id',p_job_id,'status',v_job.status,'external_side_effect',false);
end;
$$;

revoke all on function public.queue_marketing_light_video_preview_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_marketing_light_video_preview_job_v1(text,integer) from public,anon,authenticated;
revoke all on function public.complete_marketing_light_video_preview_v1(uuid,text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.fail_marketing_light_video_preview_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.queue_marketing_light_video_preview_v1(uuid,uuid) to service_role;
grant execute on function public.claim_marketing_light_video_preview_job_v1(text,integer) to service_role;
grant execute on function public.complete_marketing_light_video_preview_v1(uuid,text,text,bigint,text) to service_role;
grant execute on function public.fail_marketing_light_video_preview_v1(uuid,text,text) to service_role;

update public.marketing_runtime_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'light_video_preview_queue_enabled',true,
  'light_video_preview_duration_seconds',10,
  'light_video_preview_fps',30,
  'light_video_preview_renderer','ffmpeg_github_actions_manual',
  'light_video_preview_recurring_workflow',false
),
updated_at=now()
where id=1;