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
-- The third authentic trigger checks vitrine customer registration and address.
CREATE TABLE public.customers(
 id uuid PRIMARY KEY,
 is_active boolean DEFAULT true,
 name text,
 cpf_cnpj text
);
CREATE TABLE public.customer_addresses(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 customer_id uuid NOT NULL REFERENCES public.customers(id),
 is_active boolean DEFAULT true,
 street text, number text, neighborhood text, city text
);
CREATE TABLE public.orders(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source text,
 phone_e164 text,
 payment_method text,
 delivery_address jsonb DEFAULT '{}'::jsonb,
 customer_id uuid REFERENCES public.customers(id)
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customers,public.customer_addresses,public.orders FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.customers,public.customer_addresses,public.orders TO service_role;

