# Flow V2 Data Exchange Contract Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Make the V2 draft Flow accept every navigation field emitted by the basket editor.

**Architecture:** Keep the published V1 and endpoint engine unchanged. Update only the V2 Flow JSON schema, point the focused contract test at that draft JSON, and ensure CI runs when it changes.

**Tech Stack:** WhatsApp Flow JSON 7.3 / Data API 3.0, Node.js, GitHub Actions, Vitrine Admin Flow Manager.

**Spec:** `vitrine/admin/whatsapp-lab/meta-flow/DYNAMIC-IMPLEMENTATION.md`

## Global Constraints

- Keep Flow ID `1817973829344642` in `DRAFT` until the owner completes phone review.
- Do not change the published V1, public storefront, basket data, stock, or order-writing behavior.
- Flow product names, prices, images, and group order continue to come from Vitrine Admin and the live catalog.

## Review Focus

1. The `navegar_tipo` action carries a string `indice`; the V2 list-item payload schema must declare it.
2. Pagination carries `pagina`; keep its existing string declaration.
3. Product rows may omit images; retain `start` as optional.
4. The Flow endpoint returns existing screen data fields; do not add unsupported UI components.
5. The test must read the V2 draft JSON, leaving the published V1 definition untouched.

## Files and Tasks

### Task 1: Pin the Flow action contract

**Files:**
- Modify: `scripts/test-whatsapp-1018-flow-dynamic.mjs`
- Modify: `.github/workflows/whatsapp-1018-flow-dynamic-ci.yml`

- [x] Make the existing Flow contract check read `flow-dynamic-v2.json`.
- [x] Assert that the nested list-item action payload declares `indice` as a string.
- [x] Add the V2 JSON and contract test to the workflow path filter.
- [x] Run the workflow once and confirm the new assertion fails against the current draft JSON.

### Task 2: Correct the V2 JSON and validate in Meta

**Files:**
- Modify: `vitrine/admin/whatsapp-lab/meta-flow/flow-dynamic-v2.json`

- [x] Add `indice: { type: "string" }` to the item action payload schema.
- [x] Run the dynamic Flow contract workflow and confirm it passes.
- [x] Upload the file to the existing V2 DRAFT in Vitrine Admin and inspect the Meta validation result.
- [x] Test the draft with the restricted internal recipient; keep it DRAFT for owner review.
