# Marketing workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Marketing navigation and make post-sale, templates, and creation shortcuts work within the approved manual-send limits.

**Architecture:** Keep the existing modular Marketing pages and authenticated Vitrine APIs. Add a small Post-sale view module backed by the authenticated orders list and delivery communications action; do not change production data or send during tests.

**Tech Stack:** Browser ES modules, CSS, Supabase Edge Functions already deployed by Vitrine, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-19-marketing-workspace-design.md`

## Global Constraints

- Channels are 0975 and 1018.
- No message sends or automation enablement during implementation.
- Campaign batch limit is 10 recipients per manual cycle.
- Consent remains explicit; do not infer it.
- Show only communication states returned by a source of truth.

## Review Focus

- The Post-sale tab must not route into the Orders tab.
- The overview's New template action must open the existing template creation flow.
- Empty, loading, and failed list states must remain clear and retryable.
- Delivered-order filters must not allow non-delivered records into the list.
- Unknown follow-up status must never be presented as sent or unsent.

---

### Task 1: Regression coverage for Marketing navigation and entry actions

**Files:**
- Create: `tests/marketing-workspace.test.mjs`
- Modify: `vitrine/admin/marketing/marketing-polish.js`

**Interfaces:**
- The `post_sale` view opens `DAMarketingPostSale.mountPostSaleView(root)`.
- The overview's `data-overview-new-template` action opens Templates and then invokes `data-template-create`.

- [ ] Write failing regression checks for the old Orders redirect and inert New template button.
- [ ] Run `node --test tests/marketing-workspace.test.mjs` and confirm those checks fail for the expected missing wiring.
- [ ] Add the minimal navigation and event handlers.
- [ ] Run the test and the existing Node tests.

### Task 2: Authenticated Post-sale list

**Files:**
- Create: `vitrine/admin/marketing/post-sale-center.js`
- Create: `vitrine/admin/marketing/post-sale-center.css`
- Modify: `vitrine/admin/marketing/marketing-polish.js`
- Modify: `tests/marketing-workspace.test.mjs`

**Interfaces:**
- Export `mountPostSaleView(root)` from the post-sale module.
- Read delivered orders from `admin-products-live-v1?action=orders&tab=delivered` via `attendanceAuthorizedFetch`.
- Use the existing `admin-order-delivery-comms-v1` call only after an explicit confirmation; tell the operator it sends both delivery feedback and a consent request.
- Paginate, search, filter by date/channel, and provide retry/empty states. Label follow-up history unavailable unless the API returns evidence.

- [ ] Add failing checks for delivered-only listing, explicit send confirmation copy, and no synthetic send status.
- [ ] Run the focused test to confirm the missing view contract.
- [ ] Implement the module and mount route.
- [ ] Run the focused test and syntax checks.

### Task 3: Monthly replenishment view and admin API

**Files:**
- Create: `vitrine/admin/marketing/repurchase-center.js`
- Create: `vitrine/admin/marketing/repurchase-center.css`
- Modify: `supabase/functions/admin-marketing-audiences-v1/index.ts`
- Modify: `vitrine/admin/marketing/marketing-polish.js`
- Modify: `tests/marketing-workspace.test.mjs`

**Interfaces:**
- `GET action=repurchase_state` returns cadence records, safe status counts, and customer names for authenticated admins.
- `POST action=repurchase_recalc` recalculates no more than 50 customer records per request.
- Recalculation changes only cadence state; the API exposes no runtime toggle or send action.
- Opening the campaign composer does not imply that the cadence cohort was carried into the draft.

- [ ] Add failing checks for the dedicated route, state view and bounded recalc action.
- [ ] Run the focused test to confirm the missing contract.
- [ ] Add the authenticated read/recalc endpoints and page.
- [ ] Run focused tests and type/syntax checks.

### Task 4: Campaign execution controls

**Files:**
- Modify: `vitrine/admin/marketing/campaign-center.js`
- Modify: `supabase/functions/admin-marketing-campaigns-v1/index.ts` only if the existing server action can exceed the approved manual cap.
- Modify: `tests/marketing-workspace.test.mjs`

**Interfaces:**
- Remove campaign scheduling from the Marketing UI.
- Preserve review, internal test preparation, pause, resume, and cancel only where their server-side states allow them.
- Confirm no execution path can dispatch more than 10 recipients per manual cycle; do not enable the runtime gate.

- [ ] Inspect the dispatch path and add a failing test for the limit/absence of schedule UI.
- [ ] Implement the smallest server-side cap and UI change required.
- [ ] Run focused tests and the full available repository test suite.
