alter table public.admin1_basket_sizes
  add column if not exists hidden_value_cents bigint not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin1_basket_sizes_hidden_value_cents_nonnegative'
      and conrelid = 'public.admin1_basket_sizes'::regclass
  ) then
    alter table public.admin1_basket_sizes
      add constraint admin1_basket_sizes_hidden_value_cents_nonnegative
      check (hidden_value_cents >= 0);
  end if;
end $$;
