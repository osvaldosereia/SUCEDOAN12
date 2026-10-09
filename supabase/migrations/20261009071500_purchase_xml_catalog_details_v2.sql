-- Fase 2: informação item a item do catálogo histórico, somente leitura.
-- O EAN comercial ou tributável pode identificar fardo/caixa, não prova a unidade.
create or replace view public.purchase_xml_catalog_observation_details_v2
with (security_invoker=true)
as
select
 case
  when trim(coalesce(o.commercial_gtin,'')) ~ '^[0-9]{8,14}$'
   then 'gtin:'||trim(o.commercial_gtin)
  when trim(coalesce(o.tax_gtin,'')) ~ '^[0-9]{8,14}$'
   then 'tax_gtin:'||trim(o.tax_gtin)
  when nullif(trim(coalesce(o.supplier_item_code,'')),'') is not null
   and nullif(trim(coalesce(d.supplier_document,'')),'') is not null
   then 'supplier:'||d.supplier_document||':'||o.supplier_item_code
  else 'unidentified:'||o.document_id::text||':'||o.item_number::text
 end as candidate_key,
 o.id as observation_id,o.document_id,o.item_number,
 i.id as purchase_item_id,i.product_id as linked_product_id,
 p.name as linked_product_name,p.gtin as linked_product_gtin,
 p.ncm as linked_product_ncm,p.cest as linked_product_cest,
 p.is_active as linked_product_active,
 d.document_key,d.issued_at,d.supplier_name,d.supplier_document,
 d.source,d.metadata->>'catalog_only' as catalog_only,
 o.description as xml_description,o.supplier_item_code,
 o.commercial_gtin,o.tax_gtin,o.ncm as xml_ncm,o.cest as xml_cest,
 o.cfop as xml_cfop,o.purchase_unit,o.purchase_quantity,
 o.purchase_unit_price,o.line_total,o.net_line_total,
 o.tax_unit,o.tax_quantity,o.lot_traces,
 o.source_state,o.parser_version,
 i.conversion_status,i.conversion_factor,i.processing_status as item_status,
 o.extracted_at
from public.purchase_xml_catalog_observations_v1 o
join public.purchase_xml_documents d on d.id=o.document_id
left join public.purchase_xml_items i
 on i.document_id=o.document_id and i.item_number=o.item_number
left join public.products p on p.id=i.product_id;
revoke all on public.purchase_xml_catalog_observation_details_v2 from public,anon,authenticated;
grant select on public.purchase_xml_catalog_observation_details_v2 to service_role;
comment on view public.purchase_xml_catalog_observation_details_v2 is
 'Readonly evidence from original NF-e XML; physical quantities and tax codes remain supplier observations, never approvals to update products.';
