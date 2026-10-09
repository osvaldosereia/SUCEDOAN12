-- R02+: READ-ONLY export of live canonical view from Supabase ssbesxgaijknwsjbsbcz.
-- Original view checksum md5(pg_get_viewdef(...,true)): c03e94673e3fb50b27db893e12a0159a.
-- TEST FIXTURE ONLY; NEVER deploy this file to production.
DROP VIEW IF EXISTS public.basket_lot_public_availability_v1;
CREATE VIEW public.basket_lot_public_availability_v1 AS
 WITH component_health AS (
         SELECT l.id AS lot_id,
            COALESCE(bool_and(li.id IS NOT NULL AND COALESCE(p.is_active, false) AND COALESCE(s.effective_sellable_stock, 0::numeric) > 0::numeric), false) AS components_in_stock
           FROM basket_stock_lots l
             LEFT JOIN basket_stock_lot_items li ON li.lot_id = l.id
             LEFT JOIN products p ON p.id = li.product_id
             LEFT JOIN ops2_sellable_stock_v1 s ON s.product_id = li.product_id
          GROUP BY l.id
        ), lot_model AS (
         SELECT l.id,
            l.basket_id,
            l.lot_code,
            l.status,
            l.quantity_built,
            l.quantity_available,
            l.composition_hash,
            l.built_at,
            l.built_by,
            l.notes,
            l.source,
            l.metadata,
            l.created_at,
            l.updated_at,
            l.kit_template_id,
            l.lot_kind,
            l.short_code,
            l.duplicated_from_lot_id,
            l.quantity_dismantled,
            l.sale_enabled,
            l.sale_price_override,
            l.component_sum_snapshot,
            l.hidden_adjustment_snapshot,
            l.public_name,
            l.linked_hygiene_lot_id,
            l.business_type,
            l.linked_lot_id,
            l.own_sale_price_override,
            l.own_component_sum_snapshot,
            l.own_hidden_adjustment_snapshot,
            l.own_cost_sum_snapshot,
            l.cost_sum_snapshot,
            l.assembly_status,
            COALESCE(l.linked_lot_id, l.linked_hygiene_lot_id) AS canonical_linked_lot_id,
                CASE
                    WHEN l.basket_id IS NOT NULL THEN COALESCE(bt.is_active, false)
                    ELSE COALESCE(kt.is_active, false)
                END AS model_active,
                CASE
                    WHEN l.basket_id IS NOT NULL THEN bt.category_id
                    ELSE kt.category_id
                END AS category_id,
            COALESCE(ch.components_in_stock, false) AS components_in_stock
           FROM basket_stock_lots l
             LEFT JOIN basket_templates bt ON bt.id = l.basket_id
             LEFT JOIN basket_kit_templates kt ON kt.id = l.kit_template_id
             LEFT JOIN component_health ch ON ch.lot_id = l.id
        ), base AS (
         SELECT l.id,
            l.basket_id,
            l.lot_code,
            l.status,
            l.quantity_built,
            l.quantity_available,
            l.composition_hash,
            l.built_at,
            l.built_by,
            l.notes,
            l.source,
            l.metadata,
            l.created_at,
            l.updated_at,
            l.kit_template_id,
            l.lot_kind,
            l.short_code,
            l.duplicated_from_lot_id,
            l.quantity_dismantled,
            l.sale_enabled,
            l.sale_price_override,
            l.component_sum_snapshot,
            l.hidden_adjustment_snapshot,
            l.public_name,
            l.linked_hygiene_lot_id,
            l.business_type,
            l.linked_lot_id,
            l.own_sale_price_override,
            l.own_component_sum_snapshot,
            l.own_hidden_adjustment_snapshot,
            l.own_cost_sum_snapshot,
            l.cost_sum_snapshot,
            l.assembly_status,
            l.canonical_linked_lot_id,
            l.model_active,
            l.category_id,
            l.components_in_stock,
            COALESCE(c.is_active, false) AS category_active,
                CASE
                    WHEN l.assembly_status = 'assembling'::text THEN 'assembling'::text
                    WHEN l.status = 'draft'::text THEN 'draft'::text
                    WHEN (l.status = ANY (ARRAY['depleted'::text, 'cancelled'::text])) OR COALESCE(l.quantity_available, 0) <= 0 THEN 'depleted'::text
                    WHEN NOT l.model_active THEN 'model_inactive'::text
                    WHEN l.category_id IS NULL OR NOT COALESCE(c.is_active, false) THEN 'category_inactive'::text
                    WHEN l.status <> 'ready'::text THEN 'depleted'::text
                    WHEN NOT COALESCE(l.sale_enabled, false) THEN 'paused'::text
                    WHEN NOT l.components_in_stock THEN 'component_out_of_stock'::text
                    ELSE 'available'::text
                END AS base_reason,
                CASE
                    WHEN l.status = 'ready'::text AND (l.assembly_status = ANY (ARRAY['legacy'::text, 'mounted'::text])) AND COALESCE(l.sale_enabled, false) AND COALESCE(l.quantity_available, 0) > 0 AND l.model_active AND l.category_id IS NOT NULL AND COALESCE(c.is_active, false) AND l.components_in_stock THEN l.quantity_available
                    ELSE 0
                END AS own_available
           FROM lot_model l
             LEFT JOIN basket_categories c ON c.id = l.category_id
        )
 SELECT b.id AS lot_id,
    b.basket_id,
    b.kit_template_id,
    b.lot_kind,
    b.short_code,
    b.lot_code,
    b.status,
    b.quantity_built,
    b.quantity_available,
    b.sale_enabled,
    b.public_name,
    b.sale_price_override,
    b.own_sale_price_override,
    b.canonical_linked_lot_id AS linked_lot_id,
    b.business_type,
    b.built_at,
    b.created_at,
    b.category_id,
    b.model_active,
    b.category_active,
    b.components_in_stock,
        CASE
            WHEN b.canonical_linked_lot_id IS NULL THEN NULL::integer
            ELSE COALESCE(x.own_available, 0)
        END AS linked_available,
        CASE
            WHEN b.base_reason <> 'available'::text THEN 0
            WHEN b.canonical_linked_lot_id IS NULL THEN b.own_available
            WHEN x.id IS NULL OR x.base_reason <> 'available'::text OR x.canonical_linked_lot_id IS NOT NULL THEN 0
            ELSE LEAST(b.own_available, x.own_available)
        END AS public_available,
        CASE
            WHEN b.base_reason <> 'available'::text THEN b.base_reason
            WHEN b.canonical_linked_lot_id IS NOT NULL AND (x.id IS NULL OR x.base_reason <> 'available'::text OR x.canonical_linked_lot_id IS NOT NULL) THEN 'linked_lot_unavailable'::text
            ELSE 'available'::text
        END AS availability_reason
   FROM base b
     LEFT JOIN base x ON x.id = b.canonical_linked_lot_id;;
