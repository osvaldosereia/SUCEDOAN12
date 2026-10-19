# Pedidos Vitrine Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the Pedidos board into Novo, Separar agora, Pronto para entrega and Entregue, following the order lifecycle without changing Bling or fiscal contracts.

**Architecture:** Keep the existing list and card providers. Add a presentation bucket model in the Admin runtime, render only the four agreed tabs, and make non-empty search span all statuses. Confirmation and separation continue through their existing actions; the board derives each visible bucket from the canonical order status and separation milestones. The manual queue RPC remains untouched and no longer controls whether a confirmed order is visible in the separation stage.

**Tech Stack:** Browser JavaScript providers, generated Admin runtime, Node.js `node:test` scripts, existing Supabase Edge Function and SQL contracts (read-only for this task).

**Spec:** `docs/superpowers/specs/2026-10-19-pedidos-vitrine-admin-design.md`

## Global Constraints

- Navigation has at most four tabs: **Novo**, **Separar agora**, **Pronto para entrega** and **Entregue**.
- A received order starts in **Novo**; confirmation moves it to **Separar agora** without manual queue inclusion.
- Completed separation moves an order to **Pronto para entrega**; dispatch remains gated by the existing fiscal authorization.
- Delivery confirmation moves an order to **Entregue**.
- Cancelled orders remain searchable across stages and retain a clear cancelled label.
- Preserve Bling endpoints, payloads, synchronization, NF-e flow, separator assignment, item checks, totals and delivery behavior.
- Do not change schema, migrations, RPCs, Edge Functions, chat, WhatsApp, production data, deployment or merge state.

## Review Focus

- Legacy incoming statuses (`created`, `storefront_received`, `received`) must all appear under **Novo**.
- Confirmed orders without a separator and orders with an assigned separator must both remain under **Separar agora**.
- A separated order with pending/rejected NF-e must remain visible under **Pronto para entrega**, with dispatch still blocked by the current fiscal gate.
- An order already `out_for_delivery` remains under **Pronto para entrega** until delivery is confirmed.
- Cancelled orders must be findable from any selected tab through global search and retain the cancelled status badge.

---

### Task 1: Four-stage order list and global search

**Files:**
- Modify: `vitrine/admin/orders/list-view.js`
- Test: `scripts/test-admin-order-list-view.mjs`
- Regenerate: `vitrine/admin/admin-runtime.js` via `scripts/build-admin-runtime.mjs`

**Interfaces:**
- Consumes the existing `statusMatch(order, bucket)` and `searchMatch(order, query)` callbacks.
- Produces exactly four tabs with keys `new`, `separate`, `ready`, and `delivered`; non-empty search returns matches across all buckets while keeping the true status visible on each card.
- Default selected bucket is `new`.

- [ ] **Step 1: Add failing list-view tests**

Assert that only the four agreed tab keys and labels render, the initial selection is `new`, and typing a query can return matching orders regardless of the selected bucket. Assert that an empty query still filters by the selected bucket.

- [ ] **Step 2: Run the list-view test and verify it fails**

Run: `node --test scripts/test-admin-order-list-view.mjs`
Expected: FAIL because current tabs/default/search behavior does not meet the four-stage contract.

- [ ] **Step 3: Implement the four-tab presentation in `orders/list-view.js`**

Update `ORDER_STATUS_TABS`, the default bucket, counts, empty-state copy and row filtering. Keep both responsive navigation placements, with CSS continuing to show the appropriate placement per viewport.

- [ ] **Step 4: Regenerate and verify the list-view contract**

Run: `node scripts/build-admin-runtime.mjs --write && node scripts/build-admin-runtime.mjs --check && node --test scripts/test-admin-order-list-view.mjs`
Expected: generated runtime matches source and the list-view test passes.

- [ ] **Step 5: Commit**

```bash
git add vitrine/admin/orders/list-view.js vitrine/admin/admin-runtime.js scripts/test-admin-order-list-view.mjs
git commit -m "feat(admin): simplify order board stages"
```

### Task 2: Derive stages from canonical order lifecycle

**Files:**
- Modify: `vitrine/admin/runtime-parts/16-orders-operations.part.js`
- Modify: `vitrine/admin/orders/card-model.js`
- Modify: `vitrine/admin/orders/card-view.js`
- Modify: `vitrine/admin/orders/list-controller.js`
- Test: `scripts/test-admin-order-card-model.mjs`
- Test: `scripts/test-admin-order-card-view.mjs`
- Test: `scripts/test-admin-order-list-controller.mjs`
- Regenerate: `vitrine/admin/admin-runtime.js`

**Interfaces:**
- Add pure `orderListBucketKey(order)` to `orders/card-model.js`: cancelled → `cancelled`; delivered → `delivered`; separated, `ready`, or `out_for_delivery` → `ready`; confirmed/processing → `separate`; all other incoming orders → `new`. Runtime `orderStatusTabKey(order)` delegates to it.
- `orderStatusTabMatch(order, 'new'|'separate'|'ready'|'delivered')` matches these buckets; cancelled is included only by a matching global search.
- Existing confirm, separate, fiscal dispatch, delivery and delivery-failure callbacks retain their current signatures and payloads.

- [ ] **Step 1: Add failing lifecycle bucket tests**

Extend `test-admin-order-card-model.mjs` to assert `orderListBucketKey(order)` for incoming aliases, unassigned and assigned confirmed orders, separated, out-for-delivery, delivered and cancelled. Extend `test-admin-order-list-view.mjs` to assert cancellation does not enter a primary bucket but remains searchable with its cancelled badge.
In `test-admin-order-list-controller.mjs`, assert the board paints the order list without first waiting for the manual queue RPC.

- [ ] **Step 2: Run the focused tests and verify the new assertions fail**

Run: `node --test scripts/test-admin-order-card-model.mjs scripts/test-admin-order-list-view.mjs scripts/test-admin-order-list-controller.mjs scripts/test-admin-order-card-view.mjs`
Expected: FAIL on the new bucket expectations while existing lifecycle and mutation protections continue to pass.

- [ ] **Step 3: Implement bucket mapping in runtime fragment 16**

Derive UI buckets from `orderV3Milestones` and canonical `order.status`. Keep fiscal state out of the bucket calculation; the existing card/fiscal controller remains responsible for showing NF-e status and enabling dispatch only when authorized.

- [ ] **Step 4: Remove manual queue membership from the board’s separation eligibility**

In `orders/card-view.js`, remove the add/remove queue action from ordinary cards. In `orders/list-controller.js`, stop waiting for and polling the manual queue as part of normal board loading. Confirmation itself makes the order visible in **Separar agora** through its canonical status. Keep the manual queue endpoint and its explicit methods available but do not use them to decide board visibility or delay the list.

- [ ] **Step 5: Regenerate and run focused lifecycle tests**

Run: `node scripts/build-admin-runtime.mjs --write && node scripts/build-admin-runtime.mjs --check && node --test scripts/test-admin-order-card-model.mjs scripts/test-admin-order-list-view.mjs scripts/test-admin-order-list-controller.mjs scripts/test-admin-order-card-view.mjs scripts/test-admin-order-action-buttons.mjs`
Expected: all focused tests pass; confirmation, separation, fiscal dispatch and delivery callbacks remain bound.

- [ ] **Step 6: Commit**

```bash
git add vitrine/admin/runtime-parts/16-orders-operations.part.js vitrine/admin/orders/card-model.js vitrine/admin/orders/card-view.js vitrine/admin/orders/list-controller.js vitrine/admin/admin-runtime.js scripts/test-admin-order-card-model.mjs scripts/test-admin-order-list-view.mjs scripts/test-admin-order-list-controller.mjs scripts/test-admin-order-card-view.mjs scripts/test-admin-order-action-buttons.mjs
git commit -m "feat(admin): derive order stages from lifecycle"
```

### Task 3: Preserve integration contracts and finish verification

**Files:**
- Modify: `scripts/test-order-separation-team-auto-fiscal-v4.mjs`
- Modify if required: `scripts/test-order-manual-queue-v1.mjs`
- Verify: `scripts/test-admin-orders-clean-flow-v3.mjs`
- Verify: `scripts/test-admin-orders-fiscal-flow-v4.mjs`
- Verify: `scripts/test-order-separation-verified-gate-v4.mjs`
- Verify: `scripts/test-order-separation-completion-feedback-v4.mjs`
- Verify generated runtime and module graph scripts.

**Interfaces:**
- No production interface or database contract changes.
- Static order separation contract reads the extracted provider `vitrine/admin/orders/card-view.js` in addition to the generated runtime, card model and operations fragment.

- [ ] **Step 1: Fix the stale extracted-provider test contract**

Add `vitrine/admin/orders/card-view.js` to the inputs read by `test-order-separation-team-auto-fiscal-v4.mjs`, so the existing phone-label assertion checks the provider that now owns the card markup.

- [ ] **Step 2: Run targeted UI, lifecycle and integration tests**

Run: `node --test scripts/test-admin-order-*.mjs scripts/test-admin-orders-*.mjs scripts/test-order-separation-*.mjs scripts/test-order-manual-queue-v1.mjs scripts/test-order-separation-team-auto-fiscal-v4.mjs`
Expected: all tests pass. Update only stale assertions that encode the removed manual queue as a required presentation step; preserve backend RPC and payload assertions.

- [ ] **Step 3: Run generated-runtime and module-load checks**

Run: `node scripts/build-admin-runtime.mjs --check && node scripts/audit-admin-module-load-graph.mjs && node scripts/test-admin-module-load-contract.mjs && node scripts/test-admin-runtime-bootstrap.mjs`
Expected: all checks pass with provider load order unchanged.

- [ ] **Step 4: Run syntax, diff and final status checks**

Run: `node --check vitrine/admin/admin-runtime.js && git diff --check && git status --short`
Expected: valid JavaScript, no whitespace errors, and only the planned order-list changes.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-order-separation-team-auto-fiscal-v4.mjs scripts/test-order-manual-queue-v1.mjs
git commit -m "test(admin): verify simplified order workflow contracts"
```

## Self-review

- Spec coverage: the four tabs, default **Novo**, automatic confirmation transition, separation transition, global cancellation search, fiscal dispatch gate, Bling preservation and chat/WhatsApp exclusion are covered by Tasks 1–3.
- Edge cases: incoming aliases; confirmed without/with assignment; fiscal pending; out-for-delivery; delivered; cancelled searched across buckets are included in Review Focus and Tasks 1–2 tests.
- Interface consistency: only list-view bucket keys are `new`, `separate`, `ready`, `delivered`; the `cancelled` internal bucket is searchable but deliberately has no navigation tab.
- Scope: no backend schema, RPC, Edge Function, production data, fiscal payload, chat or WhatsApp changes are planned.
