import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_FISCAL_ACTION as A, decideAutoFiscalAction as decide } from "../supabase/functions/_shared/order-auto-fiscal-policy-v1.mjs";

const ready = () => ({
  order: { id: "synthetic-order", status: "ready", total: 85.5 },
  confirmation: { confirmed: true, confirmed_at: "2026-10-08T18:00:00Z", proof: "meta_interactive_verified" },
  separation: {
    completed_at: "2026-10-08T18:10:00Z",
    stock_applied: true, pending_count: 0, deliverable_count: 4, final_total: 85.5,
  },
  bling: { linked: true, matches_final_items: true, matches_final_total: true, verified: true },
  fiscal: { preflight_ready: true, generation_attempts: 0 },
});
const change = (overrides) => {
  const b = ready();
  for (const [key, fields] of Object.entries(overrides)) b[key] = { ...b[key], ...fields };
  return b;
};
const action = (v) => decide(v).action;

test("pedido confirmado, separado e conciliado entra na primeira emissão automática", () => {
  assert.equal(action(ready()), A.ISSUE_NFE);
});
test("replay conserva a decisão e não depende de código público mutável", () => {
  const b = ready();
  assert.deepEqual(decide(b), decide(b));
});
test("mensagem comum ou confirmação sem prova do webhook não autoriza", () => {
  assert.equal(action(change({ confirmation: { proof: "plain_text" } })), A.WAIT_CONFIRMATION);
});
test("confirmação manual exige autorização e trilha de auditoria", () => {
  assert.equal(action(change({ confirmation: { proof: "manual_override_audited" } })), A.WAIT_CONFIRMATION);
  assert.equal(action(change({ confirmation: { proof: "manual_override_audited", approval_id: "approval-1", authorized_by: "supervisor-1" } })), A.ISSUE_NFE);
});
test("produto pendente impede faturar, mesmo com cliente confirmado", () => {
  assert.equal(action(change({ separation: { pending_count: 1 } })), A.WAIT_SEPARATION);
});
test("falta de produtos com novo total equilibrado permite faturamento", () => {
  const b = change({ order: { total: 64.75 }, separation: { final_total: 64.75, deliverable_count: 3 } });
  assert.equal(action(b), A.ISSUE_NFE);
});
test("total no Bling desatualizado exige conciliação antes da nota", () => {
  assert.equal(action(change({ bling: { matches_final_total: false } })), A.RECONCILE_BLING);
});
test("pedido ainda não vinculado deve ser enviado uma vez ao Bling", () => {
  assert.equal(action(change({ bling: { linked: false } })), A.SYNC_BLING);
});
test("Bling não verificado impede geração de nota", () => {
  assert.equal(action(change({ bling: { verified: false } })), A.SYNC_BLING);
});
test("pedido sem itens entregáveis não emite documento com valor zero", () => {
  assert.equal(action(change({ separation: { deliverable_count: 0, final_total: 0 }, order: { total: 0 } })), A.REQUIRES_REVIEW);
});
test("timeout após tentar gerar uma NF-e nunca dispara novo POST", () => {
  assert.equal(action(change({ fiscal: { generation_uncertain: true, generation_attempts: 1 } })), A.RECONCILE_NFE);
});
test("NF-e criada no Bling deve ser consultada antes de nova tentativa", () => {
  assert.equal(action(change({ fiscal: { invoice_id: "123456" } })), A.RECONCILE_NFE);
});
test("pendência de autorização deve ser conciliada, não reiniciada", () => {
  assert.equal(action(change({ fiscal: { stage: "authorizing", generation_attempts: 1 } })), A.RECONCILE_NFE);
});
test("NF-e rejeitada exige tratamento fiscal, sem liberação de expedição", () => {
  assert.equal(action(change({ fiscal: { rejected: true } })), A.REQUIRES_REVIEW);
});
test("autorização SEFAZ libera para expedição sem marcar como saiu", () => {
  assert.equal(action(change({ fiscal: { invoice_id: "999", authorized: true } })), A.READY_FOR_DISPATCH);
});
test("pedido cancelado não deve gerar NF-e", () => {
  assert.equal(action(change({ order: { status: "cancelled" } })), A.FINISHED);
});
