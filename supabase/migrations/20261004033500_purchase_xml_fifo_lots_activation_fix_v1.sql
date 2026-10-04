begin;

-- The FIFO synchronizer listens to selected columns on purchase_xml_items.
-- Replaying only updated_at does not fire an UPDATE OF trigger, so explicitly
-- touch processing_status when a verified receipt needs to activate its lots.
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
  update public.purchase_xml_items
     set processing_status=processing_status,
         updated_at=now()
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

revoke all on function public.activate_purchase_xml_inventory_lots_v1(uuid,uuid)
  from public, anon, authenticated;

-- This trigger function is shared by the verified-plan path and receipt path.
-- OLD is not available on INSERT, so gate it explicitly with TG_OP.
create or replace function public.purchase_xml_activate_inventory_lots_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_table_name='purchase_stock_receipt_plans_v1' then
    if new.status='verified'
       and (tg_op='INSERT' or old.status is distinct from new.status) then
      perform public.activate_purchase_xml_inventory_lots_v1(new.document_id,new.verified_by);
    end if;
  elsif tg_table_name='purchase_stock_receipts' then
    if new.status='applied'
       and (tg_op='INSERT' or old.status is distinct from new.status) then
      perform public.activate_purchase_xml_inventory_lots_v1(new.document_id,new.confirmed_by);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.purchase_xml_activate_inventory_lots_trigger_v1()
  from public, anon, authenticated;

-- Cover both the normal plan verification path and any receipt that is inserted
-- directly already in status applied.
drop trigger if exists purchase_receipt_activate_inventory_lots_v1
  on public.purchase_stock_receipts;
create trigger purchase_receipt_activate_inventory_lots_v1
after insert or update on public.purchase_stock_receipts
for each row execute function public.purchase_xml_activate_inventory_lots_trigger_v1();

-- Existing imported XML rows were present before the trigger existed. Replay them
-- once with a listened column so each identified item gets its idempotent internal lot.
update public.purchase_xml_items
   set processing_status=processing_status,
       updated_at=updated_at
 where product_id is not null
   and coalesce(converted_quantity,0)>0;

commit;
