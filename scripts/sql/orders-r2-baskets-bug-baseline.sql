-- R02: before patch, prove an independent hygiene lot is incorrectly
-- converted to loose when ONLY the food group changes. Test database ONLY.
\set ON_ERROR_STOP on
BEGIN;
DO $legacy_bug$
DECLARE cart jsonb; response jsonb; oid uuid; food_mode text; hygiene_mode text;
BEGIN
  cart:=jsonb_build_array(jsonb_build_object(
    'type','basket','id','00000000-0000-4000-8000-0000000000d1',
    'food_lot_id','00000000-0000-4000-8000-0000000000f1',
    'components',jsonb_build_array(
      jsonb_build_object('component_group','food',
        'product_id','00000000-0000-4000-8000-0000000000e1','quantity',0),
      jsonb_build_object('component_group','hygiene',
        'product_id','00000000-0000-4000-8000-0000000000e2','quantity',1)
    )
  ));
  response:=public.create_vitrine_cart_order_v3(null,'PIX',cart);
  oid:=(response->>'order_id')::uuid;
  SELECT metadata->>'food_mode',metadata->>'hygiene_mode'
   INTO food_mode,hygiene_mode
  FROM public.order_items WHERE order_id=oid
   AND metadata->>'history_kind'='basket' LIMIT 1;
  IF food_mode IS DISTINCT FROM 'loose'
     OR hygiene_mode IS DISTINCT FROM 'loose'
  THEN RAISE EXCEPTION 'expected OLD BUG absent; stop auto patch and inspect: %, %',
    food_mode,hygiene_mode; END IF;
  IF (SELECT count(*) FROM public.basket_stock_allocations WHERE order_id=oid)<>0
  THEN RAISE EXCEPTION 'OLD BUG did not remove the intact kit'; END IF;
END $legacy_bug$;
ROLLBACK;
SELECT 'BASELINE R02 BUG reproduced: changing food unnecessarily dismantles hygiene (rolled back)' result;
