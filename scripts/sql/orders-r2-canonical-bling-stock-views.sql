-- R02+ canonical stock/kit-lock view definitions CAPTURED READ-ONLY FROM LIVE SUPABASE.
-- For PG17 disposable test only. No production migration or data included.
-- basket_locked_component_stock_v1, MD5(pg_get_viewdef) 490f7495fdcf39652a8626fbde23453f
CREATE VIEW public.basket_locked_component_stock_v1 WITH (security_invoker=true) AS
 WITH explicit_reservations AS (
         SELECT r_1.product_id,
            sum(r_1.quantity_reserved) AS qty
           FROM basket_lot_component_reservations r_1
             JOIN basket_stock_lots l ON l.id = r_1.lot_id
          WHERE r_1.status = 'active'::text AND l.assembly_status = 'assembling'::text
          GROUP BY r_1.product_id
        ), available_lots AS (
         SELECT li.product_id,
            sum(li.quantity_per_basket * l.quantity_available::numeric) AS qty
           FROM basket_stock_lots l
             JOIN basket_stock_lot_items li ON li.lot_id = l.id
          WHERE (l.status = ANY (ARRAY['ready'::text, 'depleted'::text])) AND l.quantity_available > 0 AND NOT (EXISTS ( SELECT 1
                   FROM basket_lot_component_reservations r_1
                  WHERE r_1.lot_id = l.id AND r_1.status = 'active'::text))
          GROUP BY li.product_id
        ), active_allocations AS (
         SELECT li.product_id,
            sum(li.quantity_per_basket * a_1.quantity::numeric) AS qty
           FROM basket_stock_allocations a_1
             JOIN basket_stock_lot_items li ON li.lot_id = a_1.lot_id
          WHERE a_1.status = 'allocated'::text
          GROUP BY li.product_id
        )
 SELECT p.id AS product_id,
    COALESCE(r.qty, 0::numeric) + COALESCE(a.qty, 0::numeric) + COALESCE(x.qty, 0::numeric) AS basket_locked_quantity
   FROM products p
     LEFT JOIN explicit_reservations r ON r.product_id = p.id
     LEFT JOIN available_lots a ON a.product_id = p.id
     LEFT JOIN active_allocations x ON x.product_id = p.id
  WHERE (COALESCE(r.qty, 0::numeric) + COALESCE(a.qty, 0::numeric) + COALESCE(x.qty, 0::numeric)) > 0::numeric;;

-- ops2_sellable_stock_v1, MD5(pg_get_viewdef) 73e422fef6282a885e56491bfc6cbcde
CREATE VIEW public.ops2_sellable_stock_v1 WITH (security_invoker=true) AS
 WITH cfg AS (
         SELECT NULLIF(bling_hub_runtime_v2.metadata ->> 'selected_deposit_id'::text, ''::text)::bigint AS selected_deposit_id,
            COALESCE(bling_hub_runtime_v2.metadata ->> 'ops2_stock_authority'::text, 'legacy_shadow'::text) AS stock_authority,
            NULLIF(bling_hub_runtime_v2.metadata ->> 'ops2_stock_cutover_at'::text, ''::text)::timestamp with time zone AS stock_cutover_at
           FROM bling_hub_runtime_v2
          WHERE bling_hub_runtime_v2.id = 1
        ), links AS (
         SELECT bling_hub_entity_links_v2.source_id,
            bling_hub_entity_links_v2.bling_id,
            bling_hub_entity_links_v2.status,
            bling_hub_entity_links_v2.last_verified_at
           FROM bling_hub_entity_links_v2
          WHERE bling_hub_entity_links_v2.source_system = 'vitrine_qx'::text AND bling_hub_entity_links_v2.entity_type = 'product'::text
        )
 SELECT p.id AS product_id,
    p.name,
    p.sku,
    p.gtin,
    p.is_active,
    COALESCE(p.stock, 0::numeric) AS legacy_stock,
    l.bling_id AS bling_product_id,
    l.status AS link_status,
    m.physical_total AS bling_physical_total,
    m.virtual_total AS bling_virtual_total,
    cfg.selected_deposit_id,
        CASE
            WHEN cfg.selected_deposit_id IS NOT NULL AND m.deposit_balances ? cfg.selected_deposit_id::text THEN NULLIF((m.deposit_balances -> cfg.selected_deposit_id::text) ->> 'physical'::text, ''::text)::numeric
            ELSE NULL::numeric
        END AS sellable_physical,
        CASE
            WHEN cfg.selected_deposit_id IS NOT NULL AND m.deposit_balances ? cfg.selected_deposit_id::text THEN GREATEST(0::numeric, COALESCE(NULLIF((m.deposit_balances -> cfg.selected_deposit_id::text) ->> 'virtual'::text, ''::text)::numeric, 0::numeric))
            ELSE NULL::numeric
        END AS sellable_virtual,
    m.observed_at AS mirror_observed_at,
    m.source_event_id,
    m.source_resource,
    cfg.stock_authority,
    cfg.stock_cutover_at,
    p.is_active = true AND l.status = 'matched'::text AND l.bling_id IS NOT NULL AND m.product_id IS NOT NULL AND cfg.selected_deposit_id IS NOT NULL AND m.deposit_balances ? cfg.selected_deposit_id::text AS bling_stock_ready,
        CASE
            WHEN cfg.stock_authority = 'bling'::text THEN
            CASE
                WHEN p.is_active = true AND l.status = 'matched'::text AND l.bling_id IS NOT NULL AND m.product_id IS NOT NULL AND cfg.selected_deposit_id IS NOT NULL AND m.deposit_balances ? cfg.selected_deposit_id::text THEN GREATEST(0::numeric, COALESCE(NULLIF((m.deposit_balances -> cfg.selected_deposit_id::text) ->> 'virtual'::text, ''::text)::numeric, 0::numeric))
                ELSE 0::numeric
            END
            ELSE GREATEST(0::numeric, COALESCE(p.stock, 0::numeric))
        END AS effective_sellable_stock,
        CASE
            WHEN NOT p.is_active THEN 'inactive'::text
            WHEN l.bling_id IS NULL OR l.status IS DISTINCT FROM 'matched'::text THEN 'unlinked'::text
            WHEN m.product_id IS NULL THEN 'mirror_missing'::text
            WHEN cfg.selected_deposit_id IS NULL THEN 'deposit_not_selected'::text
            WHEN NOT m.deposit_balances ? cfg.selected_deposit_id::text THEN 'deposit_balance_missing'::text
            WHEN cfg.stock_authority = 'bling'::text THEN 'bling_virtual'::text
            ELSE 'legacy_shadow'::text
        END AS stock_source_reason
   FROM products p
     CROSS JOIN cfg
     LEFT JOIN links l ON l.source_id = p.id::text
     LEFT JOIN bling_stock_mirror_v2 m ON m.product_id = p.id;;

-- ops2_loose_sellable_stock_v1, MD5(pg_get_viewdef) 8774bfe6396c2f73e4f8fa61f718ff04
CREATE VIEW public.ops2_loose_sellable_stock_v1 WITH (security_invoker=true) AS
 SELECT s.product_id,
    s.name,
    s.sku,
    s.gtin,
    s.is_active,
    s.legacy_stock,
    s.bling_product_id,
    s.link_status,
    s.bling_physical_total,
    s.bling_virtual_total,
    s.selected_deposit_id,
    s.sellable_physical,
    s.sellable_virtual,
    s.mirror_observed_at,
    s.source_event_id,
    s.source_resource,
    s.stock_authority,
    s.stock_cutover_at,
    s.bling_stock_ready,
    s.effective_sellable_stock,
    s.stock_source_reason,
    COALESCE(l.basket_locked_quantity, 0::numeric) AS basket_locked_quantity,
    GREATEST(0::numeric, COALESCE(s.effective_sellable_stock, 0::numeric) - COALESCE(l.basket_locked_quantity, 0::numeric)) AS loose_sellable_stock
   FROM ops2_sellable_stock_v1 s
     LEFT JOIN basket_locked_component_stock_v1 l ON l.product_id = s.product_id;;
