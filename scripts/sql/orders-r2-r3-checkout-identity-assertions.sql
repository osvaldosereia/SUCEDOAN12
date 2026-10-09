-- Synthetic cross-chain regression: REAL checkout base + R03 weekly identities.
-- Runs after R02 basket tests complete (they make multiple completed carts).
\set ON_ERROR_STOP on
DO $weekly_checkout$
DECLARE n integer; bad integer; today text;
BEGIN
 SELECT count(*) INTO n FROM public.orders WHERE source='vitrine';
 IF n<6 THEN RAISE EXCEPTION 'R02 basket path not exercised, count %',n; END IF;
 today:=to_char((clock_timestamp() AT TIME ZONE 'America/Cuiaba')::date,'DD|MM|YYYY');
 SELECT count(*) INTO bad FROM public.orders o
 LEFT JOIN public.order_public_snapshots_v1 s ON s.order_id=o.id
 WHERE o.source='vitrine'
 AND (o.order_number NOT LIKE today||' - ___'
   OR s.public_code IS DISTINCT FROM o.order_number
   OR s.snapshot='{}'::jsonb
   OR (s.snapshot->>'item_count')::integer IS DISTINCT FROM
      (SELECT count(*)::integer FROM public.order_items i WHERE i.order_id=o.id));
 IF bad<>0 THEN
   RAISE EXCEPTION 'R02 checkout and R03 identity diverged (% of % orders)',bad,n;
 END IF;
 IF (SELECT count(distinct o.order_number) FROM public.orders o
     WHERE o.source='vitrine')<>n THEN
   RAISE EXCEPTION 'duplicate public weekly numbers across kits/molds'; END IF;

 BEGIN
  UPDATE public.orders SET order_number='01|01|2026 - 999'
   WHERE id=(SELECT id FROM public.orders WHERE source='vitrine' LIMIT 1);
  RAISE EXCEPTION 'order public code unexpectedly mutable';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IS DISTINCT FROM 'order_public_identity_immutable' THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE public.order_public_snapshots_v1 SET public_code='AA001'
    WHERE order_id=(SELECT id FROM public.orders WHERE source='vitrine' LIMIT 1);
  RAISE EXCEPTION 'snapshot code unexpectedly mutable';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IS DISTINCT FROM 'order_public_identity_immutable' THEN RAISE; END IF;
 END;
END $weekly_checkout$;

-- Imported Bling orders are NOT customer orders; the public weekly allocator
-- should not be spent on these. No public snapshot until one is needed.
INSERT INTO public.orders(id,source,order_number)
 VALUES('00000000-0000-4000-8000-0000000000f7','bling_import',NULL);
DO $verify_import$
BEGIN
 IF (SELECT order_number FROM public.orders
  WHERE id='00000000-0000-4000-8000-0000000000f7') IS NOT NULL
  OR EXISTS(SELECT 1 FROM public.order_public_snapshots_v1
    WHERE order_id='00000000-0000-4000-8000-0000000000f7')
 THEN RAISE EXCEPTION 'Bling import incorrectly consumed new customer number'; END IF;
END $verify_import$;

-- Customer-supplied code is overwritten BEFORE INSERT, and cannot poison
-- the Meta/Bl ing cross-system identifier.
INSERT INTO public.orders(id,source,order_number)
 VALUES('00000000-0000-4000-8000-0000000000f8',
    'manual_whatsapp','01|01|1900 - 999');
DO $verify_spoof$
DECLARE v text; s text;
BEGIN
 SELECT order_number INTO v FROM public.orders
 WHERE id='00000000-0000-4000-8000-0000000000f8';
 SELECT public_code INTO s FROM public.order_public_snapshots_v1
 WHERE order_id='00000000-0000-4000-8000-0000000000f8';
 IF v IS NULL OR v='01|01|1900 - 999' OR v IS DISTINCT FROM s
   OR v NOT LIKE to_char((clock_timestamp() AT TIME ZONE 'America/Cuiaba')::date,'DD|MM|YYYY')||' - ___'
 THEN RAISE EXCEPTION 'manual number spoof was accepted, number %, snapshot %',v,s; END IF;
END $verify_spoof$;
SELECT 'PASS: real checkout, split kits, molds, Meta/Bl ing public code, snapshots, immutability, imports' AS result;
