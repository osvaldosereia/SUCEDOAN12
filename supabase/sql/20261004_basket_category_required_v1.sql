-- Dona Antônia · toda Cesta/Kit comercial precisa de categoria pública.
do $$
begin
  if exists(select 1 from public.basket_templates where category_id is null) then
    raise exception 'basket_category_backfill_incomplete';
  end if;
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.basket_templates'::regclass
      and conname='basket_templates_category_required'
  ) then
    alter table public.basket_templates
      add constraint basket_templates_category_required
      check (category_id is not null) not valid;
  end if;
end$$;

alter table public.basket_templates
  validate constraint basket_templates_category_required;
