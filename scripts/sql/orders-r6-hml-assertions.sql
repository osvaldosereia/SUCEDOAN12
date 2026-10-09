-- R06 isolated PostgreSQL 17. Actual unchanged R02 production functions are
-- used for prepare, stock apply and completion; only init is a synthetic stub.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;

DO $r6$
DECLARE
  good uuid:='00000000-0000-4000-8000-000000000010';
  basket uuid:='00000000-0000-4000-8000-000000000050';
  got jsonb;
  snap jsonb;
  prepared jsonb;
  journal jsonb;
  replay jsonb;
  applied jsonb;
  cur timestamptz;
BEGIN
  IF has_function_privilege('anon','public.ops2_preview_order_reconciliation_v1(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.ops2_record_order_reconciliation_v1(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'R06 privileged manifest functions exposed';
  END IF;
  IF NOT has_function_privilege('service_role','public.ops2_record_order_reconciliation_v1(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'R06 service_role permission missing';
  END IF;
  IF (SELECT count(*) FROM public.order_separation_completions_v1)<>0 THEN
    RAISE EXCEPTION 'nonempty test receipt ledger';
  END IF;

  -- Fail closed BEFORE modifying order amounts.
  got:=public.ops2_preview_order_reconciliation_v1('00000000-0000-4000-8000-000000000020');
  IF got->>'ready'<>'false' OR NOT (got->'blockers') ? 'separation_incomplete' THEN
    RAISE EXCEPTION 'pending item was cleared: %',got; END IF;
  got:=public.ops2_preview_order_reconciliation_v1('00000000-0000-4000-8000-000000000030');
  IF got->>'ready'<>'false' OR NOT (got->'blockers') ? 'no_deliverable_items'
     OR (SELECT total FROM public.orders WHERE id='00000000-0000-4000-8000-000000000030')<>40 THEN
    RAISE EXCEPTION 'fully_missing_order was accepted: %',got; END IF;
  got:=public.ops2_preview_order_reconciliation_v1('00000000-0000-4000-8000-000000000040');
  IF got->>'ready'<>'false' OR NOT (got->'blockers') ? 'duplicate_reservations_for_product' THEN
    RAISE EXCEPTION 'duplicate stock reservation was accepted: %',got; END IF;
  got:=public.ops2_preview_order_reconciliation_v1('00000000-0000-4000-8000-000000000060');
  IF got->>'ready'<>'false' OR NOT (got->'blockers') ? 'priced_basket_parent_duplicates_components' THEN
    RAISE EXCEPTION 'double priced basket accepted: %',got; END IF;
  got:=public.ops2_preview_order_reconciliation_v1('00000000-0000-4000-8000-000000000070');
  IF got->>'ready'<>'false' OR NOT (got->'blockers') ? 'invalid_item_amount_or_quantity' THEN
    RAISE EXCEPTION 'zero quantity considered deliverable: %',got; END IF;

  -- Original partial shortage 230-32=198: preserve public identity.
  snap:=public.ops2_preview_order_reconciliation_v1(good);
  IF snap->>'ready'<>'true' OR (snap->'financial'->>'final_total')::numeric<>198
    OR snap->>'public_order_number'<>'08|10|2026 - 001'
    OR (SELECT count(*) FROM jsonb_array_elements(snap->'lines') x
        WHERE x->>'deliverable'='true')<>1
  THEN RAISE EXCEPTION 'original partial shortage manifest wrong: %',snap; END IF;
  journal:=public.ops2_record_order_reconciliation_v1(good);
  IF journal->>'error'<>'separation_not_prepared' THEN
    RAISE EXCEPTION 'manifest recorded without prepared completion'; END IF;
  SELECT updated_at INTO cur FROM public.orders WHERE id=good;
  prepared:=public.ops2_prepare_order_separation_completion_v2(good,cur);
  IF prepared->>'ok'<>'true' OR (prepared->>'final_total')::numeric<>198 THEN
    RAISE EXCEPTION 'canonical prepare failed: %',prepared; END IF;
  journal:=public.ops2_record_order_reconciliation_v1(good);
  IF journal->>'recorded'<>'true' OR (journal->'manifest'->'financial'->>'missing_subtotal')::numeric<>32 THEN
    RAISE EXCEPTION 'manifest not frozen: %',journal; END IF;
  replay:=public.ops2_record_order_reconciliation_v1(good);
  IF replay->>'idempotent'<>'true' OR replay->'manifest' IS DISTINCT FROM journal->'manifest' THEN
    RAISE EXCEPTION 'manifest replay double-changed: %',replay; END IF;
  applied:=public.ops2_apply_order_separation_stock_v2(good);
  IF applied->>'status'<>'stock_applied' OR applied->>'physical_stock_changed'<>'false'
     OR (SELECT quantity FROM public.vitrine_stock_reservations
        WHERE order_id=good AND product_id='00000000-0000-4000-8000-000000000111')<>3
     OR (SELECT status FROM public.vitrine_stock_reservations
        WHERE order_id=good AND product_id='00000000-0000-4000-8000-000000000112')<>'released' THEN
    RAISE EXCEPTION 'actual stock reconciliation not matching manifest: %',applied; END IF;
  replay:=public.ops2_apply_order_separation_stock_v2(good);
  IF replay->>'status'<>'already_applied' THEN
    RAISE EXCEPTION 'stock replay caused another application'; END IF;
  IF (SELECT total FROM public.orders WHERE id=good)<>198
     OR (SELECT order_number FROM public.orders WHERE id=good)<>'08|10|2026 - 001' THEN
    RAISE EXCEPTION 'partial shortage financial total or identity altered'; END IF;

  -- Basket parent is DISPLAY ONLY, component survives with preassembled quantity.
  snap:=public.ops2_preview_order_reconciliation_v1(basket);
  IF snap->>'ready'<>'true'
     OR (snap->'counts'->>'display_only')::integer<>1
     OR (snap->'financial'->>'final_total')::numeric<>140
     OR (snap->'financial'->>'final_subtotal')::numeric<>130
     OR (snap->'financial'->>'other_expenses')::numeric<>12
     OR (snap->'financial'->>'discount')::numeric<>2
     OR (snap->'financial'->>'basket_hidden_adjustment')::numeric<>10
     OR (SELECT count(*) FROM jsonb_array_elements(snap->'lines') x
         WHERE x->>'display_only'='true' AND x->>'deliverable'='false')<>1
  THEN RAISE EXCEPTION 'basket hidden price/fee/parent contract wrong: %',snap; END IF;
  SELECT updated_at INTO cur FROM public.orders WHERE id=basket;
  prepared:=public.ops2_prepare_order_separation_completion_v2(basket,cur);
  IF prepared->>'ok'<>'true' OR (prepared->>'final_total')::numeric<>140 THEN
    RAISE EXCEPTION 'canonical basket prepare failed: %',prepared; END IF;
  journal:=public.ops2_record_order_reconciliation_v1(basket);
  IF journal->>'recorded'<>'true' THEN RAISE EXCEPTION 'basket snapshot not persisted'; END IF;
  applied:=public.ops2_apply_order_separation_stock_v2(basket);
  IF applied->>'status'<>'stock_applied'
    OR (SELECT quantity FROM public.vitrine_stock_reservations
       WHERE order_id=basket AND product_id='00000000-0000-4000-8000-000000000152')<>1
    OR (SELECT status FROM public.vitrine_stock_reservations
       WHERE order_id=basket AND product_id='00000000-0000-4000-8000-000000000153')<>'released'
    OR (SELECT total FROM public.orders WHERE id=basket)<>140
  THEN RAISE EXCEPTION 'preassembled kit stock/finance reconciliation broken: %',applied; END IF;

  IF (SELECT count(*) FROM public.order_separation_completions_v1
       WHERE metadata ? 'r6_reconciliation')<>2 THEN
    RAISE EXCEPTION 'reconciled order count wrong';
  END IF;
  IF (SELECT count(*) FROM public.order_separation_completions_v1)<>2 THEN
    RAISE EXCEPTION 'blocked orders wrongly prepared or billed';
  END IF;
END
$r6$;
SELECT 'PASS R06: 5 blocked risks, real partial/basket prepare, signed-independent immutable manifest, stock once' result;
