-- R02-R06: adapt the narrow R02-R05 test fixtures to the deployed
-- separation receipt/stock RPC schema. Ephemeral PostgreSQL 17 ONLY.
-- No production mutation or fake replacement for the real R06 RPCs.
\set ON_ERROR_STOP on
ALTER TABLE public.orders
  ADD COLUMN basket_hidden_adjustment numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.order_items
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.order_separation_items_v1
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ADD COLUMN order_item_id uuid REFERENCES public.order_items(id),
  ADD COLUMN product_id uuid,
  ADD COLUMN unit_price numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN line_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
-- R05 deliberately inserted two gate-test placeholders. Do not mistake them
-- for picked products; remove them only AFTER R04/R05 assertions pass.
DELETE FROM public.order_separation_items_v1;
ALTER TABLE public.order_separation_items_v1
  ALTER COLUMN order_item_id SET NOT NULL,
  ADD CONSTRAINT r2_r6_picked_order_item_unique UNIQUE(order_id,order_item_id);

ALTER TABLE public.order_separation_completions_v1
  ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD CONSTRAINT r2_r6_completion_id_unique UNIQUE(id),
  ADD COLUMN order_number text,
  ADD COLUMN original_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN original_subtotal numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN original_fiscal_subtotal numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN original_discount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN original_other_expenses numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN original_basket_hidden_adjustment numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN missing_subtotal numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN missing_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN deliverable_order_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN separator_key text,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN prepared_at timestamptz,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- The one completed fixture from R05 is a LEGACY synthetic marker:
-- the genuine R06 receipt is exercised with basket/mold checkouts only.
UPDATE public.order_separation_completions_v1 c
SET order_number=o.order_number, original_total=o.total,
    original_subtotal=coalesce(o.subtotal,0),
    original_fiscal_subtotal=coalesce(o.fiscal_subtotal,0),
    original_discount=coalesce(o.discount,0),
    original_other_expenses=coalesce(o.other_expenses,0),
    original_basket_hidden_adjustment=0
FROM public.orders o WHERE c.order_id=o.id;

-- R02 original checkout fixture already provides bling_hub_runtime_v2,
-- vitrine_stock_reservations and basket_stock_allocations.
SELECT 'R02-R05 schemas adapted for REAL R06 functions (only disposable DB)' result;
