-- DA6 R4 PostgreSQL 17: schema descartável para testar contratos reais da fila.
-- Executar SOMENTE em banco isolado criado pelo CI.
\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
'SELECT current_setting(''request.jwt.claim.role'',true)';
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE TABLE public.products(id uuid PRIMARY KEY);
INSERT INTO public.products(id) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
CREATE TABLE public.inventory_label_batches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 total_files integer NOT NULL DEFAULT 0,
 created_by uuid,
 operator text NOT NULL DEFAULT 'DA6 CI'
);
CREATE TABLE public.inventory_label_photos(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES public.inventory_label_batches(id),
 created_by uuid NOT NULL,
 storage_path text NOT NULL,
 file_name text NOT NULL,
 mime_type text NOT NULL,
 size_bytes integer NOT NULL,
 sha256 text,
 status text NOT NULL DEFAULT 'uploading',
 attempts smallint NOT NULL DEFAULT 0,
 claimed_at timestamptz,
 next_attempt_at timestamptz,
 finished_at timestamptz,
 error_code text,
 error_detail text,
 parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 claim_token uuid
);
CREATE TABLE public.inventory_label_counts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 photo_id uuid NOT NULL REFERENCES public.inventory_label_photos(id),
 batch_id uuid NOT NULL REFERENCES public.inventory_label_batches(id),
 product_id uuid NOT NULL REFERENCES public.products(id),
 label_serial text NOT NULL,
 balance_slot smallint NOT NULL,
 quantity smallint NOT NULL,
 confidence numeric NOT NULL,
 status text NOT NULL DEFAULT 'pending_review',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(label_serial,balance_slot)
);
INSERT INTO public.inventory_label_batches(id,total_files,created_by) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',100,'11111111-1111-4111-8111-111111111111');
INSERT INTO public.inventory_label_photos(batch_id,created_by,storage_path,file_name,mime_type,size_bytes,sha256,status)
 SELECT 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '11111111-1111-4111-8111-111111111111',
 'ci/'||g::text||'.png','photo-'||g||'.png','image/png',1024,
 lpad(to_hex(g),64,'0'),'queued'
 FROM generate_series(1,100) AS g;
