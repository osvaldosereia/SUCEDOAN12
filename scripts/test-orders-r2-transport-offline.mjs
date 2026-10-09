import test from "node:test";
import assert from "node:assert/strict";
import { decideAutoFiscalAction, AUTO_FISCAL_ACTION as A } from "../supabase/functions/_shared/order-auto-fiscal-policy-v1.mjs";

const ACCESS_KEY = "1".repeat(44);
const BASE = () => ({
  order: { id: "synthetic-hml-order-1", status: "storefront_received", total: 230 },
  confirmation: { confirmed: false, order_id: "synthetic-hml-order-1" },
  separation: { completed_at: null, stock_applied: false, pending_count: 2, deliverable_count: 0, final_total: 230 },
  bling: { linked: false, matches_final_items: false, matches_final_total: false, verified: false },
  fiscal: { preflight_ready: true, generation_attempts: 0 },
});
function verifiedMeta(s, channel = "0975") {
  s.confirmation = {
    confirmed: true, order_id: s.order.id, proof: "meta_interactive_verified",
    verified_signature: true, channel, button_id: "CONFIRMADO",
    event_id: "synthetic-wamid-0000001", confirmed_at: "2026-10-08T18:00:00Z",
  };
  s.order.status = "confirmed";
}
function completePartialSeparation(s) {
  s.order.status = "ready";
  s.order.total = 198;
  s.separation = {
    completed_at: "2026-10-08T18:15:00Z",
    stock_applied: true, pending_count: 0, deliverable_count: 1,
    final_total: 198,
  };
}
function fakeVerifiedBling(s) {
  s.bling = { linked: true, matches_final_items: true, matches_final_total: true, verified: true };
}
function action(s) { return decideAutoFiscalAction(s).action; }

test("R02: before a verified Meta reply neither separation nor NF-e is eligible", () => {
  const s = BASE();
  assert.equal(action(s), A.WAIT_CONFIRMATION);
  verifiedMeta(s);
  assert.equal(action(s), A.WAIT_SEPARATION);
});

test("R02: missing items produce reconciled lower total without a second checkout", () => {
  const s = BASE();
  verifiedMeta(s, "1018");
  completePartialSeparation(s);
  assert.equal(action(s), A.SYNC_BLING);
  fakeVerifiedBling(s);
  assert.equal(s.order.total, 198);
  assert.equal(action(s), A.ISSUE_NFE);
});

test("R02: fake transport timeout triggers provider reconciliation, never duplicate POST", () => {
  const s = BASE();
  verifiedMeta(s);
  completePartialSeparation(s);
  fakeVerifiedBling(s);
  let irreversiblePosts = 0;
  const fakeTransport = {
    firstIssue() { irreversiblePosts += 1; return { result: "timeout_unknown" }; },
    lookupPrevious() { return { invoice_id: "synthetic-invoice", access_key: ACCESS_KEY, sefaz_status: "100" }; },
  };
  assert.equal(action(s), A.ISSUE_NFE);
  const attempt = fakeTransport.firstIssue();
  assert.equal(attempt.result, "timeout_unknown");
  s.fiscal = { preflight_ready: true, generation_attempts: 1, generation_uncertain: true };
  assert.equal(action(s), A.RECONCILE_NFE);
  const previous = fakeTransport.lookupPrevious();
  s.fiscal = {
    ...s.fiscal, generation_uncertain: false,
    authorized: true, ...previous,
  };
  assert.equal(action(s), A.READY_FOR_DISPATCH);
  assert.equal(irreversiblePosts, 1);
  assert.equal(s.order.status, "ready", "authorization must not invent physical dispatch");
});

test("R02: reject missing authorization key and block dispatch", () => {
  const s = BASE();
  verifiedMeta(s);
  completePartialSeparation(s);
  fakeVerifiedBling(s);
  s.fiscal = { authorized: true, invoice_id: "synthetic-invoice", sefaz_status: "100" };
  assert.equal(action(s), A.RECONCILE_NFE);
  s.fiscal = { ...s.fiscal, rejected: true };
  assert.equal(action(s), A.REQUIRES_REVIEW);
});

test("R02: failed signing and spoofed message stay blocked (no side effects)", () => {
  for (const fields of [
    { verified_signature: false },
    { order_id: "other-order" },
    { button_id: "CONFIRMADO-FAKE" },
    { event_id: "x" },
  ]) {
    const s = BASE();
    verifiedMeta(s);
    completePartialSeparation(s);
    fakeVerifiedBling(s);
    s.confirmation = { ...s.confirmation, ...fields };
    assert.equal(action(s), A.WAIT_CONFIRMATION);
  }
});
