DO $migration$
DECLARE
  v_view text;
  v_view_updated text;
  v_proc oid;
  v_pattern text;
  v_replacement text;
  v_definition text;
  v_updated text;
BEGIN
  PERFORM set_config('check_function_bodies', 'off', true);
  v_view := pg_get_viewdef('public.storefront_ean_sellable_stock_v1'::regclass, true);
  v_view_updated := replace(
    v_view,
    'p.is_active IS NOT TRUE OR p.is_whatsapp_active IS NOT TRUE OR',
    'p.is_active IS NOT TRUE OR'
  );
  IF v_view_updated = v_view THEN
    RAISE EXCEPTION 'storefront_ean_sellable_stock_v1 WhatsApp product gate not found';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.storefront_ean_sellable_stock_v1 AS ' || v_view_updated;

  FOR v_proc, v_pattern, v_replacement IN
    SELECT patch.proc, patch.pattern, patch.replacement
    FROM (VALUES
      ('public.get_whatsapp_sellable_product_v1(uuid)'::regprocedure::oid,
        '\s+and\s+p\.is_whatsapp_active\s*=\s*true', ''),
      ('public.get_whatsapp_sellable_product_v1(uuid)'::regprocedure::oid,
        '\s+and\s+p\.physically_verified\s*=\s*true', ''),
      ('public.get_cart_aware_recommendations(uuid,integer,text)'::regprocedure::oid,
        'p\.physically_verified\s*=\s*true\s+and\s+', ''),
      ('public.get_cart_aware_recommendations(uuid,integer,text)'::regprocedure::oid,
        '\s+and\s+p\.is_whatsapp_active\s*=\s*true', ''),
      ('public.set_cart_addon_quantity(uuid,uuid,numeric)'::regprocedure::oid,
        '\s+and\s+physically_verified\s*=\s*true', ''),
      ('public.set_cart_addon_quantity(uuid,uuid,numeric)'::regprocedure::oid,
        '\s+and\s+is_whatsapp_active\s*=\s*true', ''),
      ('whatsapp_ordering_private.catalog_quote_v1(uuid,text,jsonb)'::regprocedure::oid,
        '\s+and\s+product\.is_whatsapp_active\s+is\s+true', ''),
      ('public.meta_catalog_product_link_admin_save_v1(uuid,text,text,uuid,uuid)'::regprocedure::oid,
        '\s+and\s+p\.is_whatsapp_active\s*=\s*true', ''),
      ('public.meta_catalog_product_links_activate_batch_v1(uuid,text,text,jsonb)'::regprocedure::oid,
        '\s+and\s+p\.is_whatsapp_active\s*=\s*true', ''),
      ('public.meta_catalog_product_links_admin_list_v1(integer,text,uuid)'::regprocedure::oid,
        '\s+and\s+p\.is_whatsapp_active\s+then\s+0', ' then 0'),
      ('public.meta_catalog_product_links_admin_list_v1(integer,text,uuid)'::regprocedure::oid,
        '''product_eligible'',\s*p\.is_active\s+and\s+p\.is_whatsapp_active', '''product_eligible'', p.is_active'),
      ('public.meta_catalog_product_links_verification_candidates_v1(uuid,text,timestamptz,uuid)'::regprocedure::oid,
        '\s+and\s+p\.is_whatsapp_active\s*=\s*true', ''),
      ('public.site_admin_save_basket_grid_with_prices_v1(jsonb,jsonb,text)'::regprocedure::oid,
        '\s+AND\s+product\.is_whatsapp_active\s+IS\s+TRUE', ''),
      ('public.whatsapp_flow_session_open_v1(uuid,text,text,text,text,uuid,uuid,text,text,jsonb,uuid,uuid)'::regprocedure::oid,
        '\s+and\s+p\.is_whatsapp_active', ''),
      ('public.enforce_zero_stock_inactive()'::regprocedure::oid,
        '\s*new\.is_whatsapp_active\s*:=\s*false\s*;', ''),
      ('public.site_admin_save_basket_grid_v1(jsonb,text)'::regprocedure::oid,
        '\s*-- A single unavailable choice must remain active while it is part of an active site basket\.\s*UPDATE public\.products product[^;]*;\s*', ''),
      ('public.site_admin_save_basket_grid_v1(jsonb,text)'::regprocedure::oid,
        '\s*UPDATE public\.products product\s+SET is_active = false[^;]*;\s*', '')
    ) AS patch(proc, pattern, replacement)
  LOOP
    v_definition := pg_get_functiondef(v_proc);
    v_updated := regexp_replace(v_definition, v_pattern, v_replacement, 'gi');
    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'Product availability patch did not match function %, pattern %', v_proc::regprocedure, v_pattern;
    END IF;
    EXECUTE v_updated;
  END LOOP;

  DROP FUNCTION IF EXISTS public.admin_product_whatsapp_availability_v1(uuid,uuid,boolean,boolean);
END
$migration$;