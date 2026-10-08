-- New customer-facing order identity: exactly four digits.
-- Existing AA000 public codes remain untouched and valid.
-- UUID and orders.order_number remain internal technical identifiers.

create sequence if not exists public.order_public_code_4d_seq_v1
  as bigint
  minvalue 1000
  maxvalue 9999
  start with 1000
  increment by 1
  no cycle;

create or replace function public.ops2_next_order_public_code_4d_v1()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_value bigint;
  v_code text;
begin
  loop
    begin
      v_value := nextval('public.order_public_code_4d_seq_v1');
    exception
      when sequence_generator_limit_exceeded then
        raise exception using
          errcode = 'P0001',
          message = 'order_public_code_space_exhausted';
    end;

    v_code := lpad(v_value::text, 4, '0');

    exit when not exists (
      select 1
      from public.order_public_snapshots_v1
      where public_code = v_code
    );
  end loop;

  return v_code;
end;
$$;

alter table public.order_public_snapshots_v1
  alter column public_code set default public.ops2_next_order_public_code_4d_v1();

alter table public.order_public_snapshots_v1
  drop constraint if exists order_public_snapshots_v1_public_code_format_chk;

alter table public.order_public_snapshots_v1
  add constraint order_public_snapshots_v1_public_code_format_chk
  check (
    public_code ~ '^[A-Z]{2}[0-9]{3}$'
    or public_code ~ '^[0-9]{4}$'
  );

comment on column public.order_public_snapshots_v1.public_code is
  'Immutable customer-facing order code. Historical rows may use AA000; new rows use exactly four digits.';
