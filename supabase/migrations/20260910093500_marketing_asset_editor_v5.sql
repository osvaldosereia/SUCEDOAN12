begin;

-- Marketing asset editor V5.
-- Local/versioned editing only: no renderer dispatch, no provider call and no publication.

create table if not exists public.marketing_asset_revisions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.marketing_assets(id) on delete cascade,
  revision_no integer not null check (revision_no > 0),
  title text not null,
  media_kind text not null,
  generation_mode text not null,
  status_at_revision text not null,
  source_refs jsonb not null default '[]'::jsonb,
  edit_spec jsonb not null default '{}'::jsonb,
  render_spec jsonb not null default '{}'::jsonb,
  output_spec jsonb not null default '{}'::jsonb,
  change_note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(asset_id, revision_no)
);

create index if not exists marketing_asset_revisions_asset_idx
  on public.marketing_asset_revisions(asset_id, revision_no desc);

alter table public.marketing_asset_revisions enable row level security;
revoke all on table public.marketing_asset_revisions from public, anon, authenticated;
grant select,insert on table public.marketing_asset_revisions to service_role;

create or replace function public.marketing_asset_revisions_append_only_v1()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  raise exception 'marketing_asset_revisions_append_only';
end $$;

drop trigger if exists marketing_asset_revisions_append_only_v1 on public.marketing_asset_revisions;
create trigger marketing_asset_revisions_append_only_v1
before update or delete on public.marketing_asset_revisions
for each row execute function public.marketing_asset_revisions_append_only_v1();

create or replace function public.marketing_save_asset_edit_v1(
  p_asset_id uuid,
  p_title text,
  p_generation_mode text,
  p_source_refs jsonb default '[]'::jsonb,
  p_edit_spec jsonb default '{}'::jsonb,
  p_render_spec jsonb default '{}'::jsonb,
  p_change_note text default null,
  p_actor uuid default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v public.marketing_assets%rowtype;
  v_revision integer;
  v_title text:=left(trim(coalesce(p_title,'')),180);
  v_note text:=nullif(left(trim(coalesce(p_change_note,'')),1000),'');
begin
  if length(v_title) < 2 then
    return jsonb_build_object('ok',false,'error','title_required','external_side_effect',false);
  end if;
  if p_generation_mode not in ('no_ai','ai','hybrid','manual') then
    return jsonb_build_object('ok',false,'error','invalid_generation_mode','external_side_effect',false);
  end if;
  if jsonb_typeof(coalesce(p_source_refs,'[]'::jsonb)) <> 'array' then
    return jsonb_build_object('ok',false,'error','source_refs_must_be_array','external_side_effect',false);
  end if;
  if jsonb_typeof(coalesce(p_edit_spec,'{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_render_spec,'{}'::jsonb)) <> 'object' then
    return jsonb_build_object('ok',false,'error','spec_must_be_object','external_side_effect',false);
  end if;

  select * into v from public.marketing_assets where id=p_asset_id for update;
  if not found then
    return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false);
  end if;
  if v.status='approved' or v.editable=false then
    return jsonb_build_object('ok',false,'error','approved_asset_immutable_use_fork','status',v.status,'external_side_effect',false);
  end if;
  if v.status='render_queued' then
    return jsonb_build_object('ok',false,'error','asset_render_in_progress','external_side_effect',false);
  end if;
  if v.status='archived' then
    return jsonb_build_object('ok',false,'error','asset_archived','external_side_effect',false);
  end if;

  select coalesce(max(revision_no),0)+1 into v_revision
  from public.marketing_asset_revisions where asset_id=p_asset_id;

  insert into public.marketing_asset_revisions(
    asset_id,revision_no,title,media_kind,generation_mode,status_at_revision,
    source_refs,edit_spec,render_spec,output_spec,change_note,created_by
  ) values(
    v.id,v_revision,v.title,v.media_kind,v.generation_mode,v.status,
    v.source_refs,v.edit_spec,v.render_spec,v.output_spec,v_note,p_actor
  );

  update public.marketing_assets set
    title=v_title,
    generation_mode=p_generation_mode,
    source_refs=coalesce(p_source_refs,'[]'::jsonb),
    edit_spec=coalesce(p_edit_spec,'{}'::jsonb),
    render_spec=coalesce(p_render_spec,'{}'::jsonb),
    output_spec='{}'::jsonb,
    status='draft',
    editable=true,
    review_requested_at=null,
    reviewed_at=null,
    reviewed_by=null,
    approval_note=null,
    estimated_cost_cents=0,
    actual_cost_cents=0,
    updated_at=now()
  where id=p_asset_id;

  update public.marketing_publication_jobs set
    status='draft',
    scheduled_for=null,
    approved_at=null,
    approved_by=null,
    approval_note=null,
    external_ref=null,
    published_at=null,
    last_error=null,
    updated_at=now()
  where asset_id=p_asset_id and status in ('review','approved','scheduled','ready_manual','failed','review_required');

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('asset',p_asset_id::text,'edit_saved',p_actor,jsonb_build_object('revision_no',v_revision,'previous_status',v.status,'generation_mode',p_generation_mode),false);

  return jsonb_build_object('ok',true,'id',p_asset_id,'status','draft','revision_saved',v_revision,'external_side_effect',false);
end $$;

create or replace function public.marketing_fork_asset_version_v1(
  p_asset_id uuid,
  p_change_note text default null,
  p_actor uuid default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v public.marketing_assets%rowtype;
  v_id uuid;
  v_version integer;
  v_note text:=nullif(left(trim(coalesce(p_change_note,'')),1000),'');
begin
  select * into v from public.marketing_assets where id=p_asset_id for update;
  if not found then
    return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false);
  end if;
  if v.status='archived' then
    return jsonb_build_object('ok',false,'error','asset_archived','external_side_effect',false);
  end if;

  select coalesce(max(version),0)+1 into v_version
  from public.marketing_assets
  where id=p_asset_id or parent_asset_id=p_asset_id or parent_asset_id=v.parent_asset_id;
  v_version:=greatest(v.version+1,v_version);

  insert into public.marketing_assets(
    campaign_id,parent_asset_id,version,title,media_kind,generation_mode,
    template_id,command_preset_id,status,source_refs,edit_spec,render_spec,output_spec,
    editable,estimated_cost_cents,actual_cost_cents,created_by
  ) values(
    v.campaign_id,v.id,v_version,v.title,v.media_kind,v.generation_mode,
    v.template_id,v.command_preset_id,'draft',v.source_refs,v.edit_spec,v.render_spec,'{}'::jsonb,
    true,0,0,p_actor
  ) returning id into v_id;

  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('asset',v_id::text,'version_forked',p_actor,jsonb_build_object('source_asset_id',v.id,'version',v_version,'change_note',v_note),false);

  return jsonb_build_object('ok',true,'id',v_id,'parent_asset_id',v.id,'version',v_version,'status','draft','external_side_effect',false);
end $$;

revoke all on function public.marketing_asset_revisions_append_only_v1() from public,anon,authenticated;
revoke all on function public.marketing_save_asset_edit_v1(uuid,text,text,jsonb,jsonb,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.marketing_fork_asset_version_v1(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.marketing_save_asset_edit_v1(uuid,text,text,jsonb,jsonb,jsonb,text,uuid) to service_role;
grant execute on function public.marketing_fork_asset_version_v1(uuid,text,uuid) to service_role;

commit;
