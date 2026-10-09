-- Fase 5: Falhas na leitura de NF-e XML precisam ser visíveis e reprocessáveis.
-- Sem trigger, sem cron, sem UPDATE em products/fiscal/estoque/financeiro.
create table if not exists public.purchase_xml_catalog_ingest_errors_v1 (
  document_id uuid primary key references public.purchase_xml_documents(id) on delete cascade,
  error_code text not null check (length(error_code) between 1 and 160),
  error_message text not null check (length(error_message) between 1 and 400),
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint xml_ingest_error_valid_times check (
    resolved_at is null or resolved_at >= first_failed_at
  )
);
create index if not exists xml_catalog_ingest_errors_unresolved_v1
on public.purchase_xml_catalog_ingest_errors_v1(last_failed_at desc)
where resolved_at is null;

alter table public.purchase_xml_catalog_ingest_errors_v1 enable row level security;
revoke all on public.purchase_xml_catalog_ingest_errors_v1 from public,anon,authenticated;
grant select,insert,update on public.purchase_xml_catalog_ingest_errors_v1 to service_role;

create or replace view public.purchase_xml_catalog_ingest_failures_v1
with (security_invoker=true) as
select e.document_id,
 d.document_key,
 d.source,
 d.supplier_name,
 d.issued_at,
 d.item_count,
 e.error_code,
 e.error_message,
 e.first_failed_at,
 e.last_failed_at,
 e.resolved_at
from public.purchase_xml_catalog_ingest_errors_v1 e
join public.purchase_xml_documents d on d.id=e.document_id
where e.resolved_at is null;
revoke all on public.purchase_xml_catalog_ingest_failures_v1 from public,anon,authenticated;
grant select on public.purchase_xml_catalog_ingest_failures_v1 to service_role;
comment on table public.purchase_xml_catalog_ingest_errors_v1 is
'Catalog XML parser/upsert errors; never blocks original purchase processing; auditable, manual reprocessing only.';
