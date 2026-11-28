CREATE OR REPLACE FUNCTION public.site_admin_save_basket_grid_v1(p_rows jsonb, p_operator text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_row jsonb;
  v_option jsonb;
  v_option_map jsonb;
  v_option_count integer;
  v_unique_option_count integer;
  v_existing_product_count integer;
  v_total_product_count integer;
  v_option_quantity_key_count integer;
  v_row_id uuid;
  v_session_id uuid;
  v_title text;
  v_options jsonb;
  v_quantities jsonb;
  v_quantity_text text;
  v_option_quantity_text text;
  v_quantity numeric;
  v_option_quantity numeric;
  v_option_total numeric;
  v_basket record;
  v_row_order integer := 0;
  v_basket_count integer := 0;
  v_type_count integer := 0;
  v_positive_count integer := 0;
  v_positions jsonb;
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'site_admin_service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'site_basket_grid_rows_invalid';
  END IF;
  IF jsonb_array_length(p_rows) < 1 THEN
    RAISE EXCEPTION 'site_basket_grid_rows_invalid';
  END IF;

  CREATE TEMP TABLE pg_temp._site_basket_grid_baskets ON COMMIT DROP AS
  SELECT basket.id AS basket_id, mold.id AS mold_id, mold.hidden_adjustment, 1::integer AS public_composition_count,
         basket.sort_order, basket.name
  FROM public.basket_templates basket
  JOIN public.basket_categories category ON category.id = basket.category_id
  JOIN public.basket_molds mold ON mold.basket_id = basket.id
  WHERE basket.is_active IS TRUE AND category.slug = 'cestas-completas'
  ORDER BY basket.sort_order, basket.name;
  SELECT count(*) INTO v_basket_count FROM pg_temp._site_basket_grid_baskets;
  IF v_basket_count < 1 THEN RAISE EXCEPTION 'site_basket_grid_baskets_missing'; END IF;

  CREATE TEMP TABLE pg_temp._site_basket_grid_rows (
    type_id uuid PRIMARY KEY,
    session_id uuid NOT NULL,
    row_order integer NOT NULL,
    title text NOT NULL,
    options jsonb NOT NULL,
    quantities jsonb NOT NULL
  ) ON COMMIT DROP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_id := coalesce(nullif(btrim(v_row->>'id'), '')::uuid, gen_random_uuid());
    v_session_id := coalesce(nullif(btrim(v_row->>'session_id'), '')::uuid, v_row_id);
    v_title := btrim(coalesce(v_row->>'title', ''));
    v_options := v_row->'options';
    v_quantities := v_row->'quantities';
    IF v_title = '' OR char_length(v_title) > 180 OR v_options IS NULL OR v_quantities IS NULL THEN
      RAISE EXCEPTION 'site_basket_grid_type_invalid';
    END IF;
    IF jsonb_typeof(v_options) <> 'array' OR jsonb_typeof(v_quantities) <> 'object' THEN
      RAISE EXCEPTION 'site_basket_grid_type_invalid';
    END IF;
    IF jsonb_array_length(v_options) < 1 OR jsonb_array_length(v_options) > 500
       OR (SELECT count(*) FROM jsonb_object_keys(v_quantities)) <> v_basket_count THEN
      RAISE EXCEPTION 'site_basket_grid_type_invalid';
    END IF;

    SELECT count(*), count(DISTINCT (option.value->>'product_id')::uuid)
      INTO v_option_count, v_unique_option_count
    FROM jsonb_array_elements(v_options) AS option(value);
    IF v_option_count <> v_unique_option_count THEN RAISE EXCEPTION 'site_basket_grid_option_invalid'; END IF;

    FOR v_option IN SELECT value FROM jsonb_array_elements(v_options)
    LOOP
      v_option_map := v_option->'quantities';
      IF jsonb_typeof(v_option_map) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'site_basket_grid_option_quantities_invalid';
      END IF;
      SELECT count(*) INTO v_option_quantity_key_count
      FROM jsonb_object_keys(v_option_map) AS keys(key_name);
      IF v_option_quantity_key_count <> v_basket_count OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_option_map) AS keys(key_name)
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_temp._site_basket_grid_baskets basket
          WHERE basket.basket_id::text = keys.key_name
        )
      ) THEN RAISE EXCEPTION 'site_basket_grid_option_quantities_invalid'; END IF;
    END LOOP;

    FOR v_basket IN SELECT basket_id FROM pg_temp._site_basket_grid_baskets
    LOOP
      IF NOT (v_quantities ? v_basket.basket_id::text) THEN
        RAISE EXCEPTION 'site_basket_grid_quantity_missing';
      END IF;
      v_quantity_text := v_quantities->>v_basket.basket_id::text;
      IF v_quantity_text IS NULL OR v_quantity_text !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'site_basket_grid_quantity_invalid';
      END IF;
      v_quantity := v_quantity_text::numeric;
      IF v_quantity < 0 OR v_quantity > 999 THEN RAISE EXCEPTION 'site_basket_grid_quantity_invalid'; END IF;

      v_option_total := 0;
      FOR v_option IN SELECT value FROM jsonb_array_elements(v_options)
      LOOP
        v_option_quantity_text := (v_option->'quantities')->>v_basket.basket_id::text;
        IF v_option_quantity_text IS NULL OR v_option_quantity_text !~ '^[0-9]+$' THEN
          RAISE EXCEPTION 'site_basket_grid_option_quantity_invalid';
        END IF;
        v_option_quantity := v_option_quantity_text::numeric;
        IF v_option_quantity < 0 OR v_option_quantity > 999 THEN
          RAISE EXCEPTION 'site_basket_grid_option_quantity_invalid';
        END IF;
        v_option_total := v_option_total + v_option_quantity;
      END LOOP;
      IF v_option_total <> v_quantity OR v_option_total > 999 THEN
        RAISE EXCEPTION 'site_basket_grid_quantity_mismatch';
      END IF;
    END LOOP;

    INSERT INTO pg_temp._site_basket_grid_rows(type_id,session_id,row_order,title,options,quantities)
    VALUES(v_row_id,v_session_id,v_row_order,v_title,v_options,v_quantities);
    v_row_order := v_row_order + 1;
  END LOOP;
  v_type_count := v_row_order;

  IF EXISTS (
    SELECT 1 FROM pg_temp._site_basket_grid_rows
    GROUP BY session_id
    HAVING count(*) <> 1
  ) THEN RAISE EXCEPTION 'site_basket_grid_session_invalid'; END IF;

  SELECT count(DISTINCT (option.value->>'product_id')::uuid)
    INTO v_total_product_count
  FROM pg_temp._site_basket_grid_rows grid_row
  CROSS JOIN LATERAL jsonb_array_elements(grid_row.options) AS option(value);
  SELECT count(*) INTO v_existing_product_count
  FROM public.products product
  WHERE product.id IN (
    SELECT DISTINCT (option.value->>'product_id')::uuid
    FROM pg_temp._site_basket_grid_rows grid_row
    CROSS JOIN LATERAL jsonb_array_elements(grid_row.options) AS option(value)
  );
  IF v_existing_product_count <> v_total_product_count THEN RAISE EXCEPTION 'site_basket_grid_product_not_found'; END IF;

  SELECT count(*) INTO v_positive_count
  FROM pg_temp._site_basket_grid_baskets basket
  WHERE EXISTS (
    SELECT 1 FROM pg_temp._site_basket_grid_rows grid_row
    WHERE (grid_row.quantities->>basket.basket_id::text)::numeric > 0
  );
  IF v_positive_count <> v_basket_count THEN RAISE EXCEPTION 'site_basket_grid_empty_basket'; END IF;

  DELETE FROM public.site_basket_product_types product_type
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_temp._site_basket_grid_rows grid_row WHERE grid_row.type_id = product_type.id
  );
  INSERT INTO public.site_basket_product_types(id,title,session_id,slot_order,sort_order,updated_at)
  SELECT type_id,title,session_id,1,row_order,now()
  FROM pg_temp._site_basket_grid_rows
  ON CONFLICT (id) DO UPDATE SET
    title=EXCLUDED.title,session_id=EXCLUDED.session_id,slot_order=1,
    sort_order=EXCLUDED.sort_order,updated_at=now();

  DELETE FROM public.site_basket_product_type_options option
  USING pg_temp._site_basket_grid_rows grid_row
  WHERE option.product_type_id=grid_row.type_id;
  INSERT INTO public.site_basket_product_type_options(product_type_id,product_id,sort_order,metadata,updated_at)
  SELECT grid_row.type_id,(option.value->>'product_id')::uuid,(option.ordinality-1)::integer,
    (CASE WHEN jsonb_typeof(option.value->'metadata')='object'
      THEN option.value->'metadata' ELSE '{}'::jsonb END)
      - 'preferred' - 'base_quantity' - 'quantities' - 'basket_quantities',
    now()
  FROM pg_temp._site_basket_grid_rows grid_row
  CROSS JOIN LATERAL jsonb_array_elements(grid_row.options) WITH ORDINALITY AS option(value,ordinality);

  DELETE FROM public.site_basket_product_type_quantities quantity
  USING pg_temp._site_basket_grid_baskets basket
  WHERE quantity.basket_id=basket.basket_id;
  INSERT INTO public.site_basket_product_type_quantities(product_type_id,basket_id,quantity,updated_at)
  SELECT grid_row.type_id,basket.basket_id,(grid_row.quantities->>basket.basket_id::text)::integer,now()
  FROM pg_temp._site_basket_grid_rows grid_row
  CROSS JOIN pg_temp._site_basket_grid_baskets basket;

  DELETE FROM public.site_basket_product_type_option_quantities quantity
  USING pg_temp._site_basket_grid_baskets basket
  WHERE quantity.basket_id=basket.basket_id;
  INSERT INTO public.site_basket_product_type_option_quantities(product_type_id,product_id,basket_id,quantity,updated_at)
  SELECT grid_row.type_id,(option.value->>'product_id')::uuid,basket.basket_id,
    ((option.value->'quantities')->>basket.basket_id::text)::integer,now()
  FROM pg_temp._site_basket_grid_rows grid_row
  CROSS JOIN LATERAL jsonb_array_elements(grid_row.options) AS option(value)
  CROSS JOIN pg_temp._site_basket_grid_baskets basket;

  FOR v_basket IN SELECT * FROM pg_temp._site_basket_grid_baskets ORDER BY sort_order,name
  LOOP
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'label',grid_row.title,
      'quantity',(grid_row.quantities->>v_basket.basket_id::text)::integer,
      'sort_order',grid_row.row_order,
      'metadata',coalesce(current_position.metadata,'{}'::jsonb)
        || jsonb_build_object(
          'site_basket_product_type_id',grid_row.type_id,
          'site_basket_product_session_id',grid_row.session_id,
          'site_basket_product_slot_order',1
        ),
      'options',coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'product_id',configured_option.product_id,
          'sort_order',configured_option.sort_order,
          'metadata',(
            coalesce(current_option.metadata,configured_option.metadata,'{}'::jsonb)
              - 'preferred' - 'base_quantity' - 'manual_replacement_required' - 'manual_replacement_reason'
          ) || jsonb_build_object('base_quantity',coalesce(option_quantity.quantity,0))
        ) ORDER BY configured_option.sort_order,configured_option.product_id)
        FROM public.site_basket_product_type_options configured_option
        LEFT JOIN public.basket_mold_position_options current_option
          ON current_option.position_id=current_position.position_id
         AND current_option.product_id=configured_option.product_id
        LEFT JOIN public.site_basket_product_type_option_quantities option_quantity
          ON option_quantity.product_type_id=configured_option.product_type_id
         AND option_quantity.product_id=configured_option.product_id
         AND option_quantity.basket_id=v_basket.basket_id
        WHERE configured_option.product_type_id=grid_row.type_id
      ),'[]'::jsonb)
    ) ORDER BY grid_row.row_order),'[]'::jsonb)
    INTO v_positions
    FROM pg_temp._site_basket_grid_rows grid_row
    LEFT JOIN LATERAL(
      SELECT position.id AS position_id,position.metadata
      FROM public.basket_mold_positions position
      WHERE position.mold_id=v_basket.mold_id
        AND position.metadata->>'site_basket_product_type_id'=grid_row.type_id::text
      ORDER BY position.sort_order,position.id LIMIT 1
    ) current_position ON true;

    PERFORM public.site_admin_save_basket_mold_shared_v1(
      v_basket.basket_id,v_basket.hidden_adjustment,1,v_positions,
      coalesce(nullif(btrim(p_operator),''),'Admin site Dona Antônia'),'[]'::jsonb
    );
  END LOOP;

  RETURN jsonb_build_object('type_count',v_type_count,'basket_count',v_basket_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.site_admin_save_basket_grid_with_prices_v1(p_rows jsonb, p_basket_prices jsonb, p_operator text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_basket record;
  v_basket_count integer;
  v_price_key_count integer;
  v_valid_price_key_count integer;
  v_price_text text;
  v_target_price_cents numeric;
  v_product_total_cents numeric;
  v_conditional_cents numeric;
  v_saved jsonb;
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'site_admin_service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_basket_prices IS NULL OR jsonb_typeof(p_basket_prices) <> 'object' THEN
    RAISE EXCEPTION 'site_basket_grid_price_invalid';
  END IF;

  SELECT count(*) INTO v_basket_count
  FROM public.basket_templates basket
  JOIN public.basket_categories category
    ON category.id = basket.category_id
   AND category.slug = 'cestas-completas'
  JOIN public.basket_molds mold ON mold.basket_id = basket.id
  WHERE basket.is_active IS TRUE;

  SELECT count(*) INTO v_price_key_count
  FROM jsonb_object_keys(p_basket_prices) AS entry(key_name);

  SELECT count(*) INTO v_valid_price_key_count
  FROM jsonb_object_keys(p_basket_prices) AS entry(key_name)
  JOIN public.basket_templates basket ON basket.id::text = entry.key_name
  JOIN public.basket_categories category
    ON category.id = basket.category_id
   AND category.slug = 'cestas-completas'
  JOIN public.basket_molds mold ON mold.basket_id = basket.id
  WHERE basket.is_active IS TRUE;

  IF v_basket_count < 1
     OR v_price_key_count <> v_basket_count
     OR v_valid_price_key_count <> v_basket_count THEN
    RAISE EXCEPTION 'site_basket_grid_price_invalid';
  END IF;

  FOR v_basket IN
    SELECT basket.id AS basket_id
    FROM public.basket_templates basket
    JOIN public.basket_categories category
      ON category.id = basket.category_id
     AND category.slug = 'cestas-completas'
    JOIN public.basket_molds mold ON mold.basket_id = basket.id
    WHERE basket.is_active IS TRUE
  LOOP
    v_price_text := p_basket_prices ->> v_basket.basket_id::text;
    IF v_price_text IS NULL OR v_price_text !~ '^[0-9]{1,9}$'
       OR v_price_text::numeric > 100000000 THEN
      RAISE EXCEPTION 'site_basket_grid_price_invalid';
    END IF;
  END LOOP;

  v_saved := public.site_admin_save_basket_grid_v1(p_rows, p_operator);

  -- Remove only obsolete metadata from the shared option record. Review is
  -- calculated per active basket above, so the shared record is not authoritative.
  UPDATE public.site_basket_product_type_options configured_option
  SET metadata = coalesce(configured_option.metadata, '{}'::jsonb)
      - 'manual_replacement_required' - 'manual_replacement_reason',
      updated_at = now()
  FROM public.products product
  WHERE product.id = configured_option.product_id
    AND product.is_active IS TRUE
    AND coalesce(product.stock, 0) > 0
    AND configured_option.metadata @> '{"manual_replacement_required":true}'::jsonb;

  UPDATE public.basket_mold_position_options position_option
  SET metadata = coalesce(position_option.metadata, '{}'::jsonb)
      - 'manual_replacement_required' - 'manual_replacement_reason',
      updated_at = now()
  FROM public.basket_mold_positions position
  JOIN public.basket_molds mold ON mold.id = position.mold_id
  JOIN public.basket_templates basket ON basket.id = mold.basket_id AND basket.is_active IS TRUE
  WHERE position_option.position_id = position.id
    AND position_option.metadata @> '{"manual_replacement_required":true}'::jsonb
    AND EXISTS (
      SELECT 1
      FROM public.products product
      WHERE product.id = position_option.product_id
        AND product.is_active IS TRUE
        AND greatest(0, coalesce(product.stock, 0)
          - public.supabase_stock_pending_reservations_v1(product.id, NULL::uuid)) >= coalesce(
            nullif(position_option.metadata->>'base_quantity','')::numeric,
            CASE WHEN position_option.sort_order=0 THEN position.quantity ELSE 0 END
          )
    );

  FOR v_basket IN
    SELECT
      basket.id AS basket_id,
      mold.id AS mold_id,
      mold.conditional_hidden_enabled,
      mold.conditional_hidden_product_id,
      mold.conditional_hidden_adjustment
    FROM public.basket_templates basket
    JOIN public.basket_categories category
      ON category.id = basket.category_id
     AND category.slug = 'cestas-completas'
    JOIN public.basket_molds mold ON mold.basket_id = basket.id
    WHERE basket.is_active IS TRUE
  LOOP
    v_target_price_cents := (p_basket_prices ->> v_basket.basket_id::text)::numeric;

    SELECT coalesce(sum(round((CASE
      WHEN product.is_offer IS TRUE
       AND product.offer_price IS NOT NULL
       AND product.offer_price >= 0
        THEN product.offer_price
      ELSE coalesce(product.price, 0)
    END) * 100) * coalesce(
        nullif(option_row.metadata->>'base_quantity','')::numeric,
        CASE WHEN option_row.sort_order=0 THEN position.quantity ELSE 0 END
      )), 0)
    INTO v_product_total_cents
    FROM public.basket_mold_positions position
    JOIN public.basket_mold_position_options option_row
      ON option_row.position_id = position.id
     
    JOIN public.products product ON product.id = option_row.product_id
    WHERE position.mold_id = v_basket.mold_id
      AND coalesce(nullif(option_row.metadata->>'base_quantity','')::numeric,CASE WHEN option_row.sort_order=0 THEN position.quantity ELSE 0 END) > 0;

    v_conditional_cents := 0;
    IF v_basket.conditional_hidden_enabled IS TRUE
       AND v_basket.conditional_hidden_product_id IS NOT NULL
       AND coalesce(v_basket.conditional_hidden_adjustment, 0) > 0
       AND EXISTS (
         SELECT 1
         FROM public.basket_mold_positions position
         JOIN public.basket_mold_position_options option_row
           ON option_row.position_id = position.id
          
         WHERE position.mold_id = v_basket.mold_id
           AND coalesce(nullif(option_row.metadata->>'base_quantity','')::numeric,CASE WHEN option_row.sort_order=0 THEN position.quantity ELSE 0 END) > 0
           AND option_row.product_id = v_basket.conditional_hidden_product_id
       ) THEN
      v_conditional_cents := round(v_basket.conditional_hidden_adjustment * 100);
    END IF;

    UPDATE public.basket_molds
    SET hidden_adjustment = (v_target_price_cents - v_product_total_cents - v_conditional_cents) / 100
    WHERE id = v_basket.mold_id;
  END LOOP;

  RETURN coalesce(v_saved, '{}'::jsonb)
    || jsonb_build_object('default_prices_saved', v_basket_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_basket_mold_v1(p_basket_id uuid, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_operator text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_mold_id uuid;
  v_position jsonb;
  v_options jsonb;
  v_option jsonb;
  v_position_id uuid;
  v_product_id uuid;
  v_seen_products uuid[];
  v_label text;
  v_quantity numeric;
  v_position_order integer := 0;
  v_option_order integer;
begin
  if p_basket_id is null or not exists (
    select 1 from public.basket_templates b where b.id = p_basket_id
  ) then
    raise exception 'basket_mold_basket_not_found';
  end if;

  if p_public_composition_count is null or p_public_composition_count < 1 or p_public_composition_count > 6 then
    raise exception 'basket_mold_public_composition_count_invalid';
  end if;

  if p_positions is null or jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then
    raise exception 'basket_mold_positions_required';
  end if;

  for v_position in select value from jsonb_array_elements(p_positions)
  loop
    v_label := btrim(coalesce(v_position->>'label', ''));
    if v_label = '' then
      raise exception 'basket_mold_position_label_required';
    end if;

    begin
      v_quantity := nullif(v_position->>'quantity', '')::numeric;
    exception when others then
      raise exception 'basket_mold_position_quantity_invalid';
    end;
    if v_quantity is null or v_quantity < 0 or v_quantity > 999 then
      raise exception 'basket_mold_position_quantity_invalid';
    end if;

    v_options := v_position->'options';
    if v_options is null or jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) = 0 then
      raise exception 'basket_mold_position_options_required';
    end if;

    v_seen_products := '{}'::uuid[];
    for v_option in select value from jsonb_array_elements(v_options)
    loop
      begin
        if jsonb_typeof(v_option) = 'string' then
          v_product_id := trim(both '"' from v_option::text)::uuid;
        else
          v_product_id := nullif(v_option->>'product_id', '')::uuid;
        end if;
      exception when others then
        raise exception 'basket_mold_product_invalid';
      end;

      if v_product_id is null or not exists (
        select 1 from public.products p where p.id = v_product_id
      ) then
        raise exception 'basket_mold_product_not_found';
      end if;

      if v_product_id = any(v_seen_products) then
        raise exception 'basket_mold_duplicate_option';
      end if;
      v_seen_products := array_append(v_seen_products, v_product_id);
    end loop;
  end loop;

  insert into public.basket_molds(
    basket_id, hidden_adjustment, public_composition_count, metadata
  ) values (
    p_basket_id,
    coalesce(p_hidden_adjustment, 0),
    p_public_composition_count,
    jsonb_build_object('domain_version', 1, 'updated_by', coalesce(nullif(btrim(p_operator), ''), 'Operação'))
  )
  on conflict (basket_id) do update
    set hidden_adjustment = excluded.hidden_adjustment,
        public_composition_count = excluded.public_composition_count,
        metadata = coalesce(public.basket_molds.metadata, '{}'::jsonb)
          || jsonb_build_object('domain_version', 1, 'updated_by', coalesce(nullif(btrim(p_operator), ''), 'Operação')),
        updated_at = now()
  returning id into v_mold_id;

  delete from public.basket_mold_positions where mold_id = v_mold_id;

  v_position_order := 0;
  for v_position in select value from jsonb_array_elements(p_positions)
  loop
    v_label := btrim(v_position->>'label');
    v_quantity := (v_position->>'quantity')::numeric;

    insert into public.basket_mold_positions(
      mold_id, label, quantity, sort_order, metadata
    ) values (
      v_mold_id,
      v_label,
      v_quantity,
      v_position_order,
      coalesce(v_position->'metadata', '{}'::jsonb)
    ) returning id into v_position_id;

    v_option_order := 0;
    for v_option in select value from jsonb_array_elements(v_position->'options')
    loop
      if jsonb_typeof(v_option) = 'string' then
        v_product_id := trim(both '"' from v_option::text)::uuid;
      else
        v_product_id := (v_option->>'product_id')::uuid;
      end if;

      insert into public.basket_mold_position_options(
        position_id, product_id, sort_order, metadata
      ) values (
        v_position_id,
        v_product_id,
        v_option_order,
        case when jsonb_typeof(v_option) = 'object'
          then coalesce(v_option->'metadata', '{}'::jsonb)
          else '{}'::jsonb
        end
      );
      v_option_order := v_option_order + 1;
    end loop;

    v_position_order := v_position_order + 1;
  end loop;

  return public.basket_mold_editor_v1(p_basket_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.basket_mold_public_compositions_batch_v1(p_basket_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH requested AS (
  SELECT DISTINCT unnest(coalesce(p_basket_ids, '{}'::uuid[])) AS basket_id
), mold AS (
  SELECT m.id,m.basket_id,m.hidden_adjustment,m.public_composition_count,b.name,b.image_url
  FROM public.basket_molds m
  JOIN public.basket_templates b ON b.id=m.basket_id
  JOIN public.basket_categories cat ON cat.id=b.category_id AND cat.slug='cestas-completas'
  JOIN requested r ON r.basket_id=m.basket_id
), active_order_reservations AS (
  SELECT r.product_id,
         public.supabase_stock_pending_reservations_v1(r.product_id,NULL::uuid)::numeric AS reserved
  FROM public.vitrine_stock_reservations r
  WHERE r.status IN ('reserved','allocated') OR r.status='consumed'
  GROUP BY r.product_id
), stock_candidates AS (
  SELECT DISTINCT option_row.product_id
  FROM mold m
  JOIN public.basket_mold_positions position ON position.mold_id=m.id
  JOIN public.basket_mold_position_options option_row ON option_row.position_id=position.id
), fresh_stock AS MATERIALIZED (
  SELECT candidate.product_id,
         public.basket_component_fresh_sellable_stock_v1(candidate.product_id) AS sellable_stock
  FROM stock_candidates candidate
), configured AS (
  SELECT position.id AS position_id,position.mold_id,m.basket_id,position.label,
         position.sort_order AS position_order,option_row.product_id,option_row.sort_order AS option_order,
         product.name AS product_name,product.sku,product.gtin,product.image_url,
         CASE WHEN product.is_offer IS TRUE AND product.offer_price>0 THEN product.offer_price
              WHEN product.price>0 THEN product.price ELSE 9999999 END AS unit_price,
         CASE WHEN option_row.metadata ? 'base_quantity'
              THEN greatest(0,coalesce(nullif(option_row.metadata->>'base_quantity','')::numeric,0))
              WHEN option_row.sort_order=0 THEN greatest(0,position.quantity)
              ELSE 0 END AS base_quantity,
         greatest(0,stock.sellable_stock-coalesce(reservation.reserved,0))::numeric AS available_stock,
         product.is_active
  FROM mold m
  JOIN public.basket_mold_positions position ON position.mold_id=m.id
  JOIN public.basket_mold_position_options option_row ON option_row.position_id=position.id
  JOIN public.products product ON product.id=option_row.product_id
  JOIN fresh_stock stock ON stock.product_id=product.id
  LEFT JOIN active_order_reservations reservation ON reservation.product_id=product.id
), selected AS (
  SELECT configured.*,
         CASE WHEN is_active IS TRUE
              THEN least(base_quantity,available_stock)
              ELSE 0 END AS quantity
  FROM configured
), slots AS (
  SELECT m.basket_id,series.composition_number
  FROM mold m
  CROSS JOIN LATERAL generate_series(1,greatest(1,coalesce(m.public_composition_count,1))) AS series(composition_number)
), compositions AS (
  SELECT slot.basket_id,slot.composition_number,
         coalesce(jsonb_agg(jsonb_build_object(
           'position_id',selected.position_id,'label',selected.label,
           'quantity',selected.quantity,'product_id',selected.product_id,
           'name',selected.product_name,'sku',selected.sku,'gtin',selected.gtin,
           'image_url',selected.image_url,'available_stock',selected.available_stock,
           'coverage_baskets',floor(selected.available_stock/nullif(selected.quantity,0))::bigint,
           'option_rank',selected.option_order+1,'selection_score',selected.available_stock,
           'selection_reason','configured_quantity'
         ) ORDER BY selected.position_order,selected.option_order,selected.product_id)
           FILTER (WHERE selected.product_id IS NOT NULL AND selected.quantity>0),'[]'::jsonb) AS items
  FROM slots slot
  LEFT JOIN selected ON selected.basket_id=slot.basket_id
  GROUP BY slot.basket_id,slot.composition_number
)
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'basket_id',m.basket_id,'name',m.name,'image_url',m.image_url,
  'hidden_adjustment',m.hidden_adjustment,
  'public_composition_count',greatest(1,coalesce(m.public_composition_count,1)),
  'balancing','configured_quantities_v1',
  'compositions',coalesce((
    SELECT jsonb_agg(jsonb_build_object('number',c.composition_number,'items',c.items)
      ORDER BY c.composition_number)
    FROM compositions c WHERE c.basket_id=m.basket_id
  ),'[]'::jsonb)
) ORDER BY m.basket_id),'[]'::jsonb)
FROM mold m;
$function$;
