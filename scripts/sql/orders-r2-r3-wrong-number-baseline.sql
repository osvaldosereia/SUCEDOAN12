-- Synthetic PostgreSQL 17 ONLY. Reproduce mismatch BEFORE R02+R03 fix.
\set ON_ERROR_STOP on
BEGIN;
DO $broken$
DECLARE
 d jsonb; actual text; old text;
BEGIN
 d:=public.create_vitrine_cart_order_v3(null,'PIX',
   '[{"type":"product","id":"00000000-0000-4000-8000-0000000000bb","qty":1}]'::jsonb);
 old:=d->>'order_number';
 SELECT order_number INTO actual FROM public.orders
 WHERE id=(d->>'order_id')::uuid;
 IF old !~ '^DA-' OR
   actual !~ '^[0-9]{2}[|][0-9]{2}[|][0-9]{4} - [0-9]{3}$'
   OR old=actual
 THEN RAISE EXCEPTION 'checkout_wrong_number_baseline_no_longer_reproducible: %, %',
   old,actual; END IF;
END $broken$;
ROLLBACK;
SELECT 'REPRODUCED: checkout returns old DA number while database writes R03 weekly number; rolled back' AS result;
