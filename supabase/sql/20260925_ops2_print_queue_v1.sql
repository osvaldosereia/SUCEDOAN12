-- Dona Antonia Operations 2.0
-- Physical print side-effect queue. Event-driven; no polling worker is created here.

create table if not exists public.ops_print_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  job_type text not null check (job_type in ('picking','delivery','danfe','internal')),
  entity_type text not null default 'order',
  entity_id text not null,
  version_key text not null,
  printer_profile text not null default 'separation_85mm',
  status text not null default 'pending'
    check (status in ('pending','claimed','printed','failed','cancelled')),
  copies integer not null default 1 check (copies between 1 and 5),
  attempts integer not null default 0 check (attempts >= 0),
  payload jsonb not null default '{}'::jsonb,
  source_system text not null default 'dona_antonia',
  idempotency_key text not null,
  claimed_at timestamptz,
  claimed_by text,
  printed_at timestamptz,
  last_error text
);

create unique index if not exists ops_print_jobs_idempotency_uidx
  on public.ops_print_jobs(idempotency_key);

create index if not exists ops_print_jobs_pending_idx
  on public.ops_print_jobs(status,created_at)
  where status in ('pending','failed');

create index if not exists ops_print_jobs_entity_idx
  on public.ops_print_jobs(entity_type,entity_id,created_at desc);

alter table public.ops_print_jobs enable row level security;

comment on table public.ops_print_jobs is
  'Operations 2.0 event-driven physical print queue. A local printer agent may consume it after hardware homologation.';

create or replace function public.ops_enqueue_print_job_v1(
  p_job_type text,
  p_entity_type text,
  p_entity_id text,
  p_version_key text,
  p_printer_profile text default 'separation_85mm',
  p_copies integer default 1,
  p_payload jsonb default '{}'::jsonb,
  p_source_system text default 'dona_antonia',
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_key text;
begin
  v_key := coalesce(nullif(trim(p_idempotency_key),''), p_job_type||':'||p_entity_type||':'||p_entity_id||':'||p_version_key);

  select id into v_id
  from public.ops_print_jobs
  where idempotency_key=v_key
  limit 1;

  if v_id is not null then return v_id; end if;

  insert into public.ops_print_jobs(
    job_type,entity_type,entity_id,version_key,printer_profile,copies,payload,source_system,idempotency_key
  ) values (
    p_job_type,p_entity_type,p_entity_id,p_version_key,p_printer_profile,
    greatest(1,least(5,coalesce(p_copies,1))),coalesce(p_payload,'{}'::jsonb),p_source_system,v_key
  )
  returning id into v_id;

  return v_id;
exception when unique_violation then
  select id into v_id from public.ops_print_jobs where idempotency_key=v_key limit 1;
  return v_id;
end;
$$;

create or replace function public.get_ops_print_queue_v1(p_limit integer default 30)
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
  select jsonb_build_object(
    'generated_at',now(),
    'pending',count(*) filter (where status='pending'),
    'failed',count(*) filter (where status='failed'),
    'claimed',count(*) filter (where status='claimed'),
    'jobs',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',id,'job_type',job_type,'entity_type',entity_type,'entity_id',entity_id,
          'version_key',version_key,'printer_profile',printer_profile,'status',status,
          'copies',copies,'attempts',attempts,'created_at',created_at,'updated_at',updated_at,
          'last_error',last_error,'payload',payload
        ) order by created_at
      ) filter (where status in ('pending','failed','claimed')),
      '[]'::jsonb
    )
  )
  from (
    select *
    from public.ops_print_jobs
    where status in ('pending','failed','claimed')
    order by created_at
    limit greatest(1,least(100,coalesce(p_limit,30)))
  ) x;
$$;

create or replace function public.get_ops_control_tower_summary_v1()
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'orders', jsonb_build_object(
      'awaiting', (select count(*) from public.orders where status='storefront_received'),
      'confirmed', (select count(*) from public.orders where status='confirmed'),
      'ready', (select count(*) from public.orders where status='ready'),
      'delivered', (select count(*) from public.orders where status='delivered'),
      'cancelled', (select count(*) from public.orders where status='cancelled')
    ),
    'whatsapp', jsonb_build_object(
      'human_required', (select count(*) from public.conversations where channel='whatsapp' and human_required=true),
      'human_mode', (select count(*) from public.conversations where channel='whatsapp' and mode='human')
    ),
    'inventory', jsonb_build_object(
      'active_products', (select count(*) from public.products where is_active=true),
      'zero_or_negative', (select count(*) from public.products where is_active=true and coalesce(stock,0)<=0),
      'expires_90d', (select count(*) from public.products where is_active=true and validity_date is not null and validity_date between current_date and current_date+90),
      'expired', (select count(*) from public.products where is_active=true and validity_date is not null and validity_date<current_date)
    ),
    'attention', jsonb_build_object(
      'open', (select count(*) from public.ops_attention where status in ('open','acknowledged')),
      'critical', (select count(*) from public.ops_attention where status in ('open','acknowledged') and priority='critical'),
      'high', (select count(*) from public.ops_attention where status in ('open','acknowledged') and priority='high')
    ),
    'approvals', jsonb_build_object(
      'pending', (select count(*) from public.ops_approvals where status='pending')
    ),
    'printing', jsonb_build_object(
      'pending', (select count(*) from public.ops_print_jobs where status='pending'),
      'failed', (select count(*) from public.ops_print_jobs where status='failed'),
      'claimed', (select count(*) from public.ops_print_jobs where status='claimed')
    )
  );
$$;

revoke all on function public.ops_enqueue_print_job_v1(text,text,text,text,text,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.get_ops_print_queue_v1(integer) from public,anon,authenticated;
grant execute on function public.ops_enqueue_print_job_v1(text,text,text,text,text,integer,jsonb,text,text) to service_role;
grant execute on function public.get_ops_print_queue_v1(integer) to service_role;
