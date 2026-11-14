CREATE OR REPLACE VIEW public.basket_locked_component_stock_v1 AS
WITH active_allocations AS (
  SELECT
    item.product_id,
    sum(item.quantity_per_basket * allocation.quantity::numeric) AS qty
  FROM public.basket_stock_allocations allocation
  JOIN public.basket_stock_lot_items item
    ON item.lot_id = allocation.lot_id
  WHERE allocation.status = 'allocated'
  GROUP BY item.product_id
)
SELECT
  product.id AS product_id,
  coalesce(active_allocations.qty, 0::numeric) AS basket_locked_quantity
FROM public.products product
LEFT JOIN active_allocations
  ON active_allocations.product_id = product.id
WHERE coalesce(active_allocations.qty, 0::numeric) > 0::numeric;

COMMENT ON VIEW public.basket_locked_component_stock_v1 IS
  'Only components allocated to open orders reduce sellable stock. Completed legacy basket lots and assembly reservations do not reserve public product inventory.';
