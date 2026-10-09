-- R02+ real basket_lot_public_availability_v1 fixture dependencies.
-- Run only in the SEVENTH disposable PostgreSQL 17 database, after
-- orders-r2-baskets-kit-mold-fixture.sql, before loading the real view.
\set ON_ERROR_STOP on
ALTER TABLE public.basket_stock_lots
 ADD COLUMN quantity_built integer DEFAULT 0,
 ADD COLUMN composition_hash text,
 ADD COLUMN built_at timestamptz,
 ADD COLUMN built_by text,
 ADD COLUMN notes text,
 ADD COLUMN source text,
 ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb,
 ADD COLUMN created_at timestamptz DEFAULT now(),
 ADD COLUMN duplicated_from_lot_id uuid,
 ADD COLUMN quantity_dismantled integer DEFAULT 0,
 ADD COLUMN sale_enabled boolean DEFAULT true,
 ADD COLUMN component_sum_snapshot numeric(14,2),
 ADD COLUMN hidden_adjustment_snapshot numeric(14,2),
 ADD COLUMN business_type text,
 ADD COLUMN own_sale_price_override numeric(14,2),
 ADD COLUMN own_component_sum_snapshot numeric(14,2),
 ADD COLUMN own_hidden_adjustment_snapshot numeric(14,2),
 ADD COLUMN own_cost_sum_snapshot numeric(14,2),
 ADD COLUMN cost_sum_snapshot numeric(14,2),
 ADD COLUMN assembly_status text DEFAULT 'mounted';
ALTER TABLE public.basket_templates ADD COLUMN category_id uuid;
ALTER TABLE public.basket_kit_templates
 ADD COLUMN category_id uuid,
 ADD COLUMN is_active boolean NOT NULL DEFAULT true;
CREATE TABLE public.basket_categories (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
INSERT INTO public.basket_categories(id,name,is_active)
VALUES ('00000000-0000-4000-8000-0000000000f4','Cestas de teste',true);
UPDATE public.basket_templates
 SET category_id='00000000-0000-4000-8000-0000000000f4';
UPDATE public.basket_kit_templates
 SET category_id='00000000-0000-4000-8000-0000000000f4';
UPDATE public.basket_stock_lots
 SET assembly_status='mounted',sale_enabled=true,quantity_built=quantity_available;
-- Mirror only the local stock field. This is still a synthetic snapshot;
-- actual Bling mirror freshness/source/deposit data are NOT yet reproduced.
CREATE VIEW public.ops2_sellable_stock_v1 AS
 SELECT id AS product_id, stock::numeric AS effective_sellable_stock
 FROM public.products;
