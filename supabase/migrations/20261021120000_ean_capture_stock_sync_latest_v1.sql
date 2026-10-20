CREATE OR REPLACE FUNCTION public.ean_capture_sync_one_v1(p_capture_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_row public.ean_capture_records_v1%rowtype;
  v_old_status text;
  v_old_product_id uuid;
  v_latest_quantity numeric;
BEGIN
  SELECT e.sync_status,e.matched_product_id
    INTO v_old_status,v_old_product_id
  FROM public.ean_capture_records_v1 e
  WHERE e.id=p_capture_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','leitura_nao_encontrada');
  END IF;

  UPDATE public.ean_capture_records_v1 e
  SET matched_product_id=(
        SELECT found.product_id
        FROM (
          SELECT p.id AS product_id,0 AS priority
          FROM public.products p WHERE p.gtin=e.ean
          UNION ALL
          SELECT pi.product_id,1 AS priority
          FROM public.product_identifiers pi
          WHERE pi.identifier_value=e.ean AND pi.status='confirmed'
        ) found
        ORDER BY found.priority,found.product_id
        LIMIT 1
      ),
      synced_at=now(),
      updated_at=now()
  WHERE e.id=p_capture_id
  RETURNING * INTO v_row;

  UPDATE public.ean_capture_records_v1
  SET sync_status=CASE WHEN v_row.matched_product_id IS NULL THEN 'not_found' ELSE 'found' END,
      updated_at=now()
  WHERE id=v_row.id
  RETURNING * INTO v_row;

  IF v_row.matched_product_id IS NOT NULL
     AND (v_old_status IS DISTINCT FROM 'found'
          OR v_old_product_id IS DISTINCT FROM v_row.matched_product_id) THEN
    SELECT e.quantity
      INTO v_latest_quantity
    FROM public.ean_capture_records_v1 e
    WHERE e.sync_status='found'
      AND e.matched_product_id=v_row.matched_product_id
    ORDER BY e.created_at DESC,e.id DESC
    LIMIT 1;

    UPDATE public.products
    SET stock=v_latest_quantity
    WHERE id=v_row.matched_product_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',true,
    'row',jsonb_build_object(
       'id',v_row.id,'ean',v_row.ean,'quantity',v_row.quantity,
       'expires_on',v_row.expires_on,'sync_status',v_row.sync_status,
       'matched_product_id',v_row.matched_product_id,'photo_path',v_row.photo_path,
       'photo_captured_at',v_row.photo_captured_at,'created_at',v_row.created_at,
       'updated_at',v_row.updated_at,'synced_at',v_row.synced_at
    ),
    'summary',public.ean_capture_stats_v1()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ean_capture_sync_v1()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_capture record;
  v_product_id uuid;
  v_old_status text;
  v_old_product_id uuid;
  v_latest_quantity numeric;
BEGIN
  FOR v_capture IN
    SELECT e.id,e.ean,e.sync_status,e.matched_product_id
    FROM public.ean_capture_records_v1 e
    ORDER BY e.created_at ASC,e.id ASC
    FOR UPDATE
  LOOP
    v_old_status:=v_capture.sync_status;
    v_old_product_id:=v_capture.matched_product_id;

    SELECT matches.product_id INTO v_product_id
    FROM (
      SELECT p.id AS product_id,0 AS priority
      FROM public.products p WHERE p.gtin=v_capture.ean
      UNION ALL
      SELECT pi.product_id,1 AS priority
      FROM public.product_identifiers pi
      WHERE pi.identifier_value=v_capture.ean AND pi.status='confirmed'
    ) matches
    ORDER BY matches.priority,matches.product_id
    LIMIT 1;

    UPDATE public.ean_capture_records_v1
    SET sync_status=CASE WHEN v_product_id IS NULL THEN 'not_found' ELSE 'found' END,
        matched_product_id=v_product_id,
        synced_at=now(),
        updated_at=now()
    WHERE id=v_capture.id;

    IF v_product_id IS NOT NULL
       AND (v_old_status IS DISTINCT FROM 'found'
            OR v_old_product_id IS DISTINCT FROM v_product_id) THEN
      SELECT e.quantity INTO v_latest_quantity
      FROM public.ean_capture_records_v1 e
      WHERE e.sync_status='found'
        AND e.matched_product_id=v_product_id
      ORDER BY e.created_at DESC,e.id DESC
      LIMIT 1;

      UPDATE public.products
      SET stock=v_latest_quantity
      WHERE id=v_product_id;
    END IF;
  END LOOP;

  RETURN public.ean_capture_stats_v1();
END;
$function$;