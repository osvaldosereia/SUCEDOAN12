# Vitrine Marketing Consentimentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present current marketing consent and customer campaign activity in a simple, auditable operator view.

**Architecture:** Extend `admin-marketing-audiences-v1` and the existing append-only consent ledger. Read campaign activity from canonical campaign dispatches and message status records; never write or rewrite historical events to construct the UI.

**Tech Stack:** Browser JavaScript ES modules, existing Vitrine Admin CSS, Supabase Edge Functions (Deno/TypeScript), Postgres, Node.js contract scripts.

**Spec:** `docs/superpowers/specs/2026-10-06-vitrine-marketing-unified-module-design.md`

## Global Constraints

- Current consent comes from `marketing_customer_consent_current_v1`; audit comes from append-only `marketing_consent_events_v1`.
- Keep existing `record_consent` evidence requirements and server-forced source.
- Customer search/history requires an active Admin session.
- Timeline uses canonical campaign dispatches, campaigns, templates, and WhatsApp status events when available.
- Do not expose WAMID/provider IDs in normal UI or permit edits to historical events.
- Do not make an opt-in or opt-out imply campaign dispatch.

## Review Focus

- Customer has never consented versus explicitly revoked: labels and counts remain distinct; test consent ledger/UI contract.
- Opt-in submission lacks text evidence: backend rejects it; test `scripts/test-whatsapp-marketing-consent-ledger-v1.mjs`.
- One customer has many events: timeline sorts by occurrence time and paginates; test consent history API contract.
- Duplicate customer records share a phone: search does not merge their histories silently; test customer lookup contract.
- Campaign status has no linked message event: timeline displays the dispatch state without exposing provider IDs; test activity timeline contract.

---

### Task 1: Add authenticated customer consent search

**Files:**
- Modify: `supabase/functions/admin-marketing-audiences-v1/index.ts`
- Modify: `scripts/test-admin-marketing-audiences-v1.mjs`
- Create: `scripts/test-whatsapp-marketing-consent-history-v1.mjs`

**Interfaces:**
- Consumes: existing `adminAuth(req)`, customers, and `marketing_customer_consent_current_v1`.
- Produces: `GET action=consent_list&search=<name-or-phone>&limit=<1..100>&cursor=<optional>` → `{ok:true,items:[{customer_id,name,masked_phone,consent_state,updated_at}],next_cursor}`.

- [ ] **Step 1: Add search contract tests**

Assert active Admin auth, bounded search/limit, masked phone in list response, distinct never-consented/revoked states, and no provider IDs.

- [ ] **Step 2: Run RED**

Run:
- `node scripts/test-admin-marketing-audiences-v1.mjs`
- `node scripts/test-whatsapp-marketing-consent-history-v1.mjs`

Expected: FAIL on the missing searchable list contract.

- [ ] **Step 3: Implement the read-only list action**

Join customer and current-consent projection server-side. Return only the fields in the interface; use stable pagination and do not merge customer ids that happen to share a phone.

- [ ] **Step 4: Run GREEN and commit**

Run both scripts above.  
Expected: PASS; existing overview and record_consent behavior is unchanged.

Commit: `feat: add authenticated consent customer search`

---

### Task 2: Add campaign activity to the customer timeline

**Files:**
- Modify: `supabase/functions/admin-marketing-audiences-v1/index.ts`
- Modify: `scripts/test-admin-marketing-audiences-v1.mjs`
- Modify: `scripts/test-whatsapp-marketing-consent-history-v1.mjs`

**Interfaces:**
- Consumes: `customer_id`, consent events, `marketing_campaign_dispatches_v1`, `marketing_campaigns_v1`, `whatsapp_templates_v1`, and `whatsapp_message_status_events_v1`.
- Produces: `GET action=consent_history&customer_id=<uuid>` with `customer`, chronological `consent_events`, and chronological `campaign_events`; each campaign event contains occurred time, campaign name, template name, and the best available canonical status.

- [ ] **Step 1: Add timeline cases**

Cover consent grant/revoke order, a campaign dispatch with delivered/read status, a dispatch without a linked message event, missing template cache row, pagination, and absence of WAMID/provider IDs.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-consent-history-v1.mjs`  
Expected: FAIL because history currently returns consent events only.

- [ ] **Step 3: Implement campaign event projection**

Join by canonical customer/campaign/dispatch identifiers. If no message status event exists, show dispatch status and dispatch time. Do not fabricate an event or persist a copied timeline row.

- [ ] **Step 4: Run GREEN and commit**

Run:
- `node scripts/test-whatsapp-marketing-consent-history-v1.mjs`
- `node scripts/test-admin-marketing-campaign-report-v1.mjs`
- `node scripts/test-whatsapp-marketing-consent-ledger-v1.mjs`

Expected: PASS; report masking and append-only ledger remain intact.

Commit: `feat: include campaign activity in consent history`

---

### Task 3: Replace consent navigation page with simple list and detail drawer

**Files:**
- Modify: `vitrine/admin/marketing/audience-center.js`
- Modify: `vitrine/admin/marketing/audience-center.css`
- Test: `scripts/test-whatsapp-marketing-audience-ui-v1.mjs`
- Create: `scripts/test-whatsapp-marketing-consent-history-ui-v1.mjs`
- Modify: `scripts/test-whatsapp-marketing-papoai-responsive-v1.mjs`

**Interfaces:**
- Consumes: Task 1 `consent_list` and Task 2 `consent_history`.
- Produces: summary cards Total/Permitiram/Revogaram/Nunca consentiram, name-or-phone search, and a detail drawer with a chronological combined timeline.

- [ ] **Step 1: Add UI contract assertions**

Assert exactly the four consent summary states, search, accessible customer detail action, timeline content, and event-specific rendering for consent and campaign activity.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-consent-history-ui-v1.mjs`  
Expected: FAIL on missing searchable table/detail timeline.

- [ ] **Step 3: Implement the list and drawer**

Load counts/list on consent tab entry; load history only when a customer is opened. Render grant/revoke/source/channel and campaign/template/status details only when returned by the API. Keep technical IDs hidden.

- [ ] **Step 4: Verify event updates and viewport behavior**

Add a clear success/error state after a manual consent event and refresh the affected customer history. Verify the drawer is usable on desktop, tablet, and mobile.

- [ ] **Step 5: Run regressions and commit**

Run:
- `node scripts/test-whatsapp-marketing-consent-history-ui-v1.mjs`
- `node scripts/test-whatsapp-marketing-audience-ui-v1.mjs`
- `node scripts/test-whatsapp-marketing-papoai-responsive-v1.mjs`
- `node --check vitrine/admin/marketing/audience-center.js`

Expected: PASS.

Commit: `ui: simplify Marketing consent history`
