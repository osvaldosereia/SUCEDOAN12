create table if not exists public.admin_saved_cards_v1 (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  brand text not null check (char_length(btrim(brand)) between 1 and 60),
  initial_value numeric(12,2) not null check (initial_value > 0),
  current_balance numeric(12,2) not null check (current_balance >= 0 and current_balance <= initial_value),
  card_password text not null check (char_length(card_password) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_saved_cards_v1_created_at_idx
  on public.admin_saved_cards_v1 (created_at desc);

create table if not exists public.admin_saved_card_uses_v1 (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.admin_saved_cards_v1 (id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  idempotency_key uuid not null unique,
  used_at timestamptz not null default now()
);

create index if not exists admin_saved_card_uses_v1_card_used_at_idx
  on public.admin_saved_card_uses_v1 (card_id, used_at desc);

alter table public.admin_saved_cards_v1 enable row level security;
alter table public.admin_saved_card_uses_v1 enable row level security;

revoke all privileges on table public.admin_saved_cards_v1, public.admin_saved_card_uses_v1
  from public, anon, authenticated;
grant select, insert, update on table public.admin_saved_cards_v1 to service_role;
grant select, insert, update on table public.admin_saved_card_uses_v1 to service_role;

create or replace function public.register_admin_saved_card_use_v1(
  p_card_id uuid,
  p_amount numeric,
  p_idempotency_key uuid
)
returns table (
  id uuid,
  card_id uuid,
  amount numeric,
  used_at timestamptz,
  current_balance numeric
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.admin_saved_card_uses_v1%rowtype;
  v_balance numeric(12,2);
  v_used_at timestamptz := now();
  v_use_id uuid;
begin
  if p_card_id is null or p_idempotency_key is null
     or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select * into v_existing
  from public.admin_saved_card_uses_v1
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.card_id <> p_card_id or v_existing.amount <> p_amount then
      raise exception 'idempotency_key_conflict' using errcode = '22023';
    end if;
    select current_balance into v_balance
    from public.admin_saved_cards_v1
    where public.admin_saved_cards_v1.id = p_card_id;
    return query select v_existing.id, v_existing.card_id, v_existing.amount, v_existing.used_at, v_balance;
    return;
  end if;

  update public.admin_saved_cards_v1 as card
  set current_balance = card.current_balance - p_amount,
      updated_at = v_used_at
  where card.id = p_card_id
    and card.current_balance >= p_amount
  returning card.current_balance into v_balance;

  if not found then
    if exists (select 1 from public.admin_saved_cards_v1 as card where card.id = p_card_id) then
      raise exception 'insufficient_balance' using errcode = 'P0001';
    end if;
    raise exception 'card_not_found' using errcode = 'P0002';
  end if;

  insert into public.admin_saved_card_uses_v1 as saved_use (card_id, amount, idempotency_key, used_at)
  values (p_card_id, p_amount, p_idempotency_key, v_used_at)
  returning saved_use.id into v_use_id;

  return query select v_use_id, p_card_id, p_amount, v_used_at, v_balance;
end;
$$;

revoke all privileges on function public.register_admin_saved_card_use_v1(uuid, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.register_admin_saved_card_use_v1(uuid, numeric, uuid) to service_role;