begin;

-- Marketing Render/Media Registry V6.
-- Internal-only orchestration. No external publication and no paid AI/provider call.

create or replace function public.request_marketing_asset_render_v1(
  p_asset_id uuid,
  p_idempotency_key text,
  p_actor uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_asset public.marketing_assets%rowtype;
  v_kind text;
  v_input jsonb;
  v_output jsonb;
  v_result jsonb;
begin
  select * into v_asset from public.marketing_assets where id=p_asset_id;
  if not found then
    return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false);
  end if;

  if v_asset.media_kind='carousel' then
    return jsonb_build_object('ok',false,'error','carousel_requires_slide_rendering','external_side_effect',false);
  end if;

  if v_asset.generation_mode in ('no_ai','manual') then
    v_kind:=case when v_asset.media_kind='video' then 'economical_video' else 'deterministic_image' end;
  elsif v_asset.generation_mode='ai' then
    v_kind:=case when v_asset.media_kind='video' then 'ai_video' else 'ai_image' end;
  elsif v_asset.generation_mode='hybrid' then
    -- Hybrid starts from the deterministic renderer. AI enhancement remains a separate, explicit job.
    v_kind:=case when v_asset.media_kind='video' then 'economical_video' else 'deterministic_image' end;
  else
    return jsonb_build_object('ok',false,'error','unsupported_generation_mode','external_side_effect',false);
  end if;

  v_input:=jsonb_build_object(
    'asset_id',v_asset.id,
    'asset_version',v_asset.version,
    'title',v_asset.title,
    'media_kind',v_asset.media_kind,
    'generation_mode',v_asset.generation_mode,
    'source_refs',coalesce(v_asset.source_refs,'[]'::jsonb),
    'edit_spec',coalesce(v_asset.edit_spec,'{}'::jsonb),
    'render_spec',coalesce(v_asset.render_spec,'{}'::jsonb)
  );
  v_output:=jsonb_build_object('registry','marketing_media_objects','asset_version',v_asset.version);

  select public.queue_marketing_render_v2(
    v_asset.id,
    v_kind,
    p_idempotency_key,
    v_input,
    v_output,
    p_actor
  ) into v_result;

  return coalesce(v_result,jsonb_build_object('ok',false,'error','render_queue_failed','external_side_effect',false))
    || jsonb_build_object('render_kind',v_kind,'asset_id',v_asset.id,'asset_version',v_asset.version);
end;
$$;

create or replace function public.register_marketing_media_object_v1(
  p_asset_id uuid,
  p_version integer,
  p_role text,
  p_storage_provider text,
  p_object_path text,
  p_mime_type text,
  p_width integer default null,
  p_height integer default null,
  p_duration_ms integer default null,
  p_byte_size bigint default null,
  p_sha256 text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_asset public.marketing_assets%rowtype;
  v_media public.marketing_media_objects%rowtype;
  v_path text:=trim(coalesce(p_object_path,''));
begin
  select * into v_asset from public.marketing_assets where id=p_asset_id;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if p_version<1 or p_version>v_asset.version then return jsonb_build_object('ok',false,'error','invalid_asset_version','external_side_effect',false); end if;
  if p_role not in ('source','preview','output','thumbnail','poster') then return jsonb_build_object('ok',false,'error','invalid_media_role','external_side_effect',false); end if;
  if p_storage_provider not in ('supabase','github','local') then return jsonb_build_object('ok',false,'error','invalid_storage_provider','external_side_effect',false); end if;
  if length(v_path)<1 or length(v_path)>1000 or position('..' in v_path)>0 then return jsonb_build_object('ok',false,'error','invalid_object_path','external_side_effect',false); end if;
  if length(trim(coalesce(p_mime_type,'')))<3 or length(p_mime_type)>120 then return jsonb_build_object('ok',false,'error','invalid_mime_type','external_side_effect',false); end if;
  if p_width is not null and (p_width<1 or p_width>8192) then return jsonb_build_object('ok',false,'error','invalid_width','external_side_effect',false); end if;
  if p_height is not null and (p_height<1 or p_height>8192) then return jsonb_build_object('ok',false,'error','invalid_height','external_side_effect',false); end if;
  if p_duration_ms is not null and (p_duration_ms<0 or p_duration_ms>3600000) then return jsonb_build_object('ok',false,'error','invalid_duration','external_side_effect',false); end if;
  if p_byte_size is not null and (p_byte_size<0 or p_byte_size>1073741824) then return jsonb_build_object('ok',false,'error','invalid_byte_size','external_side_effect',false); end if;

  insert into public.marketing_media_objects(
    asset_id,version,role,storage_provider,bucket_name,object_path,mime_type,width,height,duration_ms,byte_size,sha256,metadata
  ) values(
    p_asset_id,p_version,p_role,p_storage_provider,
    nullif(trim(coalesce(p_metadata->>'bucket_name','')),''),v_path,trim(p_mime_type),p_width,p_height,p_duration_ms,p_byte_size,
    nullif(lower(trim(coalesce(p_sha256,''))),''),coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(asset_id,version,role,object_path) do update set
    mime_type=excluded.mime_type,width=excluded.width,height=excluded.height,duration_ms=excluded.duration_ms,
    byte_size=excluded.byte_size,sha256=excluded.sha256,metadata=excluded.metadata
  returning * into v_media;

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('media_object',v_media.id::text,'media_registered',p_actor,
    jsonb_build_object('asset_id',p_asset_id,'version',p_version,'role',p_role,'storage_provider',p_storage_provider,'mime_type',p_mime_type),false);

  return jsonb_build_object('ok',true,'media_id',v_media.id,'asset_id',p_asset_id,'version',p_version,'role',p_role,'external_side_effect',false);
end;
$$;

create or replace function public.marketing_asset_media_read_v1(p_asset_id uuid)
returns table(
  id uuid, asset_id uuid, version integer, role text, storage_provider text, bucket_name text,
  object_path text, mime_type text, width integer, height integer, duration_ms integer,
  byte_size bigint, sha256 text, metadata jsonb, created_at timestamptz
)
language sql
security invoker
set search_path=public,pg_temp
as $$
  select m.id,m.asset_id,m.version,m.role,m.storage_provider,m.bucket_name,m.object_path,m.mime_type,
         m.width,m.height,m.duration_ms,m.byte_size,m.sha256,m.metadata,m.created_at
  from public.marketing_media_objects m
  where m.asset_id=p_asset_id
  order by m.version desc,
    case m.role when 'output' then 1 when 'preview' then 2 when 'thumbnail' then 3 when 'poster' then 4 else 5 end,
    m.created_at desc;
$$;

revoke all on function public.request_marketing_asset_render_v1(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.register_marketing_media_object_v1(uuid,integer,text,text,text,text,integer,integer,integer,bigint,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.marketing_asset_media_read_v1(uuid) from public,anon,authenticated;
grant execute on function public.request_marketing_asset_render_v1(uuid,text,uuid) to service_role;
grant execute on function public.register_marketing_media_object_v1(uuid,integer,text,text,text,text,integer,integer,integer,bigint,text,jsonb,uuid) to service_role;
grant execute on function public.marketing_asset_media_read_v1(uuid) to service_role;

commit;
