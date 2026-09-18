alter table public.marketing_publication_jobs
  drop constraint if exists marketing_publication_jobs_channel_check;

alter table public.marketing_publication_jobs
  add constraint marketing_publication_jobs_channel_check
  check (channel = any (array[
    'whatsapp_status'::text,'instagram_story'::text,'facebook_story'::text,
    'instagram_feed'::text,'instagram_reel'::text,'facebook_post'::text,'facebook_reel'::text,
    'instagram_carousel'::text,'pinterest_pin'::text,'google_business_post'::text
  ]));

create or replace function public.prepare_marketing_publication_jobs_v1(
  p_asset_id uuid,p_actor uuid default null
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_asset public.marketing_assets%rowtype;
  v_role text; v_channels jsonb; v_channel jsonb; v_channel_name text; v_content_type text;
  v_manual boolean; v_media_ids jsonb; v_media_count integer; v_caption text; v_payload jsonb;
  v_key text; v_job_id uuid; v_created integer:=0; v_reused integer:=0; v_jobs jsonb:='[]'::jsonb;
begin
  select * into v_asset from public.marketing_assets where id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if v_asset.status<>'approved' then return jsonb_build_object('ok',false,'error','asset_not_approved','status',v_asset.status,'external_side_effect',false); end if;

  v_role:=coalesce(v_asset.edit_spec->>'content_role','');
  v_caption:=left(trim(concat_ws(E'\n\n',nullif(v_asset.edit_spec->>'headline',''),nullif(v_asset.edit_spec->>'cta',''))),2200);

  if v_role='feed_square' then
    v_channels:='[{"channel":"instagram_feed","content_type":"image"},{"channel":"facebook_post","content_type":"image"}]'::jsonb;
  elsif v_role='story_status' then
    v_channels:='[{"channel":"instagram_story","content_type":"image"},{"channel":"facebook_story","content_type":"image"},{"channel":"whatsapp_status","content_type":"image"}]'::jsonb;
  elsif v_role='pinterest_pin' then
    v_channels:='[{"channel":"pinterest_pin","content_type":"image"}]'::jsonb;
  elsif v_role='instagram_carousel' then
    v_channels:='[{"channel":"instagram_carousel","content_type":"carousel"}]'::jsonb;
  elsif v_role='reel_light_10s' then
    v_channels:='[{"channel":"instagram_reel","content_type":"video"},{"channel":"facebook_reel","content_type":"video"}]'::jsonb;
  else
    return jsonb_build_object('ok',false,'error','unsupported_content_role','content_role',v_role,'external_side_effect',false);
  end if;

  if v_role='reel_light_10s' then
    select coalesce(jsonb_agg(id order by created_at desc),'[]'::jsonb),count(*) into v_media_ids,v_media_count
    from public.marketing_media_objects where asset_id=v_asset.id and version=v_asset.version and mime_type='video/mp4' and role='preview';
  elsif v_role='instagram_carousel' then
    select coalesce(jsonb_agg(id order by object_path),'[]'::jsonb),count(*) into v_media_ids,v_media_count
    from public.marketing_media_objects where asset_id=v_asset.id and version=v_asset.version and mime_type like 'image/%' and role='preview';
  else
    select coalesce(jsonb_agg(id order by created_at desc),'[]'::jsonb),count(*) into v_media_ids,v_media_count
    from public.marketing_media_objects where asset_id=v_asset.id and version=v_asset.version and mime_type like 'image/%' and role='preview';
  end if;

  if v_role='instagram_carousel' and v_media_count<2 then
    return jsonb_build_object('ok',false,'error','carousel_media_incomplete','media_count',v_media_count,'external_side_effect',false);
  elsif v_role<>'instagram_carousel' and v_media_count<1 then
    return jsonb_build_object('ok',false,'error','rendered_media_required','external_side_effect',false);
  end if;

  for v_channel in select value from jsonb_array_elements(v_channels)
  loop
    v_channel_name:=v_channel->>'channel'; v_content_type:=v_channel->>'content_type'; v_manual:=v_channel_name='whatsapp_status';
    v_key:='publication:'||v_asset.id::text||':'||v_channel_name;
    v_payload:=jsonb_build_object(
      'schema','marketing.publication.payload.v1','asset_id',v_asset.id,'asset_version',v_asset.version,
      'campaign_id',v_asset.campaign_id,'content_role',v_role,'title',v_asset.title,'caption',v_caption,
      'media_ids',v_media_ids,'destination_url',case when v_channel_name='pinterest_pin' then 'https://www.donaantonia.com.br' else null end,
      'manual_confirmation_required',v_manual,'prepared_only',true,'external_publish',false
    );

    select id into v_job_id from public.marketing_publication_jobs where idempotency_key=v_key;
    if v_job_id is null then
      insert into public.marketing_publication_jobs(
        campaign_id,asset_id,channel,content_type,status,manual_confirmation_required,scheduled_for,payload,idempotency_key,
        attempt_count,last_error,estimated_cost_cents,created_by,approved_at,approved_by,approval_note
      ) values(
        v_asset.campaign_id,v_asset.id,v_channel_name,v_content_type,'approved',v_manual,null,v_payload,v_key,
        0,null,0,p_actor,now(),p_actor,'Peça aprovada no Admin'
      ) returning id into v_job_id;
      v_created:=v_created+1;
    else
      update public.marketing_publication_jobs
      set campaign_id=v_asset.campaign_id,asset_id=v_asset.id,channel=v_channel_name,content_type=v_content_type,
          status=case when status='published' then status else 'approved' end,
          manual_confirmation_required=v_manual,
          scheduled_for=case when status='published' then scheduled_for else null end,
          payload=v_payload,attempt_count=case when status='published' then attempt_count else 0 end,
          last_error=case when status='published' then last_error else null end,estimated_cost_cents=0,
          approved_at=case when status='published' then approved_at else now() end,
          approved_by=case when status='published' then approved_by else p_actor end,
          approval_note=case when status='published' then approval_note else 'Peça aprovada no Admin' end,
          updated_at=now()
      where id=v_job_id;
      v_reused:=v_reused+1;
    end if;
    v_jobs:=v_jobs||jsonb_build_array(jsonb_build_object('id',v_job_id,'channel',v_channel_name,'content_type',v_content_type,'manual_confirmation_required',v_manual));
  end loop;

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('asset',v_asset.id::text,'publication_jobs_prepared',p_actor,
    jsonb_build_object('content_role',v_role,'created',v_created,'reused',v_reused,'channels',v_channels,'media_ids',v_media_ids,'prepared_only',true),false);

  return jsonb_build_object('ok',true,'asset_id',v_asset.id,'created',v_created,'reused',v_reused,'jobs',v_jobs,'prepared_only',true,'external_side_effect',false);
end;
$$;

create or replace function public.reject_marketing_asset_review_v1(
  p_asset_id uuid,p_note text default null,p_actor uuid default null
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare v public.marketing_assets%rowtype; v_note text:=nullif(left(trim(coalesce(p_note,'')),1000),'');
begin
  select * into v from public.marketing_assets where id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if v.status<>'review' then return jsonb_build_object('ok',false,'error','asset_not_in_review','status',v.status,'external_side_effect',false); end if;
  if v_note is null then return jsonb_build_object('ok',false,'error','rejection_note_required','external_side_effect',false); end if;

  update public.marketing_assets set status='draft',reviewed_at=now(),reviewed_by=p_actor,approval_note=v_note,editable=true,updated_at=now() where id=p_asset_id;
  update public.marketing_publication_jobs
  set status='draft',scheduled_for=null,approved_at=null,approved_by=null,approval_note=v_note,external_ref=null,published_at=null,last_error=null,updated_at=now()
  where asset_id=p_asset_id and status in ('review','approved','scheduled','ready_manual','failed','review_required');

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('asset',p_asset_id::text,'review_rejected',p_actor,jsonb_build_object('note',v_note),false);
  return jsonb_build_object('ok',true,'id',p_asset_id,'status','draft','note',v_note,'external_side_effect',false);
end;
$$;

create or replace function public.approve_marketing_asset_v1(
  p_asset_id uuid,p_note text default null,p_actor uuid default null
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare v public.marketing_assets%rowtype; v_prepare jsonb;
begin
  select * into v from public.marketing_assets where id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if v.status<>'review' then return jsonb_build_object('ok',false,'error','asset_not_in_review','status',v.status,'external_side_effect',false); end if;

  update public.marketing_assets
  set status='approved',reviewed_at=now(),reviewed_by=p_actor,approval_note=nullif(left(trim(coalesce(p_note,'')),1000),''),
      editable=false,updated_at=now()
  where id=p_asset_id;

  update public.marketing_publication_jobs
  set status='approved',approved_at=now(),approved_by=p_actor,approval_note=nullif(left(trim(coalesce(p_note,'')),1000),''),updated_at=now()
  where asset_id=p_asset_id and status='review';

  select public.prepare_marketing_publication_jobs_v1(p_asset_id,p_actor) into v_prepare;
  if coalesce((v_prepare->>'ok')::boolean,false) is not true then
    raise exception 'publication_prepare_failed:%',coalesce(v_prepare->>'error','unknown');
  end if;

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('asset',p_asset_id::text,'approved',p_actor,
    jsonb_build_object('note',nullif(left(trim(coalesce(p_note,'')),1000),''),'publication_prepare',v_prepare),false);

  return jsonb_build_object('ok',true,'id',p_asset_id,'status','approved','publication_prepare',v_prepare,'external_side_effect',false);
end;
$$;

create or replace function public.marketing_save_asset_edit_v1(
  p_asset_id uuid,p_title text,p_generation_mode text,p_source_refs jsonb default '[]'::jsonb,
  p_edit_spec jsonb default '{}'::jsonb,p_render_spec jsonb default '{}'::jsonb,p_change_note text default null,p_actor uuid default null
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v public.marketing_assets%rowtype; v_revision integer; v_title text:=left(trim(coalesce(p_title,'')),180);
  v_note text:=nullif(left(trim(coalesce(p_change_note,'')),1000),''); v_invalidated_media integer:=0;
begin
  if length(v_title)<2 then return jsonb_build_object('ok',false,'error','title_required','external_side_effect',false); end if;
  if p_generation_mode not in ('no_ai','ai','hybrid','manual') then return jsonb_build_object('ok',false,'error','invalid_generation_mode','external_side_effect',false); end if;
  if jsonb_typeof(coalesce(p_source_refs,'[]'::jsonb))<>'array' then return jsonb_build_object('ok',false,'error','source_refs_must_be_array','external_side_effect',false); end if;
  if jsonb_typeof(coalesce(p_edit_spec,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_render_spec,'{}'::jsonb))<>'object' then return jsonb_build_object('ok',false,'error','spec_must_be_object','external_side_effect',false); end if;

  select * into v from public.marketing_assets where id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if v.status='approved' or v.editable=false then return jsonb_build_object('ok',false,'error','approved_asset_immutable_use_fork','status',v.status,'external_side_effect',false); end if;
  if v.status='render_queued' then return jsonb_build_object('ok',false,'error','asset_render_in_progress','external_side_effect',false); end if;
  if v.status='archived' then return jsonb_build_object('ok',false,'error','asset_archived','external_side_effect',false); end if;

  select coalesce(max(revision_no),0)+1 into v_revision from public.marketing_asset_revisions where asset_id=p_asset_id;
  insert into public.marketing_asset_revisions(asset_id,revision_no,title,media_kind,generation_mode,status_at_revision,source_refs,edit_spec,render_spec,output_spec,change_note,created_by)
  values(v.id,v_revision,v.title,v.media_kind,v.generation_mode,v.status,v.source_refs,v.edit_spec,v.render_spec,v.output_spec,v_note,p_actor);

  delete from public.marketing_media_objects where asset_id=p_asset_id and version=v.version;
  get diagnostics v_invalidated_media = row_count;

  update public.marketing_assets
  set title=v_title,generation_mode=p_generation_mode,source_refs=coalesce(p_source_refs,'[]'::jsonb),edit_spec=coalesce(p_edit_spec,'{}'::jsonb),
      render_spec=coalesce(p_render_spec,'{}'::jsonb),output_spec='{}'::jsonb,status='draft',editable=true,review_requested_at=null,reviewed_at=null,
      reviewed_by=null,approval_note=null,estimated_cost_cents=0,actual_cost_cents=0,updated_at=now()
  where id=p_asset_id;

  update public.marketing_publication_jobs
  set status='draft',scheduled_for=null,approved_at=null,approved_by=null,approval_note=null,external_ref=null,published_at=null,last_error=null,updated_at=now()
  where asset_id=p_asset_id and status in ('review','approved','scheduled','ready_manual','failed','review_required');

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('asset',p_asset_id::text,'edit_saved',p_actor,
    jsonb_build_object('revision_no',v_revision,'previous_status',v.status,'generation_mode',p_generation_mode,'invalidated_media_count',v_invalidated_media),false);

  return jsonb_build_object('ok',true,'id',p_asset_id,'status','draft','revision_saved',v_revision,'invalidated_media_count',v_invalidated_media,'external_side_effect',false);
end;
$$;

revoke all on function public.prepare_marketing_publication_jobs_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.reject_marketing_asset_review_v1(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.approve_marketing_asset_v1(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.marketing_save_asset_edit_v1(uuid,text,text,jsonb,jsonb,jsonb,text,uuid) from public,anon,authenticated;

grant execute on function public.prepare_marketing_publication_jobs_v1(uuid,uuid) to service_role;
grant execute on function public.reject_marketing_asset_review_v1(uuid,text,uuid) to service_role;
grant execute on function public.approve_marketing_asset_v1(uuid,text,uuid) to service_role;
grant execute on function public.marketing_save_asset_edit_v1(uuid,text,text,jsonb,jsonb,jsonb,text,uuid) to service_role;
