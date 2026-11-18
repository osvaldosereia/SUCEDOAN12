CREATE TABLE IF NOT EXISTS private.da_instagram_automation_cron_token_v1 (
  id smallint PRIMARY KEY CHECK (id=1),
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.da_instagram_automation_cron_token_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.da_instagram_automation_cron_token_v1 FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.da_instagram_automation_cron_authorized_v1(p_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog','private','extensions','pg_temp'
AS $function$
  SELECT p_token IS NOT NULL
    AND length(p_token) BETWEEN 32 AND 256
    AND EXISTS (
      SELECT 1
      FROM private.da_instagram_automation_cron_token_v1 t
      WHERE t.id=1
        AND t.token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
    );
$function$;
REVOKE ALL ON FUNCTION public.da_instagram_automation_cron_authorized_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.da_instagram_automation_cron_authorized_v1(text) TO service_role;

CREATE OR REPLACE FUNCTION private.da_instagram_automation_cron_tick_v1()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','private','vault','net','extensions','pg_temp'
AS $function$
DECLARE
  v_token text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name='dona_antonia_instagram_automation_cron_v1'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NULL OR length(v_token)<32 THEN
    RAISE EXCEPTION 'Instagram automation cron token is missing';
  END IF;

  SELECT net.http_post(
    url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/instagram-automation-manager-v1',
    body := '{"action":"run_scheduled"}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8',
      'x-da-instagram-cron-key',v_token
    ),
    timeout_milliseconds := 240000
  ) INTO v_request_id;

  RETURN v_request_id;
END
$function$;
REVOKE ALL ON FUNCTION private.da_instagram_automation_cron_tick_v1() FROM PUBLIC, anon, authenticated, service_role;

DO $token$
DECLARE
  v_token text;
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name='dona_antonia_instagram_automation_cron_v1'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NULL THEN
    v_token := lower(replace(gen_random_uuid()::text || gen_random_uuid()::text,'-',''));
    PERFORM vault.create_secret(
      v_token,
      'dona_antonia_instagram_automation_cron_v1',
      'Private authentication token for the Instagram automation scheduler'
    );
  END IF;

  INSERT INTO private.da_instagram_automation_cron_token_v1(id,token_hash)
  VALUES (1,encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex'))
  ON CONFLICT (id) DO UPDATE
  SET token_hash=EXCLUDED.token_hash,created_at=now();
END
$token$;

DO $schedule$
DECLARE
  v_job_id integer;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname='da-instagram-automation-v1'
  ORDER BY jobid
  LIMIT 1;

  IF v_job_id IS NULL THEN
    SELECT cron.schedule(
      'da-instagram-automation-v1',
      '*/5 * * * *',
      'select private.da_instagram_automation_cron_tick_v1();'
    ) INTO v_job_id;
  ELSE
    PERFORM cron.alter_job(
      job_id=>v_job_id,
      schedule=>'*/5 * * * *',
      command=>'select private.da_instagram_automation_cron_tick_v1();',
      active=>true
    );
  END IF;

  PERFORM cron.alter_job(job_id=>v_job_id,active=>true);
END
$schedule$;

NOTIFY pgrst,'reload schema';