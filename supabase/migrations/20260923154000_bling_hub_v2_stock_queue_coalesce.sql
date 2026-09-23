-- Coalesce pending absolute stock snapshots by product.
-- A newer physical count supersedes older unsent values.

with ranked as (
  select id,
         row_number() over (
           partition by source_system,source_id
           order by created_at desc,id desc
         ) as rn
  from public.bling_hub_jobs_v2
  where domain='stock'
    and operation='set_stock'
    and status in ('pending','retry','review_required','failed')
)
update public.bling_hub_jobs_v2 j
   set status='cancelled',
       error_code='superseded_stock_snapshot',
       error_message='Superseded by a newer absolute stock snapshot before dispatch.',
       finished_at=now(),
       locked_at=null,
       locked_by=null,
       updated_at=now()
  from ranked r
 where j.id=r.id
   and r.rn>1;

create or replace function public.enqueue_bling_hub_job_v2(
  p_domain text,
  p_operation text,
  p_source_system text,
  p_source_id text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb,
  p_payload_version integer default 1
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_max integer;
begin
  if p_domain not in ('product','stock','customer','order','webhook','fiscal') then
    raise exception 'invalid_domain';
  end if;
  if nullif(trim(coalesce(p_operation,'')),'') is null then raise exception 'operation_required'; end if;
  if nullif(trim(coalesce(p_source_system,'')),'') is null then raise exception 'source_system_required'; end if;
  if nullif(trim(coalesce(p_source_id,'')),'') is null then raise exception 'source_id_required'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'idempotency_key_required'; end if;

  select max_attempts into v_max from public.bling_hub_runtime_v2 where id=1;

  if p_domain='stock' and trim(p_operation)='set_stock' then
    select j.id
      into v_id
      from public.bling_hub_jobs_v2 j
     where j.domain='stock'
       and j.operation='set_stock'
       and j.source_system=trim(p_source_system)
       and j.source_id=trim(p_source_id)
       and j.status in ('pending','retry','review_required','failed')
     order by j.created_at desc,j.id desc
     for update
     limit 1;

    if v_id is not null then
      update public.bling_hub_jobs_v2
         set payload=coalesce(p_payload,'{}'::jsonb),
             payload_version=greatest(1,coalesce(p_payload_version,1)),
             status='pending',
             attempts=0,
             max_attempts=coalesce(v_max,5),
             next_attempt_at=now(),
             locked_at=null,
             locked_by=null,
             result='{}'::jsonb,
             error_code=null,
             error_message=null,
             last_http_status=null,
             finished_at=null,
             updated_at=now()
       where id=v_id;
      return v_id;
    end if;
  end if;

  insert into public.bling_hub_jobs_v2(
    domain,operation,source_system,source_id,idempotency_key,payload_version,payload,max_attempts
  ) values(
    p_domain,trim(p_operation),trim(p_source_system),trim(p_source_id),trim(p_idempotency_key),
    greatest(1,coalesce(p_payload_version,1)),coalesce(p_payload,'{}'::jsonb),coalesce(v_max,5)
  )
  on conflict(idempotency_key) do update set
    payload=excluded.payload,
    payload_version=excluded.payload_version,
    updated_at=now()
  where public.bling_hub_jobs_v2.status in ('pending','retry','review_required','failed')
  returning id into v_id;

  if v_id is null then
    select id into v_id
      from public.bling_hub_jobs_v2
     where idempotency_key=trim(p_idempotency_key);
  end if;
  return v_id;
end
$$;

revoke all on function public.enqueue_bling_hub_job_v2(text,text,text,text,text,jsonb,integer)
  from public,anon,authenticated;
grant execute on function public.enqueue_bling_hub_job_v2(text,text,text,text,text,jsonb,integer)
  to service_role;

insert into public.bling_hub_audit_v2(event_type,severity,domain,details)
values(
  'stock_queue_coalesce_enabled',
  'info',
  'stock',
  jsonb_build_object(
    'strategy','latest_pending_absolute_snapshot_per_product',
    'external_write',false,
    'enabled_at',now()
  )
);
