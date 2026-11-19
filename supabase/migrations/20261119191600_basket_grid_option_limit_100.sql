-- Raise the product option cap for a basket type from 40 to 100.
-- Existing assignments and quantities remain unchanged.
DO $migration$
DECLARE
  v_definition text;
  v_old text := 'jsonb_array_length(v_options) > 40';
  v_new text := 'jsonb_array_length(v_options) > 100';
  v_replaced text;
BEGIN
  v_definition := pg_get_functiondef('public.site_admin_save_basket_grid_v1(jsonb,text)'::regprocedure);
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'site_admin_save_basket_grid_v1_option_limit_not_found';
  END IF;

  v_replaced := replace(v_definition, v_old, v_new);
  IF position(v_new IN v_replaced) = 0 THEN
    RAISE EXCEPTION 'site_admin_save_basket_grid_v1_option_limit_not_updated';
  END IF;

  EXECUTE v_replaced;
END
$migration$;
