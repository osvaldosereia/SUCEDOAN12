# Product Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let authorized catalog staff upload a product photo from its Admin detail page into the canonical `product-images` bucket and save the canonical public URL to `products.image_url`.

**Architecture:** A server action validates a small JPEG/PNG/WebP file, requests a one-use signed upload token from a new authenticated Supabase Edge Function, uploads the bytes server-to-server, then asks that function to verify the stored object and update the product plus its audit log. The signed token and service credentials never reach the browser; the upload uses a new unique path and does not replace or delete the previous object.

**Tech Stack:** Next.js Server Actions, `@supabase/ssr`, Supabase Edge Functions, Supabase Storage, existing Admin gateway/session patterns.

**Spec:** `docs/planning/caderno-tecnico.md` (current product-image ruling and Flow image caveat), `docs/planning/plano-execucao.md` (canonical project and retired image gateways), and `docs/planning/implementation-ledger.md` (last completed product-editor slice).

## Global Constraints

- Canonical backend is Supabase project `ssbesxgaijknwsjbsbcz`; do not write to other projects.
- Reuse bucket `product-images`; do not create a bucket, table, or broad Storage write policy.
- Match the existing bucket contract: JPEG, PNG, or WebP, maximum 500,000 bytes, public read.
- The browser may use only the publishable key; the service-role key stays inside the Edge Function.
- Authorize using a verified Auth user plus active `admin_users` membership; only `owner`, `admin`, and `catalog_manager` may change images.
- Save only the server-derived Storage public URL to `products.image_url`; do not accept arbitrary URLs from the form.
- Do not delete Storage objects in this slice; without a durable upload-attempt record, a failed or replayed finalize cannot safely prove that a path is unreferenced.
- Do not claim that a saved URL proves display in each Flow option. The general runtime currently omits option images; the image-bearing canary and both WABA routes still need validation.
- Do not deploy the Edge Function, apply remote SQL, publish a Flow, send WhatsApp messages, or change Bling in this slice.
- Do not add or run automated tests in this slice; run focused typecheck, lint, and diff checks only.

## Review Focus

- Missing or invalid session: reject before any Storage or product write.
- Inactive staff or a role outside the image-editor allowlist: return forbidden.
- File over 500,000 bytes or MIME/content-signature mismatch: reject before upload and reject again at finalize.
- Product changed while upload is in progress: compare the original `image_url` and return a conflict without overwriting the newer value.
- Storage upload, product update, or audit write failure: show an actionable error; if audit write fails after update, attempt a guarded rollback and log any rollback failure.

---

### Task 1: Add the narrow authenticated image gateway

**Files:**
- Create: `supabase/functions/admin-product-image-v1/index.ts`
- Modify: `supabase/config.toml`
- Modify: `tsconfig.json`

**Interfaces:**
- `POST /functions/v1/admin-product-image-v1?action=prepare` accepts `{ product_id: UUID, mime_type: "image/jpeg" | "image/png" | "image/webp" }` and returns `{ ok: true, path: string, token: string, expected_image_url: string | null }`.
- `POST /functions/v1/admin-product-image-v1?action=finalize` accepts `{ product_id: UUID, path: string, expected_image_url: string | null }` and returns `{ ok: true, image_url: string }`.
- Both actions require a valid Bearer token, an existing active `admin_users` row, and role `owner`, `admin`, or `catalog_manager`.

- [x] Scaffold the Edge Function with `pnpm exec supabase functions new admin-product-image-v1 --auth user` after checking the available CLI flags.
- [x] Set `verify_jwt = true` for this function in `supabase/config.toml`.
- [x] Implement the shared auth guard with `auth.getUser(token)` and service-side `admin_users` lookup; never trust role claims from user metadata.
- [x] Implement `prepare`: require the product, capture its current `image_url`, create a random `products/<product-uuid>/<file-uuid>.<extension>` path, and call `createSignedUploadUrl` with overwrite disabled.
- [x] Implement `finalize`: require the exact product path shape, download the object, enforce size and byte-signature/type consistency, derive the public URL from the fixed bucket, and update `products.image_url` only if it still equals `expected_image_url` (use `IS NULL` when null).
- [x] Update `last_admin_edit_at` and `last_admin_edit_by` with the verified operator; insert `admin_audit_logs` action `product_image_updated`, entity type `product`, and details containing the bucket/path and prior/new URL state.
- [x] If audit insertion fails, attempt rollback guarded by the just-written URL and this attempt's editor timestamp/user; return a clear failure and log when rollback also fails.
- [x] Exclude `supabase/functions/**` from the Next.js TypeScript compilation because it uses the Deno Edge Runtime.

### Task 2: Orchestrate image upload from the product detail page

**Files:**
- Create: `src/lib/supabase/admin-product-images.ts`
- Create: `src/app/(admin)/produtos/[id]/image-actions.ts`

**Interfaces:**
- `saveAdminProductImage(input: { productId: string; file: File }): Promise<{ ok: true } | { ok: false; error: "not_configured" | "not_authenticated" | "not_authorized" | "invalid_file" | "conflict" | "unavailable" }>`.
- Server helper calls only the new Edge Function using the session Bearer token and publishable API key, then uses `uploadToSignedUrl(path, token, file, { contentType })` server-side. The Edge Function set `upsert: false` when creating the signed token; the token is never returned to the browser.

- [x] Validate UUID, declared MIME, 500,000-byte size, and JPEG/PNG/WebP magic bytes in the Server Action before requesting a signed token.
- [x] Call `prepare`, upload bytes through the signed token, then call `finalize` with the expected original URL returned by `prepare`.
- [x] Map 401/403/409 and network failures to stable UI-safe errors; never return internal Supabase details.
- [x] Revalidate `/produtos` and `/produtos/[id]` only after a successful finalize.

### Task 3: Add the simple photo editor to the product page

**Files:**
- Create: `src/app/(admin)/produtos/[id]/product-image-editor.tsx`
- Modify: `src/app/(admin)/produtos/[id]/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/(admin)/produtos/[id]/product-editor.tsx`

- [x] Add an accessible single-file chooser with accepted MIME types, 500 KB guidance, pending state, and concise success/error feedback.
- [x] Show the saved image preview and preserve the current no-photo state.
- [x] Update explanatory copy so it says the image URL feeds Flow configuration but does not claim each option currently renders it or publish a Flow.
- [x] Keep price/status editing and image upload as separate forms/actions.

### Task 4: Record the verified contract and remaining Flow gate

**Files:**
- Modify: `docs/planning/caderno-tecnico.md`
- Modify: `docs/planning/plano-execucao.md`
- Modify: `docs/planning/implementation-ledger.md`

- [x] Record the canonical bucket contract, signed-upload design, exact authorization, product field, audit trail, and no-delete behavior.
- [x] Record that `admin_basket_flow_configuration_v1()` sources each option's `image_url` from `products.image_url`.
- [x] Keep the delivery gate open: `whatsapp-flow-runtime` v5 omits images from choice options; `whatsapp-1018-basket-flow-v1` v7 is canary-only; verify the official Meta component contract and both WABAs before claiming photo-per-option is complete.
- [x] Record that this slice is local only and has not deployed an Edge Function or written remote data.

### Task 5: Run focused local checks

- [x] Run `pnpm typecheck`.
- [x] Run `pnpm lint`.
- [x] Run `git diff --check` and inspect the final diff/status to ensure no unrelated user changes were altered.
