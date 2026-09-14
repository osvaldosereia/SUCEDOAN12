-- Customer taxonomy v2 normalization: avoid duplicate customer chips
-- "Conservas" and "Enlatados e Conservas" represent the same shopping intent.

update public.products
   set customer_subsubcategory = 'Enlatados e Conservas',
       customer_taxonomy_updated_at = now()
 where customer_taxonomy_version = 'v2_2026_09'
   and customer_category = 'Para Casa'
   and customer_subcategory = 'Mercearia'
   and customer_subsubcategory = 'Conservas';
