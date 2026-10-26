# WhatsApp Admin Stock, Customers, and Meta Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move sellable stock into the GitHub catalog, add secure customer/address CRUD to the new admin, and manage Flow deployments for both WhatsApp accounts.

**Architecture:** GitHub JSON remains the product/stock/basket source of truth; the Meta endpoint and checkout use that source. Existing customer tables are accessed only through the allowlisted server API and private Postgres connection. Meta Flow operations run server-side with secrets, distinct WABA targets, and an explicit irreversible publish confirmation.

**Tech Stack:** TypeScript, Vite, Supabase Edge Functions, postgres.js, GitHub App REST API, Meta Graph API.

**Spec:** `docs/superpowers/specs/2026-10-26-whatsapp-admin-stock-customers-meta-design.md`

## Global Constraints

- Preserve branch `project/whatsapp-atendimento-github-20261025`.
- Do not copy Vitrine Admin code or schemas.
- Do not expose Supabase service credentials, GitHub App private keys, or Meta access tokens to the browser.
- Keep client data and raw order IDs out of public GitHub history; stock values and opaque idempotency markers are public because the selected source of truth is the public repository.
- No Flow publication, deployment, migration application, or customer message during this local implementation.
- Flow quantity remains 1–6, limited to positive GitHub stock, with the removal option last.

## Ruling — stock changes during an open Flow (26/10/2026)

The pinned GitHub revision controls the quantity offered to the customer. A stock-only GitHub commit after the Flow opens does not invalidate otherwise unchanged business data; on confirmation the new decrement applies to the latest branch head and may produce negative stock. This follows the user's explicit confirmation that stock is deducted on order confirmation and may go negative. Commercial changes to products/baskets still reject the stale session. Cost if wrong: an older Flow can complete after another sale consumes its displayed stock, producing negative stock; the user accepts that oversell behavior.

## Review Focus

- Concurrent confirmations must not decrement GitHub stock twice for the same order.
- A stale Flow must not accept changed product/basket/pricing data; stock-only changes may produce negative balance on confirmation by explicit user decision.
- Customer phone/document uniqueness conflicts must return safe, actionable errors.
- Customer CRUD must not mutate system-owned order/marketing metrics or delete referenced records.
- Flow IDs, public keys, phone-number IDs, and WABA IDs must remain bound to the correct channel and never expose access tokens.

---

### Task 1: GitHub stock schema and product editor

**Files:**
- Modify: `projetos/whatsapp-atendimento-github/src/domain/catalog.ts`
- Modify: `projetos/whatsapp-atendimento-github/catalog/products.json`
- Modify: `projetos/whatsapp-atendimento-github/scripts/prepare_catalog.py`
- Modify: `projetos/whatsapp-atendimento-github/src/admin/main.ts`
- Modify: `projetos/whatsapp-atendimento-github/src/admin/flows-panel.ts`
- Modify: `projetos/whatsapp-atendimento-github/src/domain/flows.ts`

- [x] Add signed integer `stockQuantity` to schema v4, validator, importer, product editor, product cards, and administrative Flow preview.
- [x] Import a single current sellable-stock snapshot into GitHub once, after applying the previously documented sellable-stock rules; do not retain Supabase as a runtime inventory source.
- [x] Run `pnpm build`, validate the JSON and ensure every Flow quantity is bounded by `max(0, min(6, stockQuantity))`.

### Task 2: Runtime GitHub stock and idempotent order decrement

**Files:**
- Modify: `projetos/whatsapp-atendimento-github/supabase/functions/whatsapp-flow-runtime/index.ts`
- Modify: `projetos/whatsapp-atendimento-github/supabase/functions/whatsapp-checkout-webhook/index.ts`
- Create: `projetos/whatsapp-atendimento-github/supabase/functions/_shared/github-stock.ts`
- Remove: `projetos/whatsapp-atendimento-github/supabase/functions/_shared/sellable-stock.ts`
- Modify: `projetos/whatsapp-atendimento-github/README.md`
- Modify: `projetos/whatsapp-atendimento-github/CONTRACTS.md`

- [x] Source Flow limits from the pinned GitHub catalog commit only.
- [x] Reject Flow draft creation when product or basket data changed after the session opened; allow stock-only movement and use the latest GitHub head for the idempotent confirmation decrement.
- [x] User confirmed: at customer confirmation, stock is reduced; a resulting negative balance does not block the order or Bling.
- [x] At customer confirmation, commit stock reductions and an opaque idempotency marker atomically in one GitHub tree/commit; retry branch conflicts by reading the latest catalog and marker.
- [x] Allow the resulting stock to be negative and never block the later Bling sale/invoice path solely for negative stock.
- [x] Verify builds, catalog parse, idempotency and branch-conflict paths by focused code inspection, and diff hygiene; do not run automated tests.

### Task 3: Secure customer and address administration

**Files:**
- Create: `projetos/whatsapp-atendimento-github/src/domain/customers.ts`
- Create: `projetos/whatsapp-atendimento-github/src/admin/customers-panel.ts`
- Modify: `projetos/whatsapp-atendimento-github/src/admin/api.ts`
- Modify: `projetos/whatsapp-atendimento-github/src/admin/main.ts`
- Modify: `projetos/whatsapp-atendimento-github/supabase/functions/whatsapp-admin-api/index.ts`
- Modify: `projetos/whatsapp-atendimento-github/README.md`

- [x] Add allowlisted authenticated routes for customer search/detail/create/update and address mutations using existing tables and server-only database connection.
- [x] Return only explicit fields needed by the UI; never accept system metrics or overwrite them from the browser.
- [x] Create/edit one customer with primary WhatsApp and multiple addresses; deactivate customers/addresses instead of hard deletion.
- [x] Enforce required shipping fields and database uniqueness; convert constraint errors into conflict responses without exposing SQL or PII.
- [x] Verify the UI compiles; issue read-only schema/count verification only.

### Task 4: Per-WABA Flow discovery and deployment controls

**Files:**
- Modify: `projetos/whatsapp-atendimento-github/src/domain/flows.ts`
- Modify: `projetos/whatsapp-atendimento-github/src/admin/api.ts`
- Modify: `projetos/whatsapp-atendimento-github/src/admin/flows-panel.ts`
- Modify: `projetos/whatsapp-atendimento-github/src/admin/main.ts`
- Modify: `projetos/whatsapp-atendimento-github/supabase/functions/whatsapp-admin-api/index.ts`
- Modify: `projetos/whatsapp-atendimento-github/README.md`

- [ ] Configure the server-side Meta access tokens, endpoint, and channel-specific encryption keys for both distinct WABAs; keep all credentials server-only.
- [x] Add read-only Flow discovery/status and channel pairing per WABA/phone number.
- [x] Add create/upload/validate/update-endpoint/publish controls with explicit allowlist and per-operation confirmation; prevent publish on validation errors.
- [x] Preserve endpoint encryption configuration per phone number; report missing server secrets or channel metadata as blocked setup, not success.
- [x] Bind the verified published Flow to the selected channel in the new private schema; webhook and outbox use and recheck that binding rather than environment Flow IDs.
- [x] Keep actual Meta state untouched in this coding task and verify build/diff only.

### Task 5: Documentation and branch closeout

- [x] Update `HANDOFF.md`, implementation plan, README, and contracts to the latest architecture and exact deployment gates.
- [x] Run `pnpm build`, `git diff --check`, and no automated tests.
- [x] Fresh review of the final diff; commit and push the same branch after final verification.
