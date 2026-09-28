create index if not exists inventory_sheet_items_product_idx
  on public.inventory_sheet_items(product_id);
create index if not exists inventory_sheet_item_results_sheet_item_idx
  on public.inventory_sheet_item_results(sheet_item_id);
