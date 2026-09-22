-- Harden the immutable PapoAI product-family classifier against mutable search_path.
-- Runtime behavior is unchanged; the function only relies on pg_catalog built-ins.
alter function public.papoai_commerce_product_family_v1(text)
set search_path = pg_catalog;
