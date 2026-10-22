-- This helper only reports whether auth.uid() is an active administrator.
-- Administrative basket-lot RPCs call it from their SECURITY DEFINER context;
-- browser sessions should not expose the helper itself as a standalone RPC.
-- Rollback: GRANT EXECUTE ON FUNCTION public.basket_lot_admin_allowed_v1() TO authenticated;

DO $migration$
DECLARE
  v_helper_oid oid;
  v_helper_definition text;
  v_helper_owner name;
  v_helper_is_definer boolean;
  v_helper_settings text[];
  v_guarded_wrappers integer;
BEGIN
  SELECT p.oid,
         pg_catalog.pg_get_functiondef(p.oid),
         pg_catalog.pg_get_userbyid(p.proowner),
         p.prosecdef,
         p.proconfig
    INTO v_helper_oid,
         v_helper_definition,
         v_helper_owner,
         v_helper_is_definer,
         v_helper_settings
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'public.basket_lot_admin_allowed_v1()'::pg_catalog.regprocedure;

  IF v_helper_oid IS NULL THEN
    RAISE EXCEPTION 'basket_lot_admin_allowed_v1 is missing';
  END IF;
  IF v_helper_owner <> 'postgres' OR v_helper_is_definer IS NOT TRUE THEN
    RAISE EXCEPTION 'basket-lot helper privilege contract changed';
  END IF;
  IF pg_catalog.strpos(v_helper_definition, 'auth.uid()') = 0
     OR pg_catalog.strpos(v_helper_definition, 'public.admin_users') = 0
     OR pg_catalog.strpos(v_helper_definition, 'is_active') = 0 THEN
    RAISE EXCEPTION 'basket-lot helper no longer checks active administrator membership';
  END IF;
  IF NOT coalesce(v_helper_settings @> ARRAY['search_path=""']::text[], false) THEN
    RAISE EXCEPTION 'basket-lot helper must keep an empty search_path';
  END IF;

  SELECT count(*)
    INTO v_guarded_wrappers
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'basket_lot_substitution_catalog_admin_v1',
      'basket_lot_substitution_family_save_admin_v1'
    )
    AND p.prosecdef IS TRUE
    AND pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid), 'basket_lot_admin_allowed_v1') > 0
    AND pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF v_guarded_wrappers <> 2 THEN
    RAISE EXCEPTION 'expected both guarded basket substitution RPCs to remain callable by authenticated admins';
  END IF;
END;
$migration$;

REVOKE EXECUTE ON FUNCTION public.basket_lot_admin_allowed_v1() FROM authenticated;
