-- R02 checkout minimum fix, DRAFT only, not a production migration.
-- Staged on top of exact canonical checkout base definition exported on
-- 2026-10-09. Do not apply unless the current function hash matches.
-- This deliberately removes the client-provided stock_adjusted_retry
-- exemption: new carts always require R$75. Already-confirmed orders
-- reduced by real missing items are handled by R07, not this RPC.
DO $secure_checkout_minimum$
DECLARE
  original text;
  revised text;
  old_guard constant text :=
    'if v_total<75 and coalesce((v_customer->>''stock_adjusted_retry'')::boolean,false)=false then raise exception ''minimum_order''; end if;';
  safe_guard constant text :=
    'if v_total<75 then raise exception ''minimum_order''; end if;';
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO original
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='create_vitrine_cart_order_v3_base'
   AND pg_get_function_identity_arguments(p.oid)
      LIKE 'p_phone text, p_payment_method text, p_items jsonb%';
 IF original IS NULL THEN
   RAISE EXCEPTION 'checkout_base_not_found';
 END IF;
 IF original LIKE '%'||safe_guard||'%' THEN
   RAISE NOTICE 'secure checkout minimum already applied';
   RETURN;
 END IF;
 IF md5(original)<>'b765301f2dfb833341bf01762749c7e8' THEN
   RAISE EXCEPTION 'checkout_base_changed_needs_new_review';
 END IF;
 revised:=replace(original,old_guard,safe_guard);
 IF revised=original THEN
   RAISE EXCEPTION 'unsafe_minimum_guard_not_found';
 END IF;
 EXECUTE revised;
END $secure_checkout_minimum$;
