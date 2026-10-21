-- Source of truth for EAN-scanned physical stock on the public storefront only.
-- The global Bling stock authority and its operational inventory views are unchanged.
-- Local reservations are deducted once, and consumed orders are deducted only
-- if they consumed stock AFTER the physical EAN count was recorded.

CREATE OR REPLACE VIEW public.storefront_ean_sellable_stock_v1
WITH (security_invoker = true) AS
SELECT
  s.*,
  CASE
    WHEN e.id IS NULL THEN NULL::numeric
    WHEN p.is_active IS NOT TRUE OR p.is_whatsapp_active IS NOT TRUE
      OR COALESCE(p.price,0)<=0 OR COALESCE(p.stock,0)<=0
      OR (p.validity_date IS NOT NULL AND p.validity_date<CURRENT_DATE)
      OR (e.expires_on IS NOT NULL AND e.expires_on<CURRENT_DATE)
      OR COALESCE(e.quantity,0)<=0
    THEN 0::numeric
    ELSE GREATEST(
      0::numeric,
      FLOOR(LEAST(e.quantity, p.stock))
        - COALESCE(s.basket_locked_quantity,0)
        - COALESCE(res.pending_or_consumed,0)
    )
  END AS ean_sellable_stock
FROM public.ops2_loose_sellable_stock_v1 s
JOIN public.products p ON p.id=s.product_id
LEFT JOIN LATERAL (
  SELECT c.id,c.quantity,c.created_at,c.expires_on
  FROM public.ean_capture_records_v1 c
  WHERE c.matched_product_id=s.product_id AND c.sync_status='found'
  ORDER BY c.created_at DESC,c.id DESC
  LIMIT 1
) e ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(r.quantity),0)::numeric AS pending_or_consumed
  FROM public.vitrine_stock_reservations r
  WHERE r.product_id=s.product_id AND (
    (r.status IN ('reserved','allocated') AND (r.expires_at IS NULL OR r.expires_at>NOW()))
    OR (r.status='consumed' AND COALESCE(r.consumed_at,r.updated_at,r.created_at)>e.created_at)
  )
) res ON e.id IS NOT NULL;

REVOKE ALL ON public.storefront_ean_sellable_stock_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.storefront_ean_sellable_stock_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.basket_component_fresh_sellable_stock_v1(p_product_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT GREATEST(0,
    CASE
      WHEN s.ean_sellable_stock IS NOT NULL THEN s.ean_sellable_stock
      WHEN s.is_active=true THEN COALESCE(s.loose_sellable_stock,0)
      WHEN s.stock_authority='bling'
        AND s.link_status='matched'
        AND s.bling_product_id IS NOT NULL
        AND s.selected_deposit_id IS NOT NULL
        AND s.sellable_virtual IS NOT NULL
        AND s.mirror_observed_at > NOW()-INTERVAL '48 hours'
        AND s.mirror_observed_at <= NOW()+INTERVAL '5 minutes'
      THEN COALESCE(s.sellable_virtual,0)-COALESCE(s.basket_locked_quantity,0)
      ELSE 0
    END
  )
  FROM public.storefront_ean_sellable_stock_v1 s
  WHERE s.product_id=p_product_id
    AND (
      s.ean_sellable_stock IS NOT NULL
      OR (s.is_active=true AND (s.stock_authority<>'bling' OR s.bling_stock_ready=true))
      OR (s.is_active=false AND s.stock_authority='bling'
        AND s.link_status='matched'
        AND s.bling_product_id IS NOT NULL
        AND s.selected_deposit_id IS NOT NULL
        AND s.sellable_virtual IS NOT NULL
        AND s.mirror_observed_at > NOW()-INTERVAL '48 hours'
        AND s.mirror_observed_at <= NOW()+INTERVAL '5 minutes')
    );
$function$;
REVOKE ALL ON FUNCTION public.basket_component_fresh_sellable_stock_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.basket_component_fresh_sellable_stock_v1(uuid) TO service_role;

-- The checkout's original SQL was already patched in several migrations.
-- Preserve that implementation verbatim, substituting ONLY the saleable stock read.
DO $patch$
DECLARE
  v_target regprocedure:='public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure;
  v_def text;
BEGIN
  SELECT pg_get_functiondef(v_target) INTO v_def;
  IF (length(v_def)-length(replace(v_def,'from public.ops2_loose_sellable_stock_v1','')))/length('from public.ops2_loose_sellable_stock_v1')<>4
    OR (length(v_def)-length(replace(v_def,'select loose_sellable_stock into','')))/length('select loose_sellable_stock into')<>2
    OR (length(v_def)-length(replace(v_def,'select coalesce(loose_sellable_stock,0) into','')))/length('select coalesce(loose_sellable_stock,0) into')<>2
  THEN RAISE EXCEPTION 'ean_stock_checkout_patch_anchor_mismatch'; END IF;
  v_def:=replace(v_def,'from public.ops2_loose_sellable_stock_v1',
    'from public.storefront_ean_sellable_stock_v1');
  v_def:=replace(v_def,'select loose_sellable_stock into',
    'select coalesce(ean_sellable_stock,loose_sellable_stock) into');
  v_def:=replace(v_def,'select coalesce(loose_sellable_stock,0) into',
    'select coalesce(ean_sellable_stock,loose_sellable_stock,0) into');
  EXECUTE v_def;
END;
$patch$;

-- The reservation must NOT subtract active orders a second time for EAN
-- because the EAN saleable quantity in the storefront view is already net.
DO $patch$
DECLARE
  v_target regprocedure:='public.reserve_vitrine_order_stock_v1(uuid)'::regprocedure;
  v_def text;
  v_old text:='    if v_authority=''bling'' then';
  v_new text:=$replacement$
    select ean_sellable_stock into v_effective
    from public.storefront_ean_sellable_stock_v1
    where product_id=r.product_id;
    if v_effective is not null then
      v_available:=greatest(0,v_effective);
    elsif v_authority='bling' then$replacement$;
BEGIN
  SELECT pg_get_functiondef(v_target) INTO v_def;
  IF (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1
  THEN RAISE EXCEPTION 'ean_stock_reservation_patch_anchor_mismatch'; END IF;
  EXECUTE replace(v_def,v_old,v_new);
END;
$patch$;

NOTIFY pgrst,'reload schema';
