# Vitrine Marketing Públicos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Admin operators build, count, save, reuse, and update commercial audiences without exposing database identifiers.

**Architecture:** Keep the existing audience preview RPC and filters. Add one canonical saved-audience table because the production schema has no saved-audience store; expose it only through the authenticated audiences Edge Function. Campaigns receive a copy of the selected filters.

**Tech Stack:** Browser JavaScript ES modules, Supabase Edge Functions (Deno/TypeScript), Postgres JSONB/RLS, Node.js contract scripts.

**Spec:** `docs/superpowers/specs/2026-10-06-vitrine-marketing-unified-module-design.md`

## Global Constraints

- Filters use the existing audience preview RPC and supported canonical customer/order/label data.
- The builder's primary filters are city, neighborhood, label, purchased product/category/brand, and last purchase date.
- Keep advanced filters collapsed under “Mais filtros”.
- The UI shows the server-calculated matching count; it does not fetch/render the full customer set.
- Persist saved audiences in `marketing_audiences_v1`; campaigns copy filter JSON so later audience edits do not change existing campaigns.
- Enable RLS and deny direct `anon`/`authenticated` access; use the authenticated Admin Edge Function.
- Do not change consent eligibility or dispatch rules in this plan.

## Review Focus

- Two selected labels overlap: count customers once; test in `scripts/test-whatsapp-marketing-audience-progressive-v1.mjs`.
- Filters return zero matches: show a usable zero-result state and allow saving a draft filter; test audience UI contract.
- Invalid or oversized filter JSON is submitted: reject server-side without persisting; test audiences Edge contract.
- A saved audience changes after a campaign is created: the campaign retains the original filters; test campaign draft contract.
- A user guesses another audience UUID: no direct Data API access and all writes still require an active Admin; test RLS/API contract.

---

### Task 1: Add the saved-audience table with least-privilege access

**Files:**
- Create via `supabase migration new marketing_audiences_v1`: generated migration under `supabase/migrations/`
- Test: `scripts/test-admin-marketing-audiences-v1.mjs`
- Create or modify: `scripts/test-whatsapp-marketing-audiences-saved-v1.mjs`

**Interfaces:**
- Consumes: authenticated Admin user id.
- Produces: `public.marketing_audiences_v1(id uuid, name text, filters jsonb, created_by uuid, created_at timestamptz, updated_at timestamptz)`; filters must be a JSON object.

- [ ] **Step 1: Add migration contract assertions**

Assert table columns/check constraints, JSON-object validation, RLS enabled, no direct browser grants, and explicit service_role access.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-audiences-saved-v1.mjs`  
Expected: FAIL because the migration/table does not exist.

- [ ] **Step 3: Generate the migration**

Run: `supabase migration new marketing_audiences_v1`  
Expected: Supabase CLI creates a timestamped migration file; use that generated path.

- [ ] **Step 4: Implement the additive schema**

Create the table with UUID primary key, bounded non-empty name, JSONB object filters, author and timestamps. Enable RLS; revoke table privileges from `anon` and `authenticated`; grant required table privileges only to `service_role`. Do not add customer snapshots or duplicate preview results.

- [ ] **Step 5: Run test and commit**

Run: `node scripts/test-whatsapp-marketing-audiences-saved-v1.mjs`  
Expected: PASS.

Commit: `feat(db): add saved marketing audiences`

---

### Task 2: Add authenticated saved-audience actions

**Files:**
- Modify: `supabase/functions/admin-marketing-audiences-v1/index.ts`
- Modify: `scripts/test-admin-marketing-audiences-v1.mjs`
- Test: `scripts/test-whatsapp-marketing-audiences-saved-v1.mjs`
- Modify: `.github/workflows/marketing-audience-progressive-ci.yml`

**Interfaces:**
- Consumes: Task 1 table and existing `adminAuth(req)`.
- Produces:
  - `GET action=saved_list` → `{ok:true, items:[{id,name,filters,updated_at}]}`
  - `POST action=saved_create` with `{name,filters}` → `{ok:true,item}`
  - `POST action=saved_update` with `{id,name,filters}` → `{ok:true,item}`
  - `POST action=saved_delete` with `{id}` → `{ok:true,deleted:true}`

- [ ] **Step 1: Add action and validation tests**

Require active Admin authentication, allowed filter keys/size, non-empty name, and no service-role/token/SQL fields in payload. Verify actions never call Graph or campaign dispatch.

- [ ] **Step 2: Run RED**

Run:
- `node scripts/test-admin-marketing-audiences-v1.mjs`
- `node scripts/test-whatsapp-marketing-audiences-saved-v1.mjs`

Expected: FAIL on missing saved-audience action contracts.

- [ ] **Step 3: Implement the four actions**

Use the existing service-role client only inside the Edge Function after `adminAuth`; validate the filter object against the same allowlist and size limits as preview. Return only operator-facing fields; never expose customer-level records from saved filters.

- [ ] **Step 4: Run GREEN and commit**

Run both scripts above.  
Expected: PASS; current overview, preview, consent_history, and record_consent actions remain available.

Commit: `feat: add authenticated saved audience API`

---

### Task 3: Build the progressive audience editor and saved list

**Files:**
- Modify: `vitrine/admin/marketing/audience-center.js`
- Modify: `vitrine/admin/marketing/audience-center.css`
- Test: `scripts/test-whatsapp-marketing-audience-ui-v1.mjs`
- Test: `scripts/test-whatsapp-marketing-audience-progressive-v1.mjs`
- Modify: `.github/workflows/marketing-audience-progressive-ci.yml`

**Interfaces:**
- Consumes: existing `overview`/`preview` actions and Task 2 saved-audience actions.
- Produces: progressive editor state `{name:string, filters:object}`, server-count display, and save/select/update operations.

- [ ] **Step 1: Update UI contracts**

Assert visible primary filters, collapsed advanced controls, persistent `found_count`, empty state, and save/list/update affordances. Assert no visible UUID or raw product-ID field in the primary flow.

- [ ] **Step 2: Run RED**

Run:
- `node scripts/test-whatsapp-marketing-audience-ui-v1.mjs`
- `node scripts/test-whatsapp-marketing-audience-progressive-v1.mjs`

Expected: FAIL on too many always-visible filters and absent save/list flow.

- [ ] **Step 3: Implement progressive builder**

Show name, primary filter fields, server count, and an expandable advanced section. Reuse existing preview call and labels; do not render all matching customers in the page.

- [ ] **Step 4: Implement saved-audience list and actions**

Load saved filters on demand, allow edit/update/delete, and retain the preview count. For zero results, allow save while clearly showing zero.

- [ ] **Step 5: Run tests and commit**

Run:
- `node scripts/test-whatsapp-marketing-audience-ui-v1.mjs`
- `node scripts/test-whatsapp-marketing-audience-progressive-v1.mjs`
- `node --check vitrine/admin/marketing/audience-center.js`

Expected: PASS.

Commit: `ui: add progressive saved audience builder`

---

### Task 4: Verify campaign handoff uses immutable filter copies

**Files:**
- Modify only if needed: `vitrine/admin/marketing/campaign-simple-ui.js`
- Modify only if needed: `supabase/functions/admin-marketing-campaigns-v1/index.ts`
- Test: `scripts/test-whatsapp-marketing-campaign-drafts-v1.mjs`
- Test: `scripts/test-whatsapp-marketing-campaign-simple-audience-v1.mjs`

**Interfaces:**
- Consumes: Task 2 saved audience item `{id,name,filters}`.
- Produces: campaign draft request whose `filters` is a copy of the chosen audience filters, independent of later saved-audience edits.

- [ ] **Step 1: Add immutable handoff regression**

Create a draft from a saved audience, update that audience, and assert the campaign draft still contains the original filter JSON.

- [ ] **Step 2: Run RED**

Run both tests above.  
Expected: FAIL only if campaign selection/handoff stores a mutable audience reference or omits its filter snapshot.

- [ ] **Step 3: Implement the smallest handoff fix**

Copy the selected filter object into the existing campaign draft payload. Keep preview, consent, dedupe, and dispatch logic server-side.

- [ ] **Step 4: Run GREEN and commit**

Run both tests above.  
Expected: PASS without changing campaign send gates.

Commit: `fix: snapshot saved audience filters in campaign draft`
