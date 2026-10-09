-- R02+R03: prove the ACTUAL v3 checkout refuses an unavailable lot,
-- not just that the view labels it unavailable. All orders are fictional.
\set ON_ERROR_STOP on
DO $real_checkout_availability$
DECLARE
 cart jsonb := jsonb_build_array(jsonb_build_object(
   'type','basket',
   'id','00000000-0000-4000-8000-0000000000d1',
   'food_lot_id','00000000-0000-4000-8000-0000000000f1',
   'components',jsonb_build_array(
      jsonb_build_object('component_group','food',
        'product_id','00000000-0000-4000-8000-0000000000e1','quantity',1),
      jsonb_build_object('component_group','hygiene',
        'product_id','00000000-0000-4000-8000-0000000000e2','quantity',1)
   )
 ));
 before_orders integer;
BEGIN
 SELECT count(*) INTO before_orders FROM public.orders;

 UPDATE public.basket_categories SET is_active=false
 WHERE id='00000000-0000-4000-8000-0000000000d5';
 BEGIN
   PERFORM public.create_vitrine_cart_order_v3(null,'PIX',cart);
   RAISE EXCEPTION 'security_bug_inactive_category_was_sold';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT IN ('basket_kit_lot_insufficient','basket_hygiene_lot_invalid')
   THEN RAISE; END IF;
 END;
 UPDATE public.basket_categories SET is_active=true
 WHERE id='00000000-0000-4000-8000-0000000000d5';

 UPDATE public.basket_stock_lots SET sale_enabled=false
 WHERE id='00000000-0000-4000-8000-0000000000f2';
 BEGIN
   PERFORM public.create_vitrine_cart_order_v3(null,'PIX',cart);
   RAISE EXCEPTION 'security_bug_paused_linked_kit_was_sold';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT IN ('basket_kit_lot_insufficient','basket_hygiene_lot_invalid')
   THEN RAISE; END IF;
 END;
 UPDATE public.basket_stock_lots SET sale_enabled=true
 WHERE id='00000000-0000-4000-8000-0000000000f2';

 UPDATE public.basket_stock_lots SET assembly_status='assembling'
 WHERE id='00000000-0000-4000-8000-0000000000f1';
 BEGIN
   PERFORM public.create_vitrine_cart_order_v3(null,'PIX',cart);
   RAISE EXCEPTION 'security_bug_unassembled_food_kit_was_sold';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT IN ('basket_kit_lot_insufficient','basket_hygiene_lot_invalid')
   THEN RAISE; END IF;
 END;
 UPDATE public.basket_stock_lots SET assembly_status='mounted'
 WHERE id='00000000-0000-4000-8000-0000000000f1';

 IF (SELECT count(*) FROM public.orders) IS DISTINCT FROM before_orders
    OR EXISTS(SELECT 1 FROM public.basket_stock_allocations)
    OR EXISTS(SELECT 1 FROM public.vitrine_stock_reservations)
 THEN RAISE EXCEPTION 'rejected linked-basket checkout left orphan order, allocation or reservation';
 END IF;
END $real_checkout_availability$;
SELECT 'PASS: actual checkout refuses inactive category, paused hygiene and assembling food lot; no orphan orders' AS result;
