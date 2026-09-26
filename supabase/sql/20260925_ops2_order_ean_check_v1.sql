-- Operations 2.0 — audited EAN order checking.
-- Live schema applied 2026-09-25. This file documents the canonical migration contract.

create table if not exists public.ops_order_check_sessions(
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 status text not null default 'open' check(status in ('open','verified','cancelled')),
 operator_label text, started_at timestamptz not null default now(), verified_at timestamptz, updated_at timestamptz not null default now(),
 unique(order_id,status)
);
create table if not exists public.ops_order_check_items(
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.ops_order_check_sessions(id) on delete cascade,
 product_id uuid not null references public.products(id), gtin text, name_snapshot text not null,
 expected_quantity numeric(14,3) not null, checked_quantity numeric(14,3) not null default 0,
 updated_at timestamptz not null default now(), unique(session_id,product_id)
);
alter table public.ops_order_check_sessions enable row level security;
alter table public.ops_order_check_items enable row level security;
revoke all on public.ops_order_check_sessions,public.ops_order_check_items from public,anon,authenticated;
grant select,insert,update on public.ops_order_check_sessions,public.ops_order_check_items to service_role;

create or replace function public.ops_enforce_order_check_before_ready_v1()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.status='ready' and old.status='processing'
    and not exists(select 1 from public.ops_order_check_sessions s where s.order_id=new.id and s.status='verified' and s.verified_at is not null)
 then raise exception 'order_check_required_before_ready'; end if;
 return new;
end $$;
drop trigger if exists trg_ops_enforce_order_check_before_ready_v1 on public.orders;
create trigger trg_ops_enforce_order_check_before_ready_v1 before update of status on public.orders
for each row execute function public.ops_enforce_order_check_before_ready_v1();
revoke all on function public.ops_enforce_order_check_before_ready_v1() from public,anon,authenticated;
grant execute on function public.ops_enforce_order_check_before_ready_v1() to service_role;

-- RPC implementations are live in the database:
-- ops_start_order_check_v1, ops_scan_order_check_v1, ops_get_order_check_v1, ops_finish_order_check_v1.
-- Their contract is fail-closed: processing only; exact EAN; no over-count; exact completion required.
