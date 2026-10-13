-- DA6 R3: PostgreSQL17 isolated fixtures, transaction always rolled back.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
'SELECT current_setting(''request.jwt.claim.role'',true)';
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END$$;
CREATE TABLE public.inventory_label_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_by uuid,
 total_files integer NOT NULL,
 operator text DEFAULT 'Test'
);
CREATE TABLE public.inventory_label_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES public.inventory_label_batches(id),
 created_by uuid NOT NULL,
 storage_path text NOT NULL,
 file_name text NOT NULL,
 mime_type text NOT NULL,
 size_bytes integer NOT NULL,
 sha256 text NOT NULL,
 status text NOT NULL DEFAULT 'uploading',
 attempts smallint NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX inventory_label_photos_operator_sha256_uidx
 ON public.inventory_label_photos(created_by,sha256);
INSERT INTO public.inventory_label_batches(id,created_by,total_files)
 VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',10),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',100),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222',10);
SET request.jwt.claim.role='service_role';
