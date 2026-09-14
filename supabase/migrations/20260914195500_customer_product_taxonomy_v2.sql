-- Customer-facing product taxonomy for the /comprar experience.
-- Legacy category/subcategory/subsubcategory fields remain untouched for rollback and compatibility.

alter table public.products
  add column if not exists customer_category text,
  add column if not exists customer_subcategory text,
  add column if not exists customer_subsubcategory text,
  add column if not exists customer_taxonomy_version text,
  add column if not exists customer_taxonomy_confidence text,
  add column if not exists customer_taxonomy_review_status text;

comment on column public.products.customer_category is
  'Customer-facing top product taxonomy. Current v2 values: Para Você or Para Casa.';
comment on column public.products.customer_subcategory is
  'Customer-facing second taxonomy level.';
comment on column public.products.customer_subsubcategory is
  'Customer-facing third taxonomy level.';
comment on column public.products.customer_taxonomy_version is
  'Version of customer-facing taxonomy classification.';
comment on column public.products.customer_taxonomy_confidence is
  'Classification confidence: high, medium or low.';
comment on column public.products.customer_taxonomy_review_status is
  'Classification review state: auto_classified, needs_review or reviewed.';

create index if not exists idx_products_customer_taxonomy_v2_catalog
  on public.products (customer_category, customer_subcategory, customer_subsubcategory, name)
  where is_active = true
    and physically_verified = true
    and stock > 0;
