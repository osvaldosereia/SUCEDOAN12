-- Concurrent stock test, PostgreSQL17 ephemeral fixture only.
-- 3 kits each remain after deterministic previous assertions.
SELECT public.create_vitrine_cart_order_v3(
  null,'PIX',
  '[{"type":"basket","id":"00000000-0000-4000-8000-0000000000d1",
     "food_lot_id":"00000000-0000-4000-8000-0000000000f1","qty":2,
     "components":[
        {"component_group":"food","product_id":"00000000-0000-4000-8000-0000000000e1","quantity":1},
        {"component_group":"hygiene","product_id":"00000000-0000-4000-8000-0000000000e2","quantity":1}
      ]}]'::jsonb
)->>'order_id';
