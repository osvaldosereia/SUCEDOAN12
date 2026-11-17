-- Publish the daily offer images as Instagram Stories from GitHub Actions.
-- Instagram credentials remain in Supabase Vault; the public repo only receives short-lived OIDC tokens.

UPDATE storage.buckets
SET allowed_mime_types=ARRAY['image/jpeg']
WHERE id='daily-offer-status';

CREATE TABLE IF NOT EXISTS public.da_offer_story_publications_v1 (
  offer_date date NOT NULL,
  image_number smallint NOT NULL CHECK (image_number BETWEEN 1 AND 8),
  source_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','creating','container_created','publishing','published','failed','needs_review')),
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  creation_id text,
  story_id text,
  last_error text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_date, image_number)
);

ALTER TABLE public.da_offer_story_publications_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.da_offer_story_publications_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.da_offer_story_publications_v1 TO service_role;

CREATE INDEX IF NOT EXISTS da_offer_story_publications_v1_date_status_idx
  ON public.da_offer_story_publications_v1 (offer_date, status);

CREATE OR REPLACE FUNCTION public.da_offer_story_instagram_token_v1()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog','vault','pg_temp'
AS $function$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name='dona_antonia_instagram_story_access_token_v1'
  ORDER BY created_at DESC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.da_offer_story_instagram_token_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.da_offer_story_instagram_token_v1() TO service_role;

CREATE OR REPLACE FUNCTION public.da_offer_story_claim_v1(p_offer_date date,p_image_number integer,p_source_path text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp'
AS $function$
DECLARE
  v_row public.da_offer_story_publications_v1%ROWTYPE;
BEGIN
  IF p_offer_date IS NULL OR p_image_number IS NULL OR p_image_number < 1 OR p_image_number > 8
     OR p_source_path IS NULL OR length(p_source_path) > 300 THEN
    RAISE EXCEPTION 'invalid story publication key';
  END IF;

  INSERT INTO public.da_offer_story_publications_v1 (offer_date,image_number,source_path)
  VALUES (p_offer_date,p_image_number,p_source_path)
  ON CONFLICT (offer_date,image_number) DO NOTHING;

  SELECT * INTO v_row
  FROM public.da_offer_story_publications_v1
  WHERE offer_date=p_offer_date AND image_number=p_image_number
  FOR UPDATE;

  IF v_row.status IN ('creating','publishing') AND v_row.updated_at < now() - interval '5 minutes' THEN
    UPDATE public.da_offer_story_publications_v1
    SET status='needs_review',
        last_error='A execução anterior foi interrompida; confira o Instagram antes de tentar novamente.',
        updated_at=now()
    WHERE offer_date=p_offer_date AND image_number=p_image_number;
    RETURN jsonb_build_object(
      'action','needs_review',
      'status','needs_review',
      'last_error','A execução anterior foi interrompida; confira o Instagram antes de tentar novamente.'
    );
  END IF;

  IF v_row.status='published' THEN
    RETURN jsonb_build_object('action','skip','status','published');
  END IF;

  IF v_row.status IN ('creating','publishing') THEN
    RETURN jsonb_build_object('action','busy','status',v_row.status);
  END IF;

  IF v_row.status='container_created' THEN
    RETURN jsonb_build_object(
      'action','check_container',
      'status',v_row.status,
      'creation_id',v_row.creation_id
    );
  END IF;

  IF v_row.status IN ('pending','failed') AND v_row.attempt_count < 3 THEN
    UPDATE public.da_offer_story_publications_v1
    SET status='creating',
        source_path=p_source_path,
        attempt_count=attempt_count+1,
        creation_id=NULL,
        story_id=NULL,
        last_error=NULL,
        updated_at=now()
    WHERE offer_date=p_offer_date AND image_number=p_image_number
    RETURNING * INTO v_row;
    RETURN jsonb_build_object(
      'action','create',
      'status',v_row.status,
      'attempt_count',v_row.attempt_count
    );
  END IF;

  RETURN jsonb_build_object(
    'action',v_row.status,
    'status',v_row.status,
    'last_error',v_row.last_error,
    'attempt_count',v_row.attempt_count
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.da_offer_story_container_created_v1(p_offer_date date,p_image_number integer,p_creation_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp'
AS $function$
BEGIN
  UPDATE public.da_offer_story_publications_v1
  SET status='container_created',creation_id=p_creation_id,last_error=NULL,updated_at=now()
  WHERE offer_date=p_offer_date AND image_number=p_image_number AND status='creating'
    AND p_creation_id IS NOT NULL AND length(p_creation_id) BETWEEN 1 AND 120;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION public.da_offer_story_begin_publish_v1(p_offer_date date,p_image_number integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp'
AS $function$
BEGIN
  UPDATE public.da_offer_story_publications_v1
  SET status='publishing',updated_at=now()
  WHERE offer_date=p_offer_date AND image_number=p_image_number
    AND status='container_created' AND creation_id IS NOT NULL;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION public.da_offer_story_mark_published_v1(p_offer_date date,p_image_number integer,p_story_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp'
AS $function$
BEGIN
  UPDATE public.da_offer_story_publications_v1
  SET status='published',story_id=p_story_id,published_at=now(),last_error=NULL,updated_at=now()
  WHERE offer_date=p_offer_date AND image_number=p_image_number AND status='publishing'
    AND p_story_id IS NOT NULL AND length(p_story_id) BETWEEN 1 AND 120;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION public.da_offer_story_mark_failed_v1(p_offer_date date,p_image_number integer,p_error text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp'
AS $function$
BEGIN
  UPDATE public.da_offer_story_publications_v1
  SET status='failed',creation_id=NULL,story_id=NULL,
      last_error=left(coalesce(p_error,'Falha ao criar o Story.'),500),updated_at=now()
  WHERE offer_date=p_offer_date AND image_number=p_image_number
    AND status IN ('creating','container_created');
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION public.da_offer_story_mark_review_v1(p_offer_date date,p_image_number integer,p_error text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp'
AS $function$
BEGIN
  UPDATE public.da_offer_story_publications_v1
  SET status='needs_review',
      last_error=left(coalesce(p_error,'É necessário conferir a publicação.'),500),updated_at=now()
  WHERE offer_date=p_offer_date AND image_number=p_image_number
    AND status IN ('creating','container_created','publishing');
  RETURN FOUND;
END
$function$;

REVOKE ALL ON FUNCTION public.da_offer_story_claim_v1(date,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.da_offer_story_container_created_v1(date,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.da_offer_story_begin_publish_v1(date,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.da_offer_story_mark_published_v1(date,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.da_offer_story_mark_failed_v1(date,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.da_offer_story_mark_review_v1(date,integer,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.da_offer_story_claim_v1(date,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.da_offer_story_container_created_v1(date,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.da_offer_story_begin_publish_v1(date,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.da_offer_story_mark_published_v1(date,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.da_offer_story_mark_failed_v1(date,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.da_offer_story_mark_review_v1(date,integer,text) TO service_role;

NOTIFY pgrst,'reload schema';
