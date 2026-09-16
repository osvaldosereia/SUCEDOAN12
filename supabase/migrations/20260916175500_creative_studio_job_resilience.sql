-- Creative Studio render queue resilience: idempotency, leases, retries and atomic worker claims.
alter table public.creative_studio_jobs add column if not exists idempotency_key text;
alter table public.creative_studio_jobs add column if not exists attempt_count integer not null default 0;
alter table public.creative_studio_jobs add column if not exists max_attempts integer not null default 3;
alter table public.creative_studio_jobs add column if not exists worker_id text;
alter table public.creative_studio_jobs add column if not exists claimed_at timestamptz;
alter table public.creative_studio_jobs add column if not exists lease_expires_at timestamptz;
alter table public.creative_studio_jobs add column if not exists paid_approved_at timestamptz;

alter table public.creative_studio_jobs drop constraint if exists creative_studio_jobs_attempt_count_check;
alter table public.creative_studio_jobs add constraint creative_studio_jobs_attempt_count_check check (attempt_count >= 0);
alter table public.creative_studio_jobs drop constraint if exists creative_studio_jobs_max_attempts_check;
alter table public.creative_studio_jobs add constraint creative_studio_jobs_max_attempts_check check (max_attempts between 1 and 10);

create unique index if not exists uq_creative_studio_jobs_idempotency
  on public.creative_studio_jobs(idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_creative_studio_jobs_queue_claim
  on public.creative_studio_jobs(status, created_at)
  where status='queued';
create index if not exists idx_creative_studio_jobs_lease
  on public.creative_studio_jobs(lease_expires_at)
  where status='rendering';

create or replace function public.creative_studio_recover_stale_jobs()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare affected integer;
begin
  update public.creative_studio_jobs
     set status = case when attempt_count >= max_attempts then 'failed' else 'queued' end,
         worker_id = null,
         claimed_at = null,
         lease_expires_at = null,
         error_code = 'worker_lease_expired',
         error_detail = 'Render worker lease expired before completion.',
         queued_at = case when attempt_count < max_attempts then now() else queued_at end,
         updated_at = now()
   where status='rendering'
     and lease_expires_at is not null
     and lease_expires_at <= now();
  get diagnostics affected = row_count;
  return affected;
end $$;

create or replace function public.creative_studio_claim_job(p_worker_id text, p_lease_seconds integer default 1200)
returns setof public.creative_studio_jobs
language plpgsql
security definer
set search_path=public
as $$
begin
  if nullif(btrim(p_worker_id),'') is null then
    raise exception 'worker_id_required';
  end if;
  p_lease_seconds := greatest(60, least(coalesce(p_lease_seconds,1200),3600));
  return query
  with candidate as (
    select id
      from public.creative_studio_jobs
     where status='queued'
       and attempt_count < max_attempts
     order by queued_at nulls first, created_at
     for update skip locked
     limit 1
  )
  update public.creative_studio_jobs j
     set status='rendering',
         attempt_count=j.attempt_count+1,
         worker_id=p_worker_id,
         claimed_at=now(),
         lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
         render_started_at=coalesce(j.render_started_at,now()),
         error_code=null,
         error_detail=null,
         updated_at=now()
    from candidate c
   where j.id=c.id
  returning j.*;
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
  update public.creative_studio_jobs j
     set status='completed',
         output_bucket=coalesce(j.output_bucket,'creative-studio-renders'),
         output_path=p_output_path,
         output_metadata=coalesce(p_output_metadata,'{}'::jsonb),
         actual_cost_brl=greatest(coalesce(p_actual_cost_brl,0),0),
         completed_at=now(),
         worker_id=null,
         lease_expires_at=null,
         error_code=null,
         error_detail=null,
         updated_at=now()
   where j.id=p_job_id
     and j.status='rendering'
     and j.worker_id=p_worker_id
  returning j.*;
end $$;

create or replace function public.creative_studio_fail_job(p_job_id uuid,p_worker_id text,p_error text)
returns setof public.creative_studio_jobs
language plpgsql
security definer
set search_path=public
as $$;
begin
  return query
  update public.creative_studio_jobs j
     set status=case when j.attempt_count < j.max_attempts then 'queued' else 'failed' end,
         queued_at=case when j.attempt_count < j.max_attempts then now() else j.queued_at end,
         worker_id=null,
         claimed_at=null,
         lease_expires_at=null,
         error_code='render_failed',
         error_detail=left(coalesce(p_error,'render_failed'),1500),
         updated_at=now()
   where j.id=p_job_id
     and j.status='rendering'
     and j.worker_id=p_worker_id
  returning j.*;
end $$;
