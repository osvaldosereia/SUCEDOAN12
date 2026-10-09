-- Full canonical basket_lot_public_availability_v1 behavior after the
-- proposed mounted-kit patch. Database is disposable PostgreSQL 17.
\set ON_ERROR_STOP on
BEGIN;
UPDATE public.products SET stock=0 WHERE id IN
 ('00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000e2',
  '00000000-0000-4000-8000-0000000000e5');

DO $mounted$
DECLARE food record; hygiene record; legacy record;
        response jsonb; created_order_id uuid;
BEGIN
 SELECT * INTO food FROM public.basket_lot_public_availability_v1
   WHERE lot_id='00000000-0000-4000-8000-0000000000f1';
 SELECT * INTO hygiene FROM public.basket_lot_public_availability_v1
   WHERE lot_id='00000000-0000-4000-8000-0000000000f2';
 SELECT * INTO legacy FROM public.basket_lot_public_availability_v1
   WHERE lot_id='00000000-0000-4000-8000-0000000000f3';
 IF food.public_available IS DISTINCT FROM 6
   OR food.linked_available IS DISTINCT FROM 6
   OR food.availability_reason IS DISTINCT FROM 'available'
   OR hygiene.public_available IS DISTINCT FROM 6
   OR hygiene.availability_reason IS DISTINCT FROM 'available'
   OR legacy.public_available IS DISTINCT FROM 4
 THEN RAISE EXCEPTION 'mounted lots incorrectly depend on loose stock: food % hygiene % legacy %',
   to_jsonb(food),to_jsonb(hygiene),to_jsonb(legacy); END IF;

 response:=public.create_vitrine_cart_order_v3(null,'PIX',
  jsonb_build_array(jsonb_build_object(
   'type','basket','id','00000000-0000-4000-8000-0000000000d1',
   'food_lot_id','00000000-0000-4000-8000-0000000000f1',
   'components',jsonb_build_array(
      jsonb_build_object('component_group','food',
        'product_id','00000000-0000-4000-8000-0000000000e1','quantity',1),
      jsonb_build_object('component_group','hygiene',
        'product_id','00000000-0000-4000-8000-0000000000e2','quantity',1)
   ))));
 created_order_id:=(response->>'order_id')::uuid;
 IF (response->>'total')::numeric IS DISTINCT FROM 160
    OR (SELECT count(*) FROM public.basket_stock_allocations
       WHERE order_id=created_order_id)<>2
    OR EXISTS(SELECT 1 FROM public.vitrine_stock_reservations
      WHERE order_id=order_id)
 THEN RAISE EXCEPTION 'mounted kits checkout incorrectly uses loose stock or lost allocation: %',response;
 END IF;
END $mounted$;
ROLLBACK;

BEGIN;
UPDATE public.basket_stock_lots SET sale_enabled=false
 WHERE id='00000000-0000-4000-8000-0000000000f2';
DO $paused$
BEGIN
 IF (SELECT availability_reason FROM public.basket_lot_public_availability_v1
     WHERE lot_id='00000000-0000-4000-8000-0000000000f2') IS DISTINCT FROM 'paused'
 OR (SELECT availability_reason FROM public.basket_lot_public_availability_v1
     WHERE lot_id='00000000-0000-4000-8000-0000000000f1') IS DISTINCT FROM 'linked_lot_unavailable'
 THEN RAISE EXCEPTION 'paused linked hygiene was offered as available'; END IF;
END $paused$;
ROLLBACK;

BEGIN;
UPDATE public.basket_categories SET is_active=false;
DO $category$
BEGIN
 IF EXISTS(SELECT 1 FROM public.basket_lot_public_availability_v1
    WHERE public_available>0)
 THEN RAISE EXCEPTION 'inactive category exposed assembled stock'; END IF;
END $category$;
ROLLBACK;

BEGIN;
UPDATE public.products SET is_active=false
 WHERE id='00000000-0000-4000-8000-0000000000e1';
DO $product$
BEGIN
 IF (SELECT availability_reason FROM public.basket_lot_public_availability_v1
    WHERE lot_id='00000000-0000-4000-8000-0000000000f1')
    IS DISTINCT FROM 'component_out_of_stock'
 THEN RAISE EXCEPTION 'inactive product allowed in mounted kit'; END IF;
END $product$;
ROLLBACK;

BEGIN;
UPDATE public.basket_stock_lots SET assembly_status='assembling'
 WHERE id='00000000-0000-4000-8000-0000000000f1';
DO $assembly$
BEGIN
 IF (SELECT availability_reason FROM public.basket_lot_public_availability_v1
    WHERE lot_id='00000000-0000-4000-8000-0000000000f1') IS DISTINCT FROM 'assembling'
 THEN RAISE EXCEPTION 'unfinished basket lot became available'; END IF;
END $assembly$;
ROLLBACK;

BEGIN;
UPDATE public.basket_stock_lots SET quantity_available=0
 WHERE id='00000000-0000-4000-8000-0000000000f2';
DO $empty$
BEGIN
 IF (SELECT public_available FROM public.basket_lot_public_availability_v1
   WHERE lot_id='00000000-0000-4000-8000-0000000000f1')<>0
 THEN RAISE EXCEPTION 'linked zero-quantity hygiene still offered'; END IF;
END $empty$;
ROLLBACK;
SELECT 'PASS canonical lot availability: mounted/legacy stock survives zero loose, inactive/paused/assembling/depleted correctly blocked' result;
