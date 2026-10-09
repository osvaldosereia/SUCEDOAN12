-- R02+R03 synthetic LABORATORY ONLY. The existing R02 basket fixture's
-- availability view is simplified. Upgrade required tables before replacing
-- it with the exact production pg_get_viewdef, with no real operational data.
\set ON_ERROR_STOP on
DROP VIEW public.basket_lot_public_availability_v1;

CREATE TABLE public.basket_categories (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.basket_templates ADD COLUMN category_id uuid;
ALTER TABLE public.basket_kit_templates
  ADD COLUMN category_id uuid,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.basket_stock_lots
  ADD COLUMN quantity_built integer,
  ADD COLUMN composition_hash text,
  ADD COLUMN built_at timestamptz,
  ADD COLUMN built_by text,
  ADD COLUMN notes text,
  ADD COLUMN source text,
  ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN duplicated_from_lot_id uuid,
  ADD COLUMN quantity_dismantled integer DEFAULT 0,
  ADD COLUMN sale_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN component_sum_snapshot numeric,
  ADD COLUMN hidden_adjustment_snapshot numeric,
  ADD COLUMN business_type text,
  ADD COLUMN own_sale_price_override numeric,
  ADD COLUMN own_component_sum_snapshot numeric,
  ADD COLUMN own_hidden_adjustment_snapshot numeric,
  ADD COLUMN own_cost_sum_snapshot numeric,
  ADD COLUMN cost_sum_snapshot numeric,
  ADD COLUMN assembly_status text NOT NULL DEFAULT 'mounted';

-- The underlying 'ops2_sellable_stock_v1' is separately audited next:
-- a fixture with effective_sellable_stock derived only from synthetic
-- product.stock. It is NOT a production Bling/warehouse stock mirror.
CREATE VIEW public.ops2_sellable_stock_v1 AS
SELECT id AS product_id,stock AS effective_sellable_stock
FROM public.products;

INSERT INTO public.basket_categories(id,name,is_active)
VALUES ('00000000-0000-4000-8000-0000000000d5','CATEGORIA DE TESTE',true);
UPDATE public.basket_templates
SET category_id='00000000-0000-4000-8000-0000000000d5'::uuid
WHERE id IN ('00000000-0000-4000-8000-0000000000d1',
             '00000000-0000-4000-8000-0000000000d4');
UPDATE public.basket_kit_templates
SET category_id='00000000-0000-4000-8000-0000000000d5'::uuid,
    is_active=true
WHERE id IN ('00000000-0000-4000-8000-0000000000a1',
             '00000000-0000-4000-8000-0000000000a2');
UPDATE public.basket_stock_lots SET
  sale_enabled=true,
  assembly_status='mounted',
  quantity_built=quantity_available,
  source='synthetic',
  business_type='mock'
WHERE id IN ('00000000-0000-4000-8000-0000000000f1',
             '00000000-0000-4000-8000-0000000000f2',
             '00000000-0000-4000-8000-0000000000f3');
