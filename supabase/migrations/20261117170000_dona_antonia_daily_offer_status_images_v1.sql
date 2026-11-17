-- Daily WhatsApp Status images for the rotating offers.
-- The existing offer set is unchanged; future daily selections require product photos.

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
      AND NULLIF(BTRIM(p.image_url),'') IS NOT NULL
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

CREATE TABLE IF NOT EXISTS public.da_offer_status_images_v1 (
  offer_date date PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','generating','ready','failed','empty')),
  product_count integer NOT NULL DEFAULT 0 CHECK (product_count >= 0),
  image_count integer NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  unpictured_count integer NOT NULL DEFAULT 0 CHECK (unpictured_count >= 0),
  image_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  zip_path text,
  generated_at timestamptz,
  error_message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.da_offer_status_images_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.da_offer_status_images_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.da_offer_status_images_v1 TO service_role;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='da_offer_status_images_v1'
      AND policyname='service role manages daily offer status images'
  ) THEN
    CREATE POLICY "service role manages daily offer status images"
      ON public.da_offer_status_images_v1
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END
$policy$;

CREATE TABLE IF NOT EXISTS private.da_offer_status_image_cron_token_v1 (
  id smallint PRIMARY KEY CHECK (id=1),
  token_hash text NOT NULL CHECK (length(token_hash)=64)
);
REVOKE ALL ON TABLE private.da_offer_status_image_cron_token_v1 FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('daily-offer-status','daily-offer-status',false,67108864,ARRAY['image/png','application/zip'])
ON CONFLICT (id) DO UPDATE
SET name=EXCLUDED.name,
    public=false,
    file_size_limit=EXCLUDED.file_size_limit,
    allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.da_offer_status_images_cron_authorized_v1(p_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog','private','extensions','pg_temp'
AS $function$
  SELECT p_token IS NOT NULL
    AND length(p_token)>=32
    AND EXISTS (
      SELECT 1
      FROM private.da_offer_status_image_cron_token_v1 t
      WHERE t.id=1
        AND t.token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
    );
$function$;

REVOKE ALL ON FUNCTION public.da_offer_status_images_cron_authorized_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.da_offer_status_images_cron_authorized_v1(text) TO service_role;

CREATE OR REPLACE FUNCTION private.da_offer_cycle_with_status_images_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','private','vault','net','extensions','pg_temp'
AS $function$
DECLARE
  v_rotation jsonb;
  v_token text;
  v_request_id bigint;
BEGIN
  v_rotation := private.da_offer_rotation_run_v1(false);

  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name='da_offer_status_images_cron_token_v1'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NOT NULL THEN
    SELECT net.http_post(
      url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/daily-offer-status-images-v1',
      body := '{"action":"generate"}'::jsonb,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey','sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8',
        'x-da-offer-cron-key',v_token
      ),
      timeout_milliseconds := 10000
    ) INTO v_request_id;
  END IF;

  RETURN coalesce(v_rotation,'{}'::jsonb) || jsonb_build_object(
    'images_requested',v_request_id IS NOT NULL,
    'image_request_id',v_request_id
  );
END
$function$;

REVOKE ALL ON FUNCTION private.da_offer_cycle_with_status_images_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.da_offer_cycle_with_status_images_v1() TO service_role;

DO $schedule$
DECLARE
  v_job_id integer;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname='da-offer-cycle-v1'
  ORDER BY jobid
  LIMIT 1;

  IF v_job_id IS NULL THEN
    SELECT cron.schedule(
      'da-offer-cycle-v1',
      '0 4 * * *',
      'select private.da_offer_cycle_with_status_images_v1();'
    ) INTO v_job_id;
  ELSE
    PERFORM cron.alter_job(
      job_id=>v_job_id,
      schedule=>'0 4 * * *',
      command=>'select private.da_offer_cycle_with_status_images_v1();',
      active=>true
    );
  END IF;

  -- Activate after the encrypted cron token has been installed below.
  PERFORM cron.alter_job(job_id=>v_job_id,active=>false);
END
$schedule$;

NOTIFY pgrst,'reload schema';
