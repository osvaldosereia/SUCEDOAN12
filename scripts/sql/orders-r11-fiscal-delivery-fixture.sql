-- R11 synthetic logistics schema on SAME database as R02->R10 real checkout.
-- Lab only; no delivery addresses, customers or external services.
\set ON_ERROR_STOP on

CREATE TABLE public.ops_delivery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date date NOT NULL DEFAULT (now() at time zone 'America/Cuiaba')::date,
  vehicle_key text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  loading_started_at timestamptz,
  loaded_at timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ops_delivery_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.ops_delivery_runs(id),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  sequence integer NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  loaded_at timestamptz,
  custody_confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id,order_id)
);
CREATE TABLE public.admin_audit_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.r11_test_runs(kind text PRIMARY KEY,run_id uuid NOT NULL);
INSERT INTO public.r11_test_runs(kind,run_id)
VALUES ('authorized_only','00000000-0000-4000-8000-00000000a111'),
       ('unapproved_only','00000000-0000-4000-8000-00000000a112'),
       ('mixed','00000000-0000-4000-8000-00000000a113');
INSERT INTO public.ops_delivery_runs(id,vehicle_key,status)
SELECT run_id,CASE kind WHEN 'mixed' THEN 'car_2' ELSE 'car_1' END,'planned'
FROM public.r11_test_runs;

INSERT INTO public.ops_delivery_stops(run_id,order_id,sequence)
SELECT run.run_id,o.order_id,1
FROM public.r11_test_runs run
CROSS JOIN public.r2_r5_meta_test_orders o
WHERE (run.kind='authorized_only' AND o.kind='basket')
   OR (run.kind='unapproved_only' AND o.kind='mold')
   OR (run.kind='mixed' AND o.kind='basket');
INSERT INTO public.ops_delivery_stops(run_id,order_id,sequence)
SELECT run.run_id,o.order_id,2
FROM public.r11_test_runs run
CROSS JOIN public.r2_r5_meta_test_orders o
WHERE run.kind='mixed' AND o.kind='mold';

DO $r11_fixture$
BEGIN
  IF (SELECT count(*) FROM public.ops_delivery_runs)<>3
     OR (SELECT count(*) FROM public.ops_delivery_stops)<>4
     OR (SELECT count(*) FROM public.r2_r5_meta_test_orders
          WHERE kind='basket')<>1
  THEN RAISE EXCEPTION 'r11_fixture_wrong_shape'; END IF;
END $r11_fixture$;
