-- R02+ lab-only dependencies for the EXACT real Bling stock, loose
-- stock and basket-locked stock views. Run in the NINTH disposable PG17
-- database, after canonical basket-availability fixture, BEFORE new views.
-- Absolutely no production DDL, no real products, no Bling credentials.
\set ON_ERROR_STOP on

-- Existing minimal checkout fixture provides a legacy simulated loose-stock
-- view and basket-availability setup provides a simulated sellable-stock view.
DROP VIEW public.ops2_loose_sellable_stock_v1;
DROP VIEW public.ops2_sellable_stock_v1;

ALTER TABLE public.products ADD COLUMN gtin text;
CREATE TABLE public.bling_hub_entity_links_v2(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  entity_type text NOT NULL,
  source_id text NOT NULL,
  bling_id bigint,
  status text NOT NULL,
  last_verified_at timestamptz
);
CREATE UNIQUE INDEX bling_hub_links_synthetic_unique
  ON public.bling_hub_entity_links_v2(source_system,entity_type,source_id);

CREATE TABLE public.bling_stock_mirror_v2(
  product_id uuid PRIMARY KEY REFERENCES public.products(id),
  physical_total numeric(14,3),
  virtual_total numeric(14,3),
  deposit_balances jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz,
  source_event_id text,
  source_resource text
);
CREATE TABLE public.basket_lot_component_reservations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.basket_stock_lots(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  status text NOT NULL,
  quantity_reserved numeric(14,3) NOT NULL
);
UPDATE public.bling_hub_runtime_v2 SET metadata=
  jsonb_build_object('ops2_stock_authority','bling',
    'selected_deposit_id',5,'ops2_stock_cutover_at','2026-10-08T00:00:00Z')
WHERE id=1;
INSERT INTO public.bling_hub_entity_links_v2(
  source_system,entity_type,source_id,bling_id,status,last_verified_at)
SELECT 'vitrine_qx','product',p.id::text,
  90000+row_number() OVER (ORDER BY p.id),'matched',now()
FROM public.products p;
INSERT INTO public.bling_stock_mirror_v2(
  product_id,physical_total,virtual_total,deposit_balances,
  observed_at,source_event_id,source_resource)
SELECT p.id,p.stock,p.stock,
  jsonb_build_object('5',jsonb_build_object(
    'physical',p.stock,'virtual',p.stock)),
  now(),'synthetic-stock-event','tests/disposable-mirror'
FROM public.products p
WHERE p.id<>'00000000-0000-4000-8000-0000000000cc'::uuid;

-- No GRANT on views/tables to anon or authenticated. In production each
-- canonical stock view uses security_invoker=true and is service-role only.
