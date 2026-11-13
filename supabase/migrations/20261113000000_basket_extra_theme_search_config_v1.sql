-- Configure public basket extra sections with independent OR search terms.
ALTER TABLE public.basket_extra_themes
  ADD COLUMN IF NOT EXISTS search_terms text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sales_categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.basket_extra_themes.search_terms IS
  'Independent storefront search phrases. A product is included when it matches any phrase.';
COMMENT ON COLUMN public.basket_extra_themes.sales_categories IS
  'Storefront sales_category values included in the section search.';
COMMENT ON COLUMN public.basket_extra_themes.is_active IS
  'Controls whether the configured section is shown in public basket extras.';
