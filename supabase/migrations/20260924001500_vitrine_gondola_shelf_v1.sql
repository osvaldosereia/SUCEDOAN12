alter table public.product_gondola_assignments
  add column if not exists shelf_label text;

update public.product_gondola_assignments
set shelf_label = null
where shelf_label is not null
  and nullif(trim(shelf_label),'') is null;

comment on column public.product_gondola_assignments.shelf_label
  is 'Prateleira opcional dentro da gôndola para orientar separação de pedidos.';
