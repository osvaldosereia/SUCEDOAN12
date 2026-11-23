-- Card credit dates, audited balance movements, editing, and archive-safe deletion.
begin;

alter table public.admin_saved_cards_v1
  add column if not exists credit_added_on date,
  add column if not exists deleted_at timestamptz;

update public.admin_saved_cards_v1
set credit_added_on = (created_at at time zone 'America/Cuiaba')::date
where credit_added_on is null;

alter table public.admin_saved_cards_v1
  alter column credit_added_on set default ((now() at time zone 'America/Cuiaba')::date),
  alter column credit_added_on set not null;

alter table public.admin_saved_cards_v1
  drop constraint if exists admin_saved_cards_v1_check,
  drop constraint if exists admin_saved_cards_v1_current_balance_check,
  drop constraint if exists admin_saved_cards_v1_card_password_check;

alter table public.admin_saved_cards_v1
  add constraint admin_saved_cards_v1_current_balance_check check (current_balance >= 0),
  add constraint admin_saved_cards_v1_card_password_check check (
    (deleted_at is not null and card_password = '')
    or (deleted_at is null and char_length(card_password) between 1 and 120)
  );

alter table public.admin_saved_card_uses_v1
  add column if not exists transaction_type text not null default 'exit',
  add column if not exists location text,
  add column if not exists transaction_origin text not null default 'manual';

alter table public.admin_saved_card_uses_v1
  drop constraint if exists admin_saved_card_uses_v1_transaction_type_check,
  drop constraint if exists admin_saved_card_uses_v1_location_check,
  drop constraint if exists admin_saved_card_uses_v1_transaction_origin_check;

alter table public.admin_saved_card_uses_v1
  add constraint admin_saved_card_uses_v1_transaction_type_check
    check (transaction_type in ('entry', 'exit')),
  add constraint admin_saved_card_uses_v1_location_check
    check ((transaction_type = 'entry' and location is null) or (transaction_type = 'exit' and (location is null or location in ('Assaí', 'Fort', 'Atacadão')))),
  add constraint admin_saved_card_uses_v1_transaction_origin_check
    check (
      transaction_origin = 'manual'
      or (transaction_origin = 'initial' and transaction_type = 'entry' and location is null)
    );

create index if not exists admin_saved_card_uses_v1_card_used_at_idx
  on public.admin_saved_card_uses_v1 (card_id, used_at desc);

create or replace function public.create_admin_saved_card_v1(
  p_name text,
  p_brand text,
  p_initial_value numeric,
  p_credit_added_on date,
  p_card_password text,
  p_idempotency_key uuid
)
returns public.admin_saved_cards_v1
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_card public.admin_saved_cards_v1%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_brand text := btrim(coalesce(p_brand, ''));
  v_password text := btrim(coalesce(p_card_password, ''));
begin
  if char_length(v_name) not between 1 and 120
    or char_length(v_brand) not between 1 and 60
    or char_length(v_password) not between 1 and 120
    or p_initial_value is null
    or p_initial_value <= 0
    or p_initial_value > 9999999999.99
    or p_initial_value <> round(p_initial_value, 2)
    or p_credit_added_on is null
    or p_idempotency_key is null
  then
    raise exception 'invalid_card';
  end if;

  select c.* into v_card
  from public.admin_saved_cards_v1 as c
  join public.admin_saved_card_uses_v1 as u on u.card_id = c.id
  where u.idempotency_key = p_idempotency_key
    and u.transaction_origin = 'initial'
    and c.deleted_at is null
  limit 1;

  if found then
    if v_card.name <> v_name
      or v_card.brand <> v_brand
      or v_card.initial_value <> p_initial_value
      or v_card.credit_added_on <> p_credit_added_on
      or v_card.card_password <> v_password
    then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_card;
  end if;

  insert into public.admin_saved_cards_v1 (
    name, brand, initial_value, current_balance, credit_added_on, card_password
  )
  values (
    v_name, v_brand, p_initial_value, p_initial_value, p_credit_added_on, v_password
  )
  returning * into v_card;

  insert into public.admin_saved_card_uses_v1 (
    card_id, amount, idempotency_key, transaction_type, location, transaction_origin
  )
  values (
    v_card.id, p_initial_value, p_idempotency_key, 'entry', null, 'initial'
  );

  return v_card;
end;
$$;

create or replace function public.update_admin_saved_card_v1(
  p_card_id uuid,
  p_name text,
  p_brand text,
  p_initial_value numeric,
  p_credit_added_on date,
  p_card_password text
)
returns public.admin_saved_cards_v1
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_card public.admin_saved_cards_v1%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_brand text := btrim(coalesce(p_brand, ''));
  v_has_manual_movements boolean;
begin
  if p_card_id is null
    or char_length(v_name) not between 1 and 120
    or char_length(v_brand) not between 1 and 60
    or p_initial_value is null
    or p_initial_value <= 0
    or p_initial_value > 9999999999.99
    or p_initial_value <> round(p_initial_value, 2)
    or p_credit_added_on is null
    or (p_card_password is not null and char_length(btrim(p_card_password)) not between 1 and 120)
  then
    raise exception 'invalid_card';
  end if;

  select c.* into v_card
  from public.admin_saved_cards_v1 as c
  where c.id = p_card_id and c.deleted_at is null
  for update;

  if not found then
    raise exception 'card_not_found';
  end if;

  select exists (
    select 1
    from public.admin_saved_card_uses_v1 as u
    where u.card_id = p_card_id and u.transaction_origin = 'manual'
  ) into v_has_manual_movements;

  if v_has_manual_movements and p_initial_value <> v_card.initial_value then
    raise exception 'initial_value_has_history';
  end if;

  if not v_has_manual_movements and p_initial_value <> v_card.initial_value then
    update public.admin_saved_card_uses_v1 as u
    set amount = p_initial_value
    where u.card_id = p_card_id and u.transaction_origin = 'initial';
  end if;

  update public.admin_saved_cards_v1 as c
  set name = v_name,
      brand = v_brand,
      initial_value = p_initial_value,
      current_balance = case
        when v_has_manual_movements then c.current_balance
        else p_initial_value
      end,
      credit_added_on = p_credit_added_on,
      card_password = coalesce(nullif(btrim(p_card_password), ''), c.card_password),
      updated_at = now()
  where c.id = p_card_id
  returning c.* into v_card;

  return v_card;
end;
$$;

create or replace function public.register_admin_saved_card_transaction_v1(
  p_card_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_location text,
  p_idempotency_key uuid
)
returns table (
  transaction_id uuid,
  card_id uuid,
  amount numeric,
  transaction_type text,
  location text,
  transaction_origin text,
  used_at timestamptz,
  current_balance numeric
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_card public.admin_saved_cards_v1%rowtype;
  v_existing public.admin_saved_card_uses_v1%rowtype;
  v_transaction public.admin_saved_card_uses_v1%rowtype;
  v_balance numeric(12,2);
begin
  if p_card_id is null then
    raise exception 'card_not_found';
  end if;
  if p_transaction_type is null or p_transaction_type not in ('entry', 'exit') then
    raise exception 'invalid_transaction_type';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9999999999.99 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_amount';
  end if;
  if p_idempotency_key is null then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_transaction_type = 'entry' and p_location is not null then
    raise exception 'invalid_location';
  end if;
  if p_transaction_type = 'exit'
    and (p_location is null or p_location not in ('Assaí', 'Fort', 'Atacadão'))
  then
    raise exception 'invalid_location';
  end if;

  select c.* into v_card
  from public.admin_saved_cards_v1 as c
  where c.id = p_card_id and c.deleted_at is null
  for update;

  if not found then
    raise exception 'card_not_found';
  end if;

  select u.* into v_existing
  from public.admin_saved_card_uses_v1 as u
  where u.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.card_id <> p_card_id
      or v_existing.amount <> p_amount
      or v_existing.transaction_type <> p_transaction_type
      or v_existing.location is distinct from p_location
    then
      raise exception 'idempotency_key_conflict';
    end if;
    return query
      select v_existing.id, v_existing.card_id, v_existing.amount,
        v_existing.transaction_type, v_existing.location, v_existing.transaction_origin,
        v_existing.used_at, v_card.current_balance;
    return;
  end if;

  if p_transaction_type = 'entry' then
    if v_card.current_balance + p_amount > 9999999999.99 then
      raise exception 'balance_limit_exceeded';
    end if;

    update public.admin_saved_cards_v1 as c
    set current_balance = c.current_balance + p_amount, updated_at = now()
    where c.id = p_card_id
    returning c.current_balance into v_balance;
  else
    update public.admin_saved_cards_v1 as c
    set current_balance = c.current_balance - p_amount, updated_at = now()
    where c.id = p_card_id and c.current_balance >= p_amount
    returning c.current_balance into v_balance;

    if not found then
      raise exception 'insufficient_balance';
    end if;
  end if;

  insert into public.admin_saved_card_uses_v1 (
    card_id, amount, idempotency_key, transaction_type, location, transaction_origin
  )
  values (
    p_card_id, p_amount, p_idempotency_key, p_transaction_type, p_location, 'manual'
  )
  returning * into v_transaction;

  return query
    select v_transaction.id, v_transaction.card_id, v_transaction.amount,
      v_transaction.transaction_type, v_transaction.location, v_transaction.transaction_origin,
      v_transaction.used_at, v_balance;
end;
$$;

create or replace function public.delete_admin_saved_card_v1(p_card_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_card_id is null then
    raise exception 'card_not_found';
  end if;

  update public.admin_saved_cards_v1 as c
  set deleted_at = now(), card_password = '', updated_at = now()
  where c.id = p_card_id and c.deleted_at is null
  returning c.id into v_id;

  if v_id is null then
    raise exception 'card_not_found';
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_admin_saved_card_v1(text, text, numeric, date, text, uuid) from public, anon, authenticated;
revoke all on function public.update_admin_saved_card_v1(uuid, text, text, numeric, date, text) from public, anon, authenticated;
revoke all on function public.register_admin_saved_card_transaction_v1(uuid, text, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_admin_saved_card_v1(uuid) from public, anon, authenticated;

grant execute on function public.create_admin_saved_card_v1(text, text, numeric, date, text, uuid) to service_role;
grant execute on function public.update_admin_saved_card_v1(uuid, text, text, numeric, date, text) to service_role;
grant execute on function public.register_admin_saved_card_transaction_v1(uuid, text, numeric, text, uuid) to service_role;
grant execute on function public.delete_admin_saved_card_v1(uuid) to service_role;

commit;
