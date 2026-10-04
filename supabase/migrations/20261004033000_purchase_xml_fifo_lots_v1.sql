begin;

-- Purchase XML lots are operational stock layers. Bling remains the physical
-- stock authority; these rows explain which receipt should be consumed first.
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

-- source_ref is the technical lot identity. It is intentionally not a supplier
-- lot number: the operator does not need to invent one.
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
  -- The self-update below only attaches inventory_lot_id; do not recurse.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.product_id is null or coalesce(new.converted_quantity,0) <= 0 then
    if new.inventory_lot_id is not null then
      update public.product_inventory_lots
         set status='cancelled', updated_at=now()
       where id=new.inventory_lot_id and status='quarantine';
      update public.purchase_xml_items set inventory_lot_id=null where id=new.id;
    end if;
    return new;
  end if;

  select d.receipt_status,d.issued_at
    into v_doc_receipt,v_doc_issued
    from public.purchase_xml_documents d
   where d.id=new.document_id;

  select p.verified_at
    into v_verified_at
    from public.purchase_stock_receipt_plans_v1 p
   where p.document_id=new.document_id and p.status='verified'
   limit 1;

  select r.applied_at
    into v_applied_at
    from public.purchase_stock_receipts r
   where r.document_id=new.document_id and r.status='applied'
   limit 1;

  v_received := coalesce(v_doc_receipt='received',false)
    or v_verified_at is not null
    or v_applied_at is not null;
  if v_received then
    v_received_at := coalesce(v_verified_at,v_applied_at,v_doc_issued,now());
  end if;

  select l.id,l.product_id,l.status
    into v_lot_id,v_existing_product,v_existing_status
    from public.product_inventory_lots l
   where l.source='purchase_xml' and l.source_ref=v_ref
   for update;

  if found
     and v_existing_status in ('active','depleted','expired')
     and v_existing_product is distinct from new.product_id then
    raise exception 'received_purchase_lot_product_change_forbidden';
  end if;

  insert into public.product_inventory_lots(
    product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,
    status,source,source_ref,received_at,metadata,updated_at
  ) values (
    new.product_id,null,new.lot_expiration_date,
    case when v_received then coalesce(new.converted_quantity,0) else 0 end,
    0,
    case when v_received then 'active' else 'quarantine' end,
    'purchase_xml',v_ref,v_received_at,
    jsonb_strip_nulls(jsonb_build_object(
      'purchase_item_id',new.id,
      'document_id',new.document_id,
      'item_number',new.item_number,
      'expected_quantity',new.converted_quantity,
      'base_unit',new.base_unit,
      'supplier_item_code',new.supplier_item_code,
      'commercial_gtin',new.commercial_gtin,
      'tax_gtin',new.tax_gtin,
      'lot_number_required',false,
      'expiration_optional',true
    )),
    now()
  )
  on conflict (source,source_ref) where source_ref is not null do update set
    product_id=case
      when public.product_inventory_lots.status in ('quarantine','cancelled') then excluded.product_id
      else public.product_inventory_lots.product_id
    end,
    expiration_date=excluded.expiration_date,
    quantity_on_hand=case
      when public.product_inventory_lots.status in ('quarantine','cancelled') and excluded.status='active'
        then excluded.quantity_on_hand
      when public.product_inventory_lots.status='cancelled' and excluded.status='quarantine'
        then 0
      else public.product_inventory_lots.quantity_on_hand
    end,
    status=case
      when public.product_inventory_lots.status in ('quarantine','cancelled') then excluded.status
      else public.product_inventory_lots.status
    end,
    received_at=coalesce(public.product_inventory_lots.received_at,excluded.received_at),
    metadata=public.product_inventory_lots.metadata || excluded.metadata,
    updated_at=now()
  returning id into v_lot_id;

  if new.inventory_lot_id is distinct from v_lot_id then
    update public.purchase_xml_items
       set inventory_lot_id=v_lot_id
     where id=new.id;
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
       set lot_expiration_date=case
         when lot_expiration_date is null then new.expiration_date
         else least(lot_expiration_date,new.expiration_date)
       end,
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

create or replace function public.activate_purchase_xml_inventory_lots_v1(
  p_document_id uuid,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_items integer:=0;
  v_active integer:=0;
begin
  -- Re-touching the items runs the idempotent lot synchronizer. The verifier
  -- has already proved the Bling stock delta before this function is reached.
  update public.purchase_xml_items
     set updated_at=now()
   where document_id=p_document_id
     and product_id is not null
     and coalesce(converted_quantity,0)>0;
  get diagnostics v_items=row_count;

  select count(*) into v_active
    from public.purchase_xml_items i
    join public.product_inventory_lots l on l.id=i.inventory_lot_id
   where i.document_id=p_document_id and l.status in ('active','depleted');

  return jsonb_build_object(
    'ok',true,
    'document_id',p_document_id,
    'items_touched',v_items,
    'active_lots',v_active,
    'verified_by',p_user_id,
    'local_product_stock_mutated',false
  );
end;
$$;

revoke all on function public.activate_purchase_xml_inventory_lots_v1(uuid,uuid) from public, anon, authenticated;

create or replace function public.purchase_xml_activate_inventory_lots_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_table_name='purchase_stock_receipt_plans_v1' then
    if new.status='verified' and old.status is distinct from new.status then
      perform public.activate_purchase_xml_inventory_lots_v1(new.document_id,new.verified_by);
    end if;
  elsif tg_table_name='purchase_stock_receipts' then
    if new.status='applied' and old.status is distinct from new.status then
      perform public.activate_purchase_xml_inventory_lots_v1(new.document_id,new.confirmed_by);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.purchase_xml_activate_inventory_lots_trigger_v1() from public, anon, authenticated;

drop trigger if exists purchase_receipt_plan_activate_inventory_lots_v1 on public.purchase_stock_receipt_plans_v1;
create trigger purchase_receipt_plan_activate_inventory_lots_v1
after update of status on public.purchase_stock_receipt_plans_v1
for each row execute function public.purchase_xml_activate_inventory_lots_trigger_v1();

drop trigger if exists purchase_receipt_activate_inventory_lots_v1 on public.purchase_stock_receipts;
create trigger purchase_receipt_activate_inventory_lots_v1
after update of status on public.purchase_stock_receipts
for each row execute function public.purchase_xml_activate_inventory_lots_trigger_v1();

-- Missing expiry is explicitly allowed. Only real review evidence blocks receipt.
create or replace function public.get_purchase_xml_receipt_preflight_v1(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  d public.purchase_xml_documents%rowtype;
  v_authority text;
  v_deposit bigint;
  v_total integer:=0;
  v_ready integer:=0;
  v_review integer:=0;
  v_unlinked integer:=0;
  v_lot_rows integer:=0;
  v_lot_review integer:=0;
  v_cpf boolean:=false;
begin
  select * into d from public.purchase_xml_documents where id=p_document_id;
  if not found then
    return jsonb_build_object('ok',false,'ready',false,'error','document_not_found');
  end if;

  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow'),
         nullif(metadata->>'selected_deposit_id','')::bigint
    into v_authority,v_deposit
    from public.bling_hub_runtime_v2 where id=1;

  select count(*),
         count(*) filter(where product_id is not null
           and conversion_status<>'review_required'
           and processing_status not in ('review_required','failed','pending')
           and coalesce(converted_quantity,0)>0
           and coalesce(base_unit_cost,0)>=0),
         count(*) filter(where product_id is null
           or conversion_status='review_required'
           or processing_status in ('review_required','failed','pending')
           or coalesce(converted_quantity,0)<=0),
         count(*) filter(where product_id is not null and not exists(
           select 1 from public.bling_hub_entity_links_v2 l
           where l.entity_type='product'
             and l.status='matched'
             and l.source_id=purchase_xml_items.product_id::text
         ))
    into v_total,v_ready,v_review,v_unlinked
    from public.purchase_xml_items
   where document_id=p_document_id;

  select count(*),
         count(*) filter(where e.status='review_required')
    into v_lot_rows,v_lot_review
    from public.purchase_xml_item_lot_evidence e
    join public.purchase_xml_items i on i.id=e.purchase_item_id
   where i.document_id=p_document_id;

  v_cpf:=d.recipient_kind='CPF';

  return jsonb_build_object(
    'ok',true,
    'document_id',d.id,
    'document_key',d.document_key,
    'processing_status',d.processing_status,
    'receipt_status',d.receipt_status,
    'recipient_kind',d.recipient_kind,
    'financial_eligible',d.financial_eligible,
    'finance_status',d.finance_status,
    'cpf_finance_blocked',v_cpf and d.financial_eligible=false and d.finance_status='blocked_personal',
    'stock_authority',v_authority,
    'deposit_id',v_deposit,
    'item_count',v_total,
    'ready_item_count',v_ready,
    'review_item_count',v_review,
    'unlinked_bling_products',v_unlinked,
    'lot_evidence_rows',v_lot_rows,
    'lot_evidence_review_rows',v_lot_review,
    'expiration_required',false,
    'local_stock_write_allowed',v_authority<>'bling',
    'external_bling_receipt_required',v_authority='bling',
    'ready',
      d.processing_status='processed'
      and v_total>0
      and v_review=0
      and v_unlinked=0
      and (v_authority<>'bling' or v_deposit is not null),
    'blocking_reasons',
      to_jsonb(array_remove(array[
        case when d.processing_status<>'processed' then 'document_not_processed' end,
        case when v_total=0 then 'document_without_items' end,
        case when v_review>0 then 'items_require_conversion_or_match_review' end,
        case when v_unlinked>0 then 'products_not_linked_to_bling' end,
        case when v_authority='bling' and v_deposit is null then 'bling_deposit_missing' end,
        case when v_lot_review>0 then 'lot_evidence_requires_review' end
      ],null))
  );
end;
$$;

create or replace function public.prepare_purchase_stock_receipt_plan_v1(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p jsonb;
  v_plan public.purchase_stock_receipt_plans_v1%rowtype;
  v_expected jsonb;
  v_baseline jsonb;
  v_lot_summary jsonb;
  v_authority text;
  v_deposit bigint;
begin
  p:=public.get_purchase_xml_receipt_preflight_v1(p_document_id);
  if coalesce((p->>'ready')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error','purchase_receipt_preflight_failed','preflight',p);
  end if;

  v_authority:=p->>'stock_authority';
  v_deposit:=nullif(p->>'deposit_id','')::bigint;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',q.product_id,
    'bling_product_id',q.bling_product_id,
    'quantity',q.quantity,
    'base_unit',q.base_unit,
    'purchase_item_ids',q.purchase_item_ids
  ) order by q.product_id),'[]'::jsonb)
  into v_expected
  from (
    select
      i.product_id,
      max(coalesce(l.bling_id,i.bling_product_id)) as bling_product_id,
      sum(i.converted_quantity)::numeric(18,6) as quantity,
      min(i.base_unit) as base_unit,
      jsonb_agg(i.id order by i.item_number) as purchase_item_ids
    from public.purchase_xml_items i
    left join lateral (
      select bling_id from public.bling_hub_entity_links_v2 x
      where x.entity_type='product' and x.status='matched' and x.source_id=i.product_id::text
      order by x.last_verified_at desc nulls last limit 1
    ) l on true
    where i.document_id=p_document_id
    group by i.product_id
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',x.product_id,
    'bling_product_id',x.bling_product_id,
    'physical',x.sellable_physical,
    'virtual',x.sellable_virtual,
    'observed_at',x.mirror_observed_at
  ) order by x.product_id),'[]'::jsonb)
  into v_baseline
  from public.ops2_sellable_stock_v1 x
  where x.product_id in (
    select product_id from public.purchase_xml_items where document_id=p_document_id and product_id is not null
  );

  select jsonb_build_object(
    'rows',count(*),
    'ready',count(*) filter(where e.status in ('observed','ready','materialized')),
    'review_required',count(*) filter(where e.status='review_required'),
    'without_expiration',count(*) filter(where e.expiration_date is null),
    'expiration_required',false
  )
  into v_lot_summary
  from public.purchase_xml_item_lot_evidence e
  join public.purchase_xml_items i on i.id=e.purchase_item_id
  where i.document_id=p_document_id;

  insert into public.purchase_stock_receipt_plans_v1(
    document_id,status,stock_authority,deposit_id,expected_items,baseline_snapshot,
    lot_evidence_summary,idempotency_key,updated_at
  ) values(
    p_document_id,
    case when v_authority='bling' then 'awaiting_bling_receipt' else 'preview' end,
    v_authority,v_deposit,v_expected,v_baseline,coalesce(v_lot_summary,'{}'::jsonb),
    'purchase-receipt-plan:'||p_document_id::text,now()
  )
  on conflict(document_id) do update set
    expected_items=case when purchase_stock_receipt_plans_v1.status='verified'
      then purchase_stock_receipt_plans_v1.expected_items else excluded.expected_items end,
    baseline_snapshot=case when purchase_stock_receipt_plans_v1.status='verified'
      then purchase_stock_receipt_plans_v1.baseline_snapshot else excluded.baseline_snapshot end,
    lot_evidence_summary=excluded.lot_evidence_summary,
    deposit_id=excluded.deposit_id,
    stock_authority=excluded.stock_authority,
    updated_at=case when purchase_stock_receipt_plans_v1.status='verified'
      then purchase_stock_receipt_plans_v1.updated_at else now() end
  returning * into v_plan;

  return jsonb_build_object(
    'ok',true,'plan_id',v_plan.id,'document_id',v_plan.document_id,
    'status',v_plan.status,'stock_authority',v_plan.stock_authority,
    'deposit_id',v_plan.deposit_id,'expected_items',v_plan.expected_items,
    'baseline_snapshot',v_plan.baseline_snapshot,
    'lot_evidence_summary',v_plan.lot_evidence_summary,
    'expiration_required',false,
    'external_write',false
  );
end;
$$;

-- Snapshot the current loose stock as the oldest operational layer. Existing
-- active internal layers are subtracted, making this rerunnable without double count.
insert into public.product_inventory_lots(
  product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,
  status,source,source_ref,received_at,metadata
)
select
  s.product_id,null,null,
  greatest(coalesce(s.loose_sellable_stock,0)-coalesce(x.tracked_quantity,0),0),
  0,'active','legacy','fifo-baseline:'||s.product_id::text,
  timestamptz '2000-01-01 00:00:00+00',
  jsonb_build_object(
    'reason','fifo_initial_baseline',
    'stock_authority',s.stock_authority,
    'captured_loose_sellable_stock',s.loose_sellable_stock,
    'existing_tracked_quantity',coalesce(x.tracked_quantity,0),
    'expiration_known',false
  )
from public.ops2_loose_sellable_stock_v1 s
left join lateral (
  select coalesce(sum(coalesce(l.quantity_on_hand,0)),0) tracked_quantity
  from public.product_inventory_lots l
  where l.product_id=s.product_id and l.status='active'
) x on true
where greatest(coalesce(s.loose_sellable_stock,0)-coalesce(x.tracked_quantity,0),0)>0
on conflict (source,source_ref) where source_ref is not null do nothing;

-- Backfill expiry from real NF-e trace evidence when present. It remains optional.
update public.purchase_xml_items i
   set lot_expiration_date=e.expiration_date,
       updated_at=now()
  from (
    select purchase_item_id,min(expiration_date) expiration_date
      from public.purchase_xml_item_lot_evidence
     where expiration_date is not null
     group by purchase_item_id
  ) e
 where i.id=e.purchase_item_id and i.lot_expiration_date is null;

-- Materialize one quarantined/received internal layer per already imported item.
update public.purchase_xml_items
   set updated_at=updated_at
 where product_id is not null and coalesce(converted_quantity,0)>0;

create or replace function public.vitrine_stock_allocate_fifo_v1(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_res public.vitrine_stock_reservations%rowtype;
  v_lot record;
  v_alloc record;
  v_need numeric(18,6);
  v_take numeric(18,6);
  v_available numeric(18,6);
  v_authority text;
  v_reconcile_id uuid;
  v_allocated numeric(18,6):=0;
  v_reconciled numeric(18,6):=0;
begin
  select * into v_res
    from public.vitrine_stock_reservations
   where id=p_reservation_id
   for update;
  if not found then
    return jsonb_build_object('ok',false,'error','reservation_not_found');
  end if;
  if v_res.status not in ('reserved','consumed') then
    return jsonb_build_object('ok',true,'skipped',true,'status',v_res.status);
  end if;

  -- A quantity change or a reserve replay replaces only still-reserved allocations.
  for v_alloc in
    select a.id,a.lot_id,a.allocated_quantity
      from public.vitrine_stock_reservation_lots a
     where a.reservation_id=p_reservation_id and a.status='reserved'
     for update
  loop
    update public.product_inventory_lots
       set quantity_reserved=greatest(quantity_reserved-v_alloc.allocated_quantity,0),
           updated_at=now()
     where id=v_alloc.lot_id;
    update public.vitrine_stock_reservation_lots
       set status='released',released_at=now(),updated_at=now()
     where id=v_alloc.id;
  end loop;

  v_need:=v_res.quantity;

  for v_lot in
    select l.id,l.quantity_on_hand,l.quantity_reserved
      from public.product_inventory_lots l
     where l.product_id=v_res.product_id
       and l.status='active'
       and coalesce(l.quantity_on_hand,0)-coalesce(l.quantity_reserved,0)>0
     order by coalesce(l.received_at,l.created_at),l.created_at,l.id
     for update
  loop
    exit when v_need<=0;
    v_available:=greatest(coalesce(v_lot.quantity_on_hand,0)-coalesce(v_lot.quantity_reserved,0),0);
    v_take:=least(v_need,v_available);
    if v_take<=0 then continue; end if;

    insert into public.vitrine_stock_reservation_lots(
      reservation_id,lot_id,product_id,allocated_quantity,status,metadata,updated_at
    ) values(
      v_res.id,v_lot.id,v_res.product_id,v_take,'reserved',
      jsonb_build_object('allocation','fifo'),now()
    )
    on conflict(reservation_id,lot_id) do update set
      allocated_quantity=excluded.allocated_quantity,
      status='reserved',consumed_at=null,released_at=null,
      metadata=public.vitrine_stock_reservation_lots.metadata || excluded.metadata,
      updated_at=now();

    update public.product_inventory_lots
       set quantity_reserved=quantity_reserved+v_take,updated_at=now()
     where id=v_lot.id;
    v_need:=v_need-v_take;
    v_allocated:=v_allocated+v_take;
  end loop;

  if v_need>0 then
    select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
      into v_authority
      from public.bling_hub_runtime_v2 where id=1;

    if v_authority<>'bling' then
      raise exception 'insufficient_fifo_lot_stock';
    end if;

    insert into public.product_inventory_lots(
      product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,
      status,source,source_ref,received_at,metadata
    ) values(
      v_res.product_id,null,null,v_need,0,'active','bling',
      'reconcile-vitrine-reservation:'||v_res.id::text||':'||gen_random_uuid()::text,
      now(),
      jsonb_build_object(
        'reason','internal_fifo_shortfall_under_bling_authority',
        'reservation_id',v_res.id,
        'authoritative_reservation_already_accepted',true
      )
    ) returning id into v_reconcile_id;

    insert into public.vitrine_stock_reservation_lots(
      reservation_id,lot_id,product_id,allocated_quantity,status,metadata
    ) values(
      v_res.id,v_reconcile_id,v_res.product_id,v_need,'reserved',
      jsonb_build_object('allocation','bling_reconciliation')
    );
    update public.product_inventory_lots
       set quantity_reserved=quantity_reserved+v_need,updated_at=now()
     where id=v_reconcile_id;
    v_reconciled:=v_need;
    v_allocated:=v_allocated+v_need;
    v_need:=0;
  end if;

  return jsonb_build_object(
    'ok',true,'reservation_id',v_res.id,
    'allocated_quantity',v_allocated,
    'reconciled_quantity',v_reconciled,
    'remaining_quantity',v_need
  );
end;
$$;

revoke all on function public.vitrine_stock_allocate_fifo_v1(uuid) from public, anon, authenticated;

create or replace function public.vitrine_stock_consume_fifo_v1(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_res public.vitrine_stock_reservations%rowtype;
  v_alloc record;
  v_reserved numeric(18,6):=0;
  v_consumed numeric(18,6):=0;
begin
  select * into v_res from public.vitrine_stock_reservations where id=p_reservation_id for update;
  if not found then return jsonb_build_object('ok',false,'error','reservation_not_found'); end if;

  select coalesce(sum(allocated_quantity),0) into v_reserved
    from public.vitrine_stock_reservation_lots
   where reservation_id=p_reservation_id and status='reserved';

  if v_reserved < v_res.quantity then
    perform public.vitrine_stock_allocate_fifo_v1(p_reservation_id);
  end if;

  for v_alloc in
    select a.id,a.lot_id,a.allocated_quantity
      from public.vitrine_stock_reservation_lots a
     where a.reservation_id=p_reservation_id and a.status='reserved'
     order by a.created_at,a.id
     for update
  loop
    update public.product_inventory_lots
       set quantity_on_hand=greatest(coalesce(quantity_on_hand,0)-v_alloc.allocated_quantity,0),
           quantity_reserved=greatest(quantity_reserved-v_alloc.allocated_quantity,0),
           status=case
             when greatest(coalesce(quantity_on_hand,0)-v_alloc.allocated_quantity,0)<=0 then 'depleted'
             else status
           end,
           updated_at=now()
     where id=v_alloc.lot_id;
    update public.vitrine_stock_reservation_lots
       set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
     where id=v_alloc.id;
    v_consumed:=v_consumed+v_alloc.allocated_quantity;
  end loop;

  return jsonb_build_object('ok',true,'reservation_id',p_reservation_id,'consumed_quantity',v_consumed);
end;
$$;

revoke all on function public.vitrine_stock_consume_fifo_v1(uuid) from public, anon, authenticated;

create or replace function public.vitrine_stock_release_fifo_v1(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_alloc record;
  v_authority text;
  v_released numeric(18,6):=0;
begin
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
    into v_authority from public.bling_hub_runtime_v2 where id=1;

  for v_alloc in
    select a.id,a.lot_id,a.allocated_quantity,a.status
      from public.vitrine_stock_reservation_lots a
     where a.reservation_id=p_reservation_id and a.status in ('reserved','consumed')
     for update
  loop
    if v_alloc.status='reserved' then
      update public.product_inventory_lots
         set quantity_reserved=greatest(quantity_reserved-v_alloc.allocated_quantity,0),
             updated_at=now()
       where id=v_alloc.lot_id;
    elsif v_alloc.status='consumed' and v_authority<>'bling' then
      update public.product_inventory_lots
         set quantity_on_hand=coalesce(quantity_on_hand,0)+v_alloc.allocated_quantity,
             status='active',updated_at=now()
       where id=v_alloc.lot_id;
    end if;

    update public.vitrine_stock_reservation_lots
       set status='released',released_at=now(),
           metadata=metadata || jsonb_build_object(
             'restored_quantity',v_alloc.status='consumed' and v_authority<>'bling',
             'bling_physical_restore_skipped',v_alloc.status='consumed' and v_authority='bling'
           ),
           updated_at=now()
     where id=v_alloc.id;
    v_released:=v_released+v_alloc.allocated_quantity;
  end loop;

  return jsonb_build_object('ok',true,'reservation_id',p_reservation_id,'released_quantity',v_released,'stock_authority',v_authority);
end;
$$;

revoke all on function public.vitrine_stock_release_fifo_v1(uuid) from public, anon, authenticated;

create or replace function public.vitrine_stock_reservation_lot_sync_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op='INSERT' then
    if new.status='reserved' then perform public.vitrine_stock_allocate_fifo_v1(new.id); end if;
    return new;
  end if;

  if new.status='reserved'
     and (old.status is distinct from new.status or old.quantity is distinct from new.quantity or old.product_id is distinct from new.product_id) then
    perform public.vitrine_stock_allocate_fifo_v1(new.id);
  elsif new.status='consumed' and old.status is distinct from new.status then
    perform public.vitrine_stock_consume_fifo_v1(new.id);
  elsif new.status='released' and old.status is distinct from new.status then
    perform public.vitrine_stock_release_fifo_v1(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.vitrine_stock_reservation_lot_sync_v1() from public, anon, authenticated;

drop trigger if exists vitrine_stock_reservation_lot_sync_v1 on public.vitrine_stock_reservations;
create trigger vitrine_stock_reservation_lot_sync_v1
after insert or update of status,quantity,product_id
on public.vitrine_stock_reservations
for each row execute function public.vitrine_stock_reservation_lot_sync_v1();

create or replace function public.vitrine_stock_reservation_lot_delete_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.status in ('reserved','consumed') then
    perform public.vitrine_stock_release_fifo_v1(old.id);
  end if;
  return old;
end;
$$;

revoke all on function public.vitrine_stock_reservation_lot_delete_v1() from public, anon, authenticated;

drop trigger if exists vitrine_stock_reservation_lot_delete_v1 on public.vitrine_stock_reservations;
create trigger vitrine_stock_reservation_lot_delete_v1
before delete on public.vitrine_stock_reservations
for each row execute function public.vitrine_stock_reservation_lot_delete_v1();

-- Existing open reservations must be represented in the new FIFO layer. Historical
-- consumed reservations are deliberately not replayed because Bling already reflects them.
do $$
declare r record;
begin
  for r in
    select id from public.vitrine_stock_reservations
     where status='reserved' and expires_at>now()
     order by created_at,id
  loop
    perform public.vitrine_stock_allocate_fifo_v1(r.id);
  end loop;
end;
$$;

commit;
