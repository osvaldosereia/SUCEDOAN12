-- R05 disposable CI only. Runs after synthetic R04 end-to-end assertions.
\set ON_ERROR_STOP on
ALTER TABLE public.order_separation_completions_v1
  ADD COLUMN phase text NOT NULL DEFAULT 'prepared';
ALTER TABLE public.order_separation_completions_v1
  ADD COLUMN completed_at timestamptz;
ALTER TABLE public.order_separation_items_v1
  ADD COLUMN quantity numeric NOT NULL DEFAULT 1;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT '60000000-0000-4000-8000-000000000001'::uuid $$;
CREATE TABLE public.admin_users(
  user_id uuid PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true
);
INSERT INTO public.admin_users(user_id,is_active)
VALUES ('60000000-0000-4000-8000-000000000001',true);
-- A test-only stand-in for the existing, admin-validated manual queue RPC.
CREATE FUNCTION public.manual_pick_queue_feed_v1()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'ok',true,
    'orders',jsonb_build_array(
      jsonb_build_object('id','10000000-0000-4000-8000-000000000001',
                         'public_code','08|10|2026 - 001','status','confirmed'),
      jsonb_build_object('id','10000000-0000-4000-8000-000000000002',
                         'public_code','08|10|2026 - 002','status','confirmed')
    )
  )
$$;
