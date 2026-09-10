begin;

-- Marketing Carousel Render Spec V11.
-- Canonical deterministic render specs are built server-side from the editable slide model.
-- No provider call, AI call or external publication is introduced here.

create or replace function public.marketing_build_carousel_slide_render_spec_v1(
  p_asset_id uuid,
  p_version integer,
  p_slide_no integer,
  p_title text,
  p_source_refs jsonb,
  p_edit_spec jsonb
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_source jsonb:=coalesce(p_source_refs,'[]'::jsonb);
  v_edit jsonb:=coalesce(p_edit_spec,'{}'::jsonb);
  v_media_id_text text;
  v_media_id uuid;
  v_media public.marketing_media_objects%rowtype;
  v_fit text;
  v_x numeric;
  v_y numeric;
  v_scale numeric;
  v_headline text;
  v_price text;
  v_cta text;
  v_layers jsonb:='[]'::jsonb;
  v_raw text;
begin
  if p_version<1 or p_slide_no<1 or p_slide_no>10 then raise exception 'invalid_carousel_render_identity'; end if;
  if jsonb_typeof(v_source)<>'array' or jsonb_typeof(v_edit)<>'object' then raise exception 'invalid_carousel_render_input'; end if;
  if jsonb_array_length(v_source)>1 then raise exception 'carousel_slide_single_source_required'; end if;

  if jsonb_array_length(v_source)=1 then
    if coalesce(v_source->0->>'kind','')<>'private_media' then raise exception 'carousel_slide_private_media_required'; end if;
    v_media_id_text:=trim(coalesce(v_source->0->>'media_id',''));
    if v_media_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'invalid_carousel_media_id'; end if;
    v_media_id:=v_media_id_text::uuid;
    select * into v_media from public.marketing_media_objects
      where id=v_media_id and asset_id=p_asset_id and version=p_version and mime_type in ('image/webp','image/png','image/jpeg');
    if not found then raise exception 'carousel_media_scope_mismatch'; end if;
  end if;

  v_fit:=case when lower(coalesce(v_edit#>>'{crop,fit}','contain'))='cover' then 'cover' else 'contain' end;
  v_raw:=coalesce(v_edit#>>'{crop,x}','50');
  v_x:=case when v_raw ~ '^-?[0-9]+([.][0-9]+)?$' then least(100,greatest(0,v_raw::numeric)) else 50 end;
  v_raw:=coalesce(v_edit#>>'{crop,y}','50');
  v_y:=case when v_raw ~ '^-?[0-9]+([.][0-9]+)?$' then least(100,greatest(0,v_raw::numeric)) else 50 end;
  v_raw:=coalesce(v_edit#>>'{crop,scale}','1');
  v_scale:=case when v_raw ~ '^-?[0-9]+([.][0-9]+)?$' then least(3,greatest(0.5,v_raw::numeric)) else 1 end;

  v_headline:=left(trim(coalesce(nullif(v_edit->>'headline',''),p_title,'Oferta Dona Antônia')),90);
  v_price:=left(trim(coalesce(v_edit->>'price','')),30);
  v_cta:=left(trim(coalesce(nullif(v_edit->>'cta',''),'Peça pelo WhatsApp')),50);

  if v_media_id is not null then
    v_layers:=v_layers||jsonb_build_array(jsonb_build_object(
      'type','image','x',0,'y',0,'width',1080,'height',820,
      'source_ref',jsonb_build_object('kind','private_media','media_id',v_media_id),
      'crop',jsonb_build_object('fit',v_fit,'x',v_x,'y',v_y,'scale',v_scale)
    ));
  end if;

  v_layers:=v_layers||jsonb_build_array(
    jsonb_build_object('type','rect','x',0,'y',820,'width',1080,'height',530,'fill','#ffffff'),
    jsonb_build_object('type','text','text',v_headline,'x',72,'y',865,'width',936,'fontSize',62,'fontWeight','700','color','#173f2a','align','left')
  );
  if length(v_price)>0 then
    v_layers:=v_layers||jsonb_build_array(jsonb_build_object('type','text','text',v_price,'x',72,'y',1038,'width',936,'fontSize',72,'fontWeight','700','color','#111827','align','left'));
  end if;
  v_layers:=v_layers||jsonb_build_array(jsonb_build_object('type','text','text',v_cta,'x',72,'y',1192,'width',936,'fontSize',38,'fontWeight','700','color','#173f2a','align','left'));

  return jsonb_build_object(
    'schema','marketing.carousel.render.v1',
    'width',1080,'height',1350,'background','#f7f4ee','quality',84,'effort',5,
    'layers',v_layers,
    'metadata',jsonb_build_object('asset_id',p_asset_id,'asset_version',p_version,'slide_no',p_slide_no,'ai_used',false,'external_side_effect',false)
  );
end;
$$;

create or replace function public.save_marketing_carousel_slides_v1(
  p_asset_id uuid,
  p_slides jsonb,
  p_actor uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_asset public.marketing_assets%rowtype;
  v_count integer;
  v_item jsonb;
  v_no integer:=0;
  v_mode text;
  v_title text;
  v_source jsonb;
  v_edit jsonb;
  v_render jsonb;
begin
  select * into v_asset from public.marketing_assets where id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if v_asset.media_kind<>'carousel' then return jsonb_build_object('ok',false,'error','asset_not_carousel','external_side_effect',false); end if;
  if v_asset.status in ('approved','archived') or not v_asset.editable then return jsonb_build_object('ok',false,'error','asset_immutable','external_side_effect',false); end if;
  if jsonb_typeof(coalesce(p_slides,'null'::jsonb))<>'array' then return jsonb_build_object('ok',false,'error','slides_must_be_array','external_side_effect',false); end if;
  v_count:=jsonb_array_length(p_slides);
  if v_count<2 or v_count>10 then return jsonb_build_object('ok',false,'error','carousel_slide_count_invalid','min',2,'max',10,'external_side_effect',false); end if;

  delete from public.marketing_carousel_slides where carousel_asset_id=p_asset_id and asset_version=v_asset.version;

  for v_item in select value from jsonb_array_elements(p_slides)
  loop
    v_no:=v_no+1;
    if jsonb_typeof(v_item)<>'object' then raise exception 'invalid_carousel_slide'; end if;
    v_mode:=trim(coalesce(v_item->>'generation_mode',v_asset.generation_mode));
    if v_mode not in ('no_ai','ai','hybrid','manual') then raise exception 'invalid_carousel_generation_mode'; end if;
    v_title:=left(trim(coalesce(v_item->>'title',v_asset.title||' · '||v_no::text)),180);
    if length(v_title)<1 then raise exception 'carousel_slide_title_required'; end if;
    v_source:=coalesce(v_item->'source_refs','[]'::jsonb);
    v_edit:=coalesce(v_item->'edit_spec','{}'::jsonb);
    if jsonb_typeof(v_source)<>'array' or jsonb_typeof(v_edit)<>'object' then raise exception 'invalid_carousel_slide_spec'; end if;
    if length(v_source::text)>50000 or length(v_edit::text)>50000 then raise exception 'carousel_slide_spec_too_large'; end if;

    -- Client-provided render_spec is deliberately ignored. The server snapshots a canonical safe spec.
    v_render:=public.marketing_build_carousel_slide_render_spec_v1(p_asset_id,v_asset.version,v_no,v_title,v_source,v_edit);

    insert into public.marketing_carousel_slides(carousel_asset_id,asset_version,slide_no,title,generation_mode,source_refs,edit_spec,render_spec,status,created_by)
    values(p_asset_id,v_asset.version,v_no,v_title,v_mode,v_source,v_edit,v_render,'draft',p_actor);
  end loop;

  update public.marketing_assets set status='draft',updated_at=now() where id=p_asset_id;
  update public.marketing_publication_jobs set status='draft',scheduled_for=null,updated_at=now()
    where asset_id=p_asset_id and status in ('review','approved','scheduled','ready_manual');

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('asset',p_asset_id::text,'carousel_slides_saved',p_actor,
    jsonb_build_object('asset_version',v_asset.version,'slide_count',v_count,'render_spec_schema','marketing.carousel.render.v1'),false);

  return jsonb_build_object('ok',true,'asset_id',p_asset_id,'asset_version',v_asset.version,'slide_count',v_count,'status','draft','render_spec_schema','marketing.carousel.render.v1','external_side_effect',false);
exception when others then
  return jsonb_build_object('ok',false,'error',sqlerrm,'external_side_effect',false);
end;
$$;

create or replace function public.request_marketing_carousel_renders_v1(
  p_asset_id uuid,
  p_idempotency_key text,
  p_actor uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_runtime public.marketing_runtime_config%rowtype;
  v_asset public.marketing_assets%rowtype;
  v_slide public.marketing_carousel_slides%rowtype;
  v_count integer;
  v_new_count integer:=0;
  v_job_id uuid;
  v_key text;
  v_jobs jsonb:='[]'::jsonb;
begin
  select * into v_runtime from public.marketing_runtime_config where id=1;
  if not found then return jsonb_build_object('ok',false,'error','runtime_missing','external_side_effect',false); end if;
  if v_runtime.kill_switch or not v_runtime.enabled or not v_runtime.generation_enabled then
    return jsonb_build_object('ok',false,'error','marketing_generation_disabled','external_side_effect',false);
  end if;
  if not v_runtime.deterministic_render_enabled then
    return jsonb_build_object('ok',false,'error','deterministic_render_disabled','external_side_effect',false);
  end if;
  if length(trim(coalesce(p_idempotency_key,'')))<8 or length(p_idempotency_key)>80 then
    return jsonb_build_object('ok',false,'error','invalid_idempotency_key','external_side_effect',false);
  end if;

  select * into v_asset from public.marketing_assets where id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if v_asset.media_kind<>'carousel' then return jsonb_build_object('ok',false,'error','asset_not_carousel','external_side_effect',false); end if;
  if v_asset.status not in ('draft','failed','rendered','render_queued') then
    return jsonb_build_object('ok',false,'error','asset_not_renderable','status',v_asset.status,'external_side_effect',false);
  end if;

  select count(*) into v_count from public.marketing_carousel_slides where carousel_asset_id=p_asset_id and asset_version=v_asset.version;
  if v_count<2 or v_count>10 then return jsonb_build_object('ok',false,'error','carousel_slide_count_invalid','external_side_effect',false); end if;
  if exists(select 1 from public.marketing_carousel_slides where carousel_asset_id=p_asset_id and asset_version=v_asset.version and generation_mode='ai') then
    return jsonb_build_object('ok',false,'error','ai_slide_requires_explicit_ai_pipeline','external_side_effect',false);
  end if;
  if exists(select 1 from public.marketing_carousel_slides where carousel_asset_id=p_asset_id and asset_version=v_asset.version and coalesce(render_spec->>'schema','')<>'marketing.carousel.render.v1') then
    return jsonb_build_object('ok',false,'error','carousel_render_spec_not_canonical','external_side_effect',false);
  end if;

  for v_slide in
    select * from public.marketing_carousel_slides where carousel_asset_id=p_asset_id and asset_version=v_asset.version order by slide_no
  loop
    v_key:=left(trim(p_idempotency_key)||':'||p_asset_id::text||':v'||v_asset.version::text||':s'||v_slide.slide_no::text,160);
    v_job_id:=null;
    insert into public.marketing_render_jobs(asset_id,render_kind,status,idempotency_key,input_spec,output_spec,ai_used,created_by)
    values(p_asset_id,'deterministic_image','queued',v_key,v_slide.render_spec,
      jsonb_build_object('registry','marketing_media_objects','asset_version',v_asset.version,'carousel_slide_id',v_slide.id,'slide_no',v_slide.slide_no),false,p_actor)
    on conflict(idempotency_key) do nothing
    returning id into v_job_id;
    if v_job_id is null then
      select id into v_job_id from public.marketing_render_jobs where idempotency_key=v_key and asset_id=p_asset_id;
      if v_job_id is null then return jsonb_build_object('ok',false,'error','idempotency_key_collision','external_side_effect',false); end if;
    else
      v_new_count:=v_new_count+1;
    end if;
    v_jobs:=v_jobs||jsonb_build_array(jsonb_build_object('job_id',v_job_id,'slide_no',v_slide.slide_no,'idempotency_key',v_key));
  end loop;

  update public.marketing_assets set status='render_queued',updated_at=now() where id=p_asset_id and status<>'render_queued';
  update public.marketing_carousel_slides set status='render_queued',updated_at=now()
    where carousel_asset_id=p_asset_id and asset_version=v_asset.version and status='draft';
  if v_new_count>0 then
    insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
    values('asset',p_asset_id::text,'carousel_render_batch_queued',p_actor,
      jsonb_build_object('asset_version',v_asset.version,'slide_count',v_count,'new_jobs',v_new_count,'render_kind','deterministic_image'),false);
  end if;
  return jsonb_build_object('ok',true,'asset_id',p_asset_id,'asset_version',v_asset.version,'slide_count',v_count,'new_jobs',v_new_count,'jobs',v_jobs,'ai_used',false,'external_side_effect',false);
end;
$$;

revoke all on function public.marketing_build_carousel_slide_render_spec_v1(uuid,integer,integer,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.save_marketing_carousel_slides_v1(uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.request_marketing_carousel_renders_v1(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.marketing_build_carousel_slide_render_spec_v1(uuid,integer,integer,text,jsonb,jsonb) to service_role;
grant execute on function public.save_marketing_carousel_slides_v1(uuid,jsonb,uuid) to service_role;
grant execute on function public.request_marketing_carousel_renders_v1(uuid,text,uuid) to service_role;

insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
values('runtime','1','carousel_render_spec_v11_ready',jsonb_build_object('schema','marketing.carousel.render.v1','server_canonical',true,'private_media_scoped',true,'ai_used',false),false);

commit;
