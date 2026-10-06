# Central ANA Management Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an operator-friendly ANA area in Vitrine Admin for per-channel status, safe behavior settings, published knowledge, deterministic triggers, no-send testing, and review history.

**Architecture:** Add immutable published configuration snapshots and a mutable draft in Supabase. Add management actions to the existing authenticated ANA preview Edge Function to avoid consuming another deployed function slot. The live worker loads only published configuration, applies deterministic triggers before AI, and keeps the current human-control, confidence, Meta outbox, and idempotency gates. Add the ANA page through the existing Admin sidebar and keep marketing controls separate.

**Tech Stack:** Static HTML/CSS/ES modules, Supabase Postgres migrations and RPCs, Supabase Edge Functions (Deno/TypeScript), Node contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-06-ana-central-admin-design.md`

## Global Constraints

- Do not add another Supabase Edge Function; extend the existing authenticated `admin-whatsapp-ana-preview-v1` endpoint for management actions.
- Preserve the current behavior as the initial published configuration before the live worker reads database configuration.
- Keep human takeover as the final send gate; maintain existing confidence, idempotency, Meta outbox, and canonical-message behavior.
- Keep `ana_enabled`, `send_enabled`, Meta capture, and `campaigns_enabled` separate; do not change current production switches during the migration.
- Do not send tests to customers. The simulator never calls Meta, changes customer/order records, or changes marketing consent.
- Store management data in dedicated ANA tables and mirror every SQL migration under `supabase/sql/`.
- Verify all Admin management writes server-side against the existing `admin_users` role model; never expose service-role credentials to the browser.
- Marketing campaigns/consent and transactional order/preparation/delivery notifications remain outside this feature.

## Review Focus

- Invalid or missing active configuration must fail closed to human review without sending a reply.
- A human takeover during model generation must prevent any deterministic or AI message from reaching Meta.
- A deterministic trigger and the AI path must share the current job/outbox idempotency boundary so a single inbound cannot produce duplicate replies.
- Draft edits, failed tests, and stale revisions must never silently replace the active published version.
- Channel ANA controls must never change Meta capture/send permissions or marketing campaign/consent state.

---

### Task 1: Versioned ANA configuration schema and safe database contracts

**Files:**
- Create: `supabase/migrations/20261007_whatsapp_ana_admin_v1.sql`
- Create: `supabase/sql/20261007_whatsapp_ana_admin_v1.sql`
- Create: `scripts/test-whatsapp-ana-admin-schema-v1.mjs`
- Create: `.github/workflows/ana-central-admin-ci.yml`

**Interfaces:**
- `whatsapp_ana_admin_draft_v1`: singleton draft JSON document and optimistic revision number.
- `whatsapp_ana_admin_versions_v1`: immutable published snapshots with monotonically increasing version, actor, time, and change note.
- `whatsapp_ana_admin_runtime_v1`: singleton pointer to the active published version.
- `whatsapp_ana_admin_events_v1`: append-only audit events for save, publish, channel toggle, and rollback.
- `whatsapp_ana_admin_test_runs_v1`: aggregate test-run outcome and failing scenario keys; never customer conversation data.
- JSON document keys: `behavior`, `knowledge[]`, `triggers[]`, and `test_cases[]`.
- RPCs: `ops2_ana_admin_load_v1()`, `ops2_ana_admin_save_draft_v1(p_configuration jsonb, p_expected_revision bigint, p_note text)`, `ops2_ana_admin_publish_v1(p_test_run_id uuid, p_note text)`, `ops2_ana_admin_rollback_v1(p_version_id bigint, p_note text)`, and `ops2_ana_active_config_v1()`.

- [ ] **Step 1: Write schema contract assertions** for singleton uniqueness, immutable versions/events, valid draft/published state, RPC execute grants, and SQL mirror equality.
- [ ] **Step 2: Run `node scripts/test-whatsapp-ana-admin-schema-v1.mjs`** and confirm it fails because the ANA admin schema/migration do not exist yet.
- [ ] **Step 3: Add the migration, RPCs, and seed** the initial draft/published document from the current hard-coded ANA behavior. Restrict direct writes and RPC execution to server-side service role; enforce draft revision checks and atomic publish/rollback.
- [ ] **Step 4: Run the schema test** and require PASS, including byte-for-byte equality between the migration and its `supabase/sql/` mirror.
- [ ] **Step 5: Create `ana-central-admin-ci.yml` for Node 22 with the schema test command** and run that command locally.

---

### Task 2: Shared ANA configuration and deterministic trigger policy

**Files:**
- Create: `supabase/functions/_shared/ana-admin-config-v1.mjs`
- Create: `scripts/test-whatsapp-ana-admin-config-v1.mjs`
- Modify: `supabase/functions/_shared/ana-policy-v1.mjs`

**Interfaces:**
- `validateAnaConfiguration(configuration) -> {ok, errors[]}` validates supported style controls, required safety text, bounded list sizes, trigger actions, channel scopes, and scenario expectations.
- `evaluateAnaTriggers(configuration, inboundText, channel) -> {matched, triggerKey, action, responseText, labelKey}` uses normalized exact/phrase rules and deterministic priority ordering.
- `buildAnaRuntimeInstructions(configuration)` produces model instructions from protected base policy plus supported published style controls; it does not allow the draft to weaken protected safety rules.
- Trigger actions are only `fixed_reply`, `label`, or `handoff`; no order/cadastre/payment action is representable.

- [ ] **Step 1: Write tests** for invalid configs, unsafe actions, text normalization, overlapping trigger priority, channel scoping, empty matches, protected-policy retention, and reply length.
- [ ] **Step 2: Run `node scripts/test-whatsapp-ana-admin-config-v1.mjs`** and confirm failures for missing exports.
- [ ] **Step 3: Implement the schema validator, trigger evaluator, and protected instruction builder** in the shared policy module.
- [ ] **Step 4: Run the config tests** and require PASS.

---

### Task 3: Authenticated Admin management actions

**Files:**
- Modify: `supabase/functions/admin-whatsapp-ana-preview-v1/index.ts`
- Create: `scripts/test-whatsapp-ana-admin-api-v1.mjs`
- Modify: `.github/workflows/ana-central-admin-ci.yml`

**Interfaces:**
- Extend the existing endpoint with actions `admin_load`, `admin_save_draft`, `admin_publish`, `admin_rollback`, `admin_set_channel`, `admin_test`, and `admin_history`; retain existing preview/review/metrics contracts unchanged.
- Every action authenticates the bearer with Supabase Auth and checks active `admin_users` membership/role before server-side RPC access.
- Editors may save drafts and run tests. Only Admin users with role `owner` may publish, roll back, or toggle channel ANA state.
- The channel mutation updates only `whatsapp_channel_runtime_v1.ana_enabled`; all other channel switches remain untouched.

- [ ] **Step 1: Write API contract tests** for missing/invalid sessions, inactive/non-admin users, viewer/editor/owner role matrix, action schemas, publication guards, and existing preview response compatibility.
- [ ] **Step 2: Run `node scripts/test-whatsapp-ana-admin-api-v1.mjs`** and confirm failure on missing management actions.
- [ ] **Step 3: Add the management actions** using the existing authenticated endpoint, role checks, dedicated RPCs, and sanitized error responses.
- [ ] **Step 4: Run API contract tests** and require PASS.
- [ ] **Step 5: Add the API test to `ana-central-admin-ci.yml`.**

---

### Task 4: Live worker consumes published behavior safely

**Files:**
- Modify: `supabase/functions/whatsapp-ana-worker-v1/index.ts`
- Modify: `supabase/functions/_shared/ana-policy-v1.mjs`
- Create: `scripts/test-whatsapp-ana-admin-worker-v1.mjs`
- Modify: `.github/workflows/ana-central-admin-ci.yml`

**Interfaces:**
- Worker reads one active configuration snapshot through `ops2_ana_active_config_v1()` for each claimed job (or a bounded cache that is invalidated by active-version changes).
- The published `behavior` settings shape the safe response style; published `knowledge[]` are supplied as explicitly labeled authoritative facts.
- Deterministic triggers run before AI. Any `fixed_reply` or `handoff` result uses the existing live-job status, gate recheck, Meta outbox, WAMID acceptance, and canonical-message persistence path.
- Invalid/missing configuration results in human handoff and no Meta send.

- [ ] **Step 1: Write worker tests** for published-version selection, grounding, trigger precedence, channel matching, human takeover race, duplicate inbound, config fetch/validation failure, and no Meta send on handoff.
- [ ] **Step 2: Run `node scripts/test-whatsapp-ana-admin-worker-v1.mjs`** and confirm failure for missing config integration.
- [ ] **Step 3: Integrate the active published configuration and trigger routing** while preserving both AI gates and the existing outbox acceptance contract.
- [ ] **Step 4: Run worker tests plus existing `test-whatsapp-ana-worker-v1.mjs`, `test-whatsapp-ana-live-policy-v1.mjs`, and `test-whatsapp-ana-live-release-v1.mjs`; require PASS.**
- [ ] **Step 5: Add the new worker contract test to the ANA CI workflow.**

---

### Task 5: ANA section in the Vitrine Admin

**Files:**
- Modify: `vitrine/admin/index.html`
- Create: `vitrine/admin/ana/ana-admin.js`
- Create: `vitrine/admin/ana/ana-admin.css`
- Create: `scripts/test-admin-ana-section-v1.mjs`
- Modify: `.github/workflows/ana-central-admin-ci.yml`

**Interfaces:**
- Add a top-level `data-tab="ana"` navigation item and render the ANA manager as a single-page tab in the existing Admin shell; dynamically load `vitrine/admin/ana/ana-admin.js` into `#content`.
- The page exposes the five approved areas: Visão geral, Comportamento, Conhecimento, Gatilhos, Testes e histórico.
- The module calls only the authenticated `admin-whatsapp-ana-preview-v1` endpoint and never accesses private database tables directly.
- All UI copy is in Brazilian Portuguese; labels and status indicate draft versus active published version.

- [ ] **Step 1: Write UI contract tests** for sidebar routing, responsive navigation, all five sections, role-based controls, draft/published state, simulator no-send warnings, and marketing separation.
- [ ] **Step 2: Run `node scripts/test-admin-ana-section-v1.mjs`** and confirm it fails because the ANA route/module is absent.
- [ ] **Step 3: Add the sidebar entry and focused ANA module** with loading/error/empty states, accessible forms, confirmations for publish/rollback/channel toggles, and draft autosave guarded by revision.
- [ ] **Step 4: Run UI contract tests plus `test-admin-sidebar-v9.py` and existing ANA preview-button tests; require PASS.**
- [ ] **Step 5: Add UI contract test to the ANA CI workflow.**

---

### Task 6: Simulator, regression history, CI, and staged production cutover

**Files:**
- Modify: `supabase/functions/admin-whatsapp-ana-preview-v1/index.ts`
- Modify: `supabase/migrations/20261007_whatsapp_ana_admin_v1.sql`
- Modify: `supabase/sql/20261007_whatsapp_ana_admin_v1.sql`
- Modify: `vitrine/admin/ana/ana-admin.js`
- Modify: `.github/workflows/ana-central-admin-ci.yml`
- Create: `scripts/test-ana-central-admin-ci-v1.mjs`

**Interfaces:**
- `admin_test` evaluates the current draft against a capped set of synthetic test cases using the same policy/trigger path as production; it never sends to WhatsApp.
- Each test run stores only version/revision, scenario keys, pass/fail counts, safe reasons, latency, and actor; do not persist customer identifiers or conversation text.
- Publish requires current draft revision, passing schema validation, and all required scenarios passing; stale or failed test runs cannot publish.
- History combines version/audit events with privacy-minimized live job outcomes and the existing review ledger.

- [ ] **Step 1: Write final workflow contract tests** for stale test-run rejection, simulated trigger replies, AI handoff cases, history privacy, and no-send guarantee.
- [ ] **Step 2: Run `node scripts/test-ana-central-admin-ci-v1.mjs`** and confirm it fails before the final integration exists.
- [ ] **Step 3: Implement the simulator/history contracts and add the final test command to the existing CI workflow**; cap test cases per run and return safe errors.
- [ ] **Step 4: Run all four new ANA admin tests, existing ANA worker/preview/review tests, and the attendance Admin integration tests. Require all to PASS.**
- [ ] **Step 5: Verify the SQL mirror, edge function syntax, and complete CI workflow locally.**
- [ ] **Step 6: After PR CI passes and the change is merged, apply the backwards-compatible migration first and verify the seed matches current live behavior. Then deploy the updated existing Edge Functions and confirm channel and campaign switches remain unchanged.**
- [ ] **Step 7: Verify production with synthetic simulator cases and the company-owned isolated number only; inspect ANA job/outbox/message records for correct handoff or single canonical send before closing the rollout.**

---

## Plan Self-Review

- Schema and atomic publication: Task 1.
- Safe behavior controls and deterministic triggers: Task 2.
- Auth, roles, and channel controls: Task 3.
- Live published configuration and send gates: Task 4.
- Five-tab Admin section and usability: Task 5.
- No-send testing, privacy-minimized history, CI, migration, and cutover: Task 6.
- Review-focus failure cases are explicitly tested in Tasks 1–6; no test case requires a real customer.
- No new Edge Function or marketing control is introduced.
