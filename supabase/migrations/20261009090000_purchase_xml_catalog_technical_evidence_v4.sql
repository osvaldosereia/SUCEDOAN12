-- NF-e evidence trace V4: extract additional already-stored technical/fiscal attributes.
-- Read-only view: does not create products, classify NCM/CEST, synchronize Bling,
-- recalculate taxes, touch sales prices, costs, inventory or accounting.
create or replace view public.purchase_xml_catalog_technical_evidence_v4
with (security_invoker=true)
as
with raw as (
  select
    o.id as observation_id,
    o.document_id,
    o.item_number,
    d.document_key,
    d.issued_at,
    d.source as document_source,
    d.supplier_document,
    d.supplier_name,
    o.description,
    o.commercial_gtin,
    o.tax_gtin,
    o.supplier_item_code,
    o.ncm as xml_ncm,
    o.cest as xml_cest,
    o.cfop as xml_cfop,
    o.purchase_unit as xml_commercial_unit,
    o.purchase_quantity as xml_commercial_quantity,
    o.tax_unit as xml_tax_unit,
    o.tax_quantity as xml_tax_quantity,
    o.purchase_unit_price as xml_commercial_unit_price,
    o.line_total as xml_line_total,
    o.net_line_total as xml_net_line_total,
    o.lot_traces,
    o.source_state,
    o.parser_version,
    o.source_content_sha256,
    coalesce(o.raw_item->'prod','{}'::jsonb) as prod,
    coalesce(o.tax_detail,'{}'::jsonb) as tax
  from public.purchase_xml_catalog_observations_v1 o
  join public.purchase_xml_documents d on d.id=o.document_id
), decomposed as (
  select r.*,
    (select key from jsonb_each(coalesce(r.tax->'ICMS','{}'::jsonb)) limit 1) as icms_group,
    (select value from jsonb_each(coalesce(r.tax->'ICMS','{}'::jsonb)) limit 1) as icms_values,
    (select key from jsonb_each(coalesce(r.tax->'PIS','{}'::jsonb)) limit 1) as pis_group,
    (select value from jsonb_each(coalesce(r.tax->'PIS','{}'::jsonb)) limit 1) as pis_values,
    (select key from jsonb_each(coalesce(r.tax->'COFINS','{}'::jsonb)) limit 1) as cofins_group,
    (select value from jsonb_each(coalesce(r.tax->'COFINS','{}'::jsonb)) limit 1) as cofins_values,
    (select key from jsonb_each(coalesce(r.tax->'IPI','{}'::jsonb))
      where key in ('IPITrib','IPINT') limit 1) as ipi_group,
    (select value from jsonb_each(coalesce(r.tax->'IPI','{}'::jsonb))
      where key in ('IPITrib','IPINT') limit 1) as ipi_values
  from raw r
)
select
  observation_id,document_id,item_number,document_key,issued_at,
  document_source,supplier_document,supplier_name,description,
  commercial_gtin,tax_gtin,supplier_item_code,
  xml_ncm,xml_cest,xml_cfop,
  case when left(xml_cfop,1)='5' then 'issuer_in_state'
       when left(xml_cfop,1)='6' then 'issuer_interstate'
       when left(xml_cfop,1)='7' then 'issuer_foreign'
       else 'issuer_region_unclassified' end as cfop_region_hint,
  -- An unusual code calls for a review, never for automatic stock adjustments.
  (xml_cfop='5910') as operation_requires_manual_review,
  xml_commercial_unit,xml_commercial_quantity,xml_commercial_unit_price,
  xml_tax_unit,xml_tax_quantity,
  prod->>'vUnTrib' as xml_tax_unit_price_text,
  prod->>'indTot' as xml_in_invoice_total_flag,
  prod->>'xPed' as supplier_order_reference,
  prod->>'nItemPed' as supplier_order_line,
  prod->>'indEscala' as manufacturing_scale_flag,
  prod->>'cBenef' as fiscal_benefit_code,
  prod->>'nFCI' as import_fci_number,
  prod->>'CNPJFab' as manufacturer_document_xml,
  xml_line_total,xml_net_line_total,
  prod->>'vDesc' as xml_discount_text,
  prod->>'vFrete' as xml_freight_text,
  prod->>'vSeg' as xml_insurance_text,
  prod->>'vOutro' as xml_other_expenses_text,
  icms_group,icms_values->>'orig' as xml_origin_code,
  icms_values->>'CST' as xml_icms_cst,
  icms_values->>'CSOSN' as xml_icms_csosn,
  icms_values->>'pICMS' as xml_icms_rate_text,
  icms_values->>'vICMS' as xml_icms_amount_text,
  icms_values->>'pICMSST' as xml_icms_st_rate_text,
  icms_values->>'vICMSST' as xml_icms_st_amount_text,
  pis_group,pis_values->>'CST' as xml_pis_cst,
  pis_values->>'pPIS' as xml_pis_rate_text,
  pis_values->>'vPIS' as xml_pis_amount_text,
  cofins_group,cofins_values->>'CST' as xml_cofins_cst,
  cofins_values->>'pCOFINS' as xml_cofins_rate_text,
  cofins_values->>'vCOFINS' as xml_cofins_amount_text,
  ipi_group,ipi_values->>'CST' as xml_ipi_cst,
  ipi_values->>'pIPI' as xml_ipi_rate_text,
  ipi_values->>'vIPI' as xml_ipi_amount_text,
  tax->'II' as xml_import_duty_detail,
  tax->'IBSCBS'->>'CST' as xml_ibs_cbs_cst,
  tax->'IBSCBS'->>'cClassTrib' as xml_ibs_cbs_classification,
  tax#>>'{IBSCBS,gIBSCBS,vBC}' as xml_ibs_cbs_tax_base_text,
  tax#>>'{IBSCBS,gIBSCBS,vIBS}' as xml_ibs_amount_text,
  tax#>>'{IBSCBS,gIBSCBS,gIBSUF,pIBSUF}' as xml_ibs_state_rate_text,
  tax#>>'{IBSCBS,gIBSCBS,gIBSUF,vIBSUF}' as xml_ibs_state_amount_text,
  tax#>>'{IBSCBS,gIBSCBS,gIBSMun,pIBSMun}' as xml_ibs_city_rate_text,
  tax#>>'{IBSCBS,gIBSCBS,gIBSMun,vIBSMun}' as xml_ibs_city_amount_text,
  tax#>>'{IBSCBS,gIBSCBS,gCBS,pCBS}' as xml_cbs_rate_text,
  tax#>>'{IBSCBS,gIBSCBS,gCBS,vCBS}' as xml_cbs_amount_text,
  tax->'ICMSUFDest' as xml_destination_icms_detail,
  case when jsonb_typeof(lot_traces)='array'
    then jsonb_array_length(lot_traces) else 0 end as xml_lot_count,
  lot_traces as xml_lot_trace,
  null::numeric as unconfirmed_package_height_cm,
  null::numeric as unconfirmed_package_width_cm,
  null::numeric as unconfirmed_package_depth_cm,
  null::numeric as unconfirmed_item_gross_weight_kg,
  'external_supplier_nfe_observation_only'::text as fiscal_evidence_status,
  false as approved_for_catalog_update,
  false as approved_for_stock_movement,
  source_state,parser_version,source_content_sha256
from decomposed;

revoke all on public.purchase_xml_catalog_technical_evidence_v4
  from public,anon,authenticated;
grant select on public.purchase_xml_catalog_technical_evidence_v4
  to service_role;

comment on view public.purchase_xml_catalog_technical_evidence_v4 is
 'Readonly technical NF-e attributes incl IBS/CBS, ICMS, PIS, COFINS, IPI, supplier purchase order, lot and CFOP. Values are source declarations, not validated tax policy. No catalog/stock writes.';
