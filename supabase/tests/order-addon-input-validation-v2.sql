-- Run only in an isolated PostgreSQL homologation database after migration.
-- Malformed inputs must be rejected before session or order lookup.
do $addon_input_test$
declare
  v_result jsonb;
begin
  v_result := public.ops3_add_items_to_existing_order_v1(
    repeat('0',64), 'probe_missing_id', '[{"quantity":1}]'::jsonb
  );
  if v_result->>'error' is distinct from 'invalid_product_id' then
    raise exception 'missing product_id: expected invalid_product_id, got %',v_result;
  end if;
  v_result := public.ops3_add_items_to_existing_order_v1(
    repeat('0',64), 'probe_null_qty',
    '[{"product_id":"00000000-0000-0000-0000-000000000001","quantity":null}]'::jsonb
  );
  if v_result->>'error' is distinct from 'invalid_quantity' then
    raise exception 'null quantity: expected invalid_quantity, got %',v_result;
  end if;
  v_result := public.ops3_add_items_to_existing_order_v1(
    repeat('0',64), 'probe_zero_qty',
    '[{"product_id":"00000000-0000-0000-0000-000000000001","quantity":0}]'::jsonb
  );
  if v_result->>'error' is distinct from 'invalid_quantity' then
    raise exception 'zero quantity: expected invalid_quantity, got %',v_result;
  end if;
end;
$addon_input_test$;
