-- DA6 PostgreSQL17 ephemeral fixture. NO production schema or credentials.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
'SELECT current_setting(''request.jwt.claim.role'',true)';
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END$$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY REFERENCES auth.users(id),role text NOT NULL,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.inventory_label_photos(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),batch_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL,parsed jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.inventory_label_counts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 photo_id uuid NOT NULL REFERENCES public.inventory_label_photos(id),
 batch_id uuid NOT NULL,product_id uuid NOT NULL,
 label_serial text NOT NULL,balance_slot smallint NOT NULL,
 quantity smallint NOT NULL,confidence numeric NOT NULL,
 status text NOT NULL DEFAULT 'pending_review',
 reviewed_at timestamptz,reviewed_by uuid REFERENCES auth.users(id),
 UNIQUE(label_serial,balance_slot)
);
INSERT INTO auth.users(id) VALUES
('11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222222'),
('33333333-3333-4333-8333-333333333333');
INSERT INTO public.admin_users(user_id,role,is_active) VALUES
('11111111-1111-4111-8111-111111111111','operator',true),
('22222222-2222-4222-8222-222222222222','operator',true),
('33333333-3333-4333-8333-333333333333','viewer',true);
INSERT INTO public.inventory_label_photos(id,batch_id,created_by,status,parsed)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '11111111-1111-4111-8111-111111111111','needs_review',
 '{"product_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","label_serial":"ABCDEF1234","errors":[{"slot":2,"reason":"multiple_marks"}]}'::jsonb);
INSERT INTO public.inventory_label_counts
(photo_id,batch_id,product_id,label_serial,balance_slot,quantity,confidence,status)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','ABCDEF1234',1,23,0.95,'pending_review');
SET request.jwt.claim.role='service_role';
