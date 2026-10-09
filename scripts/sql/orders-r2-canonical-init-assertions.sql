-- R02+ tests the REAL current production init_order_separation RPC.
-- Requires the canonical fixture and real prepare/apply/mark definitions.
-- NEVER execute against production. All UUIDs are synthetic and stable.
\set ON_ERROR_STOP on

DO $init_hml$
DECLARE
  oid uuid:='00000000-0000-4000-8000-000000000030';
  header uuid:='00000000-0000-4000-8000-000000000031';
  component uuid:='00000000-0000-4000-8000-000000000032';
  loose uuid:='00000000-0000-4000-8000-000000000033';
  r jsonb;
BEGIN
  r:=public.ops2_init_order_separation_v2(null);
  IF r->>'error' IS DISTINCT FROM 'invalid_order_id'
    THEN RAISE EXCEPTION 'null order passed initializer: %',r; END IF;
  r:=public.ops2_init_order_separation_v2('00000000-0000-4000-8000-000000000099'::uuid);
  IF r->>'error' IS DISTINCT FROM 'order_not_found'
    THEN RAISE EXCEPTION 'unknown order passed initializer: %',r; END IF;

  INSERT INTO public.orders(id,order_number,status,total,subtotal,fiscal_subtotal)
  VALUES (oid,'09|10|2026 - 003','confirmed',160,160,160);

  INSERT INTO public.order_items
    (id,order_id,product_id,name_snapshot,quantity,unit_price,line_total,metadata)
  VALUES
    (header,oid,null,'CESTA MOCK',1,160,160,
      '{"history_kind":"basket","basket_id":"B-001","basket_name":"CESTA MOCK"}'::jsonb),
    (component,oid,'00000000-0000-4000-8000-000000000134',
      'ALIMENTO DA CESTA',2,50,100,
      '{"history_kind":"basket_component","basket_id":"B-001"}'::jsonb),
    (loose,oid,'00000000-0000-4000-8000-000000000135',
      'PRODUTO AVULSO',1,60,60,'{}'::jsonb);

  r:=public.ops2_init_order_separation_v2(oid);
  IF r->>'ok' IS DISTINCT FROM 'true'
    OR r->>'status' IS DISTINCT FROM 'initialized'
    OR (r->>'item_count')::integer IS DISTINCT FROM 2
    OR (SELECT count(*) FROM public.order_separation_items_v1 WHERE order_id=oid) <> 2
    OR EXISTS(SELECT 1 FROM public.order_separation_items_v1
             WHERE order_id=oid AND order_item_id=header)
  THEN RAISE EXCEPTION 'real initializer doubled basket head: %',r; END IF;

  IF (SELECT quantity FROM public.order_separation_items_v1 WHERE order_item_id=component)<>2
    OR (SELECT line_total FROM public.order_separation_items_v1 WHERE order_item_id=loose)<>60
  THEN RAISE EXCEPTION 'canonical real initializer did not retain product quantities'; END IF;

  -- If basket header had been incorrectly cached by old implementation,
  -- the real initializer removes it before continuing. A second call must
  -- not bring it back when actual child components are present.
  INSERT INTO public.order_separation_items_v1
    (order_id,order_item_id,product_id,state,quantity,unit_price,line_total)
  VALUES(oid,header,null,'pending',1,160,160);
  r:=public.ops2_init_order_separation_v2(oid);
  IF EXISTS(SELECT 1 FROM public.order_separation_items_v1 WHERE order_item_id=header)
  THEN RAISE EXCEPTION 'canonical initializer did not clean basket header'; END IF;

  -- Do not overwrite a decision taken by separator. A still-pending item
  -- may resync with its original order_items values.
  UPDATE public.order_separation_items_v1 SET state='separated' WHERE order_item_id=component;
  UPDATE public.order_items SET quantity=1,unit_price=80,line_total=80 WHERE id=component;
  UPDATE public.order_items SET quantity=2,unit_price=30,line_total=60 WHERE id=loose;
  r:=public.ops2_init_order_separation_v2(oid);
  IF (SELECT quantity FROM public.order_separation_items_v1 WHERE order_item_id=component)<>2
    OR (SELECT unit_price FROM public.order_separation_items_v1 WHERE order_item_id=component)<>50
    OR (SELECT quantity FROM public.order_separation_items_v1 WHERE order_item_id=loose)<>2
    OR (SELECT unit_price FROM public.order_separation_items_v1 WHERE order_item_id=loose)<>30
  THEN RAISE EXCEPTION 'initialized partial separation lost frozen operator work: %',r; END IF;

  INSERT INTO public.order_separation_completions_v1(
    order_id,order_number,phase,original_total,original_subtotal,
    original_fiscal_subtotal,original_discount,original_other_expenses,
    original_basket_hidden_adjustment,missing_subtotal,final_total
  )VALUES(oid,'09|10|2026 - 003','completed',160,160,160,0,0,0,0,160);
  r:=public.ops2_init_order_separation_v2(oid);
  IF r->>'status' IS DISTINCT FROM 'already_completed'
    OR (r->>'item_count')::integer IS DISTINCT FROM 2
  THEN RAISE EXCEPTION 'completed order was reopened by init: %',r; END IF;
  IF (SELECT count(*) FROM public.order_separation_items_v1 WHERE order_id=oid)<>2
  THEN RAISE EXCEPTION 'completed order was mutated by init'; END IF;
END $init_hml$;

DO $init_empty$
DECLARE oid uuid:='00000000-0000-4000-8000-000000000040'; v jsonb;
BEGIN
 INSERT INTO public.orders(id,order_number,status,total,subtotal,fiscal_subtotal)
 VALUES (oid,'09|10|2026 - 004','confirmed',75,75,75);
 v:=public.ops2_init_order_separation_v2(oid);
 IF v->>'error' IS DISTINCT FROM 'order_has_no_items'
 THEN RAISE EXCEPTION 'empty order permitted: %',v; END IF;
 UPDATE public.orders SET status='ready' WHERE id=oid;
 v:=public.ops2_init_order_separation_v2(oid);
 IF v->>'error' IS DISTINCT FROM 'order_not_in_separation'
 THEN RAISE EXCEPTION 'non-picking status permitted: %',v; END IF;
END $init_empty$;

SELECT 'PASS: real ops2_init_order_separation_v2, basket header, partial decisions, replay, empty and terminal orders' AS result;
