-- R02 synthetic smoke assertions. Absolutely no external services or production data.
\set ON_ERROR_STOP on
DO $$
BEGIN
  BEGIN
    PERFORM r2_hml.checkout_once('min-value-001','08|10|2026 - 999',74.99);
    RAISE EXCEPTION 'minimum_checkout_gate_failed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_checkout' THEN RAISE; END IF;
  END;
END $$;

SELECT r2_hml.checkout_once('request-hml-0001','08|10|2026 - 001',230);
DO $$
DECLARE a uuid; b uuid;
BEGIN
  a := r2_hml.checkout_once('request-hml-0001','08|10|2026 - 001',230);
  b := r2_hml.checkout_once('request-hml-0001','08|10|2026 - 001',230);
  IF a <> b OR (SELECT count(*) FROM r2_hml.orders WHERE idempotency_key='request-hml-0001') <> 1 THEN
    RAISE EXCEPTION 'replayed_checkout_duplicated_order';
  END IF;
  BEGIN
    PERFORM r2_hml.checkout_once('request-hml-0001','08|10|2026 - 001',231);
    RAISE EXCEPTION 'modified_payload_was_accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'idempotency_payload_conflict' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO r2_hml.order_items(order_id,sku,quantity,unit_price)
SELECT id,'SKU-ALIMENTO-FICTICIO',3,66 FROM r2_hml.orders WHERE idempotency_key='request-hml-0001';
INSERT INTO r2_hml.order_items(order_id,sku,quantity,unit_price)
SELECT id,'SKU-LIMPEZA-FICTICIO',1,32 FROM r2_hml.orders WHERE idempotency_key='request-hml-0001';

DO $$
DECLARE oid uuid;
BEGIN
  SELECT id INTO oid FROM r2_hml.orders WHERE idempotency_key='request-hml-0001';
  IF r2_hml.apply_verified_confirmation(oid,'synthetic-meta-event-1','0975','CONFIRMADO',false) THEN
    RAISE EXCEPTION 'unsigned_event_accepted';
  END IF;
  IF r2_hml.apply_verified_confirmation(oid,'synthetic-meta-event-2','0975','CANCELADO',true) THEN
    RAISE EXCEPTION 'wrong_button_accepted';
  END IF;
  IF r2_hml.apply_verified_confirmation(oid,'synthetic-meta-event-3','9999','CONFIRMADO',true) THEN
    RAISE EXCEPTION 'wrong_channel_accepted';
  END IF;
  BEGIN
    PERFORM r2_hml.finish_separation(oid);
    RAISE EXCEPTION 'unconfirmed_order_separated';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'customer_confirmation_required' THEN RAISE; END IF;
  END;
  IF NOT r2_hml.apply_verified_confirmation(oid,'synthetic-meta-event-4','0975','CONFIRMADO',true)
     OR NOT r2_hml.apply_verified_confirmation(oid,'synthetic-meta-event-4','0975','CONFIRMADO',true) THEN
    RAISE EXCEPTION 'valid_meta_event_not_idempotent';
  END IF;
  IF (SELECT count(*) FROM r2_hml.confirmation_events WHERE order_id=oid) <> 1 THEN
    RAISE EXCEPTION 'duplicate_meta_event_stored';
  END IF;
END $$;

UPDATE r2_hml.order_items SET separated_qty=CASE
  WHEN sku='SKU-ALIMENTO-FICTICIO' THEN 3 ELSE 0 END
WHERE order_id=(SELECT id FROM r2_hml.orders WHERE idempotency_key='request-hml-0001');
DO $$
DECLARE oid uuid; amount numeric; replay numeric;
BEGIN
  SELECT id INTO oid FROM r2_hml.orders WHERE idempotency_key='request-hml-0001';
  amount := r2_hml.finish_separation(oid);
  replay := r2_hml.finish_separation(oid);
  IF amount<>198 OR replay<>198
     OR (SELECT total FROM r2_hml.orders WHERE id=oid)<>198
     OR (SELECT count(*) FROM r2_hml.order_separation_completions_v1 WHERE order_id=oid)<>1
     OR (SELECT count(*) FROM r2_hml.dispatch_fiscal_jobs WHERE order_id=oid)<>1 THEN
    RAISE EXCEPTION 'separation_partial_or_durable_intent_failed';
  END IF;
END $$;

-- A second legitimate synthetic order exercises channel 1018, event replay
-- cross-order and worker mutual exclusion. No customer identifiers.
SELECT r2_hml.checkout_once('request-hml-0002','08|10|2026 - 002',80);
INSERT INTO r2_hml.order_items(order_id,sku,quantity,unit_price)
SELECT id,'SKU-SEGUNDO-PEDIDO',1,80 FROM r2_hml.orders WHERE idempotency_key='request-hml-0002';
DO $$
DECLARE first_id uuid; second_id uuid;
BEGIN
  SELECT id INTO first_id FROM r2_hml.orders WHERE idempotency_key='request-hml-0001';
  SELECT id INTO second_id FROM r2_hml.orders WHERE idempotency_key='request-hml-0002';
  IF r2_hml.apply_verified_confirmation(second_id,'synthetic-meta-event-4','0975','CONFIRMADO',true) THEN
    RAISE EXCEPTION 'event_reuse_across_orders';
  END IF;
  IF NOT r2_hml.apply_verified_confirmation(second_id,'synthetic-meta-event-5','1018','CONFIRMADO',true) THEN
    RAISE EXCEPTION 'channel_1018_confirmation_failed';
  END IF;
  UPDATE r2_hml.order_items SET separated_qty=1 WHERE order_id=second_id;
  IF r2_hml.finish_separation(second_id)<>80 THEN RAISE EXCEPTION 'second_separation_failed'; END IF;
END $$;

-- First job is claimed once, then made uncertain: never eligible for a second POST.
DO $$
DECLARE job_id bigint;
BEGIN
  job_id := r2_hml.claim_fiscal_job();
  IF job_id IS NULL THEN RAISE EXCEPTION 'claim_missing'; END IF;
  UPDATE r2_hml.dispatch_fiscal_jobs
  SET status='reconcile',generation_uncertain=true
  WHERE id=job_id;
  IF (SELECT count(*) FROM r2_hml.dispatch_fiscal_jobs WHERE generation_uncertain)<>1 THEN
    RAISE EXCEPTION 'uncertain_invoice_not_recorded';
  END IF;
END $$;

-- Rollback leaves no orphan order or job.
BEGIN;
SELECT r2_hml.checkout_once('request-hml-rollback','08|10|2026 - 003',85);
ROLLBACK;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM r2_hml.orders WHERE idempotency_key='request-hml-rollback')
     OR EXISTS(SELECT 1 FROM r2_hml.dispatch_fiscal_jobs
                 WHERE idempotency_key LIKE 'r2-fiscal:%'
                   AND order_id NOT IN (SELECT id FROM r2_hml.orders)) THEN
    RAISE EXCEPTION 'transaction_rollback_failed';
  END IF;
  IF (SELECT count(*) FROM r2_hml.dispatch_fiscal_jobs WHERE status='pending') <> 1 THEN
    RAISE EXCEPTION 'expected_one_job_for_worker_concurrency_test';
  END IF;
END $$;
SELECT 'PASS: synthetic checkout, Meta, separation, outbox and rollback assertions' AS result;
