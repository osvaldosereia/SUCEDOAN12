-- R05/R06 integration security gap discovered with REAL canonical initializer.
-- R05 currently guards INSERT/UPDATE on picking only if state='separated'
-- or 'missing'. That lets an unconfirmed customer order open pending pick rows.
-- Tighten the gate to EVERY pick row mutation. Applies only when the original
-- R04 opt-in flag says an order needs Meta confirmation (default OFF).
-- REVIEW DRAFT; do not apply directly to production.
DROP TRIGGER IF EXISTS trg_ops2_order_meta_picking_guard_v1
  ON public.order_separation_items_v1;
CREATE TRIGGER trg_ops2_order_meta_picking_guard_v1
  BEFORE INSERT OR UPDATE ON public.order_separation_items_v1
  FOR EACH ROW
  EXECUTE FUNCTION public.ops2_guard_order_meta_separation_v1();

-- Test harness grants no extra service privileges and does not reissue a
-- verification event or alter the R04 confirmation ledger.
COMMENT ON TRIGGER trg_ops2_order_meta_picking_guard_v1
  ON public.order_separation_items_v1 IS
  'R05/R06: even pending picks require verified Meta confirmation when opt-in gate applies.';
