set lock_timeout = '5s';

alter table public.product_gondola_assignments
  drop column if exists shelf_label;

comment on table public.product_gondola_assignments
  is 'Vínculo operacional único produto ↔ gôndola. Dona Antônia não utiliza prateleiras.';
