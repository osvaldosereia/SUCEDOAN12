-- Baseline-only reproduction of the REAL production view's stock check.
-- A physical mounted kit (quantity_available>0) is treated as depleted when
-- its individual products have zero loose effective stock. No data persists.
\set ON_ERROR_STOP on
BEGIN;
UPDATE public.products SET stock=0
WHERE id IN ('00000000-0000-4000-8000-0000000000e1',
             '00000000-0000-4000-8000-0000000000e2');
DO $baseline$
DECLARE food record; hygiene record;
BEGIN
 SELECT * INTO food FROM public.basket_lot_public_availability_v1
 WHERE lot_id='00000000-0000-4000-8000-0000000000f1';
 SELECT * INTO hygiene FROM public.basket_lot_public_availability_v1
 WHERE lot_id='00000000-0000-4000-8000-0000000000f2';
 IF food.public_available IS DISTINCT FROM 0
    OR hygiene.public_available IS DISTINCT FROM 0
    OR food.availability_reason IS DISTINCT FROM 'component_out_of_stock'
    OR hygiene.availability_reason IS DISTINCT FROM 'component_out_of_stock'
 THEN RAISE EXCEPTION 'original live view did not reproduce mounted-kit issue: food %, hygiene %',
 food.availability_reason,hygiene.availability_reason; END IF;
 IF (SELECT quantity_available FROM public.basket_stock_lots
     WHERE id='00000000-0000-4000-8000-0000000000f1')<1
 THEN RAISE EXCEPTION 'fixture is not a genuinely built lot'; END IF;
END $baseline$;
ROLLBACK;
SELECT 'BASELINE reproduced canonical view hiding mounted lots when loose stock is zero (rolled back)' AS result;
