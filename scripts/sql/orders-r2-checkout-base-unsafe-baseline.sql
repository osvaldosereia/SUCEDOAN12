-- Reproduce CURRENT deployed checkout base bug in disposable DB only.
-- The customer_snapshot JSON is untrusted and must not exempt R$75.
\set ON_ERROR_STOP on
BEGIN;
DO $unsafe$
DECLARE r jsonb; oid uuid;
BEGIN
  r:=public.create_vitrine_cart_order_v3_base(
    null,'PIX',
    '[{"type":"product","id":"00000000-0000-4000-8000-0000000000aa","qty":1}]'::jsonb,
    '{"stock_adjusted_retry":true}'::jsonb,'{}'::jsonb);
  oid:=(r->>'order_id')::uuid;
  IF r->>'total' IS DISTINCT FROM '50.00'
    OR (SELECT total FROM public.orders WHERE id=oid)<>50 THEN
    RAISE EXCEPTION 'expected vulnerable baseline not reproducible: %',r;
  END IF;
END $unsafe$;
ROLLBACK;
SELECT 'BASELINE reproduced unsafe R$50 purchase via customer snapshot (rolled back)' result;
