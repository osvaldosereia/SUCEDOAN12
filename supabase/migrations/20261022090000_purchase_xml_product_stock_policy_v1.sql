-- Persist the operator's stock receipt preference on the product catalog.
-- Existing invoice lines and prepared/verified receipt plans remain unchanged.
alter table public.products
  add column if not exists purchase_xml_stock_update boolean not null default true;

with latest_choice as (
  select distinct on (i.product_id)
         i.product_id,
         coalesce(i.stock_update_requested, true) as stock_update_requested
    from public.purchase_xml_items i
   where i.product_id is not null
   order by i.product_id, i.updated_at desc nulls last, i.created_at desc, i.item_number desc
)
update public.products p
   set purchase_xml_stock_update = latest_choice.stock_update_requested
  from latest_choice
 where p.id = latest_choice.product_id;

comment on column public.products.purchase_xml_stock_update is
  'Persistent default for including this product in future purchase XML stock receipt plans.';
