CREATE TEMP TABLE pg_temp._basket_grid_canonical_sessions AS
SELECT session_id,
       (array_agg(id ORDER BY slot_order,sort_order,id))[1] AS canonical_type_id,
       (array_agg(title ORDER BY slot_order,sort_order,id))[1] AS title,
       min(sort_order) AS sort_order
FROM public.site_basket_product_types
GROUP BY session_id;

CREATE TEMP TABLE pg_temp._basket_grid_session_map AS
SELECT product_type.id AS old_type_id,product_type.session_id,
       canonical.canonical_type_id,canonical.title,canonical.sort_order AS canonical_sort_order,
       product_type.slot_order,product_type.sort_order AS type_sort_order
FROM public.site_basket_product_types product_type
JOIN pg_temp._basket_grid_canonical_sessions canonical USING(session_id);

CREATE TEMP TABLE pg_temp._basket_grid_merged_options AS
WITH first_occurrence AS (
  SELECT DISTINCT ON (mapping.canonical_type_id,option_row.product_id)
         mapping.canonical_type_id,option_row.product_id,mapping.slot_order,
         mapping.type_sort_order,option_row.sort_order AS option_sort_order,
         (coalesce(option_row.metadata,'{}'::jsonb)
           - 'preferred' - 'base_quantity' - 'quantities' - 'basket_quantities') AS metadata
  FROM pg_temp._basket_grid_session_map mapping
  JOIN public.site_basket_product_type_options option_row
    ON option_row.product_type_id=mapping.old_type_id
  ORDER BY mapping.canonical_type_id,option_row.product_id,
           mapping.slot_order,mapping.type_sort_order,option_row.sort_order
)
SELECT canonical_type_id AS product_type_id,product_id,
       (row_number() OVER (
          PARTITION BY canonical_type_id
          ORDER BY slot_order,type_sort_order,option_sort_order,product_id
        )-1)::integer AS sort_order,
       metadata
FROM first_occurrence;

CREATE TEMP TABLE pg_temp._basket_grid_target_baskets AS
SELECT basket.id AS basket_id,mold.id AS mold_id
FROM public.basket_templates basket
JOIN public.basket_categories category ON category.id=basket.category_id
JOIN public.basket_molds mold ON mold.basket_id=basket.id
WHERE category.slug='cestas-completas'
  AND (basket.is_active IS TRUE OR mold.metadata @> '{"site_admin_basket_grid_draft":true}'::jsonb);

CREATE TEMP TABLE pg_temp._basket_grid_position_map AS
SELECT position.id AS position_id,position.mold_id,target.basket_id,
       mapping.old_type_id,mapping.canonical_type_id,mapping.session_id,
       mapping.title,mapping.canonical_sort_order,position.quantity AS old_quantity,
       position.metadata AS position_metadata,
       row_number() OVER (
         PARTITION BY position.mold_id,mapping.canonical_type_id
         ORDER BY (mapping.old_type_id=mapping.canonical_type_id) DESC,
                  mapping.slot_order,position.sort_order,position.id
       ) AS position_rank
FROM pg_temp._basket_grid_target_baskets target
JOIN public.basket_mold_positions position ON position.mold_id=target.mold_id
JOIN pg_temp._basket_grid_session_map mapping
  ON mapping.old_type_id=nullif(position.metadata->>'site_basket_product_type_id','')::uuid;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.site_basket_product_types
    GROUP BY session_id
    HAVING count(DISTINCT title)<>1
  ) THEN RAISE EXCEPTION 'basket_quantity_migration_session_titles_conflict'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_temp._basket_grid_target_baskets target
    JOIN public.basket_mold_positions position ON position.mold_id=target.mold_id
    LEFT JOIN pg_temp._basket_grid_position_map mapped ON mapped.position_id=position.id
    WHERE mapped.position_id IS NULL
  ) THEN RAISE EXCEPTION 'basket_quantity_migration_unmapped_position'; END IF;

  IF EXISTS (
    SELECT basket_id,old_type_id
    FROM pg_temp._basket_grid_position_map
    GROUP BY basket_id,old_type_id
    HAVING count(*)<>1
  ) THEN RAISE EXCEPTION 'basket_quantity_migration_duplicate_position'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_temp._basket_grid_position_map
    WHERE old_quantity<>trunc(old_quantity) OR old_quantity<0 OR old_quantity>999
  ) THEN RAISE EXCEPTION 'basket_quantity_migration_invalid_position_quantity'; END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp._basket_grid_position_map mapped
    JOIN public.basket_mold_position_options option_row ON option_row.position_id=mapped.position_id
    WHERE option_row.metadata ? 'base_quantity'
      AND (
        option_row.metadata->>'base_quantity' IS NULL
        OR CASE
          WHEN option_row.metadata->>'base_quantity' ~ '^[0-9]+$'
            THEN (option_row.metadata->>'base_quantity')::numeric>999
          ELSE true
        END
      )
  ) THEN RAISE EXCEPTION 'basket_quantity_migration_invalid_option_quantity'; END IF;
END
$migration$;

CREATE TEMP TABLE pg_temp._basket_grid_base_quantities AS
WITH ranked_options AS (
  SELECT mapped.canonical_type_id,mapped.basket_id,mapped.position_id,mapped.old_quantity,
         option_row.product_id,option_row.sort_order,option_row.metadata,
         row_number() OVER (
           PARTITION BY mapped.position_id
           ORDER BY (option_row.metadata->>'preferred'='true') DESC,
                    option_row.sort_order,option_row.product_id
         ) AS choice_rank
  FROM pg_temp._basket_grid_position_map mapped
  JOIN public.basket_mold_position_options option_row ON option_row.position_id=mapped.position_id
)
SELECT canonical_type_id AS product_type_id,basket_id,product_id,
       sum(CASE
         WHEN metadata ? 'base_quantity' THEN (metadata->>'base_quantity')::numeric
         WHEN choice_rank=1 THEN old_quantity
         ELSE 0
       END)::numeric AS quantity
FROM ranked_options
GROUP BY canonical_type_id,basket_id,product_id;

CREATE TEMP TABLE pg_temp._basket_grid_option_quantities AS
SELECT option_row.product_type_id,option_row.product_id,target.basket_id,
       coalesce(base.quantity,0)::integer AS quantity
FROM pg_temp._basket_grid_merged_options option_row
CROSS JOIN pg_temp._basket_grid_target_baskets target
LEFT JOIN pg_temp._basket_grid_base_quantities base
  ON base.product_type_id=option_row.product_type_id
 AND base.product_id=option_row.product_id
 AND base.basket_id=target.basket_id;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT product_type_id,product_id,basket_id
    FROM pg_temp._basket_grid_option_quantities
    WHERE quantity<0 OR quantity>999
  ) THEN RAISE EXCEPTION 'basket_quantity_migration_option_limit_exceeded'; END IF;

  IF EXISTS (
    SELECT product_type_id,basket_id
    FROM pg_temp._basket_grid_option_quantities
    GROUP BY product_type_id,basket_id
    HAVING sum(quantity)>999
  ) THEN RAISE EXCEPTION 'basket_quantity_migration_session_limit_exceeded'; END IF;

  IF EXISTS (
    WITH old_totals AS (
      SELECT mapping.canonical_type_id,quantity.basket_id,sum(quantity.quantity)::integer AS quantity
      FROM pg_temp._basket_grid_session_map mapping
      JOIN public.site_basket_product_type_quantities quantity
        ON quantity.product_type_id=mapping.old_type_id
      JOIN pg_temp._basket_grid_target_baskets target ON target.basket_id=quantity.basket_id
      GROUP BY mapping.canonical_type_id,quantity.basket_id
    ), new_totals AS (
      SELECT product_type_id,basket_id,sum(quantity)::integer AS quantity
      FROM pg_temp._basket_grid_option_quantities
      GROUP BY product_type_id,basket_id
    )
    SELECT 1
    FROM pg_temp._basket_grid_canonical_sessions canonical
    CROSS JOIN pg_temp._basket_grid_target_baskets target
    LEFT JOIN old_totals old ON old.canonical_type_id=canonical.canonical_type_id AND old.basket_id=target.basket_id
    LEFT JOIN new_totals fresh ON fresh.product_type_id=canonical.canonical_type_id AND fresh.basket_id=target.basket_id
    WHERE coalesce(old.quantity,0)<>coalesce(fresh.quantity,0)
  ) THEN RAISE EXCEPTION 'basket_quantity_migration_total_mismatch'; END IF;
END
$migration$;

DELETE FROM public.site_basket_product_type_quantities quantity
USING pg_temp._basket_grid_target_baskets target
WHERE quantity.basket_id=target.basket_id;

DELETE FROM public.site_basket_product_type_options option_row
WHERE option_row.product_type_id IN (SELECT old_type_id FROM pg_temp._basket_grid_session_map);

DELETE FROM public.site_basket_product_types product_type
USING pg_temp._basket_grid_session_map mapping
WHERE product_type.id=mapping.old_type_id
  AND mapping.old_type_id<>mapping.canonical_type_id;

UPDATE public.site_basket_product_types product_type
SET title=canonical.title,session_id=canonical.session_id,slot_order=1,
    sort_order=canonical.sort_order,updated_at=now()
FROM pg_temp._basket_grid_canonical_sessions canonical
WHERE product_type.id=canonical.canonical_type_id;

INSERT INTO public.site_basket_product_type_options(product_type_id,product_id,sort_order,metadata,updated_at)
SELECT product_type_id,product_id,sort_order,
       coalesce(metadata,'{}'::jsonb)-'preferred'-'base_quantity'-'quantities'-'basket_quantities',
       now()
FROM pg_temp._basket_grid_merged_options;

INSERT INTO public.site_basket_product_type_option_quantities(product_type_id,product_id,basket_id,quantity,updated_at)
SELECT product_type_id,product_id,basket_id,quantity,now()
FROM pg_temp._basket_grid_option_quantities;

INSERT INTO public.site_basket_product_type_quantities(product_type_id,basket_id,quantity,updated_at)
SELECT product_type_id,basket_id,sum(quantity)::integer,now()
FROM pg_temp._basket_grid_option_quantities
GROUP BY product_type_id,basket_id;

CREATE TEMP TABLE pg_temp._basket_grid_keep_positions AS
SELECT * FROM pg_temp._basket_grid_position_map
WHERE position_rank=1;

DELETE FROM public.basket_mold_position_options option_row
USING pg_temp._basket_grid_target_baskets target,public.basket_mold_positions position
WHERE position.mold_id=target.mold_id
  AND option_row.position_id=position.id;

UPDATE public.basket_mold_positions position
SET label=canonical.title,
    quantity=totals.quantity,
    sort_order=canonical.sort_order,
    metadata=(coalesce(position.metadata,'{}'::jsonb)-'site_basket_product_slot_order')
      ||jsonb_build_object(
        'site_basket_product_type_id',canonical.canonical_type_id,
        'site_basket_product_session_id',canonical.session_id,
        'site_basket_product_slot_order',1
      )
FROM pg_temp._basket_grid_keep_positions keep
JOIN pg_temp._basket_grid_canonical_sessions canonical
  ON canonical.canonical_type_id=keep.canonical_type_id
JOIN (
  SELECT product_type_id,basket_id,sum(quantity)::integer AS quantity
  FROM pg_temp._basket_grid_option_quantities
  GROUP BY product_type_id,basket_id
) totals ON totals.product_type_id=keep.canonical_type_id AND totals.basket_id=keep.basket_id
WHERE position.id=keep.position_id;

DELETE FROM public.basket_mold_positions position
USING pg_temp._basket_grid_position_map mapped
WHERE position.id=mapped.position_id AND mapped.position_rank>1;

INSERT INTO public.basket_mold_position_options(position_id,product_id,sort_order,metadata)
SELECT keep.position_id,option_row.product_id,option_row.sort_order,
       (coalesce(option_row.metadata,'{}'::jsonb)
         - 'preferred' - 'manual_replacement_required' - 'manual_replacement_reason' - 'base_quantity')
       ||jsonb_build_object('base_quantity',quantity.quantity)
FROM pg_temp._basket_grid_keep_positions keep
JOIN pg_temp._basket_grid_merged_options option_row
  ON option_row.product_type_id=keep.canonical_type_id
JOIN pg_temp._basket_grid_option_quantities quantity
  ON quantity.product_type_id=keep.canonical_type_id
 AND quantity.product_id=option_row.product_id
 AND quantity.basket_id=keep.basket_id
ORDER BY keep.mold_id,keep.canonical_sort_order,option_row.sort_order;

UPDATE public.basket_molds mold
SET public_composition_count=1,updated_at=now()
FROM pg_temp._basket_grid_target_baskets target
WHERE mold.id=target.mold_id;


DROP TABLE IF EXISTS pg_temp._basket_grid_keep_positions;
DROP TABLE IF EXISTS pg_temp._basket_grid_option_quantities;
DROP TABLE IF EXISTS pg_temp._basket_grid_base_quantities;
DROP TABLE IF EXISTS pg_temp._basket_grid_position_map;
DROP TABLE IF EXISTS pg_temp._basket_grid_target_baskets;
DROP TABLE IF EXISTS pg_temp._basket_grid_merged_options;
DROP TABLE IF EXISTS pg_temp._basket_grid_session_map;
DROP TABLE IF EXISTS pg_temp._basket_grid_canonical_sessions;

