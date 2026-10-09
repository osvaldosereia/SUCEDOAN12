# Order Separation V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved order-separation flow with a read-only customer storefront, a distinct Admin separation storefront, persistent per-item states, missing-item deductions, shared separator assignment, four visible order stages, and one canonical order number everywhere.

**Architecture:** Keep `orders` and `order_items` as canonical purchase history, add dedicated separation tables/RPCs for mutable operational state and immutable completion audit, and reuse the existing authenticated Admin gateway `admin-products-live-v1` for separation actions. The customer endpoint `order-public-view-v1` becomes read-only and exposes separation state; the Admin gets a dedicated separation page. Completion is an idempotent server workflow that recomposes financials, filters missing items from Bling/stock payloads, retains `ready` only as an internal guard state, and finishes in `out_for_delivery`.

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, Supabase Edge Functions (Deno/TypeScript), static HTML/JavaScript Admin and customer pages, Node.js contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-03-order-separation-v2-design.md`

## Global Constraints

- Visible Admin stages are exactly `TODOS`, `SEPARAR`, `ENTREGA`, `FINALIZADO`; `ready` may exist only internally.
- Customer storefront is read-only: no separation mutation, hidden taps, Admin controls, separator names or completion button.
- Admin separation page uses the existing Admin session/token model; no new login, PIN or password flow.
- Per-item states are exactly `pending | separated | missing` and are persisted server-side immediately.
- State changes are reversible until completion; after completion item state is immutable.
- Missing amount is `quantity × unit_price` from the canonical order line snapshot; basket/kit components follow the same rule.
- Missing items remain in purchase history but are excluded from deliverable/fiscal/physical-stock payloads after completion.
- Existing commercial discount, `other_expenses` and `basket_hidden_adjustment` are preserved; `subtotal`, `fiscal_subtotal` and `total` are recomposed by subtracting the missing subtotal.
- Physical stock is never changed by item classification. Definitive Bling stock movement happens exactly once during the protected dispatch to `out_for_delivery`.
- `orders.order_number` is the only order number shown to Admin, customer and WhatsApp; `public_code` remains routing metadata only.
- Existing orders already in `ready`, `out_for_delivery` or `delivered` are not moved backward.
- No automated customer notification is sent in this implementation.

## Review Focus

- Same product appears in more than one order line with mixed `separated`/`missing`: reservation reduction and Bling quantity must aggregate deliverable quantity correctly.
- Fixed-price basket with one missing component: keep basket hidden adjustment/commercial discount intact while fiscal preflight remains balanced.
- Two devices edit the same order: stale state/completion must return conflict and reload current server state rather than overwrite silently.
- Completion retries after an external Bling failure: financial deduction and physical stock movement must remain idempotent and never duplicate.
- Customer opens the public link while separation changes: page must expose only safe current states and always display `orders.order_number`, never the public short code as the order number.

---

## File map

**Create**
- `supabase/migrations/20261003193000_order_separation_v2.sql` — separation tables, constraints, RPCs, public-snapshot enrichment, fiscal-preflight adaptation, partial reservation handling.
- `vitrine/admin/separacao/index.html` — dedicated Admin separation storefront shell.
- `vitrine/admin/separacao/separation.js` — Admin separation API client and UI state handling.
- `scripts/test-order-separation-v2-schema.mjs` — migration/data-contract tests.
- `scripts/test-order-separation-v2-admin-api.mjs` — Admin action/auth/completion contract tests.
- `scripts/test-order-separation-v2-admin-ui.mjs` — main Admin queue + dedicated separation page contract tests.
- `scripts/test-order-separation-v2-customer.mjs` — read-only customer storefront and canonical-number tests.
- `scripts/test-order-separation-v2-completion.mjs` — financial, stock and Bling filtering source contracts.

**Modify**
- `supabase/functions/admin-products-live-v1/index.ts` — authenticated separation actions and idempotent completion orchestrator.
- `supabase/functions/order-public-view-v1/index.ts` — GET-only customer response, canonical order number and item states.
- `pedido/index.html` — customer read-only status presentation; remove triple-tap mutation.
- `vitrine/admin/index.html` — four visible filters, separator buttons, direct `SEPARAR` link, no order modal in the separate queue.
- `scripts/test-admin-orders-five-stages-v1.mjs` — replace the obsolete five-stage/Pronto assertions with four-stage behavior.
- `scripts/test-public-order-triple-tap-separation-v1.mjs` — retire/replace old public-mutation contract.
- `.github/workflows/verify-admin-order-whatsapp-ui-integration.yml` — run all separation V2 tests and syntax checks.

### Task 1: Canonical separation schema and per-item state

**Files:**
- Create: `supabase/migrations/20261003193000_order_separation_v2.sql`
- Create: `scripts/test-order-separation-v2-schema.mjs`

**Interfaces:**
- Produces tables `order_separation_assignments_v1`, `order_separation_items_v1`, `order_separation_completions_v1`.
- Produces RPCs:
  - `ops2_init_order_separation_v2(p_order_id uuid) -> jsonb`
  - `ops2_set_order_separator_v2(p_order_id uuid, p_separator_key text) -> jsonb`
  - `ops2_set_order_separation_item_v2(p_order_id uuid, p_order_item_id uuid, p_state text, p_expected_order_updated_at timestamptz, p_separator_key text) -> jsonb`
  - `ops2_get_order_separation_v2(p_order_id uuid) -> jsonb`
- All tables have RLS enabled; direct `anon`/`authenticated` access is revoked; RPC execution is service-role-only.

- [ ] **Step 1: Write the failing schema test** asserting the three tables, allowed separator keys `jose|claudenil|kelly|jovenil`, item states `pending|separated|missing`, unique `(order_id,order_item_id)`, completion unique `order_id`, RLS/revokes, and exact RPC names.
- [ ] **Step 2: Run** `node scripts/test-order-separation-v2-schema.mjs`; **expected:** FAIL because the migration does not exist.
- [ ] **Step 3: Implement the migration** so `ops2_init_order_separation_v2` idempotently copies each current `order_items` line into separation state with quantity/unit price/line total snapshots; only pending rows may refresh their price/quantity snapshot before completion.
- [ ] **Step 4: Implement state writes as SET operations, never toggles.** Reject invalid state, completed order, stale `orders.updated_at`, non-member order item, and mismatched order state with explicit JSON errors.
- [ ] **Step 5: Add the Review Focus concurrency test** to the source contract: state RPC must compare the expected order version and return a conflict marker.
- [ ] **Step 6: Run the schema test; expected:** PASS.
- [ ] **Step 7: Commit** `feat(db): add canonical order separation state`.

### Task 2: Partial reservation handling and financial recomposition

**Files:**
- Modify: `supabase/migrations/20261003193000_order_separation_v2.sql`
- Create: `scripts/test-order-separation-v2-completion.mjs`
- Modify canonical definition of `ops2_fiscal_dispatch_preflight_v1` in the new migration (do not edit old migration files).

**Interfaces:**
- Produces RPCs:
  - `ops2_prepare_order_separation_completion_v2(p_order_id uuid, p_expected_order_updated_at timestamptz) -> jsonb`
  - `ops2_apply_order_separation_stock_v2(p_order_id uuid) -> jsonb`
  - `ops2_mark_order_separation_completion_v2(p_order_id uuid, p_phase text, p_metadata jsonb) -> jsonb`
- Completion row stores `original_total`, `missing_subtotal`, `final_total`, original fiscal/subtotal fields, missing item snapshot, deliverable item ids, separator, phase and external-operation metadata.

- [ ] **Step 1: Write failing financial tests** asserting `final_total = original_total - missing_subtotal`, quantity > 1, multiple missing lines, and that `discount`, `other_expenses`, `basket_hidden_adjustment` remain unchanged while `subtotal` and `fiscal_subtotal` fall by the missing subtotal.
- [ ] **Step 2: Add the fixed-price basket test** asserting a missing basket component deducts only its own `line_total` and the recomposed preflight equation remains `total = fiscal_subtotal + other_expenses - discount`.
- [ ] **Step 3: Add the duplicate-product/mixed-state stock test** asserting deliverable quantity is aggregated per `product_id`; a unique `vitrine_stock_reservations(order_id,product_id)` row is reduced to deliverable quantity instead of being split into duplicate rows. If deliverable quantity is zero, mark it `released`; if positive under Bling authority, store only the deliverable quantity and mark it operationally consumed.
- [ ] **Step 4: Implement `ops2_prepare_order_separation_completion_v2`** with order lock + unique completion row, reject any pending item, compute immutable missing/deliverable snapshots, and return the existing completion unchanged on retry.
- [ ] **Step 5: Implement `ops2_apply_order_separation_stock_v2`** idempotently: shrink/release loose reservations to deliverable quantities; update basket allocation metadata/component snapshot to record missing components without reintroducing them into delivery; do not change `products.stock` when Bling is authority.
- [ ] **Step 6: Replace `ops2_fiscal_dispatch_preflight_v1` in this migration** so completed-separation orders compute `item_sum` from `separated` lines; orders without a completion keep the legacy behavior.
- [ ] **Step 7: Run** `node scripts/test-order-separation-v2-completion.mjs`; **expected:** PASS.
- [ ] **Step 8: Commit** `feat(db): make separation completion financial and stock safe`.

### Task 3: Authenticated Admin separation API and resumable completion

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Create: `scripts/test-order-separation-v2-admin-api.mjs`

**Interfaces:**
- Add Admin actions to `LOCAL` and write actions to `WRITE_ACTIONS`:
  - `order_separation_get`
  - `order_separation_assign`
  - `order_separation_item_set`
  - `order_separation_complete`
- `order_separation_get` returns canonical order number, order version, assignment, item states/counts, original/current total and completion state.
- `order_separation_complete` orchestrates SQL phases and external Bling operations; callers never directly set `ready` or `out_for_delivery`.

- [ ] **Step 1: Write the failing API test** asserting the four action names, Admin auth gate reuse, write-action classification, explicit conflict responses, and no public-token mutation path.
- [ ] **Step 2: Run** `node scripts/test-order-separation-v2-admin-api.mjs`; **expected:** FAIL.
- [ ] **Step 3: Implement GET/assign/item-set actions** by delegating to the Task 1 RPCs and preserving current Admin Bearer validation.
- [ ] **Step 4: Implement `order_separation_complete` phase orchestration:** prepare immutable completion → apply financial/operational stock changes → refresh public snapshot → sync adjusted deliverable order to Bling target `verified` → internal `ready` → fiscal preflight → physical stock launch → `out_for_delivery` → refresh public/delivery snapshots → mark completion `completed`.
- [ ] **Step 5: Change `buildSnapshot(oid, reason, options?)`** so reasons after completed separation use only `deliverable_order_item_ids`; pre-separation paths remain unchanged.
- [ ] **Step 6: Add retry guards** so a completion row at a later phase resumes from that phase; physical stock launch uses the existing idempotent Bling link/state and is never repeated after recorded success.
- [ ] **Step 7: Add the Review Focus external-failure test** asserting a failed Bling step leaves `needs_attention`/retryable completion metadata without repeating financial deduction on retry.
- [ ] **Step 8: Run API + completion tests; expected:** PASS.
- [ ] **Step 9: Commit** `feat(admin-api): orchestrate order separation completion`.

### Task 4: Customer endpoint becomes read-only and order number is unified

**Files:**
- Modify: `supabase/functions/order-public-view-v1/index.ts`
- Modify: `pedido/index.html`
- Create: `scripts/test-order-separation-v2-customer.mjs`
- Retire/replace: `scripts/test-public-order-triple-tap-separation-v1.mjs`

**Interfaces:**
- `order-public-view-v1` accepts `GET`/`OPTIONS` only for customer behavior; POST separation mutation is removed.
- Response exposes `order_number`, `current_status`, `items[].separation_state`, `original_total`, `missing_adjustment`, `total` and existing safe delivery/payment fields.
- `public_code` remains usable for routing but is not rendered as the order number.

- [ ] **Step 1: Write the failing customer test** asserting POST is rejected, triple-tap constants/handlers and `Concluir separação` are absent, `orders.order_number` is returned/rendered, and `public_code` is not used as the visible order number.
- [ ] **Step 2: Add state-presentation assertions** for `Aguardando separação`, `Separado`, `Em falta`, missing item remaining visible, and corrected final total after completion.
- [ ] **Step 3: Run** `node scripts/test-order-separation-v2-customer.mjs`; **expected:** FAIL.
- [ ] **Step 4: Remove the public mutation workflow from the Edge Function** and load current separation rows read-only using the snapshot order id.
- [ ] **Step 5: Stop deleting/replacing `snapshot.order_number`;** return the canonical `orders.order_number` explicitly.
- [ ] **Step 6: Simplify `pedido/index.html`** to render server states only; no Admin login, gesture, separator or completion controls.
- [ ] **Step 7: Run customer/public-summary/print tests; expected:** PASS.
- [ ] **Step 8: Commit** `feat(order-public): show read-only separation progress`.

### Task 5: Dedicated Admin separation storefront

**Files:**
- Create: `vitrine/admin/separacao/index.html`
- Create: `vitrine/admin/separacao/separation.js`
- Create: `scripts/test-order-separation-v2-admin-ui.mjs`

**Interfaces:**
- Uses `sessionStorage['da_finance_access_token_v1']` and the existing `admin-products-live-v1` Bearer pattern; no new credentials.
- URL contract: `/vitrine/admin/separacao/?order_id=<uuid>`.
- Calls actions from Task 3.

- [ ] **Step 1: Write the failing UI test** asserting the new page exists, reads the existing Admin token key, has buttons `SEPARADO` and `EM FALTA`, and has no hidden tap logic.
- [ ] **Step 2: Assert completion UX:** button `CONCLUIR SEPARAÇÃO` is hidden/disabled while any item is pending; confirmation summarizes separated count, missing count, missing amount and final total.
- [ ] **Step 3: Implement page load** using `order_separation_get`; render the canonical `order_number`, customer/delivery context and the same product grouping/photos used by the order storefront.
- [ ] **Step 4: Implement item SET actions** with `order_id`, `order_item_id`, desired state, current order version and active separator; on `409`/conflict reload server state.
- [ ] **Step 5: Implement completion action** and transition screen to success/attention state based on the resumable result; do not expose `ready` copy.
- [ ] **Step 6: Add the Review Focus two-device test contract** asserting each write returns a new version and stale versions are handled as conflicts.
- [ ] **Step 7: Parse inline JS / run** `node scripts/test-order-separation-v2-admin-ui.mjs`; **expected:** PASS.
- [ ] **Step 8: Commit** `feat(admin): add dedicated order separation storefront`.

### Task 6: Admin queue assignment controls and four visible stages

**Files:**
- Modify: `vitrine/admin/index.html`
- Modify: `scripts/test-admin-orders-five-stages-v1.mjs` (rename to `scripts/test-admin-orders-four-stages-v2.mjs` if practical; otherwise replace its assertions and message)
- Extend: `scripts/test-order-separation-v2-admin-ui.mjs`

**Interfaces:**
- Filters exactly: `[['all','Todos'],['separate','Separar'],['delivery','Entrega'],['finalized','Finalizado']]`.
- `separate` includes `confirmed|processing`; `delivery` includes internal `ready|out_for_delivery`; `finalized` includes `delivered`.
- In `SEPARAR` only, row click does not open the order modal.
- Each row exposes persisted assignment buttons `José`, `Claudenil`, `Kelly`, `Jovenil` and distinct `SEPARAR` action.

- [ ] **Step 1: Make the old five-stage test fail intentionally** by changing expected filters to four and forbidding visible `Pronto`/`Liberar para entrega` copy.
- [ ] **Step 2: Add assignment/button tests** asserting one active name from backend data, active-name click clears, another-name click replaces, and `SEPARAR` navigates directly to `/vitrine/admin/separacao/?order_id=...`.
- [ ] **Step 3: Patch `paintOrderFilters`, order filtering and row action rendering** so `ready` is shown under `ENTREGA`, never as a separate menu filter.
- [ ] **Step 4: In the `SEPARAR` renderer, stop binding the row to `openOrder()`;** preserve normal modal behavior in the other tabs.
- [ ] **Step 5: Load assignment state with the order list and persist through `order_separation_assign`;** refresh only the affected row/state after success.
- [ ] **Step 6: Run four-stage + Admin UI tests and inline-script syntax; expected:** PASS.
- [ ] **Step 7: Commit** `feat(admin): simplify separation queue and assignments`.

### Task 7: Public snapshot refresh and historical compatibility

**Files:**
- Modify behavior through `supabase/migrations/20261003193000_order_separation_v2.sql`
- Modify: `scripts/test-order-public-summary.mjs`
- Extend: `scripts/test-order-separation-v2-customer.mjs`

**Interfaces:**
- `ops2_refresh_order_public_snapshot_v1(order_id)` keeps immutable purchase identity/content but enriches current presentation with canonical order number and separation-derived financial/status fields, or the Edge Function joins current separation rows at read time without mutating purchase history.
- Existing public short links remain valid.

- [ ] **Step 1: Add compatibility tests** for a pre-V2 order with no separation rows (`pending` presentation, original total), an in-progress order, a completed order with missing items, and existing short-link token resolution.
- [ ] **Step 2: Ensure existing `ready/out_for_delivery/delivered` orders are never initialized back into editable separation.**
- [ ] **Step 3: Ensure checkout/public-link tests still pass and WhatsApp continues to use the same canonical order number/link.**
- [ ] **Step 4: Run public summary + customer tests; expected:** PASS.
- [ ] **Step 5: Commit** `test(order): preserve separation v2 backward compatibility`.

### Task 8: CI, canary validation, rollout and production verification

**Files:**
- Modify: `.github/workflows/verify-admin-order-whatsapp-ui-integration.yml`
- No other product files unless validation finds a defect.

**Interfaces:**
- CI runs all existing public-order/Admin WhatsApp tests plus all new V2 tests and inline JavaScript syntax checks.
- Supabase rollout sequence is migration → Edge canary/source verification → Admin UI deployment → production smoke without mutating real customer orders.

- [ ] **Step 1: Add all V2 test scripts and `vitrine/admin/separacao/index.html` to workflow paths and commands.**
- [ ] **Step 2: Run complete CI on the implementation PR; expected:** all green, including existing checkout, order-public, printing and WhatsApp contracts.
- [ ] **Step 3: Apply the migration to the canonical Supabase project and verify tables/RPCs/RLS by read-only SQL.**
- [ ] **Step 4: Deploy updated Edge Functions and run safe production smoke:** GET customer view; Admin `order_separation_get`; invalid/stale state write against a controlled/non-customer test order only; verify no unintended order/stock mutation.
- [ ] **Step 5: Run controlled completion on a dedicated test order covering one separated and one missing item.** Verify final total, missing audit, fiscal preflight, deliverable-only Bling payload, exactly-once stock movement and final `out_for_delivery`.
- [ ] **Step 6: Verify customer link for that controlled order shows the same `orders.order_number`, item states and adjusted total with no controls.**
- [ ] **Step 7: Inspect PR diff for unrelated changes; obtain final code review; merge only with verified head SHA.**
- [ ] **Step 8: Verify GitHub Pages and Edge deployments after merge, then retire obsolete triple-tap canary/test paths if still present.**
- [ ] **Step 9: Commit any verification-only workflow cleanup** as `ci: enforce order separation v2 contracts`.

## Self-review result

- **Spec coverage:** all approved sections map to Tasks 1–8: two storefronts, per-item persistence, missing reversal before completion, deduction, basket handling, stock/Bling, assignment, four visible stages, canonical order number, concurrency, idempotency, backward compatibility and notification readiness.
- **Type/name consistency:** all later tasks use the RPC/action names defined in Tasks 1–3.
- **Review Focus coverage:** mixed duplicate product lines → Task 2; fixed-price basket → Task 2; two-device conflict → Tasks 1/5; external retry/idempotency → Task 3; customer-safe live state/order number → Tasks 4/7.
- **Scope:** notification sending is intentionally excluded; only structured data/events needed for a future notification are preserved.
- **Rollout:** no production completion is tested on a real customer order; the destructive path requires a dedicated controlled test order.
