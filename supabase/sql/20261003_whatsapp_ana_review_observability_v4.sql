begin;

create table if not exists public.whatsapp_ana_reviews_v1 (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.whatsapp_ana_jobs_v1(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reviewer_user_id uuid not null,
  outcome text not null check (outcome in ('used','helpful','rejected')),
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_ana_reviews_v1_job_created_idx
  on public.whatsapp_ana_reviews_v1(job_id,created_at desc);
create index if not exists whatsapp_ana_reviews_v1_created_idx
  on public.whatsapp_ana_reviews_v1(created_at desc);

alter table public.whatsapp_ana_reviews_v1 enable row level security;
revoke all on public.whatsapp_ana_reviews_v1 from public,anon,authenticated;
grant select,insert on public.whatsapp_ana_reviews_v1 to service_role;

create or replace function public.ops2_admin_ana_preview_review_v1(
  p_job_id uuid,
  p_outcome text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_job public.whatsapp_ana_jobs_v1%rowtype;
  v_outcome text:=lower(btrim(coalesce(p_outcome,'')));
  v_note text:=nullif(left(btrim(coalesce(p_note,'')),500),'');
  v_review_id uuid;
begin
  if v_user is null then return jsonb_build_object('ok',false,'error','admin_auth_required'); end if;
  if not exists (
    select 1 from public.admin_users a
    where a.user_id=v_user and a.is_active=true
  ) then return jsonb_build_object('ok',false,'error','admin_not_authorized'); end if;
  if p_job_id is null then return jsonb_build_object('ok',false,'error','job_required'); end if;
  if v_outcome not in ('used','helpful','rejected') then return jsonb_build_object('ok',false,'error','review_outcome_invalid'); end if;

  select j.* into v_job
  from public.whatsapp_ana_jobs_v1 j
  where j.id=p_job_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found'); end if;
  if v_job.dry_run is not true
     or coalesce(v_job.metadata->>'dry_run_not_sendable','false')<>'true' then
    return jsonb_build_object('ok',false,'error','job_not_dry_run');
  end if;
  if not (v_job.status='completed') then
    return jsonb_build_object('ok',false,'error','ana_preview_not_completed');
  end if;

  insert into public.whatsapp_ana_reviews_v1(job_id,conversation_id,reviewer_user_id,outcome,note)
  values(v_job.id,v_job.conversation_id,v_user,v_outcome,v_note)
  returning id into v_review_id;

  update public.whatsapp_ana_jobs_v1
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'review_outcome',v_outcome,
        'review_note',v_note,
        'reviewed_by',v_user,
        'reviewed_at',now()
      ),
      updated_at=now()
  where id=v_job.id;

  return jsonb_build_object(
    'ok',true,'review_id',v_review_id,'job_id',v_job.id,'outcome',v_outcome,
    'reviewed_by',v_user,'dry_run',true,'dry_run_not_sendable',true
  );
end;
$function$;

create or replace function public.ops2_admin_ana_preview_observe_v1(
  p_job_id uuid,
  p_latency_ms integer,
  p_cached boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_job public.whatsapp_ana_jobs_v1%rowtype;
  v_latency integer:=greatest(0,least(coalesce(p_latency_ms,0),120000));
begin
  if v_user is null then return jsonb_build_object('ok',false,'error','admin_auth_required'); end if;
  if not exists (
    select 1 from public.admin_users a
    where a.user_id=v_user and a.is_active=true
  ) then return jsonb_build_object('ok',false,'error','admin_not_authorized'); end if;
  if p_job_id is null then return jsonb_build_object('ok',false,'error','job_required'); end if;

  select j.* into v_job
  from public.whatsapp_ana_jobs_v1 j
  where j.id=p_job_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','job_not_found'); end if;
  if v_job.dry_run is not true
     or coalesce(v_job.metadata->>'dry_run_not_sendable','false')<>'true' then
    return jsonb_build_object('ok',false,'error','job_not_dry_run');
  end if;

  update public.whatsapp_ana_jobs_v1
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'latency_ms',v_latency,
        'cached',coalesce(p_cached,false),
        'observed_by',v_user,
        'observed_at',now()
      ),
      updated_at=now()
  where id=v_job.id;

  return jsonb_build_object(
    'ok',true,'job_id',v_job.id,'latency_ms',v_latency,
    'cached',coalesce(p_cached,false),'dry_run_not_sendable',true
  );
end;
$function$;

create or replace function public.ops2_admin_ana_preview_metrics_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_jobs jsonb;
  v_reviews jsonb;
begin
  if v_user is null then return jsonb_build_object('ok',false,'error','admin_auth_required'); end if;
  if not exists (
    select 1 from public.admin_users a
    where a.user_id=v_user and a.is_active=true
  ) then return jsonb_build_object('ok',false,'error','admin_not_authorized'); end if;

  select jsonb_build_object(
    'total',count(*),
    'completed',count(*) filter (where j.status='completed'),
    'failed',count(*) filter (where j.status='failed'),
    'handoff',count(*) filter (where j.decision='handoff'),
    'suggest',count(*) filter (where j.decision='suggest'),
    'no_reply',count(*) filter (where j.decision='no_reply'),
    'avg_confidence',round(avg(j.confidence)::numeric,3),
    'avg_latency_ms',round(avg(case when coalesce(j.metadata->>'latency_ms','') ~ '^[0-9]+$' then (j.metadata->>'latency_ms')::numeric end),0)
  ) into v_jobs
  from public.whatsapp_ana_jobs_v1 j
  where j.dry_run=true and j.created_at>=now()-interval '30 days';

  select jsonb_build_object(
    'total',count(*),
    'used',count(*) filter (where r.outcome='used'),
    'helpful',count(*) filter (where r.outcome='helpful'),
    'rejected',count(*) filter (where r.outcome='rejected')
  ) into v_reviews
  from public.whatsapp_ana_reviews_v1 r
  where r.created_at>=now()-interval '30 days';

  return jsonb_build_object(
    'ok',true,'window_days',30,'jobs',coalesce(v_jobs,'{}'::jsonb),
    'reviews',coalesce(v_reviews,'{}'::jsonb),'dry_run_not_sendable',true
  );
end;
$function$;

revoke all on function public.ops2_admin_ana_preview_review_v1(uuid,text,text) from public,anon,authenticated;
revoke all on function public.ops2_admin_ana_preview_observe_v1(uuid,integer,boolean) from public,anon,authenticated;
revoke all on function public.ops2_admin_ana_preview_metrics_v1() from public,anon,authenticated;
grant execute on function public.ops2_admin_ana_preview_review_v1(uuid,text,text) to authenticated;
grant execute on function public.ops2_admin_ana_preview_observe_v1(uuid,integer,boolean) to authenticated;
grant execute on function public.ops2_admin_ana_preview_metrics_v1() to authenticated;

commit;
