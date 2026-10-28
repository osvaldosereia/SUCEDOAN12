# Integration Status Readiness Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement inline. Steps use checkbox syntax for tracking.

**Goal:** Make `/configuracoes` show a truthful, simple connection summary without exposing secrets or initiating integrations.

**Architecture:** Keep all Supabase gateway calls in a `server-only` helper. Read only `GET admin-products-live-v1?action=bling_status`, validate a narrow response projection, and render the result from the existing Server Component. Leave Meta in per-WABA validation-pending state until its read contract is implemented.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase SSR, existing canonical Admin gateway.

**Spec:** `docs/planning/caderno-tecnico.md` sections 11, 21 and 25; `docs/planning/plano-execucao.md` integration gateway inventory.

## Global Constraints

- No credential, raw gateway payload, customer data, or internal metadata reaches the browser.
- This slice performs no OAuth start, Meta write, Bling write, fiscal action, migration, deploy, or message send. The new Meta request is a bounded read-only Graph check.
- Never describe a historical OAuth timestamp as proof that the current Bling token works.
- Do not add or run automated tests; use the project typecheck, targeted lint, and diff checks only.

## Review Focus

- The gateway returns extra private/internal fields: expose only booleans and validated timestamps needed by this page.
- An old successful timestamp can be mistaken for a current health check: label it as the last recorded check.
- Missing session, permission, or network errors must render a neutral state without raw error detail.
- Meta API mode is known from the owner; per-WABA status is validated only by the explicit safe check in Task 2.
- Fiscal safe-off must remain visible and cannot be changed from this screen.

---

### Task 1: Show safe integration readiness

**Files:**
- Create: `src/lib/supabase/admin-integrations.ts`
- Modify: `src/app/(admin)/configuracoes/page.tsx`
- Modify: `src/app/globals.css` only if existing card styles cannot fit the status details.
- Modify: `docs/planning/implementation-ledger.md`

**Interfaces:**
- `getBlingIntegrationReadiness(): Promise<BlingIntegrationResult>` reads the authenticated existing gateway and returns only `hubEnabled`, `lastOAuthOkAt`, `lastReadOnlyOkAt`, and `fiscalSafeOff`, or one of the existing generic connection errors.
- The page remains a Server Component and receives no raw gateway JSON or token values.

- [x] Implement the server-only reader using a no-store GET and strict parsing; handle 401, 403, missing fields, and network failures generically.
- [x] Render Supabase as authenticated for this page, Meta as separately pending for `0975` and `1018`, and Bling with historical timestamps/fiscal safe-off when present.
- [x] Record the design ruling and evidence in the implementation ledger.
- [x] Run `pnpm typecheck`, targeted Biome checks, and `git diff --check`; do not add or run tests.

### Task 2: Verify Meta phone-to-WABA mapping with a read-only Graph request

**Files:**
- Create: `supabase/functions/meta-account-readiness-v1/index.ts`
- Create: `supabase/functions/meta-account-readiness-v1/deno.json`
- Modify: `supabase/config.toml`
- Modify: `src/lib/supabase/admin-integrations.ts`
- Modify: `src/app/(admin)/configuracoes/page.tsx`
- Modify: `docs/planning/staging-cutover.md`, `docs/planning/implementation-ledger.md`

**Contract:** Admin Server Component sends only `whatsapp_account_id` and the caller's Supabase access token. The Edge Function revalidates the user and `owner`/`admin`/`catalog_manager` role, loads `whatsapp_accounts` server-side, maps only the two approved slugs to their matching token suffix, requires explicit `META_GRAPH_API_VERSION`, calculates `appsecret_proof`, then reads `/{WABA-ID}/phone_numbers`. Follow cursor pagination with a small hard cap and never follow a provider-supplied URL. A result is connected only when the exact registered phone ID is present and its normalized display number equals the account's saved E.164 number.

**Response:** Browser receives only an allowlisted status, `verified_name`, normalized quality enum, and check timestamp. It never receives tokens, app secrets, WABA/phone IDs, Graph URL, raw provider response, or customer data. The status describes only this read check; it does not claim webhook, send, catalog, Flow publication, or message-quality health.

**Safety:** POST only, bounded body/response, JWT and active staff-role recheck, channel allowlist, strict decimal Meta IDs, fixed Graph origin/path, timeout, no-store, no writes, no migration, no deployment. Provider errors stay generic. No automated tests; perform targeted static/type checks only.

- [x] Implement the read-only Edge Function and safe typed Next.js adapter.
- [x] Show the per-number Graph result, check time, and optional Meta quality/name in Configurações.
- [x] Run targeted static checks and record the actual evidence and remaining limits. Deno 2.9.6 from the official release was placed outside the repository and its SHA-256 matched the published checksum; `deno check --frozen` passed for all 11 local Edge Functions. Runtime behavior and Graph credentials remain unverified because the new function is not deployed.
