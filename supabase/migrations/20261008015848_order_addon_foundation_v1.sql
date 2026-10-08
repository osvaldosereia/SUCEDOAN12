create table if not exists private.order_addon_runtime_v1 (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  window_minutes integer not null default 20 check (window_minutes between 1 and 120),
  max_operations integer not null default 5 check (max_operations between 1 and 20),
  max_distinct_products_per_operation integer not null default 20 check (max_distinct_products_per_operation between 1 and 40),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into private.order_addon_runtime_v1(singleton,enabled,window_minutes,max_operations,max_distinct_products_per_operation)
values(true,false,20,5,20)
on conflict(singleton) do nothing;

create table if not exists private.order_addon_sessions_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'open' check (status in ('open','closed','expired')),
  source text not null default 'post_checkout' check (source ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  close_reason text,
  operation_count integer not null default 0 check (operation_count >= 0),
  max_operations integer not null default 5 check (max_operations between 1 and 20),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create unique index if not exists order_addon_sessions_v1_one_open_per_order_idx
  on private.order_addon_sessions_v1(order_id)
  where status='open';

create index if not exists order_addon_sessions_v1_expiry_idx
  on private.order_addon_sessions_v1(expires_at)
  where status='open';

create table if not exists private.order_addon_operations_v1 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references private.order_addon_sessions_v1(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  request_key text not null check (request_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending','applied','rejected')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(session_id,request_key)
);

revoke all on table private.order_addon_runtime_v1 from public,anon,authenticated;
revoke all on table private.order_addon_sessions_v1 from public,anon,authenticated;
revoke all on table private.order_addon_operations_v1 from public,anon,authenticated;

create or replace function public.ops3_order_addon_eligibility_v1(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_runtime private.order_addon_runtime_v1%rowtype;
  v_order public.orders%rowtype;
  v_expires_at timestamptz;
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'eligible',false,'reason','invalid_order_id');
  end if;
  select * into v_runtime from private.order_addon_runtime_v1 where singleton;
  if not found or coalesce(v_runtime.enabled,false) is not true then
    return jsonb_build_object('ok',true,'eligible',false,'reason','feature_disabled');
  end if;
  select * into v_order from public.orders where id=p_order_id;
  if not found then return jsonb_build_object('ok',false,'eligible',false,'reason','order_not_found'); end if;
  if coalesce(v_order.source,'') not in ('vitrine','storefront_v2') then
    return jsonb_build_object('ok',true,'eligible',false,'reason','order_source_not_supported');
  end if;
  if coalesce(v_order.status,'') <> 'storefront_received' then
    return jsonb_build_object('ok',true,'eligible',false,'reason','order_status_closed','status',v_order.status);
  end if;
  if v_order.confirmed_at is not null then
    return jsonb_build_object('ok',true,'eligible',false,'reason','order_already_confirmed');
  end if;
  if v_order.bling_order_id is not null or v_order.bling_synced_at is not null or coalesce(v_order.sync_status,'local') <> 'local' then
    return jsonb_build_object('ok',true,'eligible',false,'reason','bling_sync_started');
  end if;
  if exists(select 1 from public.order_separation_assignments_v1 x where x.order_id=p_order_id)
     or exists(select 1 from public.order_separation_items_v1 x where x.order_id=p_order_id)
     or exists(select 1 from public.order_separation_completions_v1 x where x.order_id=p_order_id) then
    return jsonb_build_object('ok',true,'eligible',false,'reason','separation_started');
  end if;
  v_expires_at:=v_order.created_at + make_interval(mins=>v_runtime.window_minutes);
  if now() >= v_expires_at then
    return jsonb_build_object('ok',true,'eligible',false,'reason','addon_window_expired','expires_at',v_expires_at);
  end if;
  return jsonb_build_object(
    'ok',true,'eligible',true,'reason','eligible',
    'order_id',v_order.id,'order_number',v_order.order_number,'expires_at',v_expires_at,
    'window_minutes',v_runtime.window_minutes,'max_operations',v_runtime.max_operations,
    'max_distinct_products_per_operation',v_runtime.max_distinct_products_per_operation
  );
end;
$$;

create or replace function public.ops3_create_order_addon_session_v1(
  p_order_id uuid,
  p_token_hash text,
  p_source text default 'post_checkout',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_runtime private.order_addon_runtime_v1%rowtype;
  v_order public.orders%rowtype;
  v_session private.order_addon_sessions_v1%rowtype;
  v_token_hash text:=lower(trim(coalesce(p_token_hash,'')));
  v_source text:=lower(trim(coalesce(p_source,'post_checkout')));
  v_expires_at timestamptz;
begin
  if p_order_id is null then return jsonb_build_object('ok',false,'error','invalid_order_id'); end if;
  if v_token_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'error','invalid_token_hash'); end if;
  if v_source !~ '^[a-z0-9][a-z0-9_-]{0,39}$' then return jsonb_build_object('ok',false,'error','invalid_source'); end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then return jsonb_build_object('ok',false,'error','invalid_metadata'); end if;

  select * into v_runtime from private.order_addon_runtime_v1 where singleton for update;
  if not found or coalesce(v_runtime.enabled,false) is not true then return jsonb_build_object('ok',false,'error','feature_disabled'); end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  if coalesce(v_order.source,'') not in ('vitrine','storefront_v2') then return jsonb_build_object('ok',false,'error','order_source_not_supported'); end if;
  if coalesce(v_order.status,'') <> 'storefront_received' then return jsonb_build_object('ok',false,'error','order_status_closed','status',v_order.status); end if;
  if v_order.confirmed_at is not null then return jsonb_build_object('ok',false,'error','order_already_confirmed'); end if;
  if v_order.bling_order_id is not null or v_order.bling_synced_at is not null or coalesce(v_order.sync_status,'local') <> 'local' then
    return jsonb_build_object('ok',false,'error','bling_sync_started');
  end if;
  if exists(select 1 from public.order_separation_assignments_v1 x where x.order_id=p_order_id)
     or exists(select 1 from public.order_separation_items_v1 x where x.order_id=p_order_id)
     or exists(select 1 from public.order_separation_completions_v1 x where x.order_id=p_order_id) then
    return jsonb_build_object('ok',false,'error','separation_started');
  end if;

  v_expires_at:=v_order.created_at + make_interval(mins=>v_runtime.window_minutes);
  if now() >= v_expires_at then return jsonb_build_object('ok',false,'error','addon_window_expired','expires_at',v_expires_at); end if;

  update private.order_addon_sessions_v1
  set status='closed',closed_at=coalesce(closed_at,now()),close_reason=coalesce(close_reason,'superseded'),updated_at=now()
  where order_id=p_order_id and status='open';

  insert into private.order_addon_sessions_v1(order_id,token_hash,status,source,expires_at,max_operations,metadata)
  values(p_order_id,v_token_hash,'open',v_source,v_expires_at,v_runtime.max_operations,p_metadata)
  returning * into v_session;

  return jsonb_build_object(
    'ok',true,'session_id',v_session.id,'order_id',v_order.id,'order_number',v_order.order_number,
    'expires_at',v_session.expires_at,'max_operations',v_session.max_operations
  );
end;
$$;

create or replace function public.ops3_get_order_addon_session_v1(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_runtime private.order_addon_runtime_v1%rowtype;
  v_session private.order_addon_sessions_v1%rowtype;
  v_order public.orders%rowtype;
  v_token_hash text:=lower(trim(coalesce(p_token_hash,'')));
begin
  if v_token_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'eligible',false,'reason','invalid_token'); end if;
  select * into v_runtime from private.order_addon_runtime_v1 where singleton;
  if not found or coalesce(v_runtime.enabled,false) is not true then return jsonb_build_object('ok',true,'eligible',false,'reason','feature_disabled'); end if;
  select * into v_session from private.order_addon_sessions_v1 where token_hash=v_token_hash;
  if not found then return jsonb_build_object('ok',false,'eligible',false,'reason','session_not_found'); end if;
  if v_session.status<>'open' then return jsonb_build_object('ok',true,'eligible',false,'reason','session_closed'); end if;
  if now()>=v_session.expires_at then return jsonb_build_object('ok',true,'eligible',false,'reason','session_expired','expires_at',v_session.expires_at); end if;
  if v_session.operation_count>=v_session.max_operations then return jsonb_build_object('ok',true,'eligible',false,'reason','operation_limit_reached'); end if;

  select * into v_order from public.orders where id=v_session.order_id;
  if not found then return jsonb_build_object('ok',false,'eligible',false,'reason','order_not_found'); end if;
  if coalesce(v_order.status,'')<>'storefront_received' or v_order.confirmed_at is not null then
    return jsonb_build_object('ok',true,'eligible',false,'reason','order_status_closed','status',v_order.status);
  end if;
  if v_order.bling_order_id is not null or v_order.bling_synced_at is not null or coalesce(v_order.sync_status,'local')<>'local' then
    return jsonb_build_object('ok',true,'eligible',false,'reason','bling_sync_started');
  end if;
  if exists(select 1 from public.order_separation_assignments_v1 x where x.order_id=v_order.id)
     or exists(select 1 from public.order_separation_items_v1 x where x.order_id=v_order.id)
     or exists(select 1 from public.order_separation_completions_v1 x where x.order_id=v_order.id) then
    return jsonb_build_object('ok',true,'eligible',false,'reason','separation_started');
  end if;
  return jsonb_build_object(
    'ok',true,'eligible',true,'reason','eligible','session_id',v_session.id,
    'order_id',v_order.id,'order_number',v_order.order_number,'expires_at',v_session.expires_at,
    'operation_count',v_session.operation_count,'max_operations',v_session.max_operations,'current_total',v_order.total
  );
end;
$$;

create or replace function private.order_addon_close_sessions_for_order_v1(p_order_id uuid,p_reason text)
returns void
language sql
security definer
set search_path=''
as $$
  update private.order_addon_sessions_v1
  set status='closed',closed_at=coalesce(closed_at,now()),
      close_reason=coalesce(close_reason,left(coalesce(p_reason,'order_closed'),80)),updated_at=now()
  where order_id=p_order_id and status='open';
$$;

create or replace function private.order_addon_orders_close_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status is distinct from old.status
     or new.confirmed_at is distinct from old.confirmed_at
     or new.bling_order_id is distinct from old.bling_order_id
     or new.bling_synced_at is distinct from old.bling_synced_at
     or new.sync_status is distinct from old.sync_status then
    if coalesce(new.status,'')<>'storefront_received'
       or new.confirmed_at is not null
       or new.bling_order_id is not null
       or new.bling_synced_at is not null
       or coalesce(new.sync_status,'local')<>'local' then
      perform private.order_addon_close_sessions_for_order_v1(new.id,'order_advanced');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_addon_close_on_order_advance_v1 on public.orders;
create trigger trg_order_addon_close_on_order_advance_v1
after update of status,confirmed_at,bling_order_id,bling_synced_at,sync_status on public.orders
for each row execute function private.order_addon_orders_close_trigger_v1();

create or replace function private.order_addon_separation_close_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.order_addon_close_sessions_for_order_v1(new.order_id,'separation_started');
  return new;
end;
$$;

drop trigger if exists trg_order_addon_close_on_separation_item_v1 on public.order_separation_items_v1;
create trigger trg_order_addon_close_on_separation_item_v1
after insert on public.order_separation_items_v1
for each row execute function private.order_addon_separation_close_trigger_v1();

drop trigger if exists trg_order_addon_close_on_separation_completion_v1 on public.order_separation_completions_v1;
create trigger trg_order_addon_close_on_separation_completion_v1
after insert on public.order_separation_completions_v1
for each row execute function private.order_addon_separation_close_trigger_v1();

revoke all on function public.ops3_order_addon_eligibility_v1(uuid) from public;
revoke execute on function public.ops3_order_addon_eligibility_v1(uuid) from anon;
revoke execute on function public.ops3_order_addon_eligibility_v1(uuid) from authenticated;
grant execute on function public.ops3_order_addon_eligibility_v1(uuid) to service_role;

revoke all on function public.ops3_create_order_addon_session_v1(uuid,text,text,jsonb) from public;
revoke execute on function public.ops3_create_order_addon_session_v1(uuid,text,text,jsonb) from anon;
revoke execute on function public.ops3_create_order_addon_session_v1(uuid,text,text,jsonb) from authenticated;
grant execute on function public.ops3_create_order_addon_session_v1(uuid,text,text,jsonb) to service_role;

revoke all on function public.ops3_get_order_addon_session_v1(text) from public;
revoke execute on function public.ops3_get_order_addon_session_v1(text) from anon;
revoke execute on function public.ops3_get_order_addon_session_v1(text) from authenticated;
grant execute on function public.ops3_get_order_addon_session_v1(text) to service_role;
