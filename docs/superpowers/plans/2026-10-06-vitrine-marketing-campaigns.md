# Vitrine Marketing Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make campaign creation, scheduling, status, and reporting readable and safe inside the unified Marketing shell.

**Architecture:** Keep the existing authenticated campaign Edge Function, RPCs, snapshots, outbox, worker, and report endpoint. The browser edits campaign metadata and requests previews/transitions; all consent, opt-out, template, idempotency, runtime, and dispatch decisions remain server-side.

**Tech Stack:** Browser JavaScript ES modules, Vitrine Admin CSS, Supabase Edge Functions (Deno/TypeScript), existing Postgres RPCs, Node.js contract scripts.

**Spec:** `docs/superpowers/specs/2026-10-06-vitrine-marketing-unified-module-design.md`

## Global Constraints

- A campaign can select only a Meta `APPROVED` marketing template for its chosen channel.
- A saved audience is copied into campaign filters when the draft is created.
- Show matched and eligible counts separately, with no manual customer identifier entry.
- The browser never sends a campaign loop or calls Meta Graph directly.
- Consent/opt-out and channel/runtime gates are revalidated server-side before dispatch.
- Preserve campaign snapshots, idempotency, worker, reports, and existing kill-switches.
- Display scheduled times in `America/Cuiaba` and submit an unambiguous ISO timestamp.

## Review Focus

- Channel has no approved template: block executable creation and show a clear empty state; test campaign simple UI.
- Preview returns zero eligible customers: allow draft only and show zero recipients; test campaign audience contract.
- `campaigns_enabled=false`: show the disabled state and do not claim start/schedule succeeded; test execution UI and API.
- Scheduled time is invalid or in the past: reject before schedule API call; test scheduling contract.
- A create/start click is repeated: existing idempotency prevents duplicate dispatch; test campaign draft/execution contracts.

---

### Task 1: Replace campaign cards with searchable operator table

**Files:**
- Modify: `vitrine/admin/marketing/campaign-list-simple.js`
- Modify: `vitrine/admin/marketing/campaign-list-simple.css`
- Modify: `vitrine/admin/marketing/campaign-center.js`
- Test: `scripts/test-whatsapp-marketing-campaign-simple-list-v1.mjs`
- Modify: `scripts/test-whatsapp-marketing-campaign-ui-v1.mjs`

**Interfaces:**
- Consumes: `GET action=list` on `admin-marketing-campaigns-v1` and existing report opener.
- Produces: searchable/status/active filters and columns Name, Date, Audience, Template, Channel, Status, Report; action buttons depend on state.

- [ ] **Step 1: Add table contract assertions**

Assert search and status filters, only-active toggle, the seven specified columns, all user-facing status labels, and no snapshot/revision identifiers in primary actions.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-campaign-simple-list-v1.mjs`  
Expected: FAIL on cards or missing columns/toggle.

- [ ] **Step 3: Implement table rendering and local filters**

Map internal campaign state to the Portuguese labels; keep results from the existing list API and open the existing report view for report actions.

- [ ] **Step 4: Run GREEN and commit**

Run:
- `node scripts/test-whatsapp-marketing-campaign-simple-list-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-ui-v1.mjs`
- `node --check vitrine/admin/marketing/campaign-list-simple.js`

Expected: PASS.

Commit: `ui: simplify Marketing campaign list`

---

### Task 2: Campaign editor with approved templates and saved audiences

**Files:**
- Modify: `vitrine/admin/marketing/campaign-simple-ui.js`
- Modify: `vitrine/admin/marketing/campaign-simple-ui.css`
- Modify: `vitrine/admin/marketing/campaign-center.js`
- Test: `scripts/test-whatsapp-marketing-campaign-simple-audience-v1.mjs`
- Test: `scripts/test-whatsapp-marketing-campaign-drafts-v1.mjs`

**Interfaces:**
- Consumes: existing campaign `options/create/update_draft`, audience `preview`, and Task 3 of `2026-10-06-vitrine-marketing-audiences.md` saved-audience response `{id,name,filters}`.
- Produces: campaign draft request with copied `filters`, chosen account/template, and stable idempotency key.

- [ ] **Step 1: Extend editor contract**

Assert name/description/channel/template, saved audience or build-filters choice, preview count, advanced options collapsed, start-now/schedule options, and no UUID input.

- [ ] **Step 2: Run RED**

Run:
- `node scripts/test-whatsapp-marketing-campaign-simple-audience-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-drafts-v1.mjs`

Expected: FAIL on missing saved-audience selection or fields exposed in the advanced layout.

- [ ] **Step 3: Implement the editor flow**

Filter templates to `category=MARKETING` and `status=APPROVED`; show the selected audience name and copy its filter object into the draft. Keep filters built inline under the same preview flow.

- [ ] **Step 4: Validate date and time**

Interpret scheduled input in `America/Cuiaba`, reject invalid/past times before calling `schedule`, and serialize a timezone-explicit ISO value.

- [ ] **Step 5: Run tests and commit**

Run both tests above and:
- `node --check vitrine/admin/marketing/campaign-simple-ui.js`
- `node --check vitrine/admin/marketing/campaign-center.js`

Expected: PASS.

Commit: `ui: streamline campaign creation`

---

### Task 3: Eligibility summary and recent-conversation exclusion

**Files:**
- Modify only if needed: `vitrine/admin/marketing/campaign-simple-ui.js`
- Modify only if needed: `supabase/functions/admin-marketing-campaigns-v1/index.ts`
- Modify only if needed: `supabase/functions/admin-marketing-audiences-v1/index.ts`
- Test: `scripts/test-admin-marketing-campaigns-v1.mjs`
- Test: `scripts/test-whatsapp-marketing-campaign-simple-audience-v1.mjs`

**Interfaces:**
- Consumes: canonical audience preview and campaign snapshot contracts.
- Produces: preview summary with found/eligible/excluded counts and reasons; optional recent-conversation exclusion hours validated by the backend.

- [ ] **Step 1: Add review-focus cases**

Test 529 matched / 20 eligible, zero eligible, opt-out between preview and snapshot, and recent-conversation exclusion.

- [ ] **Step 2: Run RED**

Run both tests above.  
Expected: FAIL if the UI conflates matched with eligible or the backend does not validate the cooldown.

- [ ] **Step 3: Reuse or extend the server preview contract**

Return aggregate counts and safe reason totals. Validate the exclusion-hours value against a bounded integer range in the Edge Function; apply it through the canonical snapshot path, not a browser-side recipient list.

- [ ] **Step 4: Implement clear review copy**

Show “X clientes encontrados · Y com consentimento comercial · Z destinatários elegíveis”. For zero eligible recipients, save a draft but prevent an executable action.

- [ ] **Step 5: Run tests and commit**

Run:
- `node scripts/test-admin-marketing-campaigns-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-simple-audience-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-execution-v1.mjs`

Expected: PASS; opt-out is rechecked at snapshot/dispatch.

Commit: `feat: show campaign eligibility before creation`

---

### Task 4: Preserve gated execution actions and simple report

**Files:**
- Modify: `vitrine/admin/marketing/campaign-list-simple.js`
- Modify: `vitrine/admin/marketing/campaign-list-simple.css`
- Modify only if needed: `vitrine/admin/marketing/campaign-report.js`
- Modify only if needed: `supabase/functions/admin-marketing-campaigns-v1/index.ts`
- Test: `scripts/test-admin-marketing-campaign-scheduling-v1.mjs`
- Test: `scripts/test-whatsapp-marketing-campaign-execution-ui-v1.mjs`
- Test: `scripts/test-whatsapp-marketing-campaign-report-ui-v1.mjs`

**Interfaces:**
- Consumes: current `schedule/start_now/pause/resume/cancel_execution/execution_status` actions and `admin-marketing-campaign-report-v1`.
- Produces: contextual start/pause/cancel actions and report containing sent/delivered/read/failed totals and masked recipients.

- [ ] **Step 1: Add disabled-gate and duplicate-action cases**

Assert a closed kill-switch is visible, does not claim success, and repeated actions do not create duplicate execution.

- [ ] **Step 2: Run RED**

Run the execution UI and scheduling scripts above.  
Expected: FAIL only on missing UI-state assertions.

- [ ] **Step 3: Implement state-aware actions**

Wire buttons only to supported transitions. Keep server replies authoritative; show normalized gate/errors and poll only the existing execution status action when the operator opens a running campaign.

- [ ] **Step 4: Verify report privacy and statuses**

Show sent, delivered, read, failed, rates, and masked phones. Preserve partial/late statuses; do not expose WAMID.

- [ ] **Step 5: Run all campaign regressions and commit**

Run:
- `node scripts/test-admin-marketing-campaigns-v1.mjs`
- `node scripts/test-admin-marketing-campaign-scheduling-v1.mjs`
- `node scripts/test-admin-marketing-campaign-report-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-execution-ui-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-report-ui-v1.mjs`

Expected: PASS; no live recipient is contacted by the test suite.

Commit: `ui: complete gated campaign workflow`
