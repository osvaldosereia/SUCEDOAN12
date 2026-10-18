begin;

-- Marketing Carousel Output Binding V12.
-- Internal-only completion/progress contract. No provider call, publication or paid AI.

create or replace function public.complete_marketing_carousel_render_v1(
  p_job_id uuid,
  p_worker text,
  p_media_id uuid,
  p_actual_cost_cents integer default 0,
  p_actor uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_job public.marketing_render_jobs%rowtype;
  v_slide public.marketing_carousel_slides%rowtype;
  v_media public.marketing_media_objects%rowtype;
  v_asset public.marketing_assets%rowtype;
  v_slide_id uuid;
  v_version integer;
  v_slide_no integer;
  v_cost integer:=greatest(0,coalesce(p_actual_cost_cents,0));
  v_remaining integer;
begin
  select * into v_job from public.marketing_render_jobs where id=p_job_id for update;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found','external_side_effect',false); end if;

  begin
    v_slide_id:=nullif(v_job.output_spec->>'carousel_slide_id','')::uuid;
    v_version:=nullif(v_job.output_spec->>'asset_version','')::integer;
    v_slide_no:=nullif(v_job.output_spec->>'slide_no','')::integer;
  exception when others then
    return jsonb_build_object('ok',false,'error','invalid_carousel_job_identity','external_side_effect',false);
  end;
  if v_slide_id is null or v_version is null or v_slide_no is null then
    return jsonb_build_object('ok',false,'error','carousel_job_identity_missing','external_side_effect',false);
  end if;

  select * into v_slide from public.marketing_carousel_slides where id=v_slide_id for update;
  if not found or v_slide.carousel_asset_id<>v_job.asset_id or v_slide.asset_version<>v_version or v_slide.slide_no<>v_slide_no then
    return jsonb_build_object('ok',false,'error','carousel_job_scope_mismatch','external_side_effect',false);
  end if;

  if v_job.status='rendered' and v_job.lease_owner is null and v_slide.status='rendered' and v_slide.output_media_id=p_media_id then
    return jsonb_build_object('ok',true,'job_id',p_job_id,'slide_id',v_slide.id,'slide_no',v_slide.slide_no,'media_id',p_media_id,'status','rendered','idempotent',true,'external_side_effect',false);
  end if;

  if v_job.status<>'processing' or coalesce(v_job.lease_owner,'')<>coalesce(p_worker,'') or v_job.lease_until is null or v_job.lease_until<now() then
    return jsonb_build_object('ok',false,'error','lease_mismatch_or_expired','external_side_effect',false);
  end if;

  select * into v_media from public.marketing_media_objects where id=p_media_id;
  if not found then return jsonb_build_object('ok',false,'error','output_media_not_found','external_side_effect',false); end if;
  if v_media.asset_id<>v_job.asset_id or v_media.version<>v_version or v_media.role<>'output' then
    return jsonb_build_object('ok',false,'error','output_media_scope_mismatch','external_side_effect',false);
  end if;
  if coalesce(v_media.metadata->>'render_job_id','')<>p_job_id::text then
    return jsonb_build_object('ok',false,'error','output_media_job_mismatch','external_side_effect',false);
  end if;
  if v_job.render_kind='deterministic_image' and (v_media.mime_type<>'image/webp' or coalesce(v_media.width,0)<>1080 or coalesce(v_media.height,0)<>1350) then
    return jsonb_build_object('ok',false,'error','carousel_output_geometry_mismatch','external_side_effect',false);
  end if;

  update public.marketing_render_jobs
  set status='rendered',actual_cost_cents=v_cost,last_error=null,lease_owner=null,lease_until=null,finished_at=now(),updated_at=now(),
      output_spec=coalesce(output_spec,'{}'::jsonb)||jsonb_build_object('media_id',p_media_id,'completed_by',left(coalesce(p_worker,''),120))
  where id=p_job_id;

  update public.marketing_carousel_slides
  set status='rendered',output_media_id=p_media_id,updated_at=now()
  where id=v_slide.id;

  select count(*) into v_remaining from public.marketing_carousel_slides
  where carousel_asset_id=v_job.asset_id and asset_version=v_version and status<>'rendered';

  select * into v_asset from public.marketing_assets where id=v_job.asset_id for update;
  update public.marketing_assets
  set status=case when v_remaining=0 then 'rendered' else 'render_queued' end,
      actual_cost_cents=greatest(0,coalesce(actual_cost_cents,0)-greatest(0,coalesce(v_job.actual_cost_cents,0))+v_cost),
      output_spec=case when v_remaining=0 then coalesce(output_spec,'{}'::jsonb)||jsonb_build_object('carousel_version',v_version,'render_complete',true) else output_spec end,
      updated_at=now()
  where id=v_job.asset_id;

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('render_job',p_job_id::text,'carousel_slide_render_completed',p_actor,
    jsonb_build_object('asset_id',v_job.asset_id,'asset_version',v_version,'slide_id',v_slide.id,'slide_no',v_slide.slide_no,'media_id',p_media_id,'worker',left(coalesce(p_worker,''),120),'actual_cost_cents',v_cost,'carousel_complete',v_remaining=0),false);

  return jsonb_build_object('ok',true,'job_id',p_job_id,'slide_id',v_slide.id,'slide_no',v_slide.slide_no,'media_id',p_media_id,'status','rendered','carousel_complete',v_remaining=0,'idempotent',false,'external_side_effect',false);
end;
$$;

create or replace function public.marketing_carousel_render_progress_v1(p_asset_id uuid)
returns table(
  slide_id uuid, asset_version integer, slide_no smallint, title text, generation_mode text, slide_status text,
  output_media_id uuid, job_id uuid, job_status text, attempt_count smallint, last_error text, updated_at timestamptz
)
language sql
security invoker
set search_path=public,pg_temp
as $$
  select s.id,s.asset_version,s.slide_no,s.title,s.generation_mode,s.status,s.output_media_id,
         j.id,j.status,j.attempt_count,j.last_error,greatest(s.updated_at,coalesce(j.updated_at,s.updated_at))
  from public.marketing_carousel_slides s
  left join lateral (
    select r.* from public.marketing_render_jobs r
    where r.asset_id=s.carousel_asset_id
      and r.output_spec->>'carousel_slide_id'=s.id::text
      and r.output_spec->>'asset_version'=s.asset_version::text
      and r.output_spec->>'slide_no'=s.slide_no::text
    order by r.created_at desc,r.id desc limit 1
  ) j on true
  where s.carousel_asset_id=p_asset_id
    and s.asset_version=(select a.version from public.marketing_assets a where a.id=p_asset_id)
  order by s.slide_no;
$$;

revoke all on function public.complete_marketing_carousel_render_v1(uuid,text,uuid,integer,uuid) from public,anon,authenticated;
revoke all on function public.marketing_carousel_render_progress_v1(uuid) from public,anon,authenticated;
grant execute on function public.complete_marketing_carousel_render_v1(uuid,text,uuid,integer,uuid) to service_role;
grant execute on function public.marketing_carousel_render_progress_v1(uuid) to service_role;

insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
values('runtime','1','carousel_output_binding_v12_ready',jsonb_build_object('lease_required',true,'asset_version_slide_scope',true,'media_job_binding',true,'external_side_effect',false),false);

commit;
