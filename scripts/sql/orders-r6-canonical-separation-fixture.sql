-- R06 isolated fixture copied from verified R02 CI; no production/customer data.
-- R02 synthetic dependency subset for the REAL production separation functions.
-- Execute ONLY in PostgreSQL 17 ephemeral CI DB, never in Supabase production.
-- ops2_init_order_separation_v2 is intentionally stubbed, because items are
-- materialized below. Initialization itself is outside this test's coverage.
\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.orders (
  id uuid PRIMARY KEY,
  order_number text,
  status text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  total numeric(14,2) NOT NULL,
  subtotal numeric(14,2) NOT NULL,
  fiscal_subtotal numeric(14,2) NOT NULL,
  discount numeric(14,2) DEFAULT 0,
  other_expenses numeric(14,2) DEFAULT 0,
  basket_hidden_adjustment numeric(14,2) DEFAULT 0
);
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  product_id uuid,
  name_snapshot text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.order_separation_items_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id),
  product_id uuid,
  state text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  line_total numeric(14,2) NOT NULL
);
CREATE TABLE public.order_separation_assignments_v1 (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  separator_key text NOT NULL
);
CREATE TABLE public.order_separation_completions_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid UNIQUE NOT NULL REFERENCES public.orders(id),
  order_number text,
  phase text NOT NULL,
  original_total numeric(14,2) NOT NULL,
  original_subtotal numeric(14,2) NOT NULL,
  original_fiscal_subtotal numeric(14,2) NOT NULL,
  original_discount numeric(14,2) NOT NULL,
  original_other_expenses numeric(14,2) NOT NULL,
  original_basket_hidden_adjustment numeric(14,2) NOT NULL,
  missing_subtotal numeric(14,2) NOT NULL,
  final_total numeric(14,2) NOT NULL,
  missing_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  deliverable_order_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  separator_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  prepared_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bling_hub_runtime_v2 (
  id integer PRIMARY KEY,
  metadata jsonb NOT NULL
);
INSERT INTO public.bling_hub_runtime_v2
VALUES (1,'{"ops2_stock_authority":"bling"}');
CREATE TABLE public.vitrine_stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  product_id uuid NOT NULL,
  quantity numeric(14,3) NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  consumed_at timestamptz,
  released_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.basket_stock_allocations (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE FUNCTION public.ops2_init_order_separation_v2(p_order_id uuid)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('ok',true,'mocked_init',true)
$$;

-- Test order is only synthetic; four-digit/weekly production numbering is NOT
-- implemented here, but this provides the expected immutable public label.
INSERT INTO public.orders(id,order_number,status,total,subtotal,fiscal_subtotal)
VALUES
 ('00000000-0000-4000-8000-000000000010','08|10|2026 - 001','confirmed',230,230,230),
 ('00000000-0000-4000-8000-000000000020','08|10|2026 - 002','confirmed',85,85,85);
INSERT INTO public.order_items(id,order_id,product_id,name_snapshot)
VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000111','ARROZ FICTICIO'),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000112','SABAO FICTICIO'),
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000121','PRODUTO FICTICIO');
INSERT INTO public.order_separation_items_v1(order_id,order_item_id,product_id,state,quantity,unit_price,line_total)
VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000111','separated',3,66,198),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000112','missing',1,32,32),
 ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000121','pending',1,85,85);
INSERT INTO public.order_separation_assignments_v1(order_id,separator_key)
VALUES ('00000000-0000-4000-8000-000000000010','José');
INSERT INTO public.vitrine_stock_reservations(order_id,product_id,quantity)
VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000111',3),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000112',1);
