-- R02+ integration assertions against REAL public.ops2_sellable_stock_v1,
-- public.ops2_loose_sellable_stock_v1, basket_locked_component_stock_v1 and
-- real basket_lot_public_availability_v1, all in a ninth disposable PG17 DB.
\set ON_ERROR_STOP on
DO $baseline$
DECLARE
  food uuid:='00000000-0000-4000-8000-0000000000e1';
  hygiene uuid:='00000000-0000-4000-8000-0000000000e2';
  legacy uuid:='00000000-0000-4000-8000-0000000000e5';
BEGIN
 IF (SELECT effective_sellable_stock FROM public.ops2_sellable_stock_v1
      WHERE product_id=food)<>20
   OR (SELECT stock_source_reason FROM public.ops2_sellable_stock_v1
      WHERE product_id=food)<>'bling_virtual'
   OR (SELECT bling_stock_ready FROM public.ops2_sellable_stock_v1
      WHERE product_id=food) IS DISTINCT FROM true
   OR (SELECT basket_locked_quantity FROM public.basket_locked_component_stock_v1
      WHERE product_id=food)<>6
   OR (SELECT loose_sellable_stock FROM public.ops2_loose_sellable_stock_v1
      WHERE product_id=food)<>14
   OR (SELECT loose_sellable_stock FROM public.ops2_loose_sellable_stock_v1
      WHERE product_id=hygiene)<>14
   OR (SELECT loose_sellable_stock FROM public.ops2_loose_sellable_stock_v1
      WHERE product_id=legacy)<>6
 THEN RAISE EXCEPTION 'Bling authority / kit locked stock baseline differs from canonical view'; END IF;

 IF NOT (
   (SELECT public_available=6 FROM public.basket_lot_public_availability_v1
    WHERE lot_id='00000000-0000-4000-8000-0000000000f1') IS TRUE
 ) THEN RAISE EXCEPTION 'real Bling virtual stock should make mounted kit sellable'; END IF;
 FOR food IN
   SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='ops2_sellable_stock_v1'
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=food
       AND 'security_invoker=true'=ANY(c.reloptions))
   THEN RAISE EXCEPTION 'real stock view must be security_invoker'; END IF;
 END LOOP;
 IF has_table_privilege('anon','public.ops2_sellable_stock_v1','SELECT')
    OR has_table_privilege('authenticated','public.ops2_sellable_stock_v1','SELECT')
    OR has_table_privilege('anon','public.basket_lot_public_availability_v1','SELECT')
 THEN RAISE EXCEPTION 'unsafe public select was granted to stock/cart catalog'; END IF;
END $baseline$;

-- Mirrors are authoritative; legacy product stock cannot revive a depleted
-- or disconnected Bling item.
BEGIN;
 UPDATE public.products SET stock=999
 WHERE id='00000000-0000-4000-8000-0000000000e1';
 DO $live$
 BEGIN
   IF (SELECT effective_sellable_stock FROM public.ops2_sellable_stock_v1
     WHERE product_id='00000000-0000-4000-8000-0000000000e1')<>20
   THEN RAISE EXCEPTION 'legacy stock override leaked into Bling authority'; END IF;
 END $live$;
 UPDATE public.bling_hub_runtime_v2 SET metadata=jsonb_set(metadata,
   '{ops2_stock_authority}','"legacy_shadow"') WHERE id=1;
 DO $legacy$
 BEGIN
   IF (SELECT effective_sellable_stock FROM public.ops2_sellable_stock_v1
     WHERE product_id='00000000-0000-4000-8000-0000000000e1')<>999
   THEN RAISE EXCEPTION 'real view did not retain explicit legacy shadow behavior'; END IF;
 END $legacy$;
ROLLBACK;

-- An unlinked product, absent mirror or mismatched deposit must not sell
-- under Bling authority, even if products.stock remains positive.
BEGIN;
 UPDATE public.bling_hub_entity_links_v2 SET status='pending'
 WHERE source_id='00000000-0000-4000-8000-0000000000e1';
 DO $link$
 BEGIN
   IF (SELECT effective_sellable_stock FROM public.ops2_sellable_stock_v1
     WHERE product_id='00000000-0000-4000-8000-0000000000e1')<>0
     OR (SELECT stock_source_reason FROM public.ops2_sellable_stock_v1
     WHERE product_id='00000000-0000-4000-8000-0000000000e1')<>'unlinked'
     OR (SELECT public_available FROM public.basket_lot_public_availability_v1
     WHERE lot_id='00000000-0000-4000-8000-0000000000f1')<>0
   THEN RAISE EXCEPTION 'unlinked Bling product continued selling'; END IF;
 END $link$;
ROLLBACK;

BEGIN;
 DELETE FROM public.bling_stock_mirror_v2
 WHERE product_id='00000000-0000-4000-8000-0000000000e1';
 DO $missing$
 BEGIN
   IF (SELECT effective_sellable_stock FROM public.ops2_sellable_stock_v1
     WHERE product_id='00000000-0000-4000-8000-0000000000e1')<>0
     OR (SELECT stock_source_reason FROM public.ops2_sellable_stock_v1
     WHERE product_id='00000000-0000-4000-8000-0000000000e1')<>'mirror_missing'
   THEN RAISE EXCEPTION 'missing mirror did not fail closed'; END IF;
 END $missing$;
ROLLBACK;

BEGIN;
 UPDATE public.bling_hub_runtime_v2 SET metadata=
   jsonb_set(metadata,'{selected_deposit_id}','7') WHERE id=1;
 DO $deposit$
 BEGIN
   IF (SELECT effective_sellable_stock FROM public.ops2_sellable_stock_v1
     WHERE product_id='00000000-0000-4000-8000-0000000000e1')<>0
    OR (SELECT stock_source_reason FROM public.ops2_sellable_stock_v1
     WHERE product_id='00000000-0000-4000-8000-0000000000e1')<>'deposit_balance_missing'
   THEN RAISE EXCEPTION 'selected deposit mismatch allowed sale'; END IF;
 END $deposit$;
ROLLBACK;

-- Virtual is sellable; physical is NOT the value used by checkout.
BEGIN;
 UPDATE public.bling_stock_mirror_v2 SET physical_total=20,virtual_total=0,
   deposit_balances='{"5":{"physical":20,"virtual":0}}'::jsonb
 WHERE product_id='00000000-0000-4000-8000-0000000000e1';
 DO $virtual$
 BEGIN
   IF (SELECT effective_sellable_stock FROM public.ops2_sellable_stock_v1
      WHERE product_id='00000000-0000-4000-8000-0000000000e1')<>0
     OR (SELECT sellable_physical FROM public.ops2_sellable_stock_v1
      WHERE product_id='00000000-0000-4000-8000-0000000000e1')<>20
     OR (SELECT public_available FROM public.basket_lot_public_availability_v1
      WHERE lot_id='00000000-0000-4000-8000-0000000000f1')<>0
   THEN RAISE EXCEPTION 'physical-only stock was sold despite virtual stock=0'; END IF;
 END $virtual$;
ROLLBACK;

-- Preassembled / assembling and allocated stock cannot be counted as loose.
BEGIN;
 UPDATE public.basket_stock_lots SET assembly_status='assembling'
 WHERE id='00000000-0000-4000-8000-0000000000f1';
 INSERT INTO public.basket_lot_component_reservations(
   lot_id,product_id,status,quantity_reserved)
 VALUES ('00000000-0000-4000-8000-0000000000f1',
   '00000000-0000-4000-8000-0000000000e1','active',3);
 INSERT INTO public.orders(id,order_number,status,total)
 VALUES ('00000000-0000-4000-8000-0000000000ee','TEST-LOCK','confirmed',160);
 INSERT INTO public.basket_stock_allocations(order_id,lot_id,
   basket_id,quantity,status,allocation_role)
 VALUES('00000000-0000-4000-8000-0000000000ee',
   '00000000-0000-4000-8000-0000000000f1',
   '00000000-0000-4000-8000-0000000000d1',2,'allocated','food');
 DO $locked$
 BEGIN
   IF (SELECT basket_locked_quantity FROM public.basket_locked_component_stock_v1
       WHERE product_id='00000000-0000-4000-8000-0000000000e1')<>5
      OR (SELECT loose_sellable_stock FROM public.ops2_loose_sellable_stock_v1
       WHERE product_id='00000000-0000-4000-8000-0000000000e1')<>15
   THEN RAISE EXCEPTION 'active assembly reservation + allocations not locked'; END IF;
 END $locked$;
ROLLBACK;
SELECT 'PASS: exact Bling virtual/deposit authority, unlinked/mirror fail-closed, physical exclusion, basket locks, invoker security' result;
