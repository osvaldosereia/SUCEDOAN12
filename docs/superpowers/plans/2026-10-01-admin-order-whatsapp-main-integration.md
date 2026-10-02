# Admin Order WhatsApp Main Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the order WhatsApp and linked-registration UI into the current Admin without reverting newer `main` backend work.

**Architecture:** Keep the current production backend untouched and add only the missing Admin presentation/bindings. Prove the gap with a source-contract regression test, apply a deterministic minimal patch to `vitrine/admin/index.html`, then verify JavaScript syntax, repository checks, and the PR diff before merge.

**Tech Stack:** Static HTML/JavaScript Admin, Node.js source-contract tests, GitHub Actions, existing Supabase Edge Functions/RPCs.

**Spec:** `docs/superpowers/specs/2026-10-01-admin-order-whatsapp-main-integration-design.md`

## Global Constraints

- Preserve current `main` checkout and WhatsApp transport behavior.
- Reuse existing `order_whatsapp_send`, `order_registration_link_issue`, and `order_registration_link_status` contracts.
- Do not deploy Supabase unless verification proves a required contract is missing.
- Do not change PapoAI configuration or send messages to real customers.
- Public registration must use `order_token`, never a public `order_id`.

## Review Focus

- Provider unavailable: send button remains unavailable/explained rather than reporting success.
- Existing active registration link: UI does not silently replace it.
- Order without phone: registration/send controls stay safely disabled.
- Public link safety: no `/cadastro/?order_id=` path is introduced.
- Mainline preservation: no current checkout/transport backend code is reverted by the UI integration.

---

### Task 1: Regression test for the missing Admin UI

**Files:**
- Create: `scripts/test-admin-order-whatsapp-ui-integration.mjs`
- Create: `.github/workflows/verify-admin-order-whatsapp-ui-integration.yml`

**Interfaces:**
- Consumes: current `vitrine/admin/index.html`.
- Produces: a deterministic contract test that fails while the UI is absent and passes when the UI/bindings are present.

- [ ] **Step 1: Write the failing test** asserting the section copy, buttons, API action bindings, active-link guard, and absence of public `order_id` links.
- [ ] **Step 2: Run the test in GitHub Actions and verify it fails because the UI contract is absent.**
- [ ] **Step 3: Record the RED evidence before touching production UI.**

### Task 2: Port the missing UI into current `main`

**Files:**
- Modify: `vitrine/admin/index.html`
- Temporary implementation helper if needed: `scripts/patch-admin-order-whatsapp-ui-main.py`

**Interfaces:**
- Consumes: the current Admin order editor and existing backend API actions.
- Produces: `orderWhatsappRegistrationHtml`, status refresh/rendering, send/link issue handlers, link open/copy helpers, and editor event bindings.

- [ ] **Step 1: Apply the smallest deterministic patch based on the known-good feature branch UI.**
- [ ] **Step 2: Run the regression test and verify GREEN.**
- [ ] **Step 3: Parse every inline `<script>` in `vitrine/admin/index.html` with `new Function(...)`.**
- [ ] **Step 4: Run `git diff --check` in CI.**

### Task 3: Review, merge, and verify mainline

**Files:**
- No new product files unless review finds an Important/Critical defect.

**Interfaces:**
- Consumes: green PR branch.
- Produces: merged `main` with the Admin UI only, preserving newer backend work.

- [ ] **Step 1: Inspect the PR changed-file list and patch; reject unrelated backend rollback.**
- [ ] **Step 2: Confirm all PR checks are successful.**
- [ ] **Step 3: Merge with the verified head SHA.**
- [ ] **Step 4: Fetch `main` after merge and rerun/confirm the same source contract on the merged commit.