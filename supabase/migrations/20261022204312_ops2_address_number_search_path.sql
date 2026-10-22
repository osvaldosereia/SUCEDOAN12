-- Pin the lookup path of the two trigger functions and their pure parser.
-- Function bodies, owners, grants, trigger bindings, and rows remain unchanged.
--
-- ROLLBACK:
-- ALTER FUNCTION public.ops2_extract_address_number_v1(text) RESET search_path;
-- ALTER FUNCTION public.ops2_customer_address_number_fill_v1() RESET search_path;
-- ALTER FUNCTION public.ops2_order_delivery_number_fill_v1() RESET search_path;

DO $$
BEGIN
  IF to_regprocedure('public.ops2_extract_address_number_v1(text)') IS NULL
     OR to_regprocedure('public.ops2_customer_address_number_fill_v1()') IS NULL
     OR to_regprocedure('public.ops2_order_delivery_number_fill_v1()') IS NULL THEN
    RAISE EXCEPTION 'OPS2 address-number functions are missing; refusing to alter an unexpected schema';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid IN (
      to_regprocedure('public.ops2_extract_address_number_v1(text)'),
      to_regprocedure('public.ops2_customer_address_number_fill_v1()'),
      to_regprocedure('public.ops2_order_delivery_number_fill_v1()')
    )
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'OPS2 address-number functions are no longer SECURITY INVOKER; review access before altering';
  END IF;
END;
$$;

ALTER FUNCTION public.ops2_extract_address_number_v1(text) SET search_path = '';
ALTER FUNCTION public.ops2_customer_address_number_fill_v1() SET search_path = '';
ALTER FUNCTION public.ops2_order_delivery_number_fill_v1() SET search_path = '';
