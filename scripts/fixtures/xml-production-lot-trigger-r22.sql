-- R22: REAL runtime public function/trigger snapshot (2026-10-09), ONLY test use.
CREATE OR REPLACE FUNCTION public.purchase_xml_sync_inventory_lot_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE TRIGGER purchase_xml_sync_inventory_lot_v1 AFTER INSERT OR UPDATE OF product_id, converted_quantity, lot_expiration_date, processing_status, inventory_lot_id ON public.purchase_xml_items FOR EACH ROW EXECUTE FUNCTION purchase_xml_sync_inventory_lot_v1();
