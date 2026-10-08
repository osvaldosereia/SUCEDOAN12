/**
 * Pure decision contract for the automatic fiscal flow after separation.
 * Does NOT call Meta, Bling, Supabase or SEFAZ. An authenticated, durable worker
 * must execute actions after transactional claims and re-check the live state.
 *
 * Deliberately fail-closed: uncertain external writes are NEVER retried as POST
 * until a provider reconciliation proves whether the document was created.
 */
export const AUTO_FISCAL_ACTION = Object.freeze({
  WAIT_CONFIRMATION: "wait_confirmation",
  WAIT_SEPARATION: "wait_separation",
  WAIT_DEPENDENCY: "wait_dependency",
  SYNC_BLING: "sync_bling",
  RECONCILE_BLING: "reconcile_bling",
  RECONCILE_NFE: "reconcile_nfe",
  ISSUE_NFE: "issue_nfe",
  READY_FOR_DISPATCH: "ready_for_dispatch",
  REQUIRES_REVIEW: "requires_review",
  FINISHED: "finished",
});

const reply = (action, reason) => Object.freeze({ action, reason });
const validApproval = (confirmation, order) =>
  confirmation?.confirmed === true
  && confirmation.order_id === order.id
  && typeof confirmation.confirmed_at === "string"
  && !Number.isNaN(Date.parse(confirmation.confirmed_at))
  && (
    (confirmation.proof === "meta_interactive_verified"
      && confirmation.verified_signature === true
      && confirmation.button_id === "CONFIRMADO"
      && ["0975", "1018"].includes(confirmation.channel)
      && typeof confirmation.event_id === "string"
      && confirmation.event_id.length >= 8)
    || (confirmation.proof === "manual_override_audited"
      && Boolean(confirmation.approval_id)
      && Boolean(confirmation.authorized_by))
  );

export function decideAutoFiscalAction({ order, confirmation, separation, bling, fiscal } = {}) {
  if (!order?.id) return reply(AUTO_FISCAL_ACTION.REQUIRES_REVIEW, "order_identity_missing");

  const status = String(order.status || "");
  if (status === "delivered" || status === "out_for_delivery") {
    return reply(AUTO_FISCAL_ACTION.FINISHED, "already_dispatched");
  }
  if (status === "cancelled" || status === "returned") {
    return reply(AUTO_FISCAL_ACTION.FINISHED, "order_not_deliverable");
  }

  if (!validApproval(confirmation, order)) {
    return reply(AUTO_FISCAL_ACTION.WAIT_CONFIRMATION, "customer_confirmation_not_verified");
  }

  if (status !== "ready"
    || !separation?.completed_at
    || separation.stock_applied !== true
    || Number(separation.pending_count ?? -1) !== 0) {
    return reply(AUTO_FISCAL_ACTION.WAIT_SEPARATION, "separation_not_finalized");
  }

  const finalTotal = Number(separation.final_total);
  if (!Number.isFinite(finalTotal) || finalTotal <= 0) {
    return reply(AUTO_FISCAL_ACTION.REQUIRES_REVIEW, "nothing_billable_after_missing_items");
  }
  if (!Number.isFinite(Number(order.total))
    || Math.abs(Number(order.total) - finalTotal) > 0.009) {
    return reply(AUTO_FISCAL_ACTION.REQUIRES_REVIEW, "final_order_total_mismatch");
  }
  if (Number(separation.deliverable_count ?? 0) <= 0) {
    return reply(AUTO_FISCAL_ACTION.REQUIRES_REVIEW, "no_deliverable_items");
  }

  if (bling?.linked !== true) {
    return reply(AUTO_FISCAL_ACTION.SYNC_BLING, "bling_order_not_linked");
  }
  if (bling?.matches_final_items !== true || bling?.matches_final_total !== true) {
    return reply(AUTO_FISCAL_ACTION.RECONCILE_BLING, "bling_final_order_not_reconciled");
  }
  if (bling?.verified !== true) {
    return reply(AUTO_FISCAL_ACTION.SYNC_BLING, "bling_verified_status_missing");
  }

  if (fiscal?.rejected === true || fiscal?.invalid_tax_data === true) {
    return reply(AUTO_FISCAL_ACTION.REQUIRES_REVIEW, "fiscal_rejection_needs_correction");
  }

  // Never infer SEFAZ authorization from a boolean or an invoice ID alone.
  // These fields must come from the provider reconciliation/ledger, not the client.
  if (fiscal?.authorized === true) {
    const key = String(fiscal.access_key || "").replace(/\D/g, "");
    const status = String(fiscal.sefaz_status || "").trim().toLowerCase();
    if (Boolean(fiscal.invoice_id) && key.length === 44
      && ["autorizada", "authorized", "100"].includes(status)) {
      return reply(AUTO_FISCAL_ACTION.READY_FOR_DISPATCH, "sefaz_authorized");
    }
    return reply(AUTO_FISCAL_ACTION.RECONCILE_NFE, "authorization_evidence_incomplete");
  }

  // An existing/uncertain document must be reconciled even when preflight is
  // currently blocked. Waiting here would strand a possibly-issued NF-e.
  if (fiscal?.invoice_id || fiscal?.send_uncertain === true
    || fiscal?.generation_uncertain === true
    || Number(fiscal?.generation_attempts ?? 0) > 0
    || ["generating", "generated", "authorizing", "processing", "unknown"]
      .includes(String(fiscal?.stage || ""))) {
    return reply(AUTO_FISCAL_ACTION.RECONCILE_NFE, "invoice_needs_provider_reconciliation");
  }

  if (fiscal?.preflight_ready !== true) {
    return reply(AUTO_FISCAL_ACTION.WAIT_DEPENDENCY, "fiscal_preflight_blocked");
  }

  return reply(AUTO_FISCAL_ACTION.ISSUE_NFE, "eligible_for_first_issue");
}
