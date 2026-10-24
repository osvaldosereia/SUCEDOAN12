-- Dona Antonia: durable, source-traceable product observations from XML.
-- This migration does NOT update products, inventory, fiscal profiles or Bling.
create table if not exists public.purchase_xml_catalog_observations_v1 (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.purchase_xml_documents(id) on delete cascade,
 item_number integer not null check(item_number>0 and item_number<100000),
 document_key text not null,
 supplier_item_code text,
 description text,
 commercial_gtin text,
 tax_gtin text,
 ncm text,
 cest text,
 cfop text,
 tax_code text,
 origin_code smallint,
 purchase_unit text,
 purchase_quantity numeric,
 purchase_unit_price numeric,
 tax_unit text,
 tax_quantity numeric,
 line_total numeric,
 net_line_total numeric,
 lot_traces jsonb not null default '[]'::jsonb,
 tax_detail jsonb not null default '{}'::jsonb,
 raw_item jsonb not null default '{}'::jsonb,
 source_state text not null default 'staging_snapshot'
   check(source_state in ('staging_snapshot','xml_verified')),
 source_content_sha256 text,
 parser_version text,
 extracted_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(document_id,item_number)
);
create index if not exists purchase_xml_catalog_observations_gtin_idx
 on public.purchase_xml_catalog_observations_v1(commercial_gtin);
create index if not exists purchase_xml_catalog_observations_tax_gtin_idx
 on public.purchase_xml_catalog_observations_v1(tax_gtin);
create index if not exists purchase_xml_catalog_observations_source_idx
 on public.purchase_xml_catalog_observations_v1(source_state,extracted_at);

-- Restore the evidence already parsed without pretending it was re-read from raw XML.
insert into public.purchase_xml_catalog_observations_v1 (
 document_id,item_number,document_key,supplier_item_code,description,
 commercial_gtin,tax_gtin,ncm,cest,cfop,tax_code,origin_code,
 purchase_unit,purchase_quantity,purchase_unit_price,
 tax_unit,tax_quantity,line_total,net_line_total,lot_traces,
 raw_item,source_state,source_content_sha256,parser_version
)
select i.document_id,i.item_number,d.document_key,i.supplier_item_code,i.description,
 i.commercial_gtin,i.tax_gtin,i.ncm,i.cest,i.cfop,i.tax_code,i.origin_code,
 i.purchase_unit,i.purchase_quantity,i.purchase_unit_price,
 i.metadata->>'tax_unit',
 case when (i.metadata->>'tax_quantity') ~ '^[0-9]+([.][0-9]+)?$'
      then (i.metadata->>'tax_quantity')::numeric else null end,
 i.line_total,
 case when (i.metadata->>'net_line_total') ~ '^-?[0-9]+([.][0-9]+)?$'
      then (i.metadata->>'net_line_total')::numeric else i.line_total end,
 case when jsonb_typeof(i.metadata->'lot_traces')='array'
      then i.metadata->'lot_traces' else '[]'::jsonb end,
 jsonb_build_object('from','purchase_xml_items','metadata',i.metadata),
 'staging_snapshot',d.content_sha256,'staging_copy_v1'
from public.purchase_xml_items i
join public.purchase_xml_documents d on d.id=i.document_id
on conflict(document_id,item_number) do nothing;

alter table public.purchase_xml_catalog_observations_v1 enable row level security;
revoke all on public.purchase_xml_catalog_observations_v1 from public,anon,authenticated;
grant select,insert,update on public.purchase_xml_catalog_observations_v1 to service_role;

create or replace view public.purchase_xml_catalog_candidates_v1
with (security_invoker=true) as
with observations as (
 select o.*,
        d.supplier_document,d.supplier_name,d.issued_at,
        i.product_id,
        case when trim(coalesce(o.commercial_gtin,'')) ~ '^[0-9]{8,14}$'
          then 'gtin:'||trim(o.commercial_gtin)
          when trim(coalesce(o.tax_gtin,'')) ~ '^[0-9]{8,14}$'
          then 'tax_gtin:'||trim(o.tax_gtin)
          when nullif(trim(coalesce(o.supplier_item_code,'')),'') is not null
            and nullif(trim(coalesce(d.supplier_document,'')),'') is not null
          then 'supplier:'||d.supplier_document||':'||o.supplier_item_code
          else 'unidentified:'||o.document_id::text||':'||o.item_number::text
        end as candidate_key
 from public.purchase_xml_catalog_observations_v1 o
 join public.purchase_xml_documents d on d.id=o.document_id
 left join public.purchase_xml_items i
   on i.document_id=o.document_id and i.item_number=o.item_number
)
select candidate_key,
 (array_agg(description order by issued_at desc nulls last,extracted_at desc))[1] as display_name,
 (array_agg(commercial_gtin order by issued_at desc nulls last,extracted_at desc))[1] as gtin,
 (array_agg(tax_gtin order by issued_at desc nulls last,extracted_at desc))[1] as tax_gtin,
 (array_agg(ncm order by issued_at desc nulls last,extracted_at desc))[1] as last_observed_ncm,
 (array_agg(cest order by issued_at desc nulls last,extracted_at desc))[1] as last_observed_cest,
 (array_agg(purchase_unit order by issued_at desc nulls last,extracted_at desc))[1] as last_purchase_unit,
 count(*)::integer as observations_count,
 count(distinct document_id)::integer as distinct_invoices,
 count(distinct nullif(trim(coalesce(supplier_document,'')),''))::integer as suppliers_count,
 count(distinct nullif(trim(coalesce(ncm,'')),''))::integer as ncm_variations,
 count(distinct nullif(trim(coalesce(cest,'')),''))::integer as cest_variations,
 count(distinct product_id)::integer as matched_product_variations,
 case when count(distinct product_id)=1
   then min(product_id::text)::uuid else null end as linked_product_id,
 bool_or(source_state='xml_verified') as xml_verified,
 min(issued_at) first_seen,
 max(issued_at) last_seen,
 case when count(distinct product_id)>1 then 'identity_conflict'
      when count(distinct nullif(trim(coalesce(ncm,'')),''))>1 then 'fiscal_conflict'
      when count(distinct nullif(trim(coalesce(cest,'')),''))>1 then 'cest_conflict'
      when count(distinct product_id)=0 then 'not_linked'
      else 'linked_reviewable' end as review_status
from observations
group by candidate_key;
revoke all on public.purchase_xml_catalog_candidates_v1 from public,anon,authenticated;
grant select on public.purchase_xml_catalog_candidates_v1 to service_role;

create or replace view public.purchase_xml_catalog_reconciliation_v1
with (security_invoker=true) as
select d.id as document_id,d.document_key,d.source,d.issued_at,d.created_at,
 d.item_count as declared_items,
 count(distinct i.item_number)::integer as items_staged,
 count(distinct o.item_number)::integer as observations_captured,
 count(distinct o.item_number) filter(where o.source_state='xml_verified')::integer as xml_verified_items,
 greatest(coalesce(d.item_count,0)-count(distinct i.item_number),0)::integer as missing_staging_items,
 greatest(coalesce(d.item_count,0)-count(distinct o.item_number),0)::integer as missing_observations,
 d.processing_status,
 case when count(distinct o.item_number) filter(where o.source_state='xml_verified')=d.item_count
      then 'complete_from_xml'
      when count(distinct o.item_number)=d.item_count then 'staging_only'
      else 'incomplete' end as catalog_readiness
from public.purchase_xml_documents d
left join public.purchase_xml_items i on i.document_id=d.id
left join public.purchase_xml_catalog_observations_v1 o on o.document_id=d.id
group by d.id;
revoke all on public.purchase_xml_catalog_reconciliation_v1 from public,anon,authenticated;
grant select on public.purchase_xml_catalog_reconciliation_v1 to service_role;

comment on view public.purchase_xml_catalog_candidates_v1 is
 'Evidence-only candidate groups by GTIN or supplier code; no automatic product identity, tax classification or stock authorization.';
comment on table public.purchase_xml_catalog_observations_v1 is
 'Immutable-source observations (updatable only to replace staging snapshot with verified XML); deliberately independent of products.';
