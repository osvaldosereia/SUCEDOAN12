alter table public.basket_templates add column if not exists subcategory_id uuid references public.basket_subcategories(id) on delete set null;
alter table public.basket_kit_templates add column if not exists subcategory_id uuid references public.basket_subcategories(id) on delete set null;
create index if not exists basket_subcategories_order_idx on public.basket_subcategories(category_id,sort_order,name);
update public.basket_molds m set public_composition_count=3 from public.basket_templates b where b.id=m.basket_id and b.is_active=true and m.public_composition_count<>3;