ALTER TABLE private.da_offer_rotation_state_v1
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_product_count integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS min_discount_percent integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_discount_percent integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS min_gross_margin_percent numeric(5,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_rotation_date date,
  ADD COLUMN IF NOT EXISTS last_rotation_count integer NOT NULL DEFAULT 0;

INSERT INTO private.da_offer_rotation_state_v1
  (id, enabled, daily_product_count, min_discount_percent, max_discount_percent, min_gross_margin_percent, last_rotation_count)
VALUES (1, true, 30, 5, 15, 5, 0)
ON CONFLICT (id) DO NOTHING;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='private.da_offer_rotation_state_v1'::regclass AND conname='da_offer_rotation_daily_count_check') THEN
    ALTER TABLE private.da_offer_rotation_state_v1 ADD CONSTRAINT da_offer_rotation_daily_count_check CHECK (daily_product_count BETWEEN 1 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='private.da_offer_rotation_state_v1'::regclass AND conname='da_offer_rotation_discount_range_check') THEN
    ALTER TABLE private.da_offer_rotation_state_v1 ADD CONSTRAINT da_offer_rotation_discount_range_check CHECK (min_discount_percent BETWEEN 5 AND 15 AND max_discount_percent BETWEEN min_discount_percent AND 15);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='private.da_offer_rotation_state_v1'::regclass AND conname='da_offer_rotation_margin_check') THEN
    ALTER TABLE private.da_offer_rotation_state_v1 ADD CONSTRAINT da_offer_rotation_margin_check CHECK (min_gross_margin_percent BETWEEN 0 AND 50);
  END IF;
END
$constraints$;

UPDATE private.da_offer_rotation_state_v1
SET enabled=true,
    daily_product_count=30,
    min_discount_percent=5,
    max_discount_percent=15,
    min_gross_margin_percent=5,
    last_rotation_date=NULL,
    last_rotation_count=0
WHERE id=1;

-- Retire only the old automatic rotation set. Manual and validity offers are preserved.
UPDATE public.products
SET is_offer=false,
    offer_price=NULL,
    metadata=coalesce(metadata,'{}'::jsonb)-'offer_source'-'offer_discount_percent'-'offer_starts_at'-'offer_ends_at'-'offer_rotation_date'
WHERE metadata->>'offer_source' IN ('auto_rotation','auto_expiry');

CREATE OR REPLACE FUNCTION private.da_offer_rotation_snapshot_v1()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public','private','pg_temp'
AS $function$
DECLARE
  v_state private.da_offer_rotation_state_v1%ROWTYPE;
  v_offers jsonb;
  v_today date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  SELECT * INTO v_state FROM private.da_offer_rotation_state_v1 WHERE id=1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('config',jsonb_build_object('enabled',false),'offers','[]'::jsonb);
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',p.id,
        'name',p.name,
        'image_url',p.image_url,
        'price',p.price,
        'offer_price',p.offer_price,
        'discount_percent',coalesce(nullif(p.metadata->>'offer_discount_percent','')::integer,0),
        'sellable_stock',coalesce(s.sellable_stock,0)
      ) ORDER BY p.name
    ),
    '[]'::jsonb
  )
  INTO v_offers
  FROM public.products p
  LEFT JOIN public.storefront_product_sellable_stock_v1 s ON s.product_id=p.id
  WHERE p.is_active=true
    AND p.is_offer=true
    AND p.metadata->>'offer_source'='auto_rotation'
    AND p.metadata->>'offer_rotation_date'=v_today::text;

  RETURN jsonb_build_object(
    'config',jsonb_build_object(
      'enabled',v_state.enabled,
      'daily_product_count',v_state.daily_product_count,
      'min_discount_percent',v_state.min_discount_percent,
      'max_discount_percent',v_state.max_discount_percent,
      'min_gross_margin_percent',v_state.min_gross_margin_percent,
      'last_rotation_date',v_state.last_rotation_date,
      'last_rotation_count',v_state.last_rotation_count,
      'today',v_today::text,
      'last_rotation_at',v_state.last_run_at
    ),
    'offers',v_offers
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.da_offer_rotation_run_v1(p_force boolean)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public','private','pg_temp'
AS $function$
DECLARE
  v_state private.da_offer_rotation_state_v1%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(6121013);
  SELECT * INTO v_state FROM private.da_offer_rotation_state_v1 WHERE id=1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily offer rotation state missing';
  END IF;

  v_starts_at := v_today::timestamp AT TIME ZONE 'America/Cuiaba';
  v_ends_at := (v_today + 1)::timestamp AT TIME ZONE 'America/Cuiaba';

  IF v_state.enabled IS DISTINCT FROM true THEN
    UPDATE public.products
    SET is_offer=false,
        offer_price=NULL,
        metadata=coalesce(metadata,'{}'::jsonb)-'offer_source'-'offer_discount_percent'-'offer_starts_at'-'offer_ends_at'-'offer_rotation_date'
    WHERE metadata->>'offer_source'='auto_rotation';
    UPDATE private.da_offer_rotation_state_v1
    SET last_run_at=now(),last_rotation_date=v_today,last_rotation_count=0
    WHERE id=1;
    RETURN jsonb_build_object('rotated',false,'enabled',false,'date',v_today::text,'offer_count',0);
  END IF;

  IF coalesce(p_force,false)=false AND v_state.last_rotation_date=v_today THEN
    RETURN jsonb_build_object(
      'rotated',false,
      'already_rotated',true,
      'enabled',true,
      'date',v_today::text,
      'offer_count',v_state.last_rotation_count
    );
  END IF;

  UPDATE public.products
  SET is_offer=false,
      offer_price=NULL,
      metadata=coalesce(metadata,'{}'::jsonb)-'offer_source'-'offer_discount_percent'-'offer_starts_at'-'offer_ends_at'-'offer_rotation_date'
  WHERE metadata->>'offer_source'='auto_rotation';

  WITH settings AS (
    SELECT daily_product_count,min_discount_percent,max_discount_percent,min_gross_margin_percent
    FROM private.da_offer_rotation_state_v1
    WHERE id=1
  ),
  candidates AS (
    SELECT p.id,p.price,p.cost,
      (s.min_discount_percent+floor(random()*(s.max_discount_percent-s.min_discount_percent+1)))::integer AS discount_percent,
      s.min_gross_margin_percent
    FROM public.products p
    JOIN public.storefront_product_sellable_stock_v1 stock ON stock.product_id=p.id
    CROSS JOIN settings s
    WHERE p.is_active=true
      AND stock.is_active=true
      AND coalesce(stock.sellable_stock,0)>0
      AND p.price>0
      AND p.cost>0
      AND (p.validity_date IS NULL OR p.validity_date>=v_today)
      AND p.is_offer IS DISTINCT FROM true
      AND p.metadata->>'daily_offer_excluded_date' IS DISTINCT FROM v_today::text
      AND (
        nullif(p.metadata->>'daily_offer_last_selected_date','') IS NULL
        OR p.metadata->>'daily_offer_last_selected_date' <= (v_today-7)::text
      )
  ),
  priced AS (
    SELECT id,price,cost,discount_percent,min_gross_margin_percent,
      round(price*(100-discount_percent)::numeric/100,2) AS final_price
    FROM candidates
  ),
  chosen AS (
    SELECT id,discount_percent,final_price
    FROM priced
    WHERE final_price>0
      AND final_price<price
      AND final_price>=cost/(1-min_gross_margin_percent/100)
    ORDER BY random()
    LIMIT (SELECT daily_product_count FROM settings)
  )
  UPDATE public.products p
  SET is_offer=true,
      offer_price=chosen.final_price,
      metadata=(coalesce(p.metadata,'{}'::jsonb)-'daily_offer_excluded_date')
        || jsonb_build_object(
          'offer_source','auto_rotation',
          'offer_discount_percent',chosen.discount_percent,
          'offer_starts_at',v_starts_at,
          'offer_ends_at',v_ends_at,
          'offer_rotation_date',v_today::text,
          'daily_offer_last_selected_date',v_today::text
        )
  FROM chosen
  WHERE p.id=chosen.id;

  GET DIAGNOSTICS v_count=ROW_COUNT;

  UPDATE private.da_offer_rotation_state_v1
  SET cycle_started_at=now(),
      last_run_at=now(),
      last_rotation_date=v_today,
      last_rotation_count=v_count
  WHERE id=1;

  RETURN jsonb_build_object(
    'rotated',true,
    'enabled',true,
    'date',v_today::text,
    'offer_count',v_count,
    'target_count',v_state.daily_product_count
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.da_offer_cycle_v1()
RETURNS jsonb
LANGUAGE sql
SET search_path TO 'public','private','pg_temp'
AS $function$
  SELECT private.da_offer_rotation_run_v1(false);
$function$;

CREATE OR REPLACE FUNCTION public.da_offer_rotation_admin_v1(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public','private','pg_temp'
AS $function$
DECLARE
  v_action text := lower(trim(coalesce(p_action,'')));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_state private.da_offer_rotation_state_v1%ROWTYPE;
  v_was_enabled boolean;
  v_enabled boolean;
  v_daily_count integer;
  v_min_discount integer;
  v_max_discount integer;
  v_min_margin numeric(5,2);
  v_product_id uuid;
  v_removed integer := 0;
  v_today date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_result jsonb;
BEGIN
  IF v_action='get' THEN
    RETURN private.da_offer_rotation_snapshot_v1();
  ELSIF v_action='save' THEN
    SELECT * INTO v_state FROM private.da_offer_rotation_state_v1 WHERE id=1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'daily offer rotation state missing'; END IF;

    v_enabled := coalesce((v_payload->>'enabled')::boolean,false);
    v_daily_count := nullif(v_payload->>'daily_product_count','')::integer;
    v_min_discount := nullif(v_payload->>'min_discount_percent','')::integer;
    v_max_discount := nullif(v_payload->>'max_discount_percent','')::integer;
    v_min_margin := nullif(v_payload->>'min_gross_margin_percent','')::numeric;

    IF v_daily_count IS NULL OR v_daily_count NOT BETWEEN 1 AND 100
      OR v_min_discount IS NULL OR v_min_discount NOT BETWEEN 5 AND 15
      OR v_max_discount IS NULL OR v_max_discount NOT BETWEEN v_min_discount AND 15
      OR v_min_margin IS NULL OR v_min_margin NOT BETWEEN 0 AND 50 THEN
      RETURN jsonb_build_object('status',400,'error','daily_offer_settings_invalid','message','Configuração de oferta diária inválida.');
    END IF;

    v_was_enabled := v_state.enabled IS TRUE;
    UPDATE private.da_offer_rotation_state_v1
    SET enabled=v_enabled,
        daily_product_count=v_daily_count,
        min_discount_percent=v_min_discount,
        max_discount_percent=v_max_discount,
        min_gross_margin_percent=v_min_margin,
        last_rotation_date=CASE WHEN v_enabled AND NOT v_was_enabled THEN NULL ELSE last_rotation_date END
    WHERE id=1;

    IF NOT v_enabled OR (v_enabled AND NOT v_was_enabled) THEN
      v_result := private.da_offer_rotation_run_v1(false);
    ELSIF v_state.daily_product_count IS DISTINCT FROM v_daily_count
      OR v_state.min_discount_percent IS DISTINCT FROM v_min_discount
      OR v_state.max_discount_percent IS DISTINCT FROM v_max_discount
      OR v_state.min_gross_margin_percent IS DISTINCT FROM v_min_margin THEN
      v_result := private.da_offer_rotation_run_v1(true);
    END IF;
    RETURN private.da_offer_rotation_snapshot_v1();
  ELSIF v_action='generate' THEN
    v_result := private.da_offer_rotation_run_v1(true);
    RETURN private.da_offer_rotation_snapshot_v1() || jsonb_build_object('run',v_result);
  ELSIF v_action='remove' THEN
    v_product_id := nullif(v_payload->>'product_id','')::uuid;
    IF v_product_id IS NULL THEN
      RETURN jsonb_build_object('status',400,'error','invalid_product_id','message','Produto inválido.');
    END IF;
    UPDATE public.products
    SET is_offer=false,
        offer_price=NULL,
        metadata=(coalesce(metadata,'{}'::jsonb)-'offer_source'-'offer_discount_percent'-'offer_starts_at'-'offer_ends_at'-'offer_rotation_date')
          || jsonb_build_object('daily_offer_excluded_date',v_today::text)
    WHERE id=v_product_id
      AND is_offer=true
      AND metadata->>'offer_source'='auto_rotation'
      AND metadata->>'offer_rotation_date'=v_today::text;
    GET DIAGNOSTICS v_removed=ROW_COUNT;
    IF v_removed=0 THEN
      RETURN jsonb_build_object('status',404,'error','daily_offer_not_found','message','Essa oferta diária já não está ativa.');
    END IF;
    RETURN private.da_offer_rotation_snapshot_v1() || jsonb_build_object('removed',true);
  END IF;

  RETURN jsonb_build_object('status',400,'error','daily_offer_action_invalid','message','Ação de oferta diária inválida.');
END
$function$;

REVOKE ALL ON FUNCTION private.da_offer_rotation_snapshot_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.da_offer_rotation_run_v1(boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.da_offer_cycle_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.da_offer_rotation_admin_v1(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.da_offer_rotation_snapshot_v1() TO service_role;
GRANT EXECUTE ON FUNCTION private.da_offer_rotation_run_v1(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION private.da_offer_cycle_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.da_offer_rotation_admin_v1(text,jsonb) TO service_role;

DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid=38) THEN
    PERFORM cron.alter_job(
      job_id => 38,
      schedule => '0 4 * * *',
      command => 'select private.da_offer_cycle_v1();',
      active => true
    );
  ELSE
    PERFORM cron.schedule(
      'dona-antonia-daily-offers-v1',
      '0 4 * * *',
      'select private.da_offer_cycle_v1();'
    );
  END IF;
END
$schedule$;
