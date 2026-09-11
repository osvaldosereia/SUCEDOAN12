begin;

alter table public.basket_template_items
  add column if not exists updated_at timestamptz not null default now();

commit;
