-- Creative Studio only. Durable queue leases, idempotency and bounded retries.
alter table public.creative_studio_jobs add column if not exists idempotency_key text;
alter table public.creative_studio_jobs add column if not exists attempt_count integer not null default 0;
alter table public.creative_studio_jobs add column if not exists max_attempts integer not null default 3;
alter table public.creative_studio_jobs add column if not exists paid_approved boolean not null default false;
alter table public.creative_studio_jobs add column if not exists claimed_at timestamptz;
alter table public.creative_studio_jobs add column if not exists worker_id text;
alter table public.creative_studio_jobs add column if not exists lease_expires_at timestamptz;
alter table public.creative_studio_jobs add column if not exists last_error text;
alter table public.creative_studio_jobs add column if not exists failed_at timestamptz;

update public.creative_studio_jobs
set idempotency_key='legacy:'||id::text
where idempotency_key is null;

create unique index if not exists uq_creative_studio_jobs_idempotency
  on public.creative_studio_jobs(idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_creative_studio_jobs_queue_claim
  on public.creative_studio_jobs(status, queued_at, created_at)
  where status='queued';
create index if not exists idx_creative_studio_jobs_expired_lease
  on public.creative_studio_jobs(lease_expires_at)
  where status='rendering';

do $$ begin
  if not exists(select 1 from pg_constraint where conname='creative_studio_jobs_attempt_count_check') then
    alter table public.creative_studio_jobs add constraint creative_studio_jobs_attempt_count_check check(attempt_count>=0);
  end if;
  if not exists(select 1 from pg_constraint where conname='creative_studio_jobs_max_attempts_check') then
    alter table public.creative_studio_jobs add constraint creative_studio_jobs_max_attempts_check check(max_attempts between 1 and 10);
  end if;
end $$;

create or replace function public.creative_studio_recover_stale_jobs()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  with recovered as (
    update public.creative_studio_jobs
       set status=case when attempt_count>=max_attempts then 'failed' else 'queued' end,
           queued_at=case when attempt_count<max_attempts then now() else queued_at end,
           worker_id=null,
           claimed_at=null,
           lease_expires_at=null,
           last_error='worker_lease_expired',
           error_code=case when attempt_count>=max_attempts then 'worker_lease_expired' else null end,
           error_detail='Render worker lease expired before completion',
           failed_at=case when attempt_count>=max_attempts then now() else null end,
           render_started_at=case when attempt_count<max_attempts then null else render_started_at end,
           updated_at=now()
     where status='rendering'
       and lease_expires_at is not null
       and lease_expires_at<=now()
    returning 1
  )
  select count(*)::integer into v_count from recovered;
  return coalesce(v_count,0);
end $$;

create or replace function public.creative_studio_claim_job(p_worker_id text,p_lease_seconds integer default 1200)
returns setof public.creative_studio_jobs
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid; v_lease integer;
begin
  if nullif(trim(p_worker_id),'') is null then raise exception 'worker_id_required'; end if;
  perform public.creative_studio_recover_stale_jobs();
  v_lease:=greatest(60,least(coalesce(p_lease_seconds,1200),3600));
  select id into v_id
    from public.creative_studio_jobs
   where status='queued'
     and attempt_count<max_attempts
     and (requires_paid_approval=false or paid_approved=true)
   order by queued_at asc nulls last,created_at asc
   for update skip locked
   limit 1;
  if v_id is null then return; end if;
  return query
  update public.creative_studio_jobs
     set status='rendering',
         attempt_count=attempt_count+1,
         worker_id=trim(p_worker_id),
         claimed_at=now(),
         lease_expires_at=now()+make_interval(secs=>v_lease),
         render_started_at=now(),
         last_error=null,
         error_code=null,
         error_detail=null,
         updated_at=now()
   where id=v_id and status='queued'
  returning *;
end $$;

create or replace function public.creative_studio_complete_job(
  p_job_id uuid,
  p_worker_id text,
  p_output_path text,
  p_output_metadata jsonb default '{}'::jsonb,
  p_actual_cost_brl numeric default 0
)
returns setof public.creative_studio_jobs
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  update public.creative_studio_jobs
     set status='completed',
         output_bucket='creative-studio-renders',
         output_path=p_output_path,
         output_metadata=coalesce(p_output_metadata,'{}'::jsonb),
         actual_cost_brl=greatest(coalesce(p_actual_cost_brl,0),0),
         completed_at=now(),
         worker_id=null,
         claimed_at=null,
         lease_expires_at=null,
         last_error=null,
         error_code=null,
         error_detail=null,
         failed_at=null,
         updated_at=now()
   where id=p_job_id and status='rendering' and worker_id=p_worker_id
  returning *;
end $$;

create or replace function public.creative_studio_fail_job(p_job_id uuid,p_worker_id text,p_error text)
returns setof public.creative_studio_jobs
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  update public.creative_studio_jobs
     set status=case when attempt_count>=max_attempts then 'failed' else 'queued' end,
         queued_at=case when attempt_count<max_attempts then now() else queued_at end,
         worker_id=null,
         claimed_at=null,
         lease_expires_at=null,
         last_error=left(coalesce(p_error,'render_failed'),1500),
         error_code='render_failed',
         error_detail=left(coalesce(p_error,'render_failed'),1500),
         failed_at=case when attempt_count>=max_attempts then now() else null end,
         render_started_at=case when attempt_count<max_attempts then null else render_started_at end,
         updated_at=now()
   where id=p_job_id and status='rendering' and worker_id=p_worker_id
  returning *;
end $$;

revoke all on function public.creative_studio_recover_stale_jobs() from public,anon,authenticated;
revoke all on function public.creative_studio_claim_job(text,integer) from public,anon,authenticated;
revoke all on function public.creative_studio_complete_job(uuid,text,text,jsonb,numeric) from public,anon,authenticated;
revoke all on function public.creative_studio_fail_job(uuid,text,text) from public,anon,authenticated;
grant execute on function public.creative_studio_recover_stale_jobs() to service_role;
grant execute on function public.creative_studio_claim_job(text,integer) to service_role;
grant execute on function public.creative_studio_complete_job(uuid,text,text,jsonb,numeric) to service_role;
grant execute on function public.creative_studio_fail_job(uuid,text,text) to service_role;
