begin;

create table if not exists public.bling_history_customer_backfill_queue (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  bling_contact_id bigint not null unique,
  window_start date not null,
  window_end date not null,
  page integer not null default 1 check (page>=1),
  status text not null default 'pending'
    check (status in ('pending','running','done','error','paused')),
  fetched_count integer not null default 0,
  staged_count integer not null default 0,
  ready_count integer not null default 0,
  promoted_count integer not null default 0,
  attempt_count integer not null default 0,
  last_error text,
  last_run_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bling_history_customer_backfill_queue enable row level security;
revoke all on public.bling_history_customer_backfill_queue from public,anon,authenticated;
grant select,insert,update,delete on public.bling_history_customer_backfill_queue to service_role;

create index if not exists bling_history_customer_backfill_queue_status_idx
  on public.bling_history_customer_backfill_queue(status,next_retry_at,updated_at);

insert into public.bling_history_customer_backfill_queue(
  customer_id,bling_contact_id,window_start,window_end,status
)
select
  c.id,
  c.bling_contact_id,
  date '2024-09-01',
  date '2025-08-31',
  'pending'
from public.customers c
where c.bling_contact_id is not null
on conflict(customer_id) do nothing;

create or replace function public.claim_bling_history_customer_backfill_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  q public.bling_history_customer_backfill_queue%rowtype;
begin
  select *
  into q
  from public.bling_history_customer_backfill_queue
  where status in ('pending','error')
    and (next_retry_at is null or next_retry_at<=now())
  order by
    case when status='pending' then 0 else 1 end,
    updated_at asc,
    customer_id
  for update skip locked
  limit 1;

  if not found then return '{}'::jsonb; end if;

  update public.bling_history_customer_backfill_queue
     set status='running',
         attempt_count=attempt_count+1,
         last_run_at=now(),
         updated_at=now()
   where customer_id=q.customer_id;

  return jsonb_build_object(
    'customer_id',q.customer_id,
    'bling_contact_id',q.bling_contact_id,
    'window_start',q.window_start,
    'window_end',q.window_end,
    'page',q.page,
    'attempt_count',q.attempt_count+1
  );
end
$$;

create or replace function public.finish_bling_history_customer_backfill_v1(
  p_customer_id uuid,
  p_fetched integer,
  p_staged integer,
  p_ready integer,
  p_has_more boolean,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  q public.bling_history_customer_backfill_queue%rowtype;
begin
  select * into q
  from public.bling_history_customer_backfill_queue
  where customer_id=p_customer_id
  for update;

  if not found then raise exception 'backfill_queue_row_not_found'; end if;

  if nullif(trim(coalesce(p_error,'')),'') is not null then
    update public.bling_history_customer_backfill_queue
       set status='error',
           last_error=left(trim(p_error),500),
           next_retry_at=now()+interval '15 minutes',
           updated_at=now()
     where customer_id=p_customer_id;
  elsif p_has_more then
    update public.bling_history_customer_backfill_queue
       set status='pending',
           page=page+1,
           fetched_count=fetched_count+greatest(0,coalesce(p_fetched,0)),
           staged_count=staged_count+greatest(0,coalesce(p_staged,0)),
           ready_count=ready_count+greatest(0,coalesce(p_ready,0)),
           last_error=null,
           next_retry_at=null,
           updated_at=now()
     where customer_id=p_customer_id;
  else
    update public.bling_history_customer_backfill_queue
       set status='done',
           fetched_count=fetched_count+greatest(0,coalesce(p_fetched,0)),
           staged_count=staged_count+greatest(0,coalesce(p_staged,0)),
           ready_count=ready_count+greatest(0,coalesce(p_ready,0)),
           last_error=null,
           next_retry_at=null,
           updated_at=now()
     where customer_id=p_customer_id;
  end if;

  select * into q
  from public.bling_history_customer_backfill_queue
  where customer_id=p_customer_id;

  return jsonb_build_object(
    'customer_id',q.customer_id,
    'status',q.status,
    'page',q.page,
    'fetched_count',q.fetched_count,
    'staged_count',q.staged_count,
    'ready_count',q.ready_count,
    'attempt_count',q.attempt_count
  );
end
$$;

create or replace function public.bling_history_customer_backfill_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'total',count(*),
    'pending',count(*) filter(where status='pending'),
    'running',count(*) filter(where status='running'),
    'done',count(*) filter(where status='done'),
    'error',count(*) filter(where status='error'),
    'paused',count(*) filter(where status='paused'),
    'fetched',coalesce(sum(fetched_count),0),
    'staged',coalesce(sum(staged_count),0),
    'ready',coalesce(sum(ready_count),0),
    'promoted',coalesce(sum(promoted_count),0)
  )
  from public.bling_history_customer_backfill_queue
$$;

revoke all on function public.claim_bling_history_customer_backfill_v1() from public,anon,authenticated;
revoke all on function public.finish_bling_history_customer_backfill_v1(uuid,integer,integer,integer,boolean,text) from public,anon,authenticated;
revoke all on function public.bling_history_customer_backfill_summary_v1() from public,anon,authenticated;

grant execute on function public.claim_bling_history_customer_backfill_v1() to service_role;
grant execute on function public.finish_bling_history_customer_backfill_v1(uuid,integer,integer,integer,boolean,text) to service_role;
grant execute on function public.bling_history_customer_backfill_summary_v1() to service_role;

commit;
