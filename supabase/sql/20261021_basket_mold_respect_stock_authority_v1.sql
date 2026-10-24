-- Dynamic baskets must use the active inventory authority. EAN snapshots only
-- override stock when Bling is not the configured source of truth.
CREATE OR REPLACE FUNCTION public.basket_component_fresh_sellable_stock_v1(p_product_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT GREATEST(0,
    CASE
      WHEN s.stock_authority='bling' THEN
        CASE
          WHEN s.is_active=true AND s.bling_stock_ready=true
            THEN COALESCE(s.loose_sellable_stock,0)
          WHEN s.is_active=false
            AND s.link_status='matched'
            AND s.bling_product_id IS NOT NULL
            AND s.selected_deposit_id IS NOT NULL
            AND s.sellable_virtual IS NOT NULL
            AND s.mirror_observed_at > NOW()-INTERVAL '48 hours'
            AND s.mirror_observed_at <= NOW()+INTERVAL '5 minutes'
            THEN COALESCE(s.sellable_virtual,0)-COALESCE(s.basket_locked_quantity,0)
          ELSE 0
        END
      WHEN s.ean_sellable_stock IS NOT NULL THEN s.ean_sellable_stock
      WHEN s.is_active=true THEN COALESCE(s.loose_sellable_stock,0)
      ELSE 0
    END
  )
  FROM public.storefront_ean_sellable_stock_v1 s
  WHERE s.product_id=p_product_id
    AND (
      (s.stock_authority='bling' AND (
        (s.is_active=true AND s.bling_stock_ready=true)
        OR (s.is_active=false
          AND s.link_status='matched'
          AND s.bling_product_id IS NOT NULL
          AND s.selected_deposit_id IS NOT NULL
          AND s.sellable_virtual IS NOT NULL
          AND s.mirror_observed_at > NOW()-INTERVAL '48 hours'
          AND s.mirror_observed_at <= NOW()+INTERVAL '5 minutes')
      ))
      OR (s.stock_authority IS DISTINCT FROM 'bling' AND s.ean_sellable_stock IS NOT NULL)
      OR (s.is_active=true AND s.stock_authority IS DISTINCT FROM 'bling')
    );
$function$;

REVOKE ALL ON FUNCTION public.basket_component_fresh_sellable_stock_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.basket_component_fresh_sellable_stock_v1(uuid) TO service_role;

-- Keep checkout and reservation checks on the same configured stock source.
DO $patch$
DECLARE
  v_target regprocedure:='public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure;
  v_def text;
  v_old_regular text:=$old$select coalesce(ean_sellable_stock,loose_sellable_stock) into v_existing_stock$old$;
  v_old_default text:=$old$select coalesce(ean_sellable_stock,loose_sellable_stock,0) into v_existing_stock$old$;
  v_new_regular text:=$new$select case when stock_authority='bling' then loose_sellable_stock else coalesce(ean_sellable_stock,loose_sellable_stock) end into v_existing_stock$new$;
  v_new_default text:=$new$select case when stock_authority='bling' then loose_sellable_stock else coalesce(ean_sellable_stock,loose_sellable_stock,0) end into v_existing_stock$new$;
BEGIN
  SELECT pg_get_functiondef(v_target) INTO v_def;
  IF (length(v_def)-length(replace(v_def,v_old_regular,'')))/length(v_old_regular)<>2
    OR (length(v_def)-length(replace(v_def,v_old_default,'')))/length(v_old_default)<>2
  THEN RAISE EXCEPTION 'basket_stock_authority_checkout_patch_anchor_mismatch'; END IF;
  v_def:=replace(v_def,v_old_regular,v_new_regular);
  v_def:=replace(v_def,v_old_default,v_new_default);
  EXECUTE v_def;
END;
$patch$;

DO $patch$
DECLARE
  v_target regprocedure:='public.reserve_vitrine_order_stock_v1(uuid)'::regprocedure;
  v_def text;
  v_old text:=$old$select ean_sellable_stock into v_effective$old$;
  v_new text:=$new$select case when v_authority='bling' then null::numeric else ean_sellable_stock end into v_effective$new$;
BEGIN
  SELECT pg_get_functiondef(v_target) INTO v_def;
  IF (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1
  THEN RAISE EXCEPTION 'basket_stock_authority_reservation_patch_anchor_mismatch'; END IF;
  EXECUTE replace(v_def,v_old,v_new);
END;
$patch$;

NOTIFY pgrst,'reload schema';
