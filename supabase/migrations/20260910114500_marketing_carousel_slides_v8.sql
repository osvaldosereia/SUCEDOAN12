begin;

-- Marketing carousel slides V8.
-- Versioned editorial model only. No social API call and no publication dispatcher.

create table if not exists public.marketing_carousel_slides (
  id uuid primary key default gen_random_uuid(),
  carousel_asset_id uuid not null references public.marketing_assets(id) on delete cascade,
  asset_version integer not null check (asset_version > 0),
  slide_no smallint not null check (slide_no between 1 and 10),
  title text not null,
  generation_mode text not null check (generation_mode in ('no_ai','ai','hybrid','manual')),
  source_refs jsonb not null default '[]'::jsonb,
  edit_spec jsonb not null default '{}'::jsonb,
  render_spec jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','render_queued','rendered','review','approved','failed','archived')),
  output_media_id uuid references public.marketing_media_objects(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(carousel_asset_id,asset_version,slide_no)
);

create index if not exists marketing_carousel_slides_asset_idx
  on public.marketing_carousel_slides(carousel_asset_id,asset_version,slide_no);
create index if not exists marketing_carousel_slides_output_idx
  on public.marketing_carousel_slides(output_media_id) where output_media_id is not null;

alter table public.marketing_carousel_slides enable row level security;
revoke all on table public.marketing_carousel_slides from public,anon,authenticated;
grant select,insert,update,delete on table public.marketing_carousel_slides to service_role;

create or replace function public.marketing_carousel_read_v1(p_asset_id uuid)
returns table(
  id uuid,carousel_asset_id uuid,asset_version integer,slide_no smallint,title text,generation_mode text,
  source_refs jsonb,edit_spec jsonb,render_spec jsonb,status text,output_media_id uuid,created_at timestamptz,updated_at timestamptz
)
language sql
security invoker
set search_path=public,pg_temp
as $$
  select s.id,s.carousel_asset_id,s.asset_version,s.slide_no,s.title,s.generation_mode,s.source_refs,s.edit_spec,s.render_spec,s.status,s.output_media_id,s.created_at,s.updated_at
  from public.marketing_carousel_slides s
  where s.carousel_asset_id=p_asset_id
  order by s.asset_version desc,s.slide_no asc;
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

  -- Current asset version is editable. Older versions stay untouched for audit/history.
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
    v_render:=coalesce(v_item->'render_spec','{}'::jsonb);
    if jsonb_typeof(v_source)<>'array' or jsonb_typeof(v_edit)<>'object' or jsonb_typeof(v_render)<>'object' then raise exception 'invalid_carousel_slide_spec'; end if;
    if length(v_source::text)>50000 or length(v_edit::text)>50000 or length(v_render::text)>50000 then raise exception 'carousel_slide_spec_too_large'; end if;

    insert into public.marketing_carousel_slides(carousel_asset_id,asset_version,slide_no,title,generation_mode,source_refs,edit_spec,render_spec,status,created_by)
    values(p_asset_id,v_asset.version,v_no,v_title,v_mode,v_source,v_edit,v_render,'draft',p_actor);
  end loop;

  update public.marketing_assets set status='draft',updated_at=now() where id=p_asset_id;
  update public.marketing_publication_jobs set status='draft',scheduled_for=null,updated_at=now()
    where asset_id=p_asset_id and status in ('review','approved','scheduled','ready_manual');

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('asset',p_asset_id::text,'carousel_slides_saved',p_actor,jsonb_build_object('asset_version',v_asset.version,'slide_count',v_count),false);

  return jsonb_build_object('ok',true,'asset_id',p_asset_id,'asset_version',v_asset.version,'slide_count',v_count,'status','draft','external_side_effect',false);
exception when others then
  return jsonb_build_object('ok',false,'error',sqlerrm,'external_side_effect',false);
end;
$$;

create or replace function public.marketing_carousel_current_v1(p_asset_id uuid)
returns jsonb
language sql
security invoker
set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'slide_no',s.slide_no,'title',s.title,'generation_mode',s.generation_mode,
    'source_refs',s.source_refs,'edit_spec',s.edit_spec,'render_spec',s.render_spec,'status',s.status,
    'output_media_id',s.output_media_id,'asset_version',s.asset_version
  ) order by s.slide_no),'[]'::jsonb)
  from public.marketing_carousel_slides s
  join public.marketing_assets a on a.id=s.carousel_asset_id and a.version=s.asset_version
  where s.carousel_asset_id=p_asset_id;
$$;

revoke all on function public.marketing_carousel_read_v1(uuid) from public,anon,authenticated;
revoke all on function public.save_marketing_carousel_slides_v1(uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.marketing_carousel_current_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_carousel_read_v1(uuid) to service_role;
grant execute on function public.save_marketing_carousel_slides_v1(uuid,jsonb,uuid) to service_role;
grant execute on function public.marketing_carousel_current_v1(uuid) to service_role;

insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
values('runtime','1','carousel_slides_v8_ready',jsonb_build_object('max_slides',10,'versioned',true),false);

commit;
