# Basket Mold Admin Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement inline. Steps use checkbox syntax. Automated tests are excluded by the project instruction; use only focused static checks and manual source review.

**Goal:** Make `/cestas` accurately list the Flow basket molds and let authorized staff edit product alternatives in each position through the existing Supabase gateway.

**Architecture:** Keep Supabase calls in a `server-only` repository. Use `admin-basket-molds-v1` list/editor/products/save actions with the user's Supabase access token. The browser submits only basket/position/product IDs and an opaque snapshot revision; the server re-reads and preserves internal metadata and commercial adjustments before calling the existing atomic mold-save RPC.

**Tech Stack:** Next.js App Router Server Components and Server Actions, React client component for the draft editor, existing Supabase SSR client and Admin gateways, Biome.

**Spec:** `docs/superpowers/specs/2026-10-27-basket-mold-admin-design.md`.

## Global Constraints

- Canonical Supabase project is `ssbesxgaijknwsjbsbcz`.
- The original basket-mold editor does not create tables or alter product data. The later Flow-eligibility follow-up is separately planned in `2026-10-27-basket-flow-eligibility.md` and only adds a field to the existing internal editor RPC projection.
- Do not return raw payloads, `metadata`, cost, stock internals, or hidden adjustments as customer-facing content.
- Product options added by staff must be active, WhatsApp-active, have an HTTPS photo and a valid current sale price.
- Flow send remains disabled until staging, Meta validation and both WABA gates are complete.
- No automated tests in this slice; run focused TypeScript, Biome and diff checks only.

## Review Focus

- Viewer role or expired session: do not allow a save; the existing gateway is the authority.
- Old editor snapshot: return a conflict notice and ask the operator to reload.
- Duplicate product IDs, unknown position IDs or invalid product IDs: reject before mutation.
- Product detail unavailable or missing WhatsApp activation/photo/current price: reject adding that product and preserve the existing draft.
- Gateway product search includes `cost` and stock fields: project them out before any page/client serialization.
- Existing hidden adjustment/conditional rules and JSON metadata: preserve from the fresh server-side editor response, never accept edited values from the browser.

---

### Task 1: Add a safe repository for real basket molds

**Files:**
- Create: `src/lib/supabase/admin-basket-molds.ts`

**Interfaces:**
- `getAdminBasketMoldList(): Promise<BasketMoldResult<BasketMoldSummary[]>>` calls `action=list`; it returns active, non-legacy templates with safe summary fields.
- `getAdminBasketMoldEditor(basketId: string)` calls `action=editor`; the editor RPC omits activity/category names, so the repository joins the safe list projection for those labels. Metadata remains internal.
- `searchAdminBasketMoldProducts(query: string)` calls `action=products`, caps query/results and projects id/name/SKU/HTTPS photo/activity only. The underlying RPC's `price` is not guaranteed to include an offer and also returns cost/stock, so the search never serializes those fields or claims that price as sale price. A product detail read supplies the current sale price for validation.
- `saveAdminBasketMoldOptions(input: SaveBasketMoldInput)` re-reads the mold, compares the opaque revision, validates exact position coverage and unique IDs, rechecks every product in each changed position, enforces 1–8 eligible Flow alternatives there, preserves current category/name/quantity/hidden settings and metadata server-side, then calls `action=save`.

- [x] Implement a common authenticated gateway request helper using the current Supabase session and publishable key; map auth/network/provider failures to stable internal error codes.
- [x] Implement strict safe mappings for list/editor/product search, including HTTPS-only image URLs and integer money bounds.
- [x] Implement a canonical recursive key sorter and SHA-256 revision digest that is safe to send to the browser and changes when any server-side editor state changes.
- [x] Implement save preparation that accepts only per-position ordered `productIds`, preserves category/name/quantity/hidden/conditional values and metadata from a fresh read, and verifies new product details.
- [x] Record the gateway/version evidence and the non-atomic concurrency limitation in the implementation ledger.

### Task 2: Add authenticated search and save actions

**Files:**
- Create: `src/app/(admin)/cestas/actions.ts`

**Interfaces:**
- `searchBasketMoldProductsAction(query: string): Promise<SafeProductSearchResult>` returns only fields already allowlisted by the repository.
- `saveBasketMoldOptionsAction(input: FormData): Promise<{ ok: true } | { ok: false; error: BasketMoldSaveError }>` validates IDs/revision/positions, revalidates admin session, and calls the repository writer.

- [x] Validate the basket UUID, opaque revision format, maximum position count (80), maximum alternatives per position (40 gateway ceiling), unique positions/products and JSON byte size before any request.
- [x] Do not accept labels, quantity, category, prices, hidden adjustment, conditional rule, metadata, or operator identity from the browser; derive/preserve them server-side.
- [x] Revalidate `/cestas` and `/cestas/[basketId]` after successful save only.
- [x] Map conflicts, permission errors and missing-photo/product errors to concise Portuguese copy without provider messages.

### Task 3: Replace the stale read-only source with mold list and editor

**Files:**
- Modify: `src/app/(admin)/cestas/page.tsx`
- Create: `src/app/(admin)/cestas/[basketId]/page.tsx`
- Create: `src/app/(admin)/cestas/[basketId]/mold-editor.tsx`
- Modify: `src/app/globals.css`

- [x] Replace `admin-basket-configuration-v1?action=flow_list` as the page's main data source with the actual mold list gateway.
- [x] List basket name/category/subcategory, mold status, and a clear **Editar alternativas** link; show safe unavailable/empty states. Templates with no mold stay visibly pending because this editor intentionally does not create positions.
- [x] Build a single, low-friction editor for all real positions: show position label/order, existing product photo/name/SKU/activity, and add/remove controls while preserving option order.
- [x] Show fixed and conditional extra only as “ajuste interno” for staff and keep it out of all customer summary/output.
- [x] Search candidates on demand through a server action; verify active, WhatsApp-active, HTTPS image and current sale price both when adding and again before save; never display cost/stock internals.
- [x] Mark positions without an active HTTPS-photo option as an immediate catalog issue, and state that WhatsApp activation/current price and Meta rendering have separate checks.
- [x] Use save, pending/success/conflict/error notices; preserve the draft on validation failure.
- [x] Keep the established Loja Integrada-like spacing, labels and simple cards; no UI library was added.

### Task 4: Update planning notes and run focused static checks

**Files:**
- Modify: `docs/planning/plano-execucao.md`
- Modify: `docs/planning/caderno-tecnico.md`
- Modify: `docs/planning/implementation-ledger.md`

- [x] Correct statements that describe the old `flow_list` projection as the effective mold editor; identify the actual list/editor/save RPCs.
- [x] Record the current aggregate: 5 active WhatsApp baskets, 118 active positions, 203 eligible options with HTTPS photos and prices, 21 positions with no eligible option, and max 8 eligible options.
- [x] Record local-only status, unchanged production and unresolved staging/Meta validation gates.
- [x] Run `pnpm typecheck`, focused `pnpm exec biome check` for changed TS/TSX, and `git diff --check`.
- [x] Inspect the diff to verify no metadata, product costs, secrets, or user data reaches the browser.

## Implementation note — 27/10/2026

- The v21 gateway executes `admin_basket_mold_list_v1`, `admin_basket_mold_editor_v1`, `admin_basket_mold_products_v1` and `admin_save_basket_mold_v3`; `save` delegates the positions/options replacement to the transaction-backed writer. No DDL was needed.
- The product search RPC returns `price`, `cost`, and stock projections but lacks the final WhatsApp readiness fields. The app drops cost/stock and ignores search price; product detail is the authoritative add/save check.
- The save RPC has no revision argument. The server performs compare-before-write and prevents stale tabs in the normal case, but a small race remains between reread and transaction. A future atomic compare-and-save RPC is the correct resolution.
- A changed position is reread at product-detail level and must retain at least one and no more than eight eligible options. Other pre-existing positions are not altered or revalidated by an unrelated edit; the sender continues to enforce its own full-flow gate.
