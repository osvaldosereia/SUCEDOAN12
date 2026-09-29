alter table public.inventory_sheet_item_results
  add column if not exists ai_gondola integer null,
  add column if not exists confirmed_gondola integer null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_sheet_item_results_ai_gondola_check'
      and conrelid = 'public.inventory_sheet_item_results'::regclass
  ) then
    alter table public.inventory_sheet_item_results
      add constraint inventory_sheet_item_results_ai_gondola_check
      check (ai_gondola is null or ai_gondola between 1 and 9999);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_sheet_item_results_confirmed_gondola_check'
      and conrelid = 'public.inventory_sheet_item_results'::regclass
  ) then
    alter table public.inventory_sheet_item_results
      add constraint inventory_sheet_item_results_confirmed_gondola_check
      check (confirmed_gondola is null or confirmed_gondola between 1 and 9999);
  end if;
end $$;
