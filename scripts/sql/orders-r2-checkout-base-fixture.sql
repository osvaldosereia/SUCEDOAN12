-- R02 checkout base: disposable PostgreSQL 17 minimal dependencies.
-- The v3_base, v3 and reservation procedures are REAL live definitions
-- captured read-only from Supabase. Supporting catalog is synthetic and
-- deliberately supports DIRECT PRODUCTS only, not basket lot allocation.
\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $roles$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
     EXECUTE format('CREATE ROLE %I',role_name);
   END IF;
 END LOOP;
END $roles$;
CREATE TABLE public.customers (
  id uuid PRIMARY KEY,
  primary_whatsapp_e164 text UNIQUE
);
CREATE TABLE public.customer_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id),
  phone_e164 text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  sku text,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  price numeric(14,2) NOT NULL,
  offer_price numeric(14,2),
  is_offer boolean NOT NULL DEFAULT false,
  image_url text,
  stock numeric(14,3) NOT NULL DEFAULT 0
);
CREATE TABLE public.basket_templates(
  id uuid PRIMARY KEY,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  image_url text
);
CREATE TABLE public.basket_stock_lots(
  id uuid PRIMARY KEY,
  basket_id uuid,
  quantity_available integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ready',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.basket_molds(
  id uuid PRIMARY KEY,
  basket_id uuid REFERENCES public.basket_templates(id)
);
CREATE TABLE public.orders(
  id uuid PRIMARY KEY,
  customer_id uuid,
  status text NOT NULL DEFAULT 'storefront_received',
  total numeric(14,2) NOT NULL DEFAULT 0,
  currency char(3),
  delivery_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  basket_id uuid,
  fiscal_subtotal numeric(14,2),
  other_expenses numeric(14,2) DEFAULT 0,
  discount numeric(14,2) DEFAULT 0,
  sync_status text NOT NULL DEFAULT 'local',
  idempotency_key text,
  payment_method text,
  phone_e164 text,
  source text NOT NULL DEFAULT 'vitrine',
  subtotal numeric(14,2),
  order_number text,
  basket_name_snapshot text,
  checkout_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  bling_synced_at timestamptz
);
CREATE TABLE public.order_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  product_id uuid REFERENCES public.products(id),
  sku_snapshot text,
  name_snapshot text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  line_total numeric(14,2) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.bling_hub_runtime_v2(
  id integer PRIMARY KEY,
  metadata jsonb NOT NULL
);
INSERT INTO public.bling_hub_runtime_v2 VALUES
 (1,'{"ops2_stock_authority":"bling"}'::jsonb);
CREATE TABLE public.vitrine_stock_reservations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric(14,3) NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  released_at timestamptz,
  UNIQUE(order_id,product_id)
);
-- Simplified fixed stock mirror; the real view is NOT reproduced here.
-- The real reserve RPC subtracts pending active reservations itself.
CREATE VIEW public.ops2_loose_sellable_stock_v1 AS
SELECT p.id AS product_id,p.is_active,p.stock AS loose_sellable_stock,
       true AS bling_stock_ready
FROM public.products p;
-- The mocked customer enrichment is not the checkout/stock authority.
-- Its real version needs messaging tables and registration state.
CREATE FUNCTION public.normalize_storefront_phone_v2(p_phone text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_phone IS NULL OR btrim(p_phone)=''
    THEN NULL ELSE p_phone END
 $$;
CREATE FUNCTION public.ops2_enrich_storefront_order_result_v1(p_result jsonb)
 RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT p_result $$;
CREATE TABLE public.basket_stock_allocations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  basket_id uuid,
  lot_id uuid,
  quantity integer NOT NULL DEFAULT 0,
  status text DEFAULT 'allocated',
  component_snapshot jsonb,
  allocation_role text,
  metadata jsonb,
  UNIQUE(order_id,lot_id,basket_id,allocation_role)
);
INSERT INTO public.products(id,sku,name,price,stock,is_active)
VALUES
('00000000-0000-4000-8000-0000000000aa','TEST-ARROZ','ARROZ SINTETICO',50,10,true),
('00000000-0000-4000-8000-0000000000bb','TEST-SABAO','SABAO SINTETICO',80,2,true),
('00000000-0000-4000-8000-0000000000cc','TEST-ZERO','SEM ESTOQUE',15,0,true);
