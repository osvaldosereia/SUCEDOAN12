-- Support basket compositions that include multiple variant rows for one position.
-- Keep valid variant rows, discard stale position IDs, and rely on distinct-position coverage.
DO $patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure
  );

  v_old := $old$        if jsonb_array_length(v_mold_public_composition->'items')<>v_mold_position_count then
          raise exception 'basket_mold_composition_invalid';
        end if;$old$;

  v_new := $new$        -- Public compositions can contain multiple variants for one position.
        -- Keep those rows, but discard rows tied to positions removed from the current mold.
        v_mold_public_composition := jsonb_set(
          v_mold_public_composition,
          '{items}',
          coalesce((
            select jsonb_agg(item.value order by item.ordinality)
            from jsonb_array_elements(v_mold_public_composition->'items')
              with ordinality as item(value, ordinality)
            where exists (
              select 1
              from public.basket_mold_positions position
              where position.mold_id = v_mold.id
                and position.id::text = item.value->>'position_id'
            )
          ), '[]'::jsonb),
          true
        );$new$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'create_vitrine_cart_order_v3_base composition guard changed';
  END IF;

  v_definition := replace(v_definition,v_old,v_new);
  IF position('multiple variants for one position' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'create_vitrine_cart_order_v3_base composition patch failed';
  END IF;

  EXECUTE v_definition;
END;
$patch$;
