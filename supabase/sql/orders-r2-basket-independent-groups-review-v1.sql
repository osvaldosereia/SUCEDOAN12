-- R02: REVIEW-ONLY SQL draft; never execute on production as-is.
-- Patches the REAL canonical v3_base after the separate minimum-R$75 patch.
-- Preserves unchanged food OR hygiene lot when the other group is altered.
-- Both groups may be loosened only when BOTH were actually changed.
DO $basket_independent_groups$
DECLARE original text; revised text;
  unsafe constant text:=
    'if v_food_changed or v_hygiene_changed then
      v_food_changed:=true;
      if v_basket.uses_hygiene_kit then v_hygiene_changed:=true; end if;
    end if;';
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO original
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='create_vitrine_cart_order_v3_base';
 IF original IS NULL THEN RAISE EXCEPTION 'checkout_missing'; END IF;
 IF position(unsafe in original)=0 THEN
   IF position('v_food_changed:=not public.basket_group_preserves_original_lot_v1' in original)>0
     AND position('v_hygiene_changed:=case when v_basket.uses_hygiene_kit' in original)>0
   THEN
     RAISE NOTICE 'independent_basket_group_rule_already_applied';
     RETURN;
   END IF;
   RAISE EXCEPTION 'checkout_basket_rule_changed_needs_review';
 END IF;
 IF md5(original)<>'466896a1e78c4a2ccd102e479987b8d6' THEN
   RAISE EXCEPTION 'checkout_definition_drifted_before_basket_fix';
 END IF;
 -- The original branch force-sets both *_changed to TRUE. Removing it
 -- relies on the per-group canonical basket_group_preserves_original_lot_v1.
 revised:=replace(original,unsafe,'-- Independent kit groups retain their own changed flags.');
 IF revised=original THEN RAISE EXCEPTION 'basket_patch_noop'; END IF;
 EXECUTE revised;
END $basket_independent_groups$;
