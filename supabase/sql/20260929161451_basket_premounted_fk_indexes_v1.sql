
create index if not exists basket_allocations_basket_idx
  on public.basket_stock_allocations(basket_id);
create index if not exists basket_lot_items_template_item_idx
  on public.basket_stock_lot_items(source_template_item_id);
create index if not exists basket_alternatives_product_idx
  on public.basket_template_item_alternatives(product_id);

