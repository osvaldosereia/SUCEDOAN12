-- Exercise EXACT production basket_lot_public_availability_v1 definition
-- on a PostgreSQL 17 synthetic schema (NO real Bling access or customer data).
\set ON_ERROR_STOP on
DO $availability$
DECLARE
 food uuid:='00000000-0000-4000-8000-0000000000f1';
 hygiene uuid:='00000000-0000-4000-8000-0000000000f2';
 legacy uuid:='00000000-0000-4000-8000-0000000000f3';
 cat uuid:='00000000-0000-4000-8000-0000000000d5';
 a record; b record;
BEGIN
 SELECT * INTO a FROM public.basket_lot_public_availability_v1 WHERE lot_id=food;
 SELECT * INTO b FROM public.basket_lot_public_availability_v1 WHERE lot_id=hygiene;
 IF a.public_available IS DISTINCT FROM 6 OR a.availability_reason IS DISTINCT FROM 'available'
    OR a.linked_available IS DISTINCT FROM 6 OR a.components_in_stock IS DISTINCT FROM true
    OR b.public_available IS DISTINCT FROM 6
 THEN RAISE EXCEPTION 'original kits should be available: %, %',to_jsonb(a),to_jsonb(b); END IF;
 IF (SELECT public_available FROM public.basket_lot_public_availability_v1
     WHERE lot_id=legacy) IS DISTINCT FROM 4
 THEN RAISE EXCEPTION 'legacy mounted lot incorrectly blocked'; END IF;

 UPDATE public.basket_categories SET is_active=false WHERE id=cat;
 IF (SELECT availability_reason FROM public.basket_lot_public_availability_v1
      WHERE lot_id=food) IS DISTINCT FROM 'category_inactive'
    OR (SELECT public_available FROM public.basket_lot_public_availability_v1
      WHERE lot_id=legacy) IS DISTINCT FROM 0
 THEN RAISE EXCEPTION 'inactive category allowed selling assembled kits'; END IF;
 UPDATE public.basket_categories SET is_active=true WHERE id=cat;

 UPDATE public.basket_kit_templates SET is_active=false
 WHERE id='00000000-0000-4000-8000-0000000000a1';
 IF (SELECT availability_reason FROM public.basket_lot_public_availability_v1
     WHERE lot_id=food) IS DISTINCT FROM 'model_inactive'
 THEN RAISE EXCEPTION 'inactive food model exposed'; END IF;
 UPDATE public.basket_kit_templates SET is_active=true
 WHERE id='00000000-0000-4000-8000-0000000000a1';

 UPDATE public.basket_stock_lots SET sale_enabled=false WHERE id=hygiene;
 IF (SELECT availability_reason FROM public.basket_lot_public_availability_v1
     WHERE lot_id=hygiene) IS DISTINCT FROM 'paused'
   OR (SELECT availability_reason FROM public.basket_lot_public_availability_v1
     WHERE lot_id=food) IS DISTINCT FROM 'linked_lot_unavailable'
   OR (SELECT public_available FROM public.basket_lot_public_availability_v1
     WHERE lot_id=food) IS DISTINCT FROM 0
 THEN RAISE EXCEPTION 'linked food lot sold with paused hygiene kit'; END IF;
 UPDATE public.basket_stock_lots SET sale_enabled=true WHERE id=hygiene;

 UPDATE public.basket_stock_lots SET assembly_status='assembling' WHERE id=food;
 IF (SELECT availability_reason FROM public.basket_lot_public_availability_v1
     WHERE lot_id=food) IS DISTINCT FROM 'assembling'
 THEN RAISE EXCEPTION 'not-yet-mounted food lot exposed'; END IF;
 UPDATE public.basket_stock_lots SET assembly_status='mounted' WHERE id=food;

 UPDATE public.products SET is_active=false
 WHERE id='00000000-0000-4000-8000-0000000000e2';
 IF (SELECT availability_reason FROM public.basket_lot_public_availability_v1
     WHERE lot_id=hygiene) IS DISTINCT FROM 'component_out_of_stock'
   OR (SELECT availability_reason FROM public.basket_lot_public_availability_v1
     WHERE lot_id=food) IS DISTINCT FROM 'linked_lot_unavailable'
 THEN RAISE EXCEPTION 'disabled component allowed selling kits'; END IF;
 UPDATE public.products SET is_active=true
 WHERE id='00000000-0000-4000-8000-0000000000e2';

 UPDATE public.products SET stock=0
 WHERE id='00000000-0000-4000-8000-0000000000e2';
 IF (SELECT availability_reason FROM public.basket_lot_public_availability_v1
     WHERE lot_id=hygiene) IS DISTINCT FROM 'component_out_of_stock'
 THEN RAISE EXCEPTION 'stock-mirror zero did not block hygiene lot'; END IF;
 UPDATE public.products SET stock=20
 WHERE id='00000000-0000-4000-8000-0000000000e2';

 UPDATE public.basket_stock_lots SET quantity_available=0 WHERE id=hygiene;
 IF (SELECT availability_reason FROM public.basket_lot_public_availability_v1
     WHERE lot_id=food) IS DISTINCT FROM 'linked_lot_unavailable'
   OR (SELECT public_available FROM public.basket_lot_public_availability_v1
     WHERE lot_id=food) IS DISTINCT FROM 0
 THEN RAISE EXCEPTION 'sold food despite missing linked quantity'; END IF;
 UPDATE public.basket_stock_lots SET quantity_available=6 WHERE id=hygiene;

 UPDATE public.basket_stock_lots SET linked_lot_id=food WHERE id=hygiene;
 IF (SELECT availability_reason FROM public.basket_lot_public_availability_v1
     WHERE lot_id=food) IS DISTINCT FROM 'linked_lot_unavailable'
 THEN RAISE EXCEPTION 'cyclic linked-lot allowed'; END IF;
 UPDATE public.basket_stock_lots SET linked_lot_id=NULL WHERE id=hygiene;

 SELECT * INTO a FROM public.basket_lot_public_availability_v1 WHERE lot_id=food;
 IF a.public_available IS DISTINCT FROM 6 OR a.availability_reason IS DISTINCT FROM 'available'
 THEN RAISE EXCEPTION 'availability not restored: %',to_jsonb(a); END IF;
END $availability$;
SELECT 'PASS: real stock availability view rejects category, model, assembly, component, depleted and linked-lot failures' AS result;
