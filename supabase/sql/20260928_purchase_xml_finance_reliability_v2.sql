-- Dona Antônia · Compras/XML · confiabilidade financeira v2
-- Aplicado no Supabase canônico ssbesxgaijknwsjbsbcz em 2026-09-28.
-- Objetivo: separar processamento do XML de sincronização financeira e auditar tentativas.

alter table public.purchase_xml_documents
  add column if not exists finance_attempt_count integer not null default 0,
  add column if not exists finance_last_attempt_at timestamptz,
  add column if not exists finance_last_error text,
  add column if not exists finance_posted_at timestamptz,
  add column if not exists finance_reconciled_at timestamptz,
  add column if not exists finance_method text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.purchase_xml_documents'::regclass
      and conname='purchase_xml_documents_finance_attempt_count_check'
  ) then
    alter table public.purchase_xml_documents
      add constraint purchase_xml_documents_finance_attempt_count_check
      check (finance_attempt_count >= 0);
  end if;
end $$;

create index if not exists purchase_xml_documents_finance_pending_idx
  on public.purchase_xml_documents(finance_status, issued_at desc)
  where financial_eligible = true and finance_status <> 'posted';

update public.purchase_xml_documents
set finance_last_error = coalesce(finance_last_error, nullif(finance_reference->>'reason',''))
where finance_status='review' and finance_last_error is null;
