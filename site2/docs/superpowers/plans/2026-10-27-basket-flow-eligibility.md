# Basket Flow Eligibility Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement inline. Steps use checkbox syntax for tracking. Automated tests are excluded by the project instruction; use focused static checks and manual source review.

**Goal:** Make Admin Flow readiness use the same product eligibility contract as the greenfield Flow sender.

**Architecture:** Add `is_whatsapp_active` to the existing basket editor RPC JSON, map it through the server repository, and compute UI warnings from active + WhatsApp-active + HTTPS-photo state. Align the database snapshot's maximum at eight options per position.

**Tech Stack:** PostgreSQL/Supabase migration, Next.js server repository and Server Components, TypeScript, Biome.

**Spec:** `docs/superpowers/specs/2026-10-27-basket-flow-eligibility-design.md`.

## Global Constraints

- Canonical Supabase project is `ssbesxgaijknwsjbsbcz`.
- Production Supabase remains read-only; do not apply this migration remotely.
- Do not add tests or run test suites; the project instruction permits focused static checks only.
- Do not send WhatsApp messages, call write APIs, enable Bling fiscal, or publish a Flow.
- Product cost, stock internals, hidden adjustments, metadata and secrets stay server-side.

## Review Focus

- Old RPC payload without `is_whatsapp_active`: treat the option as not verified for Flow, and keep the migration gate visible.
- Active product with WhatsApp disabled: count it as ineligible and show the correct UI status.
- Product with invalid/missing HTTPS image: do not count it as Flow-ready.
- Position with zero eligible alternatives: show a catalog issue and link to basket editing.
- Snapshot with 9–20 options: reject it consistently with the sender's eight-option ceiling.

---

### Task 1: Extend the existing editor RPC safely

**Files:**
- Create: `supabase/migrations/20261027211839_basket_flow_eligibility_v1.sql`
- Modify: `supabase/migrations/20261027211631_whatsapp_order_intake_foundation_v1.sql`

**Interfaces:**
- `public.basket_mold_editor_v1(uuid)` keeps returning its existing JSON object and adds `positions[].options[].is_whatsapp_active: boolean`.
- The snapshot session validator accepts 1–8 options per position, matching `whatsapp-flow-session-open-v1`.

- [x] Preserve the current function language, volatility, search path, caller grants and `SECURITY INVOKER` behavior while adding the boolean key.
- [x] Keep the authenticated admin wrapper as the only app-facing execution path; do not grant the internal function to `authenticated`.
- [x] Change the private snapshot position limit from 20 to 8.
- [x] Review the migration text and compare all existing keys/security attributes with the live read-only definition recorded in the spec.

### Task 2: Use Flow eligibility in the Admin projection

**Files:**
- Modify: `src/lib/supabase/admin-basket-molds.ts`
- Modify: `src/app/(admin)/cestas/[basketId]/mold-editor.tsx`
- Modify: `src/app/(admin)/page.tsx`

**Interfaces:**
- `BasketMoldProductOption` carries `active` and `whatsappActive` separately.
- `BasketMoldPhotoAudit.positionsWithoutActiveOption` counts positions with no active, WhatsApp-active option.
- `BasketMoldPhotoAudit.activeOptionsWithoutPhoto` counts Flow-eligible products missing a safe HTTPS URL.

- [x] Parse the new JSON field without changing any browser request or save payload.
- [x] Show cadastro and WhatsApp states separately on the mold editor.
- [x] Compute the audit using `active && whatsappActive` and safe HTTPS URL validation.
- [x] Keep the dashboard call to `/cestas` visible only when readiness needs correction; explain empty positions separately from missing photos.

### Task 3: Record and verify the local change

**Files:**
- Modify: `docs/planning/implementation-ledger.md`
- Modify: `docs/planning/staging-cutover.md`

- [x] Record the live evidence, exact migration/function change, and that production remains unchanged.
- [x] Run `pnpm exec tsc --noEmit`.
- [x] Run focused Biome checks on the changed TS/TSX files and `git diff --check`.
- [x] Leave Flow Validator, staging replay, deploy, WhatsApp, Bling writes, and NF-e as outstanding gates.

## Implementation note — 27/10/2026

- The checked-in migration is not applied to Supabase. Without the new JSON field, the UI fails closed, marks the options as unverified, and keeps the rollout dependency visible; do not deploy the matching UI before the migration in staging.
- Static verification: `pnpm exec tsc --noEmit` passed; focused Biome passed for the three changed TS/TSX files; CSS check retained the 25 repository warnings and reported no warning for the new selectors; `git diff --check` passed with only the repository's existing LF/CRLF normalization warnings. No automated tests, database migration, Edge deploy or external write was run.
