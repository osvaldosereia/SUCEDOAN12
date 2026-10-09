-- R18: PostgreSQL17 disposable database ONLY. Never execute against Supabase.
\set ON_ERROR_STOP on
DO $roles$
DECLARE n text;
BEGIN
 FOREACH n IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=n) THEN
   EXECUTE format('CREATE ROLE %I',n);
  END IF;
 END LOOP;
END;
$roles$;
GRANT USAGE ON SCHEMA public TO service_role,anon,authenticated;
CREATE TABLE public.dispatch_fiscal_jobs(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 status text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0,
 max_attempts integer NOT NULL DEFAULT 2,
 bling_invoice_id bigint,
 access_key text,
 sefaz_status text,
 finished_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.order_separation_completions_v1(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 separator_key text
);
ALTER TABLE public.dispatch_fiscal_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_separation_completions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dispatch_fiscal_jobs,public.order_separation_completions_v1 FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.dispatch_fiscal_jobs,public.order_separation_completions_v1 TO service_role;
