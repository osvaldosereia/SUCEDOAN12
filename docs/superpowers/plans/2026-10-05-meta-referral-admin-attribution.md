# Meta WhatsApp Referral Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve verified WhatsApp referral attribution and show the contact origin plus Meta-confirmed 24h/72h deadlines in Vitrine Admin.

**Architecture:** Extend the existing canonical Meta message normalizer to retain a bounded referral object. Database triggers use that canonical metadata to fill the existing `conversations.referral` and service-window columns; a Meta status carrying `conversation.origin.type = referral_conversion` supplies the authoritative free-entry expiration. The current Admin context RPC returns those fields to the existing conversation overview.

**Tech Stack:** Supabase PostgreSQL/PLpgSQL, Supabase migrations, Deno/TypeScript Edge Function webhook, JavaScript, Node contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-05-vitrine-meta-attribution-cart-recovery-design.md`

## Global Constraints

- Preserve `inbound_provider=papoai` and the current outbound provider configuration.
- Keep `ana_enabled=false` and existing campaign kill-switches unchanged.
- Do not send, schedule, or queue customer messages in this plan.
- Preserve referral data only from the signed Meta webhook and associate it with the resolved account, message, and conversation.
- Store bounded referral fields: `source_type`, `source_id`, `source_url`, `headline`, `body`, `media_type`, and `ctwa_clid`; do not persist ad media downloads.
- Set the ordinary service deadline from the latest inbound customer message plus 24 hours.
- Set the 72-hour free-entry deadline only from Meta's status payload when `conversation.origin.type = referral_conversion` and a valid `conversation.expiration_timestamp` is present.
- Never infer a 72-hour free window from a website visit, UTM, or a referral object alone.
- Reuse existing `conversations.referral`, `service_window_expires_at`, and `free_entry_window_expires_at` columns.
- Reuse the existing Admin context API/RPC and do not expose service-role credentials to the browser.
- Keep all new database functions schema-qualified, with an empty search path and least-privilege grants; retain RLS on exposed tables.

## Current File Map

- `supabase/functions/_shared/whatsapp-core-v1.mjs`: canonical Meta message and status normalization.
- `supabase/functions/whatsapp-meta-webhook-v1/index.ts`: signed webhook persists normalized inbound messages and Meta statuses.
- `whatsapp_messages_v1.metadata`: canonical message metadata, including preserved Meta provider data.
- `whatsapp_message_status_events_v1.payload`: persisted Meta status payload.
- `conversations`: already has `source`, `referral`, `last_inbound_at`, `service_window_expires_at`, and `free_entry_window_expires_at`.
- `public.ops2_admin_attendance_context_v1(uuid)`: Admin context RPC; currently returns service expiry but omits referral and free-entry expiry.
- `vitrine/admin/atendimento/attendance-app.js`: selected conversation overview in the native Admin.
- `.github/workflows/whatsapp-meta-central-ci.yml`: existing Meta and Admin contract checks.

## Review Focus

1. **Referral absent or malformed:** message remains ingestible, attribution remains unknown, and no 72-hour deadline is created.
2. **Untrusted values:** oversized/invalid fields are bounded or omitted; referral metadata cannot alter account, sender, or conversation identifiers.
3. **PapoAI/Meta duplicate ordering:** a later duplicate cannot erase Meta referral data or shorten either deadline.
4. **Status lacks free-entry proof:** an ordinary status or malformed expiration never sets a 72-hour deadline.
5. **Two WhatsApp accounts share a contact:** referral and deadlines update only the conversation for the matched account and phone.

---

### Task 1: Preserve bounded referral fields in canonical Meta messages

**Files:**
- Modify: `supabase/functions/_shared/whatsapp-core-v1.mjs`
- Create: `scripts/test-whatsapp-meta-referral-attribution-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: signed Meta webhook message object `message.referral`.
- Produces: optional `message.metadata.referral` with the exact allowlist from Global Constraints; existing messages without referral retain their current shape.

- [ ] **Step 1: Add failing normalizer assertions**
  
  In the new contract script, call `canonicalMessagesFromMeta` with:
  - eligible inbound message containing every referral field;
  - message without `referral`;
  - invalid `source_type`, non-string fields, and overlong strings.
  
  Assert the valid allowlisted fields survive with their bounded values, malformed/absent values are omitted, no source is fabricated, and phone/account/message IDs still come from their existing Meta fields.

- [ ] **Step 2: Run the focused contract and confirm RED**
  
  Run: `node scripts/test-whatsapp-meta-referral-attribution-v1.mjs`  
  Expected: fails because canonical metadata currently omits `message.referral`.

- [ ] **Step 3: Implement referral normalization**
  
  Add a small helper in `whatsapp-core-v1.mjs` that validates `source_type` as `ad|post`, trims and bounds each optional field, accepts `ctwa_clid` only as a bounded string, and returns `null` if no valid referral fields remain. Attach it only to inbound Meta message metadata.

- [ ] **Step 4: Run focused and existing webhook contracts**
  
  Run:
  - `node scripts/test-whatsapp-meta-referral-attribution-v1.mjs`
  - `node scripts/test-whatsapp-meta-webhook-v1.mjs`
  - `node --check supabase/functions/_shared/whatsapp-core-v1.mjs`
  
  Expected: all pass.

- [ ] **Step 5: Add the focused contract to Meta CI**
  
  Add the new script to `.github/workflows/whatsapp-meta-central-ci.yml` beside the existing Meta webhook contracts. Verify the workflow still parses and includes the existing checks.

### Task 2: Persist referral and exact conversation windows

**Files:**
- Create: `supabase/migrations/20261005173000_meta_whatsapp_referral_attribution_v1.sql`
- Modify: `scripts/test-whatsapp-meta-referral-attribution-v1.mjs`

**Interfaces:**
- Consumes: `whatsapp_messages_v1(provider, direction, received_at, metadata.referral, conversation_id, whatsapp_account_id)` and `whatsapp_message_status_events_v1(provider, message_id, payload)`.
- Produces: updates to the matching existing `conversations` row; no new public table or RPC.

- [ ] **Step 1: Add failing SQL-contract assertions**
  
  Assert the migration:
  - installs a message trigger for inbound messages and referral metadata updates;
  - writes only the allowlisted referral fields to the matching conversation;
  - maps referral `ad` to `meta_ad` and `post` to `organic`, preserving existing values when referral is absent;
  - derives the 24-hour deadline from the latest inbound timestamp, including out-of-order delivery safety;
  - installs a status-event trigger that sets `free_entry_window_expires_at` only for provider `meta`, origin `referral_conversion`, and a valid Meta expiration timestamp;
  - never derives 72h from the referral alone;
  - uses fully qualified names, a fixed empty search path, RLS-compatible execution, and safe grants.
  
- [ ] **Step 2: Run the focused contract and confirm the migration assertions fail**
  
  Run: `node scripts/test-whatsapp-meta-referral-attribution-v1.mjs`  
  Expected: fails because the migration does not yet exist.

- [ ] **Step 3: Implement additive trigger functions and migration**
  
  Create an idempotent migration after the latest recorded schema version. Add a trigger on canonical message insert/metadata update to set referral, source, latest inbound time and the 24-hour deadline. Add a trigger on inserted Meta status events to read the nested origin and expiration, validate the epoch range, and update the matched conversation to the exact Meta-reported deadline. Never reduce an already later confirmed deadline on an out-of-order event. Do not rewrite the large canonical ingestion RPC.

- [ ] **Step 4: Verify trigger contracts and a rollback-only database smoke**
  
  In a transaction that is rolled back, use synthetic data to assert:
  - inbound Meta referral populates one matching conversation;
  - no referral leaves the existing referral untouched;
  - an inbound event sets the service expiry to inbound time plus 24 hours;
  - a `referral_conversion` status stores Meta's expiration;
  - other origins, invalid timestamps, duplicate deliveries, and another account do not create or overwrite a free-entry window.
  
  Expected: all assertions pass; no production customer data is edited and no Meta message is sent.

### Task 3: Show attribution and verified windows in Vitrine Admin

**Files:**
- Modify: `supabase/migrations/20261005173000_meta_whatsapp_referral_attribution_v1.sql`
- Modify: `vitrine/admin/atendimento/attendance-app.js`
- Create: `scripts/test-admin-attendance-attribution-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: `ops2_admin_attendance_context_v1(p_conversation_id uuid)` returning the existing conversation object plus `source`, `referral`, `service_window_expires_at`, and `free_entry_window_expires_at`.
- Produces: a read-only “Origem do contato” card in the selected conversation’s overview.

- [ ] **Step 1: Add failing Admin contract assertions**
  
  Assert the context RPC includes referral and both expirations, and the overview displays a human-readable source/campaign with:
  - the 24-hour window derived from the current conversation deadline;
  - the 72-hour window only when Meta-confirmed expiry exists;
  - “Origem não identificada” and “Janela gratuita não confirmada” when evidence is absent.
  
  Assert the UI does not infer or display a 72-hour free window from `source='meta_ad'` alone and adds no send action.

- [ ] **Step 2: Run the focused Admin contract and confirm RED**
  
  Run: `node scripts/test-admin-attendance-attribution-v1.mjs`  
  Expected: fails because the current RPC and selected-conversation overview omit attribution details.

- [ ] **Step 3: Extend the context RPC and selected-conversation overview**
  
  In the migration, recreate `ops2_admin_attendance_context_v1(uuid)` preserving its current customer/address/orders response, and add the four attribution fields to its `conversation` object. In `attendance-app.js`, add an escaped DOM-rendered card using only that context payload; show times in the existing Brazilian date/time format.

- [ ] **Step 4: Verify Admin and regression contracts**
  
  Run:
  - `node scripts/test-admin-attendance-attribution-v1.mjs`
  - `node scripts/test-admin-attendance-ui-v1.mjs`
  - `node --check vitrine/admin/atendimento/attendance-app.js`
  
  Expected: all pass; no send/provider behavior changes.

- [ ] **Step 5: Add the Admin attribution contract to Meta CI**
  
  Register the new script in `.github/workflows/whatsapp-meta-central-ci.yml` and confirm the existing native Attendance and Meta gateway checks remain present.

### Task 4: Review and prepare the first implementation PR

**Files:**
- No additional product files.

**Interfaces:**
- Consumes: Tasks 1–3 and their passing contracts.
- Produces: isolated branch/PR for the first plan phase; no production migration or message dispatch.

- [ ] **Step 1: Review the complete diff**
  
  Confirm only canonical referral, conversation attribution/window persistence, Admin visibility, tests, and CI changed. Confirm no campaign toggle, PapoAI/ANA runtime setting, or Meta sending path changed.

- [ ] **Step 2: Run all focused contracts and syntax checks**
  
  Run all commands listed in Tasks 1 and 3 plus the repository's Meta central CI locally where available. Record the exact results.

- [ ] **Step 3: Request a fresh review and open the PR**
  
  Summarize the behavior and verify CI before opening a draft PR. Link it to this task.

## Follow-on phases from the approved design

These are intentionally separate plans so each can be tested and reviewed on its own:

1. Website UTM/session and server-persisted cart events.
2. Checkout consent copy/default and evidence storage, reusing `marketing_consent_events_v1` rather than creating another consent ledger.
3. Abandoned-cart eligibility queue and Admin review mode, reusing the existing Meta template/campaign/outbox infrastructure; no automatic customer dispatch until a separate controlled activation.
4. Pixel/Conversions API after confirmed-order attribution is reconciled.
5. ANA production-provider rollout remains a separate decision from this marketing/attribution project.

## Self-review

- Spec coverage for this first deliverable: Meta referral capture, exact 24-hour service deadline, Meta-confirmed 72-hour free-entry deadline, and Admin visibility are covered by Tasks 1–3.
- Website behavior tracking, consent-copy changes, cart recovery, and Pixel/CAPI remain covered by the approved umbrella spec and are explicit follow-on plans, not duplicated here.
- Existing marketing consent, template, audience, and campaign infrastructure is reused; no parallel ledger/worker is introduced.
- The current conversation context RPC and Admin API pattern are preserved.
- The 72-hour status path is evidence-based: only Meta's own `referral_conversion` origin plus its expiration timestamp marks a confirmed free-entry deadline.
