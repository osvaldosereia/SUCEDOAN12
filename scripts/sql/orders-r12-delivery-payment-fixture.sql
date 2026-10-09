-- R12 payment/return fixture on SAME disposable R02-R11 checkout database.
-- Does NOT run against live Supabase, customers, Bling or SEFAZ.
\set ON_ERROR_STOP on
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.order_fiscal_controls
  ADD COLUMN IF NOT EXISTS dispatch_started_at timestamptz;
CREATE TABLE public.order_payment_settlements(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  expected_total_cents bigint NOT NULL,
  captured_total_cents bigint NOT NULL,
  planned_method text,
  operator_label text,
  source text NOT NULL,
  bling_sync_state text NOT NULL DEFAULT 'blocked_homologation',
  bling_sync_ref text,
  bling_sync_error text,
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.order_payment_parts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.order_payment_settlements(id),
  sequence integer NOT NULL,
  method text NOT NULL,
  amount_cents bigint NOT NULL,
  detail jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(settlement_id,sequence)
);
CREATE TABLE public.order_delivery_return_cases(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  attempt_number integer NOT NULL DEFAULT 1,
  reason_code text,
  reason_label text,
  note text,
  status text NOT NULL,
  recommended_disposition text,
  final_disposition text,
  failed_at timestamptz DEFAULT now(),
  failed_by text,
  returned_at timestamptz,
  returned_by text,
  closed_at timestamptz,
  resolution text,
  resolution_ref text,
  idempotency_key text UNIQUE,
  metadata jsonb DEFAULT '{}'::jsonb
);
-- External support actions are deliberately stubs, NOT customer actions.
CREATE FUNCTION public.ops_prepare_delivery_payment_bling_shadow_v1(p_settlement_id uuid)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('ok',true,'shadow_only',true,
    'external_write',false,'bling_sync_state','blocked_homologation')
$$;
CREATE FUNCTION public.ops2_refresh_order_public_snapshot_v1(p_order_id uuid)
RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('ok',true) $$;
CREATE FUNCTION public.ops_record_event_v1(
 p_domain text,p_event_type text,p_summary text,p_actor_type text,
 p_entity_type text,p_entity_id text,p_correlation_id text,p_actor_id text,
 p_actor_label text,p_source_system text,p_severity text,p_payload jsonb,
 p_external_ref text,p_idempotency_key text,p_occurred_at timestamptz
) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;

CREATE TABLE public.r12_test_payments(
 scenario text PRIMARY KEY,
 order_id uuid NOT NULL
);
INSERT INTO public.r12_test_payments(scenario,order_id)
SELECT 'authorized',order_id FROM public.r2_r5_meta_test_orders WHERE kind='basket';
INSERT INTO public.r12_test_payments(scenario,order_id)
SELECT 'uncertain',order_id FROM public.r2_r5_meta_test_orders WHERE kind='mold';

-- R10 allows returning to out_for_delivery from the already authorized
-- synthetic delivered state; mimic driver post-dispatch before payment.
UPDATE public.orders
SET status='out_for_delivery',delivered_at=NULL
WHERE id=(SELECT order_id FROM public.r12_test_payments WHERE scenario='authorized');
UPDATE public.order_fiscal_controls SET dispatch_started_at=now()
WHERE order_id=(SELECT order_id FROM public.r12_test_payments WHERE scenario='authorized');
DO $r12_bootstrap$
BEGIN
 IF (SELECT status FROM public.orders WHERE id=(
     SELECT order_id FROM public.r12_test_payments WHERE scenario='authorized'))<>'out_for_delivery'
   OR (SELECT status FROM public.orders WHERE id=(
     SELECT order_id FROM public.r12_test_payments WHERE scenario='uncertain'))<>'ready'
 THEN RAISE EXCEPTION 'r12_synthetic_orders_not_ready'; END IF;
END $r12_bootstrap$;
