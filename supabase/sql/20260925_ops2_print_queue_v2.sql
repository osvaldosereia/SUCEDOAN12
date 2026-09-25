-- Dona Antonia Operations 2.0
-- Print queue v2: distinguish browser presentation from proven physical print
-- and prepare a future local printer agent without enabling it.

alter table public.ops_print_jobs
  drop constraint if exists ops_print_jobs_status_check;

alter table public.ops_print_jobs
  add constraint ops_print_jobs_status_check
  check (status in ('pending','claimed','presented','printed','failed','cancelled'));

create or replace function public.ops_cancel_print_jobs_for_entity_v1(
  p_entity_type text,
  p_entity_id text,
  p_reason text default 'entity_cancelled'
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  update public.ops_print_jobs
     set status='cancelled',
         last_error=left(coalesce(p_reason,'entity_cancelled'),500),
         updated_at=now()
   where entity_type=p_entity_type
     and entity_id=p_entity_id
     and status in ('pending','failed');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.ops_present_print_job_v1(
  p_entity_type text,
  p_entity_id text,
  p_job_type text default 'picking'
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  update public.ops_print_jobs
     set status='presented',
         updated_at=now(),
         last_error=null
   where id in (
     select id
       from public.ops_print_jobs
      where entity_type=p_entity_type
        and entity_id=p_entity_id
        and job_type=p_job_type
        and status in ('pending','failed')
      order by created_at
      limit 1
   );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.ops_claim_print_jobs_v1(
  p_worker text,
  p_limit integer default 3
) returns setof public.ops_print_jobs
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  with picked as (
    select id
      from public.ops_print_jobs
     where status in ('pending','failed')
     order by created_at
     for update skip locked
     limit greatest(1,least(10,coalesce(p_limit,3)))
  )
  update public.ops_print_jobs j
     set status='claimed',
         claimed_at=now(),
         claimed_by=left(coalesce(p_worker,'unknown'),120),
         attempts=j.attempts+1,
         updated_at=now(),
         last_error=null
    from picked
   where j.id=picked.id
  returning j.*;
end;
$$;

create or replace function public.ops_finish_print_job_v1(
  p_job_id uuid,
  p_status text,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_status not in ('printed','failed') then
    raise exception 'invalid_print_finish_status';
  end if;

  update public.ops_print_jobs
     set status=p_status,
         printed_at=case when p_status='printed' then now() else printed_at end,
         last_error=case when p_status='failed' then left(coalesce(p_error,'print_failed'),500) else null end,
         updated_at=now()
   where id=p_job_id
     and status='claimed';

  return found;
end;
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
      'claimed', (select count(*) from public.ops_print_jobs where status='claimed'),
      'presented', (select count(*) from public.ops_print_jobs where status='presented'),
      'printed', (select count(*) from public.ops_print_jobs where status='printed')
    )
  );
$$;

revoke all on function public.ops_cancel_print_jobs_for_entity_v1(text,text,text) from public,anon,authenticated;
revoke all on function public.ops_present_print_job_v1(text,text,text) from public,anon,authenticated;
revoke all on function public.ops_claim_print_jobs_v1(text,integer) from public,anon,authenticated;
revoke all on function public.ops_finish_print_job_v1(uuid,text,text) from public,anon,authenticated;

grant execute on function public.ops_cancel_print_jobs_for_entity_v1(text,text,text) to service_role;
grant execute on function public.ops_present_print_job_v1(text,text,text) to service_role;
grant execute on function public.ops_claim_print_jobs_v1(text,integer) to service_role;
grant execute on function public.ops_finish_print_job_v1(uuid,text,text) to service_role;
