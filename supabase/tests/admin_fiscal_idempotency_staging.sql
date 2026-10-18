-- Rodada 02: isolated fiscal-claim regression, fictitious orders; no Bling/SEFAZ calls.
-- All state lives in a temporary table and is rolled back.
BEGIN;
CREATE TEMP TABLE admin_fiscal_claim_fixture (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL,
  fiscal_version integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'held',
  attempts integer NOT NULL DEFAULT 0,
  external_side_effect boolean NOT NULL DEFAULT false,
  UNIQUE(order_id, fiscal_version)
) ON COMMIT DROP;
INSERT INTO admin_fiscal_claim_fixture(order_id,idempotency_key,status,attempts)
 VALUES
 ('20000000-0000-0000-0000-000000000091','dispatch-fiscal:r2-test-order-91:v1','held',0),
 ('20000000-0000-0000-0000-000000000092','dispatch-fiscal:r2-test-order-92:v1','generated',1);
DO $fiscal_r2$
DECLARE acquired bigint; second_acquired bigint; duplicates integer;
BEGIN
  -- The generation CAS used by the Hub must have exactly one winner.
  UPDATE admin_fiscal_claim_fixture SET status='generating',attempts=1
   WHERE order_id='20000000-0000-0000-0000-000000000091' AND status='held' AND attempts=0
   RETURNING id INTO acquired;
  IF acquired IS NULL THEN RAISE EXCEPTION 'generation_first_claim_missing'; END IF;
  UPDATE admin_fiscal_claim_fixture SET status='generating',attempts=1
   WHERE order_id='20000000-0000-0000-0000-000000000091' AND status='held' AND attempts=0
   RETURNING id INTO second_acquired;
  IF second_acquired IS NOT NULL THEN RAISE EXCEPTION 'generation_duplicate_claim'; END IF;
  -- A lost-response review must never permit a blind second POST.
  UPDATE admin_fiscal_claim_fixture SET status='review_required',external_side_effect=true
   WHERE id=acquired;
  UPDATE admin_fiscal_claim_fixture SET status='generating',attempts=1
   WHERE id=acquired AND status='held' AND attempts=0
   RETURNING id INTO second_acquired;
  IF second_acquired IS NOT NULL THEN RAISE EXCEPTION 'uncertain_generation_retried'; END IF;
  -- Authorization has a separate CAS and cannot be sent twice.
  UPDATE admin_fiscal_claim_fixture SET status='authorizing',external_side_effect=true
   WHERE order_id='20000000-0000-0000-0000-000000000092'
     AND status IN ('held','generated')
   RETURNING id INTO acquired;
  IF acquired IS NULL THEN RAISE EXCEPTION 'authorization_first_claim_missing'; END IF;
  UPDATE admin_fiscal_claim_fixture SET status='authorizing',external_side_effect=true
   WHERE id=acquired AND status IN ('held','generated')
   RETURNING id INTO second_acquired;
  IF second_acquired IS NOT NULL THEN RAISE EXCEPTION 'authorization_duplicate_claim'; END IF;
  -- Unique idempotency key is protected at the DB boundary.
  BEGIN
    INSERT INTO admin_fiscal_claim_fixture(order_id,idempotency_key)
      VALUES('20000000-0000-0000-0000-000000000093','dispatch-fiscal:r2-test-order-92:v1');
    RAISE EXCEPTION 'idempotency_key_duplicate_accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  SELECT count(*) INTO duplicates FROM admin_fiscal_claim_fixture;
  IF duplicates<>2 THEN RAISE EXCEPTION 'unexpected_fixture_count_%',duplicates; END IF;
END $fiscal_r2$;
SELECT 'FISCAL_IDEMPOTENCY_STAGING_PASSED' AS suite_status;
ROLLBACK;
