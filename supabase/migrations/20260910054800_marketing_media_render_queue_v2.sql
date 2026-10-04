begin;

-- Marketing media/render queue V2.
-- Internal rendering only. No external publication and no AI provider call.

create table if not exists public.marketing_media_objects (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.marketing_assets(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  role text not null default 'preview' check (role in ('source','preview','output','thumbnail','poster')),
  storage_provider text not null default 'supabase' check (storage_provider in ('supabase','github','local')),
  bucket_name text,
  object_path text not null,
  mime_type text not null,
  width integer check (width is null or width between 1 and 8192),
  height integer check (height is null or height between 1 and 8192),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(asset_id,version,role,object_path)
);

create table if not exists public.marketing_render_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.marketing_assets(id) on delete cascade,
  render_kind text not null check (render_kind in ('deterministic_image','economical_video','ai_image','ai_video')),
  status text not null default 'draft' check (status in ('draft','queued','processing','rendered','failed','cancelled','review_required')),
  idempotency_key text not null unique,
  input_spec jsonb not null default '{}'::jsonb,
  output_spec jsonb not null default '{}'::jsonb,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 20),
  lease_owner text,
  lease_until timestamptz,
  estimated_cost_cents integer not null default 0 check (estimated_cost_cents >= 0),
  actual_cost_cents integer not null default 0 check (actual_cost_cents >= 0),
  ai_used boolean not null default false,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists marketing_media_asset_idx on public.marketing_media_objects(asset_id,version desc,created_at desc);
create index if not exists marketing_render_jobs_queue_idx on public.marketing_render_jobs(status,created_at) where status in ('queued','processing','review_required');
create index if not exists marketing_render_jobs_asset_idx on public.marketing_render_jobs(asset_id,created_at desc);

alter table public.marketing_media_objects enable row level security;
alter table public.marketing_render_jobs enable row level security;
revoke all on table public.marketing_media_objects from public,anon,authenticated;
revoke all on table public.marketing_render_jobs from public,anon,authenticated;
grant select,insert,update,delete on table public.marketing_media_objects to service_role;
grant select,insert,update on table public.marketing_render_jobs to service_role;

create or replace function public.queue_marketing_render_v2(
  p_asset_id uuid,
  p_render_kind text,
  p_idempotency_key text,
  p_input_spec jsonb default '{}'::jsonb,
  p_output_spec jsonb default '{}'::jsonb,
  p_actor uuid default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare
  v_runtime public.marketing_runtime_config%rowtype;
  v_asset public.marketing_assets%rowtype;
  v_job public.marketing_render_jobs%rowtype;
  v_ai boolean;
begin
  select * into v_runtime from public.marketing_runtime_config where id=1;
  if not found then return jsonb_build_object('ok',false,'error','runtime_missing','external_side_effect',false); end if;
  if v_runtime.kill_switch or not v_runtime.enabled or not v_runtime.generation_enabled then
    return jsonb_build_object('ok',false,'error','marketing_generation_disabled','external_side_effect',false);
  end if;
  if p_render_kind not in ('deterministic_image','economical_video','ai_image','ai_video') then
    return jsonb_build_object('ok',false,'error','invalid_render_kind','external_side_effect',false);
  end if;
  v_ai:=p_render_kind in ('ai_image','ai_video');
  if p_render_kind in ('deterministic_image','economical_video') and not v_runtime.deterministic_render_enabled then
    return jsonb_build_object('ok',false,'error','deterministic_render_disabled','external_side_effect',false);
  end if;
  if p_render_kind='ai_image' and not v_runtime.ai_image_enabled then
    return jsonb_build_object('ok',false,'error','ai_image_disabled','external_side_effect',false);
  end if;
  if p_render_kind='ai_video' and not v_runtime.ai_video_enabled then
    return jsonb_build_object('ok',false,'error','ai_video_disabled','external_side_effect',false);
  end if;
  select * into v_asset from public.marketing_assets where id=p_asset_id;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if v_asset.status not in ('draft','failed','rendered') then
    return jsonb_build_object('ok',false,'error','asset_not_renderable','status',v_asset.status,'external_side_effect',false);
  end if;
  if length(trim(coalesce(p_idempotency_key,'')))<8 or length(p_idempotency_key)>160 then
    return jsonb_build_object('ok',false,'error','invalid_idempotency_key','external_side_effect',false);
  end if;
  insert into public.marketing_render_jobs(asset_id,render_kind,status,idempotency_key,input_spec,output_spec,ai_used,created_by)
  values(p_asset_id,p_render_kind,'queued',trim(p_idempotency_key),coalesce(p_input_spec,'{}'::jsonb),coalesce(p_output_spec,'{}'::jsonb),v_ai,p_actor)
  on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning * into v_job;
  update public.marketing_assets set status='render_queued',updated_at=now() where id=p_asset_id and status<>'render_queued';
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
  values('render_job',v_job.id::text,'render_queued',p_actor,jsonb_build_object('asset_id',p_asset_id,'render_kind',p_render_kind,'ai_used',v_ai),false);
  return jsonb_build_object('ok',true,'job_id',v_job.id,'status',v_job.status,'ai_used',v_job.ai_used,'external_side_effect',false);
end;
$$;

create or replace function public.claim_marketing_render_jobs_v2(
  p_worker text,
  p_limit integer default 5,
  p_lease_seconds integer default 300
) returns setof public.marketing_render_jobs
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare
  v_runtime public.marketing_runtime_config%rowtype;
begin
  select * into v_runtime from public.marketing_runtime_config where id=1;
  if not found or v_runtime.kill_switch or not v_runtime.enabled or not v_runtime.generation_enabled then return; end if;
  return query
  with picked as (
    select j.id from public.marketing_render_jobs j
    where j.status='queued' or (j.status='processing' and j.lease_until<now())
    order by j.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,5),20))
  )
  update public.marketing_render_jobs j
  set status='processing',lease_owner=left(coalesce(nullif(trim(p_worker),''),'worker'),120),
      lease_until=now()+make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,300),1800))),
      attempt_count=j.attempt_count+1,started_at=coalesce(j.started_at,now()),updated_at=now()
  from picked where j.id=picked.id
  returning j.*;
end;
$$;

create or replace function public.complete_marketing_render_v2(
  p_job_id uuid,
  p_worker text,
  p_success boolean,
  p_output_spec jsonb default '{}'::jsonb,
  p_error text default null,
  p_actual_cost_cents integer default 0
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare
  v_job public.marketing_render_jobs%rowtype;
  v_status text;
begin
  select * into v_job from public.marketing_render_jobs where id=p_job_id for update;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found','external_side_effect',false); end if;
  if v_job.status<>'processing' or coalesce(v_job.lease_owner,'')<>coalesce(p_worker,'') then
    return jsonb_build_object('ok',false,'error','lease_mismatch','external_side_effect',false);
  end if;
  v_status:=case when p_success then 'rendered' else 'failed' end;
  update public.marketing_render_jobs set status=v_status,output_spec=coalesce(p_output_spec,'{}'::jsonb),
    actual_cost_cents=greatest(0,coalesce(p_actual_cost_cents,0)),last_error=case when p_success then null else left(coalesce(p_error,'render_failed'),2000) end,
    lease_owner=null,lease_until=null,finished_at=now(),updated_at=now() where id=p_job_id;
  update public.marketing_assets set status=v_status,output_spec=case when p_success then coalesce(p_output_spec,'{}'::jsonb) else output_spec end,
    actual_cost_cents=actual_cost_cents+greatest(0,coalesce(p_actual_cost_cents,0)),updated_at=now() where id=v_job.asset_id;
  insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
  values('render_job',p_job_id::text,case when p_success then 'render_completed' else 'render_failed' end,
    jsonb_build_object('asset_id',v_job.asset_id,'render_kind',v_job.render_kind,'actual_cost_cents',greatest(0,coalesce(p_actual_cost_cents,0))),false);
  return jsonb_build_object('ok',true,'job_id',p_job_id,'status',v_status,'external_side_effect',false);
end;
$$;

revoke all on function public.queue_marketing_render_v2(uuid,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.claim_marketing_render_jobs_v2(text,integer,integer) from public,anon,authenticated;
revoke all on function public.complete_marketing_render_v2(uuid,text,boolean,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.queue_marketing_render_v2(uuid,text,text,jsonb,jsonb,uuid) to service_role;
grant execute on function public.claim_marketing_render_jobs_v2(text,integer,integer) to service_role;
grant execute on function public.complete_marketing_render_v2(uuid,text,boolean,jsonb,text,integer) to service_role;

commit;
