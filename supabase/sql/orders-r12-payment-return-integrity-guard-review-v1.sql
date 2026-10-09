-- R12 DRAFT / NOT A MIGRATION. Read-only audited canonical payment flows.
-- Scope: new R07/R10/R11 orders; legacy deliveries retain old gate policy.
-- No real payment transaction, payment provider, NF-e or stock adjustments.
-- Compile/test only in disposable PostgreSQL 17 first.
CREATE OR REPLACE FUNCTION public.ops2_r12_guard_delivery_settlement_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r12_settlement$
DECLARE
  o public.orders%rowtype;
  expected bigint;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'r12_payment_order_not_found'; END IF;
  expected:=round(coalesce(o.total,0)*100)::bigint;
  IF NEW.source='delivery' AND NEW.status IN ('captured','synced','needs_review') THEN
    IF o.status NOT IN ('out_for_delivery','delivered') THEN
      RAISE EXCEPTION 'r12_payment_order_not_in_delivery';
    END IF;
    IF expected<=0 OR NEW.expected_total_cents IS DISTINCT FROM expected
       OR NEW.captured_total_cents IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'r12_delivery_payment_amount_mismatch';
    END IF;
    IF EXISTS(SELECT 1 FROM public.order_delivery_return_cases r
        WHERE r.order_id=NEW.order_id AND r.status IN ('returning','returned_review')) THEN
      RAISE EXCEPTION 'r12_delivery_payment_return_open';
    END IF;
    IF EXISTS(SELECT 1 FROM public.order_bling_r7_sync_intents_v1 i
        WHERE i.order_id=NEW.order_id)
      AND public.ops2_r11_has_dispatch_proof_v1(NEW.order_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'r12_delivery_payment_sefaz_proof_required';
    END IF;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.source='delivery' AND OLD.status IN ('captured','synced','needs_review')
      AND (NEW.order_id IS DISTINCT FROM OLD.order_id
        OR NEW.source IS DISTINCT FROM OLD.source
        OR NEW.expected_total_cents IS DISTINCT FROM OLD.expected_total_cents
        OR NEW.captured_total_cents IS DISTINCT FROM OLD.captured_total_cents
        OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key)
    THEN RAISE EXCEPTION 'r12_captured_payment_immutable'; END IF;
  END IF;
  RETURN NEW;
END $r12_settlement$;

DROP TRIGGER IF EXISTS trg_ops2_r12_guard_delivery_settlement
  ON public.order_payment_settlements;
CREATE TRIGGER trg_ops2_r12_guard_delivery_settlement
  BEFORE INSERT OR UPDATE ON public.order_payment_settlements
  FOR EACH ROW EXECUTE FUNCTION public.ops2_r12_guard_delivery_settlement_v1();

CREATE OR REPLACE FUNCTION public.ops2_r12_guard_captured_payment_parts_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r12_parts$
DECLARE s public.order_payment_settlements%rowtype;
BEGIN
  SELECT * INTO s FROM public.order_payment_settlements
  WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.settlement_id ELSE NEW.settlement_id END;
  IF s.source='delivery' AND s.status IN ('captured','synced','needs_review')
     AND TG_OP IN ('UPDATE','DELETE')
  THEN RAISE EXCEPTION 'r12_captured_payment_parts_immutable'; END IF;
  -- Existing payment RPC inserts the parts after its settlement, so INSERT
  -- must remain permitted; a deferred check enforces the sum on COMMIT.
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $r12_parts$;

DROP TRIGGER IF EXISTS trg_ops2_r12_guard_captured_payment_parts
  ON public.order_payment_parts;
CREATE TRIGGER trg_ops2_r12_guard_captured_payment_parts
  BEFORE INSERT OR UPDATE OR DELETE ON public.order_payment_parts
  FOR EACH ROW EXECUTE FUNCTION public.ops2_r12_guard_captured_payment_parts_v1();

-- Validate entire payment parts once all inserts are complete; works for
-- split PIX + cash / food cards and rejects direct partial DB writes.
CREATE OR REPLACE FUNCTION public.ops2_r12_check_payment_parts_commit_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r12_balance$
DECLARE
  sid uuid;
  s public.order_payment_settlements%rowtype;
  cnt integer;
  total bigint;
  valid_count integer;
BEGIN
  sid:=CASE WHEN TG_TABLE_NAME='order_payment_settlements' THEN NEW.id
       WHEN TG_OP='DELETE' THEN OLD.settlement_id ELSE NEW.settlement_id END;
  SELECT * INTO s FROM public.order_payment_settlements WHERE id=sid;
  IF NOT FOUND OR s.source<>'delivery'
     OR s.status NOT IN ('captured','synced','needs_review') THEN RETURN NULL; END IF;
  SELECT count(*),coalesce(sum(p.amount_cents),0),
    count(*) FILTER(WHERE p.amount_cents>0
      AND p.method IN ('pix','cash','credit_card','food_card','meal_card','other')
      AND p.sequence BETWEEN 1 AND 8)
  INTO cnt,total,valid_count
  FROM public.order_payment_parts p WHERE p.settlement_id=s.id;
  IF cnt<1 OR cnt>8 OR cnt<>valid_count OR total<>s.captured_total_cents
    OR (SELECT count(DISTINCT sequence) FROM public.order_payment_parts WHERE settlement_id=s.id)<>cnt
  THEN RAISE EXCEPTION 'r12_delivery_payment_parts_mismatch'; END IF;
  RETURN NULL;
END $r12_balance$;

DROP TRIGGER IF EXISTS trg_ops2_r12_payment_parts_commit
  ON public.order_payment_parts;
CREATE CONSTRAINT TRIGGER trg_ops2_r12_payment_parts_commit
  AFTER INSERT OR UPDATE OR DELETE ON public.order_payment_parts
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.ops2_r12_check_payment_parts_commit_v1();

DROP TRIGGER IF EXISTS trg_ops2_r12_payment_settlement_commit
  ON public.order_payment_settlements;
CREATE CONSTRAINT TRIGGER trg_ops2_r12_payment_settlement_commit
  AFTER INSERT OR UPDATE ON public.order_payment_settlements
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.ops2_r12_check_payment_parts_commit_v1();

-- A return may not be opened after the money was captured. This is already
-- checked by ops_register_failed_delivery_v1 but was bypassable by table DML.
CREATE OR REPLACE FUNCTION public.ops2_r12_guard_return_after_payment_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r12_return$
BEGIN
  IF NEW.status IN ('returning','returned_review') AND
     (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.order_id IS DISTINCT FROM OLD.order_id) AND
     EXISTS(SELECT 1 FROM public.order_payment_settlements s
       WHERE s.order_id=NEW.order_id AND s.source='delivery'
         AND s.status IN ('captured','synced','needs_review'))
  THEN RAISE EXCEPTION 'r12_return_after_payment_requires_review'; END IF;
  RETURN NEW;
END $r12_return$;

DROP TRIGGER IF EXISTS trg_ops2_r12_guard_return_after_payment
  ON public.order_delivery_return_cases;
CREATE TRIGGER trg_ops2_r12_guard_return_after_payment
  BEFORE INSERT OR UPDATE OF status,order_id ON public.order_delivery_return_cases
  FOR EACH ROW EXECUTE FUNCTION public.ops2_r12_guard_return_after_payment_v1();

REVOKE ALL ON FUNCTION public.ops2_r12_guard_delivery_settlement_v1()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ops2_r12_guard_captured_payment_parts_v1()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ops2_r12_check_payment_parts_commit_v1()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ops2_r12_guard_return_after_payment_v1()
  FROM PUBLIC,anon,authenticated;
