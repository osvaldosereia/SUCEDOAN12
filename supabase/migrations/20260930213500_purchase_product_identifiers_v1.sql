-- Purchase product identity aliases for NF-e receiving review.
-- products remains the canonical commercial record; this table only stores alternate identity evidence.

create table if not exists public.product_identifiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  identifier_value text not null,
  identifier_kind text not null check (identifier_kind in ('base_gtin','package_gtin','supplier_code','sku_alias')),
  packaging_unit text,
  conversion_factor numeric,
  supplier_document text not null default '',
  source text not null default 'system',
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  status text not null default 'confirmed' check (status in ('confirmed','candidate','rejected','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(identifier_value) <> ''),
  check (conversion_factor is null or conversion_factor >= 1),
  check (identifier_kind <> 'package_gtin' or conversion_factor is null or conversion_factor > 1),
  check (identifier_kind <> 'supplier_code' or btrim(supplier_document) <> '')
);

create index if not exists product_identifiers_product_id_idx
  on public.product_identifiers(product_id);
create index if not exists product_identifiers_value_idx
  on public.product_identifiers(identifier_value);
create index if not exists product_identifiers_supplier_idx
  on public.product_identifiers(supplier_document, identifier_value);

create unique index if not exists product_identifiers_confirmed_global_uidx
  on public.product_identifiers(identifier_kind, identifier_value)
  where status = 'confirmed'
    and identifier_kind in ('base_gtin','package_gtin','sku_alias');

create unique index if not exists product_identifiers_confirmed_supplier_uidx
  on public.product_identifiers(identifier_kind, supplier_document, identifier_value)
  where status = 'confirmed'
    and identifier_kind = 'supplier_code';

alter table public.product_identifiers enable row level security;

insert into public.product_identifiers(
  product_id, identifier_value, identifier_kind, source, confidence, status, metadata
)
select
  p.id,
  regexp_replace(p.gtin,'\D','','g'),
  'base_gtin',
  'products_backfill',
  1,
  'confirmed',
  jsonb_build_object('backfilled_from','products.gtin')
from public.products p
where p.gtin is not null
  and regexp_replace(p.gtin,'\D','','g') ~ '^(\d{8}|\d{12}|\d{13}|\d{14})$'
on conflict do nothing;

-- Products previously auto-created from packaged XML items are not reliable evidence
-- that the XML GTIN is the sellable-unit GTIN. Keep the products/history, but remove
-- only the identifier backfill so they require explicit identity confirmation.
delete from public.product_identifiers pi
using public.products p
where pi.product_id = p.id
  and pi.source = 'products_backfill'
  and pi.identifier_kind = 'base_gtin'
  and coalesce((p.metadata->>'purchase_xml_created')::boolean,false) = true
  and upper(coalesce(p.packaging,'')) in ('CX','FD','PCT','DP');
