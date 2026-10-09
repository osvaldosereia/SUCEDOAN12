-- R02-R06 true SQL integration, WITH actual R03/R04/R05 gates, real checkout,
-- real canonical init/prepare/apply/mark, and original R06 manifest RPC.
-- All orders, accounts and Meta messages are synthetic; no live external API.
\set ON_ERROR_STOP on
DO $r02_r06$
DECLARE
  basket uuid;
  mold uuid;
  simple uuid;
  v jsonb;
  preview jsonb;
  journal jsonb;
  id_before text;
  dt timestamptz;
  picked_count int;
BEGIN
 SELECT order_id INTO basket FROM public.r2_r5_meta_test_orders WHERE kind='basket';
 SELECT order_id INTO mold FROM public.r2_r5_meta_test_orders WHERE kind='mold';
 SELECT order_id INTO simple FROM public.r2_r5_meta_test_orders WHERE kind='simple';
 IF basket IS NULL OR mold IS NULL OR simple IS NULL
 THEN RAISE EXCEPTION 'missing_R02_checkout_test_orders'; END IF;

 -- The R05 assertion already left simple completed, basket confirmed by
 -- channel 1018 and processing, mold not confirmed. R06 must not override
 -- customer-confirmation status merely because order has products.
 IF (SELECT count(*) FROM public.order_meta_confirmations_v1)<>2
   OR NOT public.ops2_meta_order_confirmation_required_v1(mold)
 THEN RAISE EXCEPTION 'Meta R04 preconditions not preserved'; END IF;

 -- Never allow an unconfirmed order to instantiate pick rows by a canonical
 -- SECURITY DEFINER initializer. If a DB guard rejects the operation, the
 -- test must observe the rejection, not a silently created picked row.
 BEGIN
   v:=public.ops2_init_order_separation_v2(mold);
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'meta_customer_confirmation_required' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.order_separation_items_v1 WHERE order_id=mold)
 THEN RAISE EXCEPTION 'unconfirmed_mold_created_picking_rows'; END IF;

 -- Real kit checkout: original R$160 (food 50, hygiene 20, commercial
 -- adjustment R$90). Hygiene FALTOU R$20; do not reprice the untouched kit.
 id_before:=(SELECT order_number FROM public.orders WHERE id=basket);
 v:=public.ops2_init_order_separation_v2(basket);
 IF v->>'ok' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'actual_init_basket_failed: %',v; END IF;
 SELECT count(*) INTO picked_count FROM public.order_separation_items_v1
 WHERE order_id=basket;
 IF picked_count<>2
 THEN RAISE EXCEPTION 'basket_visual_header_counted_as_third_item: %',v; END IF;
 UPDATE public.order_separation_items_v1 SET state='missing'
 WHERE order_id=basket
   AND product_id='00000000-0000-4000-8000-0000000000e2'::uuid;
 UPDATE public.order_separation_items_v1 SET state='separated'
 WHERE order_id=basket
   AND product_id='00000000-0000-4000-8000-0000000000e1'::uuid;
 IF (SELECT count(*) FROM public.order_separation_items_v1
   WHERE order_id=basket AND state='pending')<>0
 THEN RAISE EXCEPTION 'basket_picking_state_not_exhausted'; END IF;

 preview:=public.ops2_preview_order_reconciliation_v1(basket);
 IF preview->>'ready' IS DISTINCT FROM 'true'
    OR (preview->'financial'->>'original_total')::numeric<>160
    OR (preview->'financial'->>'missing_subtotal')::numeric<>20
    OR (preview->'financial'->>'final_total')::numeric<>140
    OR (preview->'financial'->>'final_fiscal_subtotal')::numeric<>50
    OR (preview->'financial'->>'other_expenses')::numeric<>90
    OR (preview->'counts'->>'separated')::integer<>1
    OR (preview->'counts'->>'missing')::integer<>1
 THEN RAISE EXCEPTION 'real_basket_r6_manifest_wrong: %',preview; END IF;
 v:=public.ops2_record_order_reconciliation_v1(basket);
 IF v->>'error' IS DISTINCT FROM 'separation_not_prepared'
 THEN RAISE EXCEPTION 'immutable_receipt_was_written_too_soon: %',v; END IF;

 SELECT updated_at INTO dt FROM public.orders WHERE id=basket;
 v:=public.ops2_prepare_order_separation_completion_v2(basket,dt);
 IF v->>'ok' IS DISTINCT FROM 'true' OR v->>'status' IS DISTINCT FROM 'prepared'
    OR (v->>'final_total')::numeric<>140
 THEN RAISE EXCEPTION 'real_basket_prepare_failed: %',v; END IF;
 journal:=public.ops2_record_order_reconciliation_v1(basket);
 IF journal->>'recorded' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'basket_frozen_r6_snapshot_missing: %',journal; END IF;
 v:=public.ops2_record_order_reconciliation_v1(basket);
 IF v->>'idempotent' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'basket_replay_changed_manifest: %',v; END IF;
 v:=public.ops2_apply_order_separation_stock_v2(basket);
 IF v->>'status' IS DISTINCT FROM 'stock_applied'
 THEN RAISE EXCEPTION 'basket_stock_apply_failed: %',v; END IF;
 v:=public.ops2_apply_order_separation_stock_v2(basket);
 IF v->>'status' IS DISTINCT FROM 'already_applied'
 THEN RAISE EXCEPTION 'basket_stock_double_apply: %',v; END IF;
 v:=public.ops2_mark_order_separation_completion_v2(basket,'completed',
      '{"r2_r6_synthetic_test":true}'::jsonb);
 IF v->>'phase' IS DISTINCT FROM 'completed'
 THEN RAISE EXCEPTION 'basket_physical_completion_failed: %',v; END IF;

 IF (SELECT order_number FROM public.orders WHERE id=basket) IS DISTINCT FROM id_before
    OR (SELECT total FROM public.orders WHERE id=basket)<>140
    OR (SELECT fiscal_subtotal FROM public.orders WHERE id=basket)<>50
    OR (SELECT other_expenses FROM public.orders WHERE id=basket)<>90
    OR (SELECT phase FROM public.order_separation_completions_v1
        WHERE order_id=basket)<>'completed'
    OR (SELECT metadata->>'stock_applied'
        FROM public.order_separation_completions_v1 WHERE order_id=basket)<>'true'
    OR (SELECT count(*) FROM public.order_items WHERE order_id=basket)<>3
 THEN RAISE EXCEPTION 'basket_after_completion_drifted'; END IF;
 IF (SELECT count(*) FROM public.vitrine_stock_reservations
       WHERE order_id=basket AND status='consumed')<>0
 THEN RAISE EXCEPTION 'untouched_preassembled_kit_resold_as_loose'; END IF;

 -- The third original checkout remains UNCONFIRMED even after another order
 -- completes and receives an immutable reconciliation receipt.
 IF NOT public.ops2_meta_order_confirmation_required_v1(mold)
    OR EXISTS(SELECT 1 FROM public.order_separation_completions_v1
             WHERE order_id=mold)
 THEN RAISE EXCEPTION 'meta_confirmation_leaked_between_orders'; END IF;

 -- Channel 0975 approves the mold; note that R03 code must survive a
 -- shortage. Mold total R$105, 2 picked, includes R$15 hidden adjustments.
 v:=public.ops2_apply_order_meta_confirmation_v1(
    (SELECT inbound_id FROM public.r2_r5_meta_test_orders WHERE kind='mold'));
 IF v->>'applied' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'mold_original_button_not_approved: %',v; END IF;
 id_before:=(SELECT order_number FROM public.orders WHERE id=mold);
 v:=public.ops2_init_order_separation_v2(mold);
 IF v->>'ok' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'mold_real_init_failed: %',v; END IF;
 UPDATE public.order_separation_items_v1 SET state='missing'
 WHERE order_id=mold AND product_id='00000000-0000-4000-8000-0000000000e4'::uuid;
 UPDATE public.order_separation_items_v1 SET state='separated'
 WHERE order_id=mold AND product_id='00000000-0000-4000-8000-0000000000e3'::uuid;
 preview:=public.ops2_preview_order_reconciliation_v1(mold);
 IF preview->>'ready' IS DISTINCT FROM 'true'
   OR (preview->'financial'->>'original_total')::numeric<>105
   OR (preview->'financial'->>'missing_subtotal')::numeric<>30
   OR (preview->'financial'->>'final_total')::numeric<>75
   OR (preview->'financial'->>'other_expenses')::numeric<>15
 THEN RAISE EXCEPTION 'real_mold_r6_snapshot_wrong: %',preview; END IF;
 SELECT updated_at INTO dt FROM public.orders WHERE id=mold;
 v:=public.ops2_prepare_order_separation_completion_v2(mold,dt);
 IF v->>'status' IS DISTINCT FROM 'prepared'
 THEN RAISE EXCEPTION 'mold_prepare_failed: %',v; END IF;
 journal:=public.ops2_record_order_reconciliation_v1(mold);
 IF journal->>'recorded' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'mold_manifest_not_frozen: %',journal; END IF;
 v:=public.ops2_apply_order_separation_stock_v2(mold);
 IF v->>'status' IS DISTINCT FROM 'stock_applied'
 THEN RAISE EXCEPTION 'mold_reservation_apply_failed: %',v; END IF;
 v:=public.ops2_mark_order_separation_completion_v2(mold,'completed','{}'::jsonb);
 IF v->>'phase' IS DISTINCT FROM 'completed'
 THEN RAISE EXCEPTION 'mold_completed_phase_failed: %',v; END IF;
 IF (SELECT status FROM public.vitrine_stock_reservations
       WHERE order_id=mold AND product_id='00000000-0000-4000-8000-0000000000e4'::uuid)
        IS DISTINCT FROM 'released'
    OR (SELECT status FROM public.vitrine_stock_reservations
       WHERE order_id=mold AND product_id='00000000-0000-4000-8000-0000000000e3'::uuid)
        IS DISTINCT FROM 'consumed'
    OR (SELECT total FROM public.orders WHERE id=mold)<>75
    OR (SELECT order_number FROM public.orders WHERE id=mold) IS DISTINCT FROM id_before
 THEN RAISE EXCEPTION 'mold_shortage_stock_or_identity_wrong'; END IF;
 IF (SELECT count(*) FROM public.order_separation_completions_v1
     WHERE metadata ? 'r6_reconciliation')<>2
 THEN RAISE EXCEPTION 'R06_reconciled_two_orders_only'; END IF;
END $r02_r06$;
SELECT 'PASS R02-R06: true checkout Meta-confirmed basket/mold -> R06 immutability/shortage/stock/unchanged public code' result;
