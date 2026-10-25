# R17 WhatsApp Flow Commerce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dynamic WhatsApp Flow order path to Dona Antônia V2, with server-authoritative pricing and idempotent order creation.

**Architecture:** Use a versioned Flow JSON plus Supabase Edge Functions for the encrypted Flow endpoint and signed Meta webhook. Read the current public catalog through the existing V2 projection and finalize through the existing checkout RPCs. Keep all Meta credentials server-side and all real transport disabled by default.

**Tech Stack:** TypeScript, React/Vite, Supabase PostgreSQL/RPC, Supabase Edge Functions (Deno Web Crypto), WhatsApp Cloud API Flows.

**Spec:** `docs/superpowers/specs/2026-10-25-whatsapp-flow-commerce-design.md`

## Global Constraints

- Work only inside `projetos/dona-antonia-v2/` on branch `agent/dona-antonia-r17-whatsapp-commerce`.
- Do not change `main`, deploy/publish, activate Meta transport, send customer messages, or modify legacy systems.
- Do not read or write Vitrine/Admin secrets, tables, functions, workflows, or automations.
- Never put Meta tokens, app secrets, or Flow private keys in browser code, committed files, SQL rows, or logs.
- Reuse `get_storefront_catalog`, `quote_storefront_order`, and `create_storefront_order`; prices and stock are server-authoritative.
- Flow responses carry only selections and customer inputs; do not trust client totals, SKU prices, or stock.
- Keep PR draft and do not merge; no new paid service, project, branch, or Meta asset.
- Tests must include malformed/untrusted webhook data, invalid sender/account, replay, and encrypted-envelope failures.

## Review Focus

- A repeated `nfm_reply` must return the same order via idempotency, never create a second order.
- A phone number in E.164 form must normalize to the V2 local 10/11-digit contract without dropping DDD 55 when it is local.
- Client-sent price/total fields must never reach the checkout payload.
- Invalid HMAC, missing/rotated private key, and malformed encrypted payload must fail closed.
- Catalog data may change between Flow screens and submit; final checkout must recalculate and reject unavailable items.
- Unknown Meta account IDs or flow tokens must not cross-link conversations or orders.

---

### Task 1: Flow submission contract

**Files:**
- Create: `src/application/whatsapp-flow.ts`
- Test: `src/application/whatsapp-flow.test.ts`

**Interfaces:**
- Consumes: Meta `nfm_reply.response_json`, sender phone, provider account, and message ID.
- Produces: validated `CheckoutOrderRequest` plus Flow token and idempotency key.

- [ ] Write tests for valid mapping, E.164 phone normalization, omitted prices, malformed JSON, invalid account/phone/token, and empty basket.
- [ ] Run `npm test -- src/application/whatsapp-flow.test.ts`; verify failures are caused by the missing parser/behavior.
- [ ] Implement only the parser and normalization needed by the tests.
- [ ] Re-run the focused test and the full `npm test` suite.

### Task 2: Flow envelope security

**Files:**
- Create: `src/server/whatsapp/flow-crypto.ts`
- Test: `src/server/whatsapp/flow-crypto.test.ts`

**Interfaces:**
- Consumes: raw webhook body, HMAC header, encrypted AES key, encrypted Flow data, IV, and a private key supplied at runtime.
- Produces: verified/decrypted request or a typed failure; encrypted response using the Flow protocol.

- [ ] Write tests using generated RSA keys and AES-GCM fixtures for valid decrypt/encrypt round-trip, signature acceptance/rejection, invalid key, IV/tag errors, and HTTP error mapping.
- [ ] Run the focused test and observe expected failures.
- [ ] Implement Web Crypto functions compatible with Node tests and Deno Edge Functions.
- [ ] Re-run focused and full unit tests.

### Task 3: Dynamic Flow screen controller

**Files:**
- Create: `src/application/whatsapp-flow-controller.ts`
- Test: `src/application/whatsapp-flow-controller.test.ts`
- Create: `supabase/functions/whatsapp-flow-endpoint/index.ts`
- Create: `supabase/config.toml` if absent, with public endpoint JWT checks disabled only for the Meta endpoint; signature/encryption checks remain mandatory.

**Interfaces:**
- Consumes: verified `INIT`, `data_exchange`, `BACK`, and `ping` actions plus a reader for the public V2 catalog.
- Produces: screen payloads with only active product options and no trusted price totals.

- [ ] Test each supported action, unsupported actions, unavailable catalog, and maximum payload sizes.
- [ ] Confirm the new controller tests fail before implementation.
- [ ] Implement the screen state machine and the thin Edge Function adapter.
- [ ] Run focused tests, full unit suite, typecheck, lint, format, architecture check, and build.

### Task 4: Flow completion webhook and checkout

**Files:**
- Create: `src/application/whatsapp-flow-submission.ts`
- Test: `src/application/whatsapp-flow-submission.test.ts`
- Create: `supabase/functions/whatsapp-meta-webhook/index.ts`
- Create or extend only V2 test fixtures as required.

**Interfaces:**
- Consumes: signature-verified Meta webhook message `interactive.nfm_reply`, selected V2 account, and a server-side checkout client.
- Produces: one order receipt from `create_storefront_order`, or a safe rejection/failure record.

- [ ] Test account-to-phone-number mapping, `nfm_reply` extraction, missing sender/token, replay, RPC rejection, and no duplicate orders.
- [ ] Observe expected test failures before implementation.
- [ ] Implement strict payload mapping and invoke the existing checkout RPC with a stable idempotency key.
- [ ] Ensure successful Flow response does not expose private basket adjustment or product-level basket prices.
- [ ] Run focused tests, full suite, DB migration tests, and build.

### Task 5: Versioned Flow definition and Inbox action

**Files:**
- Create: `src/server/whatsapp/flows/build-order.flow.json`
- Modify: `src/admin/features/inbox/PersistentInboxPanel.tsx`
- Modify: matching application/platform Inbox contracts and tests.
- Modify: relevant Inbox styles and E2E tests.

- [ ] Validate the Flow JSON against the current Meta Flow JSON version and component constraints.
- [ ] Test that the Inbox action can only queue an interactive Flow for an open conversation/account and reports disabled configuration clearly.
- [ ] Implement a server-only send adapter and the minimal Inbox action; never send through browser-side tokens.
- [ ] Run mobile/desktop E2E and accessibility checks.

### Task 6: Documentation and release gates

**Files:**
- Modify: `docs/STATUS_RODADAS_V2.md`
- Modify: `docs/CONTINUIDADE_WORK_RODADAS_V2.md`
- Add: isolated Flow setup/runbook documentation.

- [ ] Record code-complete, locally tested, connected, published, and Meta-homologated as separate states.
- [ ] Document required Supabase Function secrets by name only (no values), webhook registration, private-key setup/rotation, and rollback.
- [ ] Run `npm run check`, `npm test`, `npm run test:db`, `npm run lint`, `npm run format:check`, `npm run architecture:check`, `npm run build`, and `git diff --check`.
- [ ] Confirm no production deploy, Meta Flow publish, external send, or merge occurred.

