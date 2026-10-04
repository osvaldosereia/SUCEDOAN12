begin;

alter table public.marketing_assets
  add column if not exists review_requested_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists approval_note text;

alter table public.marketing_publication_jobs
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists approval_note text;

create index if not exists marketing_jobs_calendar_v4_idx
  on public.marketing_publication_jobs(scheduled_for, channel, status)
  where scheduled_for is not null and status in ('approved','scheduled','ready_manual');

create or replace function public.submit_marketing_asset_review_v1(p_asset_id uuid,p_actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.marketing_assets%rowtype;
begin
  select * into v from public.marketing_assets where id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if v.status not in ('draft','rendered') then return jsonb_build_object('ok',false,'error','asset_not_reviewable','status',v.status,'external_side_effect',false); end if;
  update public.marketing_assets set status='review',review_requested_at=coalesce(review_requested_at,now()),updated_at=now() where id=p_asset_id;
  update public.marketing_publication_jobs set status='review',updated_at=now() where asset_id=p_asset_id and status='draft';
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data) values('asset',p_asset_id::text,'review_requested',p_actor,jsonb_build_object('external_side_effect',false));
  return jsonb_build_object('ok',true,'id',p_asset_id,'status','review','external_side_effect',false);
end $$;

create or replace function public.approve_marketing_asset_v1(p_asset_id uuid,p_note text default null,p_actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.marketing_assets%rowtype;
begin
  select * into v from public.marketing_assets where id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if v.status <> 'review' then return jsonb_build_object('ok',false,'error','asset_not_in_review','status',v.status,'external_side_effect',false); end if;
  update public.marketing_assets set status='approved',reviewed_at=now(),reviewed_by=p_actor,approval_note=nullif(left(trim(coalesce(p_note,'')),1000),''),editable=false,updated_at=now() where id=p_asset_id;
  update public.marketing_publication_jobs set status='approved',approved_at=now(),approved_by=p_actor,approval_note=nullif(left(trim(coalesce(p_note,'')),1000),''),updated_at=now() where asset_id=p_asset_id and status='review';
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data) values('asset',p_asset_id::text,'approved',p_actor,jsonb_build_object('external_side_effect',false));
  return jsonb_build_object('ok',true,'id',p_asset_id,'status','approved','external_side_effect',false);
end $$;

create or replace function public.schedule_marketing_publication_v1(p_job_id uuid,p_scheduled_for timestamptz,p_actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare j public.marketing_publication_jobs%rowtype; a public.marketing_assets%rowtype;
begin
  if p_scheduled_for is null or p_scheduled_for < now() - interval '5 minutes' then return jsonb_build_object('ok',false,'error','invalid_schedule_time','external_side_effect',false); end if;
  select * into j from public.marketing_publication_jobs where id=p_job_id for update;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found','external_side_effect',false); end if;
  if j.status not in ('approved','scheduled') then return jsonb_build_object('ok',false,'error','job_not_approved','status',j.status,'external_side_effect',false); end if;
  select * into a from public.marketing_assets where id=j.asset_id;
  if not found or a.status <> 'approved' then return jsonb_build_object('ok',false,'error','asset_not_approved','external_side_effect',false); end if;
  update public.marketing_publication_jobs set status='scheduled',scheduled_for=p_scheduled_for,updated_at=now() where id=p_job_id;
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data) values('publication_job',p_job_id::text,'scheduled',p_actor,jsonb_build_object('scheduled_for',p_scheduled_for,'channel',j.channel,'external_side_effect',false));
  return jsonb_build_object('ok',true,'id',p_job_id,'status','scheduled','scheduled_for',p_scheduled_for,'manual_confirmation_required',j.manual_confirmation_required,'external_side_effect',false);
end $$;

create or replace function public.unschedule_marketing_publication_v1(p_job_id uuid,p_actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare j public.marketing_publication_jobs%rowtype;
begin
  select * into j from public.marketing_publication_jobs where id=p_job_id for update;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found','external_side_effect',false); end if;
  if j.status <> 'scheduled' then return jsonb_build_object('ok',false,'error','job_not_scheduled','status',j.status,'external_side_effect',false); end if;
  update public.marketing_publication_jobs set status='approved',scheduled_for=null,updated_at=now() where id=p_job_id;
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data) values('publication_job',p_job_id::text,'unscheduled',p_actor,jsonb_build_object('external_side_effect',false));
  return jsonb_build_object('ok',true,'id',p_job_id,'status','approved','external_side_effect',false);
end $$;

create or replace function public.marketing_calendar_v1(p_from timestamptz default now()-interval '1 day',p_to timestamptz default now()+interval '31 days')
returns jsonb language sql security invoker set search_path=public,pg_temp as $$
select coalesce(jsonb_agg(x order by x.scheduled_for,x.channel),'[]'::jsonb) from (
  select j.id,j.asset_id,j.campaign_id,j.channel,j.content_type,j.status,j.manual_confirmation_required,j.scheduled_for,a.title,a.media_kind,a.generation_mode
  from public.marketing_publication_jobs j join public.marketing_assets a on a.id=j.asset_id
  where j.scheduled_for between p_from and p_to and j.status in ('approved','scheduled','ready_manual')
  order by j.scheduled_for,j.channel limit 500
) x $$;

revoke all on function public.submit_marketing_asset_review_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.approve_marketing_asset_v1(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.schedule_marketing_publication_v1(uuid,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.unschedule_marketing_publication_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.marketing_calendar_v1(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.submit_marketing_asset_review_v1(uuid,uuid) to service_role;
grant execute on function public.approve_marketing_asset_v1(uuid,text,uuid) to service_role;
grant execute on function public.schedule_marketing_publication_v1(uuid,timestamptz,uuid) to service_role;
grant execute on function public.unschedule_marketing_publication_v1(uuid,uuid) to service_role;
grant execute on function public.marketing_calendar_v1(timestamptz,timestamptz) to service_role;

commit;