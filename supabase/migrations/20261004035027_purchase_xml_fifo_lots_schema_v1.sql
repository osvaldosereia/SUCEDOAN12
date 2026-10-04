alter table public.product_inventory_lots
  alter column expiration_date drop not null;

alter table public.purchase_xml_items
  add column if not exists lot_expiration_date date,
  add column if not exists inventory_lot_id uuid;

comment on column public.purchase_xml_items.lot_expiration_date is
  'Optional expiration date for the internal receipt layer created from this XML item.';
comment on column public.purchase_xml_items.inventory_lot_id is
  'Internal FIFO inventory layer associated with this XML item.';

alter table public.purchase_xml_items
  drop constraint if exists purchase_xml_items_inventory_lot_id_fkey;
alter table public.purchase_xml_items
  add constraint purchase_xml_items_inventory_lot_id_fkey
  foreign key (inventory_lot_id) references public.product_inventory_lots(id) on delete set null;

create index if not exists purchase_xml_items_inventory_lot_idx
  on public.purchase_xml_items(inventory_lot_id)
  where inventory_lot_id is not null;
create index if not exists purchase_xml_items_document_product_idx
  on public.purchase_xml_items(document_id,product_id)
  where product_id is not null;

create unique index if not exists product_inventory_lots_source_ref_uidx
  on public.product_inventory_lots(source,source_ref)
  where source_ref is not null;
create index if not exists product_inventory_lots_fifo_idx
  on public.product_inventory_lots(product_id,status,received_at,created_at,id);

create table if not exists public.vitrine_stock_reservation_lots (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.vitrine_stock_reservations(id) on delete cascade,
  lot_id uuid not null references public.product_inventory_lots(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  allocated_quantity numeric(18,6) not null check (allocated_quantity > 0),
  status text not null default 'reserved' check (status in ('reserved','consumed','released')),
  consumed_at timestamptz,
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(reservation_id,lot_id)
);

alter table public.vitrine_stock_reservation_lots enable row level security;
create index if not exists vitrine_stock_reservation_lots_reservation_idx
  on public.vitrine_stock_reservation_lots(reservation_id,status);
create index if not exists vitrine_stock_reservation_lots_lot_idx
  on public.vitrine_stock_reservation_lots(lot_id,status);
create index if not exists vitrine_stock_reservation_lots_product_idx
  on public.vitrine_stock_reservation_lots(product_id,status);
revoke all on table public.vitrine_stock_reservation_lots from anon, authenticated;

create or replace function public.purchase_xml_sync_inventory_lot_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ref text := 'purchase-xml-item:' || new.id::text;
  v_lot_id uuid;
  v_existing_product uuid;
  v_existing_status text;
  v_doc_receipt text;
  v_doc_issued timestamptz;
  v_verified_at timestamptz;
  v_applied_at timestamptz;
  v_received boolean := false;
  v_received_at timestamptz;
begin
  if pg_trigger_depth() > 1 then return new; end if;

  if new.product_id is null or coalesce(new.converted_quantity,0) <= 0 then
    if new.inventory_lot_id is not null then
      update public.product_inventory_lots set status='cancelled', updated_at=now()
       where id=new.inventory_lot_id and status='quarantine';
      update public.purchase_xml_items set inventory_lot_id=null where id=new.id;
    end if;
    return new;
  end if;

  select d.receipt_status,d.issued_at into v_doc_receipt,v_doc_issued
    from public.purchase_xml_documents d where d.id=new.document_id;
  select p.verified_at into v_verified_at
    from public.purchase_stock_receipt_plans_v1 p
   where p.document_id=new.document_id and p.status='verified' limit 1;
  select r.applied_at into v_applied_at
    from public.purchase_stock_receipts r
   where r.document_id=new.document_id and r.status='applied' limit 1;

  v_received := coalesce(v_doc_receipt='received',false) or v_verified_at is not null or v_applied_at is not null;
  if v_received then v_received_at := coalesce(v_verified_at,v_applied_at,v_doc_issued,now()); end if;

  select l.id,l.product_id,l.status into v_lot_id,v_existing_product,v_existing_status
    from public.product_inventory_lots l
   where l.source='purchase_xml' and l.source_ref=v_ref for update;

  if found and v_existing_status in ('active','depleted','expired')
     and v_existing_product is distinct from new.product_id then
    raise exception 'received_purchase_lot_product_change_forbidden';
  end if;

  insert into public.product_inventory_lots(
    product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,
    status,source,source_ref,received_at,metadata,updated_at
  ) values (
    new.product_id,null,new.lot_expiration_date,
    case when v_received then coalesce(new.converted_quantity,0) else 0 end,
    0,case when v_received then 'active' else 'quarantine' end,
    'purchase_xml',v_ref,v_received_at,
    jsonb_strip_nulls(jsonb_build_object(
      'purchase_item_id',new.id,'document_id',new.document_id,'item_number',new.item_number,
      'expected_quantity',new.converted_quantity,'base_unit',new.base_unit,
      'supplier_item_code',new.supplier_item_code,'commercial_gtin',new.commercial_gtin,
      'tax_gtin',new.tax_gtin,'lot_number_required',false,'expiration_optional',true
    )),now()
  )
  on conflict (source,source_ref) where source_ref is not null do update set
    product_id=case when public.product_inventory_lots.status in ('quarantine','cancelled') then excluded.product_id else public.product_inventory_lots.product_id end,
    expiration_date=excluded.expiration_date,
    quantity_on_hand=case
      when public.product_inventory_lots.status in ('quarantine','cancelled') and excluded.status='active' then excluded.quantity_on_hand
      when public.product_inventory_lots.status='cancelled' and excluded.status='quarantine' then 0
      else public.product_inventory_lots.quantity_on_hand end,
    status=case when public.product_inventory_lots.status in ('quarantine','cancelled') then excluded.status else public.product_inventory_lots.status end,
    received_at=coalesce(public.product_inventory_lots.received_at,excluded.received_at),
    metadata=public.product_inventory_lots.metadata || excluded.metadata,
    updated_at=now()
  returning id into v_lot_id;

  if new.inventory_lot_id is distinct from v_lot_id then
    update public.purchase_xml_items set inventory_lot_id=v_lot_id where id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.purchase_xml_sync_inventory_lot_v1() from public, anon, authenticated;

drop trigger if exists purchase_xml_sync_inventory_lot_v1 on public.purchase_xml_items;
create trigger purchase_xml_sync_inventory_lot_v1
after insert or update of product_id,converted_quantity,lot_expiration_date,processing_status,inventory_lot_id
on public.purchase_xml_items
for each row execute function public.purchase_xml_sync_inventory_lot_v1();

create or replace function public.purchase_xml_lot_evidence_expiration_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.expiration_date is not null then
    update public.purchase_xml_items
       set lot_expiration_date=case when lot_expiration_date is null then new.expiration_date else least(lot_expiration_date,new.expiration_date) end,
           updated_at=now()
     where id=new.purchase_item_id;
  end if;
  return new;
end;
$$;
revoke all on function public.purchase_xml_lot_evidence_expiration_v1() from public, anon, authenticated;

drop trigger if exists purchase_xml_lot_evidence_expiration_v1 on public.purchase_xml_item_lot_evidence;
create trigger purchase_xml_lot_evidence_expiration_v1
after insert on public.purchase_xml_item_lot_evidence
for each row execute function public.purchase_xml_lot_evidence_expiration_v1();