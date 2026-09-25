-- Dona Antônia · Compras/XML v1
-- Applied to canonical project ssbesxgaijknwsjbsbcz on 2026-09-25.
-- This file records the database contract used by the Admin; deployment remains managed in Supabase.

create table if not exists public.purchase_xml_import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('bling_daily','bling_manual','manual_xml','bulk_xml')),
  status text not null default 'running' check (status in ('running','completed','completed_with_review','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  documents_seen integer not null default 0 check (documents_seen >= 0),
  documents_processed integer not null default 0 check (documents_processed >= 0),
  documents_duplicate integer not null default 0 check (documents_duplicate >= 0),
  documents_failed integer not null default 0 check (documents_failed >= 0),
  items_seen integer not null default 0 check (items_seen >= 0),
  items_matched integer not null default 0 check (items_matched >= 0),
  items_review integer not null default 0 check (items_review >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_xml_documents (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid references public.purchase_xml_import_runs(id) on delete set null,
  source text not null check (source in ('bling_daily','bling_manual','manual_xml','bulk_xml')),
  source_document_id text,
  bling_nfe_id bigint,
  document_key text not null unique,
  content_sha256 text,
  storage_path text,
  issued_at timestamptz,
  supplier_document text,
  supplier_name text,
  supplier_bling_contact_id bigint,
  recipient_document text,
  recipient_kind text not null default 'unknown' check (recipient_kind in ('CNPJ','CPF','unknown')),
  financial_eligible boolean not null default false,
  finance_status text not null default 'not_applicable'
    check (finance_status in ('not_applicable','blocked_personal','pending_company_match','eligible','posted','review')),
  finance_reference jsonb not null default '{}'::jsonb,
  receipt_status text not null default 'not_received'
    check (receipt_status in ('not_received','ready','received','review')),
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processing','processed','review_required','failed','duplicate')),
  total_amount numeric(18,6),
  item_count integer not null default 0 check (item_count >= 0),
  matched_item_count integer not null default 0 check (matched_item_count >= 0),
  review_item_count integer not null default 0 check (review_item_count >= 0),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_xml_documents_cpf_finance_guard check (
    recipient_kind <> 'CPF'
    or (
      financial_eligible = false
      and finance_status = 'blocked_personal'
      and coalesce(jsonb_array_length(coalesce(finance_reference->'accounts','[]'::jsonb)),0)=0
    )
  )
);

create table if not exists public.purchase_xml_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.purchase_xml_documents(id) on delete cascade,
  item_number integer not null check (item_number > 0),
  supplier_item_code text,
  description text not null,
  commercial_gtin text,
  tax_gtin text,
  ncm text,
  cest text,
  cfop text,
  tax_code text,
  origin_code smallint check (origin_code between 0 and 8),
  purchase_unit text,
  purchase_quantity numeric(18,6) not null default 0 check (purchase_quantity >= 0),
  purchase_unit_price numeric(18,6),
  line_total numeric(18,6),
  base_unit text not null default 'UN',
  conversion_status text not null default 'review_required'
    check (conversion_status in ('not_needed','known','inferred_xml','review_required')),
  conversion_factor numeric(18,6) check (conversion_factor is null or conversion_factor >= 1),
  conversion_chain jsonb not null default '[]'::jsonb,
  converted_quantity numeric(18,6),
  base_unit_cost numeric(18,6),
  product_id uuid references public.products(id) on delete set null,
  bling_product_id bigint,
  match_method text,
  processing_status text not null default 'pending'
    check (processing_status in ('pending','matched','created_inactive','review_required','processed','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_id,item_number)
);

create table if not exists public.product_supplier_packaging (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_document text not null default '',
  supplier_bling_contact_id bigint,
  supplier_item_code text not null default '',
  purchase_unit text not null,
  base_unit text not null default 'UN',
  conversion_factor numeric(18,6) not null check (conversion_factor >= 1),
  conversion_chain jsonb not null default '[]'::jsonb,
  confidence numeric(5,4) not null default 1 check (confidence between 0 and 1),
  status text not null default 'confirmed' check (status in ('confirmed','inferred_xml','review_required','inactive')),
  is_default boolean not null default false,
  source_document_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_supplier_packaging_identity_uq
    unique(product_id,supplier_document,supplier_item_code,purchase_unit)
);

create table if not exists public.product_purchase_history (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.purchase_xml_documents(id) on delete cascade,
  purchase_item_id uuid not null unique references public.purchase_xml_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  document_key text not null,
  issued_at timestamptz,
  supplier_document text,
  supplier_name text,
  supplier_bling_contact_id bigint,
  original_unit text,
  original_quantity numeric(18,6),
  conversion_factor numeric(18,6),
  conversion_chain jsonb not null default '[]'::jsonb,
  base_unit text not null default 'UN',
  base_quantity numeric(18,6),
  line_total numeric(18,6),
  purchase_unit_cost numeric(18,6),
  base_unit_cost numeric(18,6),
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_stock_receipts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.purchase_xml_documents(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','confirmed','applied','review_required','cancelled')),
  confirmed_by uuid,
  confirmed_at timestamptz,
  applied_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_xml_settings (
  id smallint primary key default 1 check (id=1),
  company_document text,
  daily_enabled boolean not null default true,
  daily_lookback_days integer not null default 3 check (daily_lookback_days between 1 and 31),
  daily_hour_cuiaba smallint not null default 6 check (daily_hour_cuiaba between 0 and 23),
  auto_create_inactive_products boolean not null default true,
  auto_sync_product_supplier boolean not null default true,
  auto_create_payables boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.purchase_xml_settings(id) values (1) on conflict (id) do nothing;

create index if not exists purchase_xml_documents_issued_idx on public.purchase_xml_documents(issued_at desc);
create index if not exists purchase_xml_documents_status_idx on public.purchase_xml_documents(processing_status,created_at desc);
create index if not exists purchase_xml_documents_supplier_idx on public.purchase_xml_documents(supplier_document,issued_at desc);
create index if not exists purchase_xml_items_product_idx on public.purchase_xml_items(product_id,created_at desc);
create index if not exists purchase_xml_items_review_idx on public.purchase_xml_items(conversion_status,processing_status);
create index if not exists product_purchase_history_product_idx on public.product_purchase_history(product_id,issued_at desc);
create index if not exists product_supplier_packaging_product_idx on public.product_supplier_packaging(product_id,status);

alter table public.purchase_xml_import_runs enable row level security;
alter table public.purchase_xml_documents enable row level security;
alter table public.purchase_xml_items enable row level security;
alter table public.product_supplier_packaging enable row level security;
alter table public.product_purchase_history enable row level security;
alter table public.purchase_stock_receipts enable row level security;
alter table public.purchase_xml_settings enable row level security;

revoke all on public.purchase_xml_import_runs from anon, authenticated;
revoke all on public.purchase_xml_documents from anon, authenticated;
revoke all on public.purchase_xml_items from anon, authenticated;
revoke all on public.product_supplier_packaging from anon, authenticated;
revoke all on public.product_purchase_history from anon, authenticated;
revoke all on public.purchase_stock_receipts from anon, authenticated;
revoke all on public.purchase_xml_settings from anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('purchase-xml','purchase-xml',false,10485760,array['application/xml','text/xml','application/octet-stream'])
on conflict (id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.apply_purchase_stock_receipt_v1(p_document_id uuid,p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_doc public.purchase_xml_documents%rowtype;
  v_receipt public.purchase_stock_receipts%rowtype;
  v_item record;
  v_count integer := 0;
  v_total_qty numeric := 0;
  v_now timestamptz := now();
begin
  if p_document_id is null then raise exception 'document_id_required'; end if;
  select * into v_doc from public.purchase_xml_documents where id=p_document_id for update;
  if not found then raise exception 'purchase_document_not_found'; end if;
  select * into v_receipt from public.purchase_stock_receipts where document_id=p_document_id for update;
  if found and v_receipt.status='applied' then
    return jsonb_build_object('ok',true,'idempotent_replay',true,'receipt_id',v_receipt.id,'document_id',p_document_id,'applied_at',v_receipt.applied_at);
  end if;
  if v_doc.processing_status <> 'processed' then raise exception 'purchase_document_not_ready:%',v_doc.processing_status; end if;
  if exists (
    select 1 from public.purchase_xml_items i where i.document_id=p_document_id
    and (i.product_id is null or i.conversion_status='review_required'
      or i.processing_status in ('review_required','failed','pending')
      or i.converted_quantity is null or i.converted_quantity<=0)
  ) then raise exception 'purchase_items_require_review'; end if;

  insert into public.purchase_stock_receipts(document_id,status,confirmed_by,confirmed_at,idempotency_key,updated_at)
  values(p_document_id,'confirmed',p_user_id,v_now,'purchase-stock:'||p_document_id::text,v_now)
  on conflict(document_id) do update
  set status=case when public.purchase_stock_receipts.status='applied' then 'applied' else 'confirmed' end,
      confirmed_by=coalesce(public.purchase_stock_receipts.confirmed_by,excluded.confirmed_by),
      confirmed_at=coalesce(public.purchase_stock_receipts.confirmed_at,excluded.confirmed_at),
      updated_at=v_now
  returning * into v_receipt;

  if v_receipt.status='applied' then
    return jsonb_build_object('ok',true,'idempotent_replay',true,'receipt_id',v_receipt.id,'document_id',p_document_id,'applied_at',v_receipt.applied_at);
  end if;

  for v_item in
    select i.id,i.product_id,i.converted_quantity,i.base_unit,i.description
    from public.purchase_xml_items i where i.document_id=p_document_id order by i.item_number for update
  loop
    update public.products set stock=coalesce(stock,0)+v_item.converted_quantity,updated_at=v_now where id=v_item.product_id;
    if not found then raise exception 'product_not_found:%',v_item.product_id; end if;
    v_count:=v_count+1; v_total_qty:=v_total_qty+v_item.converted_quantity;
  end loop;

  update public.purchase_stock_receipts
  set status='applied',applied_at=v_now,
      result=jsonb_build_object('items_applied',v_count,'base_quantity_total',v_total_qty,'document_key',v_doc.document_key),
      updated_at=v_now
  where id=v_receipt.id;

  update public.purchase_xml_documents set receipt_status='received',updated_at=v_now where id=p_document_id;

  insert into public.bling_hub_audit_v2(event_type,severity,domain,source_system,source_id,details)
  values('purchase_stock_receipt_applied','info','stock','canonical',p_document_id,
    jsonb_build_object('document_key',v_doc.document_key,'items_applied',v_count,'base_quantity_total',v_total_qty,'confirmed_by',p_user_id,'make_used',false));

  return jsonb_build_object('ok',true,'idempotent_replay',false,'receipt_id',v_receipt.id,'document_id',p_document_id,'items_applied',v_count,'base_quantity_total',v_total_qty,'applied_at',v_now);
end
$$;

revoke all on function public.apply_purchase_stock_receipt_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_purchase_stock_receipt_v1(uuid,uuid) to service_role;

create or replace function public.dispatch_purchase_xml_daily_v1()
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_enabled boolean;
  v_request_id bigint;
begin
  select daily_enabled into v_enabled from public.purchase_xml_settings where id=1;
  if coalesce(v_enabled,false) is not true then return null; end if;
  select net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1',
    headers:=jsonb_build_object('Content-Type','application/json','x-dona-antonia-bling-hub-key',public.get_bling_hub_key_v2()),
    body:=jsonb_build_object('action','vitrine_bling_hub_internal','subaction','purchase_xml_daily_sync'),
    timeout_milliseconds:=120000
  ) into v_request_id;
  return v_request_id;
end
$$;

revoke all on function public.dispatch_purchase_xml_daily_v1() from public,anon,authenticated;
grant execute on function public.dispatch_purchase_xml_daily_v1() to service_role;

-- Runtime schedule applied in Supabase:
-- select cron.schedule('purchase-xml-daily-v1','0 10 * * *','select public.dispatch_purchase_xml_daily_v1();');
