-- Bling Hub V2 webhook inbox.
-- Signed events are stored idempotently and processed asynchronously.
-- No business data is mutated by this inbox.

create table if not exists public.bling_webhook_inbox_v2 (
  event_id text primary key,
  event_hash text not null,
  event_name text not null,
  resource text not null,
  action text not null,
  company_id text,
  event_version text,
  event_at timestamptz,
  provider_entity_id text,
  payload jsonb not null,
  signature_verified boolean not null default true,
  self_generated_candidate boolean not null default false,
  status text not null default 'held'
    check(status in ('held','received','processing','processed','ignored','review_required','retry','failed')),
  attempt_count integer not null default 0 check(attempt_count>=0),
  max_attempts integer not null default 8 check(max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  processed_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  last_error text,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bling_webhook_inbox_v2_claim_idx
  on public.bling_webhook_inbox_v2(status,next_attempt_at,received_at);
create index if not exists bling_webhook_inbox_v2_resource_idx
  on public.bling_webhook_inbox_v2(resource,provider_entity_id,received_at desc);
create index if not exists bling_webhook_inbox_v2_event_at_idx
  on public.bling_webhook_inbox_v2(event_at desc);

alter table public.bling_webhook_inbox_v2 enable row level security;
revoke all on table public.bling_webhook_inbox_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.bling_webhook_inbox_v2 to service_role;
drop policy if exists service_role_bling_webhook_inbox_v2 on public.bling_webhook_inbox_v2;
create policy service_role_bling_webhook_inbox_v2
  on public.bling_webhook_inbox_v2 for all to service_role
  using(true) with check(true);

create or replace function public.claim_bling_webhook_inbox_v2(
  p_worker text,
  p_limit integer default 10,
  p_lease_seconds integer default 300
)
returns setof public.bling_webhook_inbox_v2
language plpgsql
security definer
set search_path=''
as $$
declare
  v_runtime public.bling_hub_runtime_v2%rowtype;
  v_limit integer;
begin
  select * into v_runtime from public.bling_hub_runtime_v2 where id=1;
  if not found
     or v_runtime.hub_enabled is not true
     or v_runtime.webhooks_enabled is not true
     or v_runtime.mode not in ('homologation','live') then
    return;
  end if;
  if nullif(trim(coalesce(p_worker,'')),'') is null then raise exception 'worker_required'; end if;

  v_limit:=greatest(1,least(coalesce(p_limit,10),50));

  update public.bling_webhook_inbox_v2
     set status='retry',locked_at=null,locked_by=null,next_attempt_at=now(),updated_at=now(),
         last_error=coalesce(last_error,'lease_expired')
   where status='processing'
     and locked_at is not null
     and locked_at < now()-make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,300),1800)));

  return query
  with picked as (
    select i.event_id
      from public.bling_webhook_inbox_v2 i
     where i.status in ('held','received','retry')
       and i.next_attempt_at<=now()
       and i.attempt_count<i.max_attempts
     order by i.event_at nulls last,i.received_at,i.event_id
     for update skip locked
     limit v_limit
  )
  update public.bling_webhook_inbox_v2 i
     set status='processing',
         attempt_count=i.attempt_count+1,
         locked_by=left(trim(p_worker),120),
         locked_at=now(),
         updated_at=now()
    from picked
   where i.event_id=picked.event_id
  returning i.*;
end
$$;

create or replace function public.finish_bling_webhook_inbox_v2(
  p_event_id text,
  p_status text,
  p_result jsonb default '{}'::jsonb,
  p_error text default null,
  p_retry_seconds integer default 120,
  p_self_generated boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_row public.bling_webhook_inbox_v2%rowtype;
begin
  if v_status not in ('processed','ignored','review_required','retry','failed') then
    raise exception 'invalid_finish_status';
  end if;

  update public.bling_webhook_inbox_v2
     set status=v_status,
         result=coalesce(p_result,'{}'::jsonb),
         last_error=nullif(left(trim(coalesce(p_error,'')),1200),''),
         self_generated_candidate=coalesce(p_self_generated,false),
         next_attempt_at=case
           when v_status='retry' then now()+make_interval(secs=>greatest(5,least(coalesce(p_retry_seconds,120),86400)))
           else next_attempt_at
         end,
         processed_at=case when v_status in ('processed','ignored','review_required','failed') then now() else null end,
         locked_by=null,
         locked_at=null,
         updated_at=now()
   where event_id=p_event_id
   returning * into v_row;

  if not found then raise exception 'webhook_event_not_found'; end if;

  insert into public.bling_hub_audit_v2(event_type,severity,domain,source_system,source_id,details)
  values(
    'webhook_'||v_status,
    case when v_status in ('review_required','failed') then 'warning' else 'info' end,
    case
      when v_row.resource='product' then 'product'
      when v_row.resource in ('stock','virtual_stock') then 'stock'
      when v_row.resource='order' then 'order'
      when v_row.resource in ('invoice','consumer_invoice') then 'fiscal'
      else 'webhook'
    end,
    'bling_webhook',
    v_row.event_id,
    jsonb_build_object(
      'event_name',v_row.event_name,
      'provider_entity_id',v_row.provider_entity_id,
      'self_generated_candidate',coalesce(p_self_generated,false),
      'status',v_status
    )
  );

  return jsonb_build_object(
    'event_id',v_row.event_id,
    'status',v_row.status,
    'attempt_count',v_row.attempt_count,
    'self_generated_candidate',v_row.self_generated_candidate
  );
end
$$;

revoke all on function public.claim_bling_webhook_inbox_v2(text,integer,integer) from public,anon,authenticated;
revoke all on function public.finish_bling_webhook_inbox_v2(text,text,jsonb,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.claim_bling_webhook_inbox_v2(text,integer,integer) to service_role;
grant execute on function public.finish_bling_webhook_inbox_v2(text,text,jsonb,text,integer,boolean) to service_role;
