-- All identifiers/products/lots in this suite are synthetic.
-- Executes REAL v3_base, wrapper, stock reservation and captured lot helpers.
\set ON_ERROR_STOP on
DO $basket_integration$
DECLARE
 food uuid:='00000000-0000-4000-8000-0000000000e1';
 clean uuid:='00000000-0000-4000-8000-0000000000e2';
 basket uuid:='00000000-0000-4000-8000-0000000000d1';
 food_lot uuid:='00000000-0000-4000-8000-0000000000f1';
 clean_lot uuid:='00000000-0000-4000-8000-0000000000f2';
 mold uuid:='00000000-0000-4000-8000-0000000000d3';
 legacy uuid:='00000000-0000-4000-8000-0000000000d4';
 legacy_lot uuid:='00000000-0000-4000-8000-0000000000f3';
 ar uuid:='00000000-0000-4000-8000-0000000000e3';
 sb uuid:='00000000-0000-4000-8000-0000000000e4';
 p1 uuid:='00000000-0000-4000-8000-0000000000c2';
 p2 uuid:='00000000-0000-4000-8000-0000000000c3';
 input jsonb; response jsonb; oid uuid;
 r record;
BEGIN
 -- Untouched: both kits stay preassembled, sale 160 with 70 fiscal items
 -- and exactly 90 other_expenses. The parent display card cannot be counted
 -- as extra product, but persists as order_items metadata.
 input:=jsonb_build_array(jsonb_build_object('type','basket','id',basket,
  'food_lot_id',food_lot,'components',jsonb_build_array(
    jsonb_build_object('component_group','food','product_id',food,'quantity',1),
    jsonb_build_object('component_group','hygiene','product_id',clean,'quantity',1)
  )));
 response:=public.create_vitrine_cart_order_v3(null,'PIX',input);
 oid:=(response->>'order_id')::uuid;
 IF (response->>'total')::numeric<>160
    OR (SELECT fiscal_subtotal FROM public.orders WHERE id=oid)<>70
    OR (SELECT other_expenses FROM public.orders WHERE id=oid)<>90
    OR (SELECT count(*) FROM public.basket_stock_allocations WHERE order_id=oid)<>2
    OR (SELECT count(*) FROM public.order_items WHERE order_id=oid)<>3
    OR EXISTS (SELECT 1 FROM public.vitrine_stock_reservations WHERE order_id=oid)
 THEN RAISE EXCEPTION 'unchanged kits checkout failed: %',response; END IF;
 SELECT metadata->>'food_mode' AS f,metadata->>'hygiene_mode' AS h
 INTO r FROM public.order_items WHERE order_id=oid
 AND metadata->>'history_kind'='basket';
 IF r.f IS DISTINCT FROM 'lot' OR r.h IS DISTINCT FROM 'lot'
 THEN RAISE EXCEPTION 'no-change kits marked loose: %, %',r.f,r.h; END IF;

 -- Food removed; hygiene intact => 110 commercial / 20 fiscal,
 -- one hygiene allocation. Never touch the untouched kit's stock.
 input:=jsonb_build_array(jsonb_build_object('type','basket','id',basket,
  'food_lot_id',food_lot,'components',jsonb_build_array(
    jsonb_build_object('component_group','food','product_id',food,'quantity',0),
    jsonb_build_object('component_group','hygiene','product_id',clean,'quantity',1)
  )));
 response:=public.create_vitrine_cart_order_v3(null,'PIX',input);
 oid:=(response->>'order_id')::uuid;
 IF (response->>'total')::numeric<>110
    OR (SELECT fiscal_subtotal FROM public.orders WHERE id=oid)<>20
    OR (SELECT other_expenses FROM public.orders WHERE id=oid)<>90
    OR (SELECT count(*) FROM public.basket_stock_allocations WHERE order_id=oid)<>1
    OR (SELECT allocation_role FROM public.basket_stock_allocations WHERE order_id=oid)<>'hygiene'
    OR (SELECT count(*) FROM public.vitrine_stock_reservations WHERE order_id=oid)<>0
 THEN RAISE EXCEPTION 'food edit destroyed hygiene lot: %',response; END IF;
 SELECT metadata->>'food_mode' AS f,metadata->>'hygiene_mode' AS h
 INTO r FROM public.order_items WHERE order_id=oid
 AND metadata->>'history_kind'='basket';
 IF r.f IS DISTINCT FROM 'loose' OR r.h IS DISTINCT FROM 'lot'
 THEN RAISE EXCEPTION 'food-only change did not preserve hygiene: %, %',r.f,r.h; END IF;

 -- Hygiene removed; food intact => preserve food allocation only.
 input:=jsonb_build_array(jsonb_build_object('type','basket','id',basket,
  'food_lot_id',food_lot,'components',jsonb_build_array(
    jsonb_build_object('component_group','food','product_id',food,'quantity',1),
    jsonb_build_object('component_group','hygiene','product_id',clean,'quantity',0)
  )));
 response:=public.create_vitrine_cart_order_v3(null,'PIX',input);
 oid:=(response->>'order_id')::uuid;
 IF (response->>'total')::numeric<>140
   OR (SELECT fiscal_subtotal FROM public.orders WHERE id=oid)<>50
   OR (SELECT other_expenses FROM public.orders WHERE id=oid)<>90
   OR (SELECT count(*) FROM public.basket_stock_allocations WHERE order_id=oid)<>1
   OR (SELECT allocation_role FROM public.basket_stock_allocations WHERE order_id=oid)<>'food'
 THEN RAISE EXCEPTION 'hygiene edit destroyed food lot: %',response; END IF;
 SELECT metadata->>'food_mode' AS f,metadata->>'hygiene_mode' AS h
 INTO r FROM public.order_items WHERE order_id=oid
 AND metadata->>'history_kind'='basket';
 IF r.f IS DISTINCT FROM 'lot' OR r.h IS DISTINCT FROM 'loose'
 THEN RAISE EXCEPTION 'hygiene-only change did not preserve food: %, %',r.f,r.h; END IF;

 -- Add one loose food item to already mounted food lot (2 requested vs 1).
 -- The original kit remains, and ONLY the added unit is reserved loose.
 input:=jsonb_build_array(jsonb_build_object('type','basket','id',basket,
  'food_lot_id',food_lot,'components',jsonb_build_array(
    jsonb_build_object('component_group','food','product_id',food,'quantity',2),
    jsonb_build_object('component_group','hygiene','product_id',clean,'quantity',1)
  )));
 response:=public.create_vitrine_cart_order_v3(null,'PIX',input);
 oid:=(response->>'order_id')::uuid;
 IF (response->>'total')::numeric<>210
   OR (SELECT fiscal_subtotal FROM public.orders WHERE id=oid)<>120
   OR (SELECT quantity FROM public.vitrine_stock_reservations WHERE order_id=oid)<>1
   OR (SELECT count(*) FROM public.basket_stock_allocations WHERE order_id=oid)<>2
   OR (SELECT (metadata->>'preassembled_units')::numeric
       FROM public.order_items WHERE order_id=oid AND product_id=food)<>1
 THEN RAISE EXCEPTION 'mounted kit extra reserved twice: %',response; END IF;

 -- Mold card: choose two allowed products; additional +5 hidden when ARROZ
 -- selected, fixed hidden +10. Commercial 105 vs fiscal subtotal 90.
 input:=jsonb_build_array(jsonb_build_object('type','basket_mold','id',mold,
  'composition_number',2,'components',jsonb_build_array(
   jsonb_build_object('position_id',p1,'product_id',ar,'quantity',1),
   jsonb_build_object('position_id',p2,'product_id',sb,'quantity',1)
  )));
 response:=public.create_vitrine_cart_order_v3(null,'PIX',input);
 oid:=(response->>'order_id')::uuid;
 IF (response->>'total')::numeric<>105
   OR (SELECT fiscal_subtotal FROM public.orders WHERE id=oid)<>90
   OR (SELECT other_expenses FROM public.orders WHERE id=oid)<>15
   OR (SELECT count(*) FROM public.order_items WHERE order_id=oid)<>3
   OR (SELECT count(*) FROM public.vitrine_stock_reservations WHERE order_id=oid)<>2
   OR (SELECT (metadata->>'conditional_hidden_value')::numeric FROM public.order_items
       WHERE order_id=oid AND metadata->>'history_kind'='basket_mold')<>5
 THEN RAISE EXCEPTION 'mold with conditional hidden adjustment invalid: %',response; END IF;

 -- Choose second position only: conditional hidden zero, fixed hidden 10.
 input:=jsonb_build_array(jsonb_build_object('type','basket_mold','id',mold,
  'composition_number',1,'components',jsonb_build_array(
   jsonb_build_object('position_id',p1,'product_id',ar,'quantity',0),
   jsonb_build_object('position_id',p2,'product_id',sb,'quantity',3)
  )));
 response:=public.create_vitrine_cart_order_v3(null,'PIX',input);
 oid:=(response->>'order_id')::uuid;
 IF (response->>'total')::numeric<>100
    OR (SELECT other_expenses FROM public.orders WHERE id=oid)<>10
    OR (SELECT fiscal_subtotal FROM public.orders WHERE id=oid)<>90
    OR (SELECT count(*) FROM public.vitrine_stock_reservations WHERE order_id=oid)<>1
 THEN RAISE EXCEPTION 'mold conditional hidden counted with omitted item: %',response; END IF;

 -- Invalid mold option cannot bypass position allowed product whitelist.
 BEGIN
  input:=jsonb_build_array(jsonb_build_object('type','basket_mold','id',mold,
   'components',jsonb_build_array(
     jsonb_build_object('position_id',p1,'product_id',sb,'quantity',1),
     jsonb_build_object('position_id',p2,'product_id',ar,'quantity',1))));
  PERFORM public.create_vitrine_cart_order_v3(null,'PIX',input);
  RAISE EXCEPTION 'forbidden mold substitution accepted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM IS DISTINCT FROM 'basket_mold_option_invalid' THEN RAISE; END IF;
 END;

 -- Legacy preassembled lots still accepted, and physical kits allocated.
 input:=jsonb_build_array(jsonb_build_object('type','basket','id',legacy,
  'lot_id',legacy_lot));
 response:=public.create_vitrine_cart_order_v3(null,'PIX',input);
 oid:=(response->>'order_id')::uuid;
 IF (response->>'total')::numeric<>120
    OR (SELECT fiscal_subtotal FROM public.orders WHERE id=oid)<>40
    OR (SELECT count(*) FROM public.basket_stock_allocations WHERE order_id=oid)<>1
 THEN RAISE EXCEPTION 'legacy preassembled basket path invalid: %',response; END IF;

 -- No customer-supplied group should cause an extra phantom reservation.
 IF EXISTS (SELECT 1 FROM public.vitrine_stock_reservations res
   JOIN public.order_items i ON i.order_id=res.order_id AND i.product_id=res.product_id
   WHERE i.metadata->>'history_kind'='basket' )
 THEN RAISE EXCEPTION 'phantom reservation created for visual basket parent'; END IF;
END $basket_integration$;
SELECT 'PASS: unchanged kits, independent food/hygiene edits, extra stock, conditional mold hidden value, legacy lot' result;
