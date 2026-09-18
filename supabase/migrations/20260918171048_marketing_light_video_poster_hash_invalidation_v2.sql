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
  v_input jsonb;
  v_output jsonb;
  v_changed boolean:=false;
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
  v_input:=jsonb_build_object(
    'preview_only',true,'asset_id',v_asset.id,'asset_version',v_asset.version,
    'poster_media_id',v_poster.id,'poster_object_path',v_poster.object_path,'poster_sha256',v_poster.sha256,
    'duration_ms',10000,'width',1080,'height',1920,'fps',30,
    'motion',coalesce(v_asset.edit_spec->'motion','[]'::jsonb),
    'timeline',coalesce(v_asset.render_spec->'timeline','[]'::jsonb),
    'ai_used',false,'generative_video',false
  );
  v_output:=jsonb_build_object(
    'bucket_name','marketing-private','object_path',v_target,'mime_type','video/mp4',
    'duration_ms',10000,'width',1080,'height',1920,'fps',30,'preview_only',true
  );

  insert into public.marketing_render_jobs(
    asset_id,render_kind,status,idempotency_key,input_spec,output_spec,
    estimated_cost_cents,actual_cost_cents,ai_used,created_by
  )
  values(v_asset.id,'economical_video','queued',v_key,v_input,v_output,0,0,false,p_actor)
  on conflict(idempotency_key) do nothing;

  select * into v_job from public.marketing_render_jobs where idempotency_key=v_key for update;
  if not found then return jsonb_build_object('ok',false,'error','queue_failed','external_side_effect',false); end if;

  if v_job.status in ('failed','cancelled','review_required')
     or coalesce(v_job.input_spec->>'poster_sha256','') is distinct from coalesce(v_poster.sha256,'') then
    v_changed:=true;
    update public.marketing_render_jobs
    set status='queued',attempt_count=0,lease_owner=null,lease_until=null,last_error=null,
        input_spec=v_input,output_spec=v_output,actual_cost_cents=0,
        started_at=null,finished_at=null,updated_at=now()
    where id=v_job.id
    returning * into v_job;

    update public.marketing_assets
    set output_spec=(coalesce(output_spec,'{}'::jsonb)-'preview_video_media_id')
      ||jsonb_build_object('preview_ready',true,'mp4_ready',false,'poster_media_id',v_poster.id,'ai_used',false),
        updated_at=now()
    where id=v_asset.id;
  end if;

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('render_job',v_job.id::text,'light_video_preview_queued',p_actor,
    jsonb_build_object(
      'asset_id',v_asset.id,'duration_ms',10000,'ai_used',false,'estimated_cost_cents',0,
      'poster_sha256',v_poster.sha256,'requeued_for_poster_change',v_changed
    ),false);

  return jsonb_build_object(
    'ok',true,'job_id',v_job.id,'status',v_job.status,'asset_id',v_asset.id,
    'poster_sha256',v_poster.sha256,'requeued_for_poster_change',v_changed,
    'ai_used',false,'external_side_effect',false
  );
end;
$$;

revoke all on function public.queue_marketing_light_video_preview_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.queue_marketing_light_video_preview_v1(uuid,uuid) to service_role;