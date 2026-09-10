begin;

-- Marketing private media V7.
-- Private Supabase Storage bucket + server-only resolver for short-lived Admin previews.
-- No public bucket, no provider call, no publication dispatcher.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'marketing-private',
  'marketing-private',
  false,
  104857600,
  array['image/webp','image/png','image/jpeg','video/mp4']::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=least(coalesce(storage.buckets.file_size_limit,104857600),104857600),
  allowed_mime_types=array['image/webp','image/png','image/jpeg','video/mp4']::text[];

-- Keep this bucket private. Service-role operations bypass RLS; no client policy is created.
-- Explicitly remove any accidentally broad policies previously created for this bucket by name.
drop policy if exists "marketing private public read" on storage.objects;
drop policy if exists "marketing private authenticated read" on storage.objects;
drop policy if exists "marketing private anon read" on storage.objects;

create or replace function public.marketing_media_signable_v1(p_media_id uuid)
returns table(
  media_id uuid,
  asset_id uuid,
  version integer,
  role text,
  bucket_name text,
  object_path text,
  mime_type text,
  width integer,
  height integer,
  duration_ms integer,
  byte_size bigint,
  sha256 text
)
language sql
security invoker
set search_path=public,pg_temp
as $$
  select
    m.id,
    m.asset_id,
    m.version,
    m.role,
    m.bucket_name,
    m.object_path,
    m.mime_type,
    m.width,
    m.height,
    m.duration_ms,
    m.byte_size,
    m.sha256
  from public.marketing_media_objects m
  join public.marketing_assets a on a.id=m.asset_id
  where m.id=p_media_id
    and m.storage_provider='supabase'
    and m.bucket_name='marketing-private'
    and m.role in ('preview','output','thumbnail','poster','source')
    and m.object_path !~ '(^|/)\.\.(/|$)'
    and length(m.object_path) between 1 and 1000
    and a.status <> 'archived';
$$;

create or replace function public.register_marketing_private_media_v2(
  p_asset_id uuid,
  p_version integer,
  p_role text,
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
  v_path text:=trim(coalesce(p_object_path,''));
  v_prefix text;
  v_result jsonb;
begin
  if p_asset_id is null then
    return jsonb_build_object('ok',false,'error','asset_required','external_side_effect',false);
  end if;
  if p_version is null or p_version < 1 then
    return jsonb_build_object('ok',false,'error','invalid_asset_version','external_side_effect',false);
  end if;
  if p_role not in ('source','preview','output','thumbnail','poster') then
    return jsonb_build_object('ok',false,'error','invalid_media_role','external_side_effect',false);
  end if;
  if length(v_path)<1 or length(v_path)>1000 or v_path like '/%' or position('..' in v_path)>0 then
    return jsonb_build_object('ok',false,'error','invalid_object_path','external_side_effect',false);
  end if;
  v_prefix:=p_asset_id::text||'/v'||p_version::text||'/';
  if left(v_path,length(v_prefix))<>v_prefix then
    return jsonb_build_object('ok',false,'error','object_path_scope_mismatch','expected_prefix',v_prefix,'external_side_effect',false);
  end if;
  if trim(coalesce(p_mime_type,'')) not in ('image/webp','image/png','image/jpeg','video/mp4') then
    return jsonb_build_object('ok',false,'error','unsupported_mime_type','external_side_effect',false);
  end if;

  select public.register_marketing_media_object_v1(
    p_asset_id,
    p_version,
    p_role,
    'supabase',
    v_path,
    trim(p_mime_type),
    p_width,
    p_height,
    p_duration_ms,
    p_byte_size,
    p_sha256,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('bucket_name','marketing-private'),
    p_actor
  ) into v_result;

  return coalesce(v_result,jsonb_build_object('ok',false,'error','media_registration_failed','external_side_effect',false));
end;
$$;

revoke all on function public.marketing_media_signable_v1(uuid) from public,anon,authenticated;
revoke all on function public.register_marketing_private_media_v2(uuid,integer,text,text,text,integer,integer,integer,bigint,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.marketing_media_signable_v1(uuid) to service_role;
grant execute on function public.register_marketing_private_media_v2(uuid,integer,text,text,text,integer,integer,integer,bigint,text,jsonb,uuid) to service_role;

insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
values('runtime','1','private_media_storage_v7_ready',jsonb_build_object('bucket','marketing-private','public',false),false);

commit;
