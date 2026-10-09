-- R02+: REVIEW-ONLY SQL. NOT a production migration.
-- Mounted/legacy kits have already been assembled into separate physical
-- stock, tracked by lot.quantity_available. Their loose component stock can
-- legitimately be zero. Still validate that component items exist and their
-- catalog products are active. Other lot statuses remain governed by the
-- unchanged canonical availability clauses.
--
-- Original live view MD5: c03e94673e3fb50b27db893e12a0159a
DO $safe_mounted_lot_check$
DECLARE
  original text;
  revised text;
  old_component_test constant text :=
    'COALESCE(s.effective_sellable_stock, 0::numeric) > 0::numeric';
  new_component_test constant text :=
    '(l.assembly_status = ANY (ARRAY[''mounted''::text, ''legacy''::text]) OR COALESCE(s.effective_sellable_stock, 0::numeric) > 0::numeric)';
BEGIN
  SELECT pg_get_viewdef(c.oid,true) INTO original
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='basket_lot_public_availability_v1'
    AND c.relkind='v';
  IF original IS NULL THEN RAISE EXCEPTION 'canonical_lot_view_not_found'; END IF;
  -- The uniquely ordered mounted/legacy marker cannot occur in the original
  -- view. It distinguishes repeated deployment from a modified source.
  IF position('l.assembly_status = ANY (ARRAY[''mounted''::text, ''legacy''::text])' in original)>0
  THEN
    RAISE NOTICE 'mounted_lot_availability_rule_already_applied';
    RETURN;
  END IF;
  IF md5(original)<>'c03e94673e3fb50b27db893e12a0159a' THEN
    RAISE EXCEPTION 'canonical_lot_view_drift_requires_review';
  END IF;
  revised:=replace(original,old_component_test,new_component_test);
  IF revised=original OR
     (length(original)-length(replace(original,old_component_test,'')))
       <>length(old_component_test)
  THEN RAISE EXCEPTION 'expected_one_component_stock_check_not_found'; END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.basket_lot_public_availability_v1 AS '||revised;
END $safe_mounted_lot_check$;
