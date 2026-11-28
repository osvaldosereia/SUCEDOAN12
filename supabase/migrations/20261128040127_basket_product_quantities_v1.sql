CREATE TABLE public.site_basket_product_type_option_quantities (
  product_type_id uuid NOT NULL,
  product_id uuid NOT NULL,
  basket_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_basket_product_type_option_quantities_pkey
    PRIMARY KEY (product_type_id,product_id,basket_id),
  CONSTRAINT site_basket_product_type_option_quantities_quantity_check
    CHECK (quantity>=0 AND quantity<=999),
  CONSTRAINT site_basket_product_type_option_quantities_option_fkey
    FOREIGN KEY (product_type_id,product_id)
    REFERENCES public.site_basket_product_type_options(product_type_id,product_id)
    ON DELETE CASCADE,
  CONSTRAINT site_basket_product_type_option_quantities_basket_id_fkey
    FOREIGN KEY (basket_id) REFERENCES public.basket_templates(id) ON DELETE CASCADE
);
CREATE INDEX site_basket_product_type_option_quantities_basket_idx
  ON public.site_basket_product_type_option_quantities(basket_id,product_type_id,product_id);
ALTER TABLE public.site_basket_product_type_option_quantities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.site_basket_product_type_option_quantities FROM anon,authenticated;
GRANT ALL ON TABLE public.site_basket_product_type_option_quantities TO service_role;

ALTER TABLE public.basket_mold_positions
  DROP CONSTRAINT IF EXISTS basket_mold_positions_quantity_check;
ALTER TABLE public.basket_mold_positions
  ADD CONSTRAINT basket_mold_positions_quantity_check
  CHECK (quantity>=0 AND quantity<=999);
