# Vitrine Marketing Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the unified Meta template manager using the existing authenticated Admin and canonical Supabase cache.

**Architecture:** The UI calls `admin-whatsapp-templates-v1` and the existing carousel Edge Function. The Meta Graph token stays server-side; the Meta cache and webhook event ledger remain canonical. Add a backend action only when the current contract lacks a required read or mutation.

**Tech Stack:** Browser JavaScript ES modules, Vitrine Admin CSS, Supabase Edge Functions (Deno/TypeScript), shared Meta helpers, Node.js contract scripts.

**Spec:** `docs/superpowers/specs/2026-10-06-vitrine-marketing-unified-module-design.md`

## Global Constraints

- Use `whatsapp_templates_v1` and `whatsapp_template_events_v1`; do not create parallel Meta template tables.
- Translate Meta states exactly as specified in the design and display unknown/absent states as “Não informado”.
- No browser request calls Graph API or contains Meta/service-role credentials.
- Editing fetches the remote template using `meta_template_id` before populating the editor.
- No UI action can approve a template; Meta status updates come from sync/webhooks.
- Preserve existing campaign send, runtime, channel, and canary gates.

## Review Focus

- Meta adds an unknown or omits status: display “Não informado” and preserve the raw value; test in the template manager contract.
- Sync fails while a cached list exists: keep the last list and show a recoverable error; test in the template manager contract.
- Local cache is stale when editing: fetch remote template before showing the form; test edit path in `scripts/test-whatsapp-marketing-template-admin-v1.mjs`.
- A stale cache offers deletion for a template already absent remotely: show the backend result and refresh, never claim deletion succeeded; test delete path.
- Variables exist without required examples: block submission before Meta call and show the missing example field; test editor validation.

---

### Task 1: Status labels, filters, list and synchronization states

**Files:**
- Modify: `vitrine/admin/marketing/template-center.js`
- Modify: `vitrine/admin/marketing/template-center.css`
- Test: `scripts/test-whatsapp-marketing-template-admin-v1.mjs`
- Create or modify: `scripts/test-whatsapp-marketing-template-center-v1.mjs`
- Modify: `.github/workflows/marketing-professional-ui-ci.yml`

**Interfaces:**
- Consumes: `GET action=list|sync&account_id=<uuid>` on `admin-whatsapp-templates-v1`.
- Produces: Portuguese status mapper `templateStatusLabel(status: string | null): string` and a filtered list that preserves the last successful result on request failure.

- [ ] **Step 1: Add list contract cases**

Cover the eight status mappings, missing/unknown status, all five filters, accessible row actions, and preserving cached rows on sync error.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-template-center-v1.mjs`  
Expected: FAIL for raw status labels and current sync failure behavior.

- [ ] **Step 3: Implement status mapping and list**

Render “Não informado” for unknown/absent values, show category/channel/quality/update time, and keep Meta raw status accessible to technical detail without exposing it as the primary label.

- [ ] **Step 4: Implement list-preserving sync errors**

Do not clear successful items on a failed sync. Keep the prior table visible and show an actionable Portuguese error with a details disclosure.

- [ ] **Step 5: Run tests and commit**

Run:
- `node scripts/test-whatsapp-marketing-template-center-v1.mjs`
- `node scripts/test-whatsapp-marketing-template-admin-v1.mjs`
- `node --check vitrine/admin/marketing/template-center.js`

Expected: PASS.

Commit: `ui: clarify Meta template status and sync`

---

### Task 2: Template type picker, standard editor and WhatsApp preview

**Files:**
- Modify: `vitrine/admin/marketing/template-type-picker.js`
- Modify: `vitrine/admin/marketing/template-center.css`
- Modify: `vitrine/admin/marketing/template-center.js`
- Test: `scripts/test-whatsapp-marketing-template-simple-ui-v1.mjs`
- Create or modify: `scripts/test-whatsapp-marketing-template-editor-v1.mjs`

**Interfaces:**
- Consumes: existing create payload and channel/account lookup.
- Produces: picker types `standard | carousel | catalog | authentication`; standard draft fields map to the Meta components payload through the existing Edge API.

- [ ] **Step 1: Update picker and editor tests**

Assert the four requested picker labels, permanent preview, all supported header modes, variable example fields, and that unsupported catalog/authentication capabilities are visibly unavailable rather than submitted.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-template-editor-v1.mjs`  
Expected: FAIL on picker values and missing preview/field validation.

- [ ] **Step 3: Implement the four type choices**

Keep quick replies as an editor component instead of a separate Meta template type. Only offer catalog/authentication as enabled choices when the connected account/API capability supports them.

- [ ] **Step 4: Implement standard editor preview and examples**

Bind editor state to the WhatsApp preview; insert sequential `{{1}}` variables; require an example for every variable before submit; map supported headers, body, footer, and buttons to the existing API contract.

- [ ] **Step 5: Run GREEN and commit**

Run:
- `node scripts/test-whatsapp-marketing-template-editor-v1.mjs`
- `node scripts/test-whatsapp-marketing-template-simple-ui-v1.mjs`
- `node --check vitrine/admin/marketing/template-type-picker.js`

Expected: PASS.

Commit: `ui: build guided WhatsApp template editor`

---

### Task 3: Carousel editor and server-side media upload

**Files:**
- Modify: `vitrine/admin/marketing/template-carousel-editor.js`
- Modify: `vitrine/admin/marketing/template-carousel-editor.css`
- Modify: `supabase/functions/admin-whatsapp-template-carousel-v1/index.ts`
- Modify shared Meta helper only if validation is missing: `supabase/functions/_shared/whatsapp-meta-carousel-v1.mjs`
- Test: `scripts/test-admin-whatsapp-template-carousel-v1.mjs`
- Test: `scripts/test-whatsapp-marketing-template-carousel-v1.mjs`
- Modify: `.github/workflows/marketing-carousel-ci.yml`

**Interfaces:**
- Consumes: authenticated carousel Edge actions `upload_media` and `create`.
- Produces: a validated MARKETING carousel draft with 2–10 cards and media handles; browser never receives the Meta token.

- [ ] **Step 1: Extend contract tests for preview and incomplete cards**

Cover 2–10 cards, image/video capability, consistent button structure, removing/reordering cards, and blocking incomplete cards before upload/create.

- [ ] **Step 2: Run RED**

Run:
- `node scripts/test-admin-whatsapp-template-carousel-v1.mjs`
- `node scripts/test-whatsapp-marketing-template-carousel-v1.mjs`

Expected: FAIL only for missing UX assertions or unsupported validation.

- [ ] **Step 3: Implement only missing server validation**

Reuse the resumable upload and Meta helper. Do not create a new table unless a documented Meta component cannot fit in existing JSONB cache.

- [ ] **Step 4: Implement editor preview and card controls**

Start with two cards, allow add/remove/reorder up to ten, and update preview immediately as the draft changes.

- [ ] **Step 5: Run tests, syntax checks and commit**

Run both scripts above and:
- `node --check vitrine/admin/marketing/template-carousel-editor.js`
- `node --check supabase/functions/_shared/whatsapp-meta-carousel-v1.mjs`

Expected: PASS.

Commit: `feat: complete carousel template editor`

---

### Task 4: Remote edit, duplicate, deletion, detail drawer and Meta event history

**Files:**
- Modify: `supabase/functions/admin-whatsapp-templates-v1/index.ts`
- Modify: `supabase/functions/_shared/whatsapp-meta-templates-v1.mjs`
- Modify: `vitrine/admin/marketing/template-center.js`
- Modify: `vitrine/admin/marketing/template-center.css`
- Modify: `supabase/functions/whatsapp-meta-webhook-v1/index.ts` only if status events are not already reflected in the cache
- Test: `scripts/test-whatsapp-marketing-template-admin-v1.mjs`
- Test: `scripts/test-attendance-meta-template-plpgsql-v1.mjs`
- Modify: `.github/workflows/marketing-professional-ui-ci.yml`

**Interfaces:**
- Consumes: `meta_template_id`, existing edit/delete/sync contracts, and `whatsapp_template_events_v1`.
- Produces: authenticated remote detail read, edit form seeded from Meta, explicit delete confirmation, and a sanitized timeline with no fabricated events.

- [ ] **Step 1: Audit current read/edit/delete/webhook contracts**

Use existing actions where present. Update tests to require remote fetch before edit and verify status webhook updates are idempotent.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-template-admin-v1.mjs`  
Expected: FAIL only on the missing read-before-edit, duplicate, or event projection contract.

- [ ] **Step 3: Add the smallest missing authenticated backend action**

If no remote get exists, add `action=get` keyed by local template id, resolve `meta_template_id` server-side, and call the existing shared Meta client. Never accept WABA, token, or Meta ID from an untrusted browser payload when the stored row can provide it.

- [ ] **Step 4: Implement UI actions and drawer**

Edit must load the returned remote components; duplicate opens a new draft; delete requires the explicit Meta-removal confirmation; details render components and ordered sync/status events.

- [ ] **Step 5: Run regressions and commit**

Run:
- `node scripts/test-whatsapp-marketing-template-admin-v1.mjs`
- `node scripts/test-admin-whatsapp-template-carousel-v1.mjs`
- `node scripts/test-admin-marketing-campaigns-v1.mjs`
- `node --check vitrine/admin/marketing/template-center.js`

Expected: PASS; existing send and campaign contracts remain intact.

Commit: `feat: complete Meta template lifecycle in Marketing`
