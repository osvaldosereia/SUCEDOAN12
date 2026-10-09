-- R10 offline-only schema, after R02/R06/R07/R09 fixtures and tests.
-- Mirrors the current production outbox's unique key and one-attempt policy.
\set ON_ERROR_STOP on
CREATE TABLE public.dispatch_fiscal_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  source_order_id uuid,bling_order_id bigint,
  fiscal_version integer NOT NULL DEFAULT 1 CHECK(fiscal_version>0),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK(status IN
    ('held','ready','generating','generated','authorizing',
     'authorized','review_required','error','cancelled')),
  external_side_effect boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  max_attempts integer NOT NULL DEFAULT 1 CHECK(max_attempts=1),
  bling_invoice_id bigint,
  access_key text,sefaz_status text,
  error_code text,error_detail text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(order_id,fiscal_version)
);
CREATE TABLE public.order_fiscal_controls(
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  dispatch_fiscal_status text,
  dispatch_fiscal_authorized_at timestamptz,
  dispatch_fiscal_source text,dispatch_fiscal_reason text,
  bling_invoice_id bigint,sefaz_status text,
  issued_at timestamptz,updated_at timestamptz
);

INSERT INTO public.dispatch_fiscal_jobs(
  order_id,source_order_id,bling_order_id,fiscal_version,
  idempotency_key,status,attempts,max_attempts)
SELECT q.order_id,q.order_id,q.bling_order_id,1,
  'dispatch-fiscal:'||q.order_id::text||':v1','ready',0,1
FROM public.order_fiscal_r9_observations_v1 q
WHERE q.status='observed_no_invoice';
