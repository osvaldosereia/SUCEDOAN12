-- Marketing Admin V1 / Round 7 — official publication connectors foundation.
-- Fail-closed: no direct channel is enabled and global publishing remains OFF.

alter table public.marketing_runtime_config add column if not exists instagram_feed_publish_enabled boolean not null default false;
alter table public.marketing_runtime_config add column if not exists instagram_reel_publish_enabled boolean not null default false;
alter table public.marketing_runtime_config add column if not exists facebook_post_publish_enabled boolean not null default false;
alter table public.marketing_runtime_config add column if not exists facebook_reel_publish_enabled boolean not null default false;

update public.marketing_runtime_config
set publishing_enabled=false,
    kill_switch=true,
    instagram_feed_publish_enabled=false,
    instagram_story_publish_enabled=false,
    instagram_reel_publish_enabled=false,
    instagram_carousel_publish_enabled=false,
    facebook_post_publish_enabled=false,
    facebook_story_publish_enabled=false,
    facebook_reel_publish_enabled=false,
    pinterest_publish_enabled=false,
    whatsapp_status_publish_enabled=false,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'publication_adapter_version','marketing_publish_v1',
      'official_connectors_ready',true,
      'official_connectors_enabled',false,
      'facebook_story_mode','manual_or_accounts_center_cross_share',
      'whatsapp_status_mode','native_share_manual',
      'provider_media_ttl_seconds',3600,
      'manual_share_ttl_seconds',900,
      'provider_tokens_storage','supabase_vault',
      'default_destination_url','https://donaantonia.com.br/',
      'direct_publish_requires_verified_channel',true,
      'direct_publish_requires_graph_version',true
    ),updated_at=now()
where id=1;

update public.marketing_channel_accounts
set capabilities=coalesce(capabilities,'{}'::jsonb)||case channel
  when 'instagram_feed' then '{"publish_mode":"official_api","api_direct":true,"media":"image","required_permissions":["instagram_basic","instagram_content_publish","pages_read_engagement","pages_show_list"],"requires_public_fetchable_media":true}'::jsonb
  when 'instagram_story' then '{"publish_mode":"official_api","api_direct":true,"media":"image","business_account_only":true,"required_permissions":["instagram_basic","instagram_content_publish","pages_read_engagement","pages_show_list"],"requires_public_fetchable_media":true}'::jsonb
  when 'instagram_reel' then '{"publish_mode":"official_api","api_direct":true,"media":"video","required_permissions":["instagram_basic","instagram_content_publish","pages_read_engagement","pages_show_list"],"requires_public_fetchable_media":true}'::jsonb
  when 'instagram_carousel' then '{"publish_mode":"official_api","api_direct":true,"media":"carousel","max_items":10,"required_permissions":["instagram_basic","instagram_content_publish","pages_read_engagement","pages_show_list"],"requires_public_fetchable_media":true}'::jsonb
  when 'facebook_post' then '{"publish_mode":"official_api","api_direct":true,"media":"image","required_permissions":["pages_show_list","pages_read_engagement","pages_manage_posts"],"requires_public_fetchable_media":true}'::jsonb
  when 'facebook_reel' then '{"publish_mode":"official_api","api_direct":true,"media":"video","required_permissions":["pages_show_list","pages_read_engagement","pages_manage_posts"],"requires_public_fetchable_media":true}'::jsonb
  when 'facebook_story' then '{"publish_mode":"manual_or_cross_share","api_direct":false,"media":"image","manual_confirmation_required":true,"reason":"no_direct_page_story_endpoint_verified_in_official_api_workspace"}'::jsonb
  when 'pinterest_pin' then '{"publish_mode":"official_api","api_direct":true,"media":"image","link":true,"required_scopes":["boards:read","boards:write","pins:read","pins:write"],"requires_board_id":true}'::jsonb
  when 'whatsapp_status' then '{"publish_mode":"native_share_manual","api_direct":false,"media":"image_or_video","manual_confirmation_required":true,"reason":"whatsapp_cloud_api_has_no_status_publish_endpoint"}'::jsonb
  else '{}'::jsonb end,
  metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('round7_policy','official_only_fail_closed'),
  updated_at=now()
where channel in ('instagram_feed','instagram_story','instagram_reel','instagram_carousel','facebook_post','facebook_story','facebook_reel','pinterest_pin','whatsapp_status');

create or replace function public.marketing_channel_secret_v1(p_channel_account_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public','vault','pg_temp'
as $$
declare v_ref text; v_secret text;
begin
  select credential_ref into v_ref
  from public.marketing_channel_accounts
  where id=p_channel_account_id and status in ('configured','verified');
  if nullif(v_ref,'') is null then return null; end if;
  if v_ref !~ '^dona_antonia_marketing_[a-z0-9_]+$' then return null; end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name=v_ref
  order by created_at desc limit 1;
  return v_secret;
end;
$$;
revoke all on function public.marketing_channel_secret_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_channel_secret_v1(uuid) to service_role;

create or replace function public.marketing_publication_preflight_v1(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  j public.marketing_publication_jobs%rowtype;
  a public.marketing_assets%rowtype;
  c public.marketing_channel_accounts%rowtype;
  r public.marketing_runtime_config%rowtype;
  v_channel_gate boolean:=false;
  v_manual boolean:=false;
  v_reasons jsonb:='[]'::jsonb;
  v_provider_media_count integer:=0;
  v_expected_media_count integer:=0;
  v_media_ready boolean:=false;
  v_asset_version integer;
  v_media_ids jsonb:='[]'::jsonb;
  v_graph_version text;
  v_published_today integer:=0;
  v_daily_limit integer:=0;
begin
  select * into j from public.marketing_publication_jobs where id=p_job_id;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found','external_side_effect',false); end if;
  select * into a from public.marketing_assets where id=j.asset_id;
  select * into r from public.marketing_runtime_config where id=1;
  select * into c from public.marketing_channel_accounts where channel=j.channel order by updated_at desc limit 1;

  v_asset_version:=case when coalesce(j.payload->>'asset_version','') ~ '^[0-9]+$'
    then (j.payload->>'asset_version')::integer else coalesce(a.version,1) end;
  v_media_ids:=case when jsonb_typeof(coalesce(j.payload->'media_ids','[]'::jsonb))='array'
    then coalesce(j.payload->'media_ids','[]'::jsonb) else '[]'::jsonb end;
  v_graph_version:=nullif(coalesce(c.metadata->>'graph_api_version',r.metadata->>'meta_graph_version',''),'');
  v_manual:=j.channel in ('whatsapp_status','facebook_story');

  v_channel_gate:=case j.channel
    when 'instagram_feed' then coalesce(r.instagram_feed_publish_enabled,false)
    when 'instagram_story' then coalesce(r.instagram_story_publish_enabled,false)
    when 'instagram_reel' then coalesce(r.instagram_reel_publish_enabled,false)
    when 'instagram_carousel' then coalesce(r.instagram_carousel_publish_enabled,false)
    when 'facebook_post' then coalesce(r.facebook_post_publish_enabled,false)
    when 'facebook_story' then false
    when 'facebook_reel' then coalesce(r.facebook_reel_publish_enabled,false)
    when 'pinterest_pin' then coalesce(r.pinterest_publish_enabled,false)
    when 'whatsapp_status' then false
    else false end;

  if a.id is null or a.status<>'approved' then v_reasons:=v_reasons||jsonb_build_array('asset_not_approved'); end if;
  if j.status not in ('approved','scheduled','ready_manual','failed') then v_reasons:=v_reasons||jsonb_build_array('job_status_not_publishable'); end if;
  if r.publishing_enabled is not true then v_reasons:=v_reasons||jsonb_build_array('global_publishing_disabled'); end if;
  if r.kill_switch is true then v_reasons:=v_reasons||jsonb_build_array('kill_switch_active'); end if;
  if v_manual is false and coalesce(r.execution_mode,'off') not in ('canary','live') then v_reasons:=v_reasons||jsonb_build_array('execution_mode_not_live'); end if;

  v_daily_limit:=greatest(0,coalesce(r.max_daily_publications,0));
  if v_manual is false then
    select count(*) into v_published_today
    from public.marketing_publication_jobs
    where status='published'
      and published_at>=date_trunc('day',now() at time zone coalesce(r.default_timezone,'America/Cuiaba')) at time zone coalesce(r.default_timezone,'America/Cuiaba');
    if v_daily_limit<=0 then v_reasons:=v_reasons||jsonb_build_array('daily_publication_limit_zero');
    elsif v_published_today>=v_daily_limit then v_reasons:=v_reasons||jsonb_build_array('daily_publication_limit_reached'); end if;
  end if;

  if v_manual is false and v_channel_gate is not true then v_reasons:=v_reasons||jsonb_build_array('channel_gate_disabled'); end if;
  if v_manual is false and (c.id is null or c.status<>'verified') then v_reasons:=v_reasons||jsonb_build_array('channel_not_verified'); end if;
  if v_manual is false and nullif(c.credential_ref,'') is null then v_reasons:=v_reasons||jsonb_build_array('credential_ref_missing'); end if;
  if v_manual is false and c.provider='meta' and nullif(c.external_account_id,'') is null then v_reasons:=v_reasons||jsonb_build_array('external_account_id_missing'); end if;
  if v_manual is false and c.provider='meta' and v_graph_version is null then v_reasons:=v_reasons||jsonb_build_array('graph_api_version_missing'); end if;
  if v_manual is false and c.provider='pinterest' and nullif(c.metadata->>'board_id','') is null then v_reasons:=v_reasons||jsonb_build_array('pinterest_board_id_missing'); end if;

  v_expected_media_count:=greatest(1,jsonb_array_length(v_media_ids));
  if j.content_type in ('image','carousel') then
    select count(*) into v_provider_media_count
    from public.marketing_media_objects
    where asset_id=j.asset_id and version=v_asset_version and role='output' and mime_type='image/jpeg'
      and coalesce((metadata->>'provider_ready')::boolean,false)=true;
    v_media_ready:=v_provider_media_count>=v_expected_media_count;
  elsif j.content_type='video' then
    select count(*) into v_provider_media_count
    from public.marketing_media_objects
    where asset_id=j.asset_id and version=v_asset_version and mime_type='video/mp4' and duration_ms=10000
      and coalesce((metadata->>'provider_ready')::boolean,false)=true
      and lower(coalesce(metadata->>'video_codec',''))='h264'
      and lower(coalesce(metadata->>'audio_codec',''))='aac'
      and coalesce((metadata->>'audio_sample_rate_hz')::integer,0)=48000;
    v_media_ready:=v_provider_media_count>=1;
  else
    v_media_ready:=false;
  end if;
  if v_media_ready is not true then v_reasons:=v_reasons||jsonb_build_array('provider_media_not_ready'); end if;

  return jsonb_build_object(
    'ok',true,'job_id',j.id,'channel',j.channel,'status',j.status,
    'manual_confirmation_required',v_manual,'api_direct',not v_manual,
    'eligible_for_external_publish',not v_manual and jsonb_array_length(v_reasons)=0,
    'eligible_for_manual_share',v_manual and v_media_ready and a.status='approved' and j.status in ('approved','ready_manual','scheduled','failed'),
    'provider_media_ready',v_media_ready,'provider_media_count',v_provider_media_count,
    'execution_mode',r.execution_mode,'published_today',v_published_today,'max_daily_publications',v_daily_limit,
    'reasons',v_reasons,'channel_account_id',c.id,'provider',c.provider,'graph_api_version',v_graph_version,
    'external_side_effect',false
  );
end;
$$;
revoke all on function public.marketing_publication_preflight_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_publication_preflight_v1(uuid) to service_role;

create or replace function public.normalize_manual_marketing_publication_job_v1()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $$
begin
  if new.channel in ('whatsapp_status','facebook_story') then
    new.manual_confirmation_required:=true;
    if new.status='approved' then new.status:='ready_manual'; end if;
    new.payload:=coalesce(new.payload,'{}'::jsonb)||jsonb_build_object('manual_confirmation_required',true,'external_publish',false);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_normalize_manual_marketing_publication_job_v1 on public.marketing_publication_jobs;
create trigger trg_normalize_manual_marketing_publication_job_v1
before insert or update on public.marketing_publication_jobs
for each row execute function public.normalize_manual_marketing_publication_job_v1();

create or replace function public.marketing_publication_mark_started_v1(p_job_id uuid,p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare j public.marketing_publication_jobs%rowtype; p jsonb;
begin
  select public.marketing_publication_preflight_v1(p_job_id) into p;
  if coalesce((p->>'eligible_for_external_publish')::boolean,false) is not true then
    return p||jsonb_build_object('ok',false,'error','publication_preflight_blocked');
  end if;
  update public.marketing_publication_jobs
  set status='publishing',attempt_count=attempt_count+1,last_error=null,updated_at=now()
  where id=p_job_id and status in ('approved','scheduled','failed') returning * into j;
  if j.id is null then return jsonb_build_object('ok',false,'error','job_not_claimed','external_side_effect',false); end if;
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('publication_job',j.id::text,'publication_started',p_actor,jsonb_build_object('channel',j.channel,'attempt_count',j.attempt_count),false);
  return jsonb_build_object('ok',true,'job_id',j.id,'channel',j.channel,'attempt_count',j.attempt_count,'external_side_effect',false);
end;
$$;
revoke all on function public.marketing_publication_mark_started_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketing_publication_mark_started_v1(uuid,uuid) to service_role;

create or replace function public.complete_marketing_light_video_preview_v1(
  p_job_id uuid,p_worker_id text,p_object_path text,p_byte_size bigint,p_sha256 text
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
    v_asset.id,v_asset.version,'preview',p_object_path,'video/mp4',1080,1920,10000,p_byte_size,p_sha256,
    jsonb_build_object('bucket_name','marketing-private','renderer','ffmpeg_github_actions','preview_only',true,
      'provider_ready',true,'video_codec','h264','audio_codec','aac','audio_sample_rate_hz',48000,'ai_used',false,'fps',30),null
  ) into v_media;
  if coalesce((v_media->>'ok')::boolean,false) is not true then return coalesce(v_media,jsonb_build_object('ok',false,'error','media_registration_failed')); end if;
  v_media_id:=(v_media->>'media_id')::uuid;

  update public.marketing_render_jobs
  set status='rendered',
      output_spec=coalesce(output_spec,'{}'::jsonb)||jsonb_build_object('media_id',v_media_id,'object_path',p_object_path,'preview_only',true,
        'provider_ready',true,'video_codec','h264','audio_codec','aac','audio_sample_rate_hz',48000),
      actual_cost_cents=0,last_error=null,lease_owner=null,lease_until=null,finished_at=now(),updated_at=now()
  where id=v_job.id;

  update public.marketing_assets
  set output_spec=coalesce(output_spec,'{}'::jsonb)||jsonb_build_object('preview_ready',true,'mp4_ready',true,'preview_video_media_id',v_media_id,
        'duration_ms',10000,'fps',30,'video_renderer','ffmpeg_github_actions','provider_ready',true,
        'video_codec','h264','audio_codec','aac','audio_sample_rate_hz',48000,'ai_used',false),
      updated_at=now()
  where id=v_asset.id;

  insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
  values('render_job',v_job.id::text,'light_video_preview_completed',
    jsonb_build_object('asset_id',v_asset.id,'media_id',v_media_id,'duration_ms',10000,'actual_cost_cents',0,'ai_used',false,
      'provider_ready',true,'video_codec','h264','audio_codec','aac','audio_sample_rate_hz',48000),false);

  return jsonb_build_object('ok',true,'job_id',v_job.id,'asset_id',v_asset.id,'media_id',v_media_id,'status','rendered',
    'actual_cost_cents',0,'provider_ready',true,'external_side_effect',false);
end;
$$;
revoke all on function public.complete_marketing_light_video_preview_v1(uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.complete_marketing_light_video_preview_v1(uuid,text,text,bigint,text) to service_role;

update public.marketing_publication_jobs
set manual_confirmation_required=true,
    status=case when status='approved' then 'ready_manual' else status end,
    payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('manual_confirmation_required',true,'external_publish',false),
    updated_at=now()
where channel in ('whatsapp_status','facebook_story') and status<>'published';
