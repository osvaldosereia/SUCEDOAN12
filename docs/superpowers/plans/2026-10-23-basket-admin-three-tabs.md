# Cestas Admin Three Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver the approved three-tab basket configuration in Vitrine Admin with safe persistence and ordered public alternatives.

**Architecture:** Add normalized administrative tables and admin-only Postgres RPCs, expose them through a JWT-forwarding Edge Function, and split the UI into shell, shared domain/API helpers, and one module per tab. Link the five existing active basket templates; keep new Doação and Família configuration-only until a commercial template is deliberately linked.

**Tech Stack:** Existing plain JavaScript Admin, Supabase Edge Functions (Deno + supabase-js), PostgreSQL SQL migration, Node 24 contract tests, current storefront-v2.

**Spec:** docs/superpowers/specs/2026-10-23-basket-admin-three-tabs-design.md

## Global Constraints

- Do not write directly to main.
- Do not apply the production migration or deploy an Edge Function in this implementation branch.
- Preserve existing baskets, mold rows, stock, prices, orders, tax data, and Bling behavior.
- Existing active store templates remain the only templates automatically visible to customers.
- All protected reads and writes go through authenticated, role-checked RPCs.
- Carousel alternatives remain subject to current active product and stock checks.
- Do not impose a fixed count limit on selected products per product type.

## Review Focus

- No linked commercial basket for Doação/Família: they remain editable but never become public templates.
- Zero quantity: persists as zero and removes the corresponding item from the basket composition.
- Product order ties or missing priority: deterministic sort_order, then stable product ID fallback.
- Product removed, deactivated, or out of stock: it cannot be offered to the customer, regardless of its saved priority.
- Admin viewer or missing JWT: reads/writes fail closed.

## Task 1: Contract tests and pure domain helpers

**Files:**
- Create: vitrine/admin/basket-admin-domain.js
- Test: scripts/test-basket-admin-three-tabs.mjs

- [ ] Test creation, validation, stable product ordering, zero quantities and no fixed product-array cap.
- [ ] Run the new test to verify it fails because the domain module is absent.
- [ ] Implement the pure domain helpers and verify the tests pass.

## Task 2: Normalized schema and authorization

**Files:**
- Create: supabase/migrations/20261023120000_basket_admin_three_tabs.sql
- Create: supabase/functions/admin-basket-configuration-v1/index.ts

- [ ] Add idempotent tables for basket types, product types, quantities and ordered product options.
- [ ] Seed the 7 requested basket types and 28 requested product types; link only the five existing active templates.
- [ ] Copy existing quantity and option data conservatively without deleting/renaming source rows.
- [ ] Add admin-authorized list/save RPCs. Keep RLS on and direct Data API access revoked.
- [ ] Allow zero quantities and arbitrary option counts while validating IDs, duplicate products, labels and integer order.
- [ ] Add contract checks for admin authorization and no destructive changes.

## Task 3: Three-tab Admin

**Files:**
- Modify: vitrine/admin/basket-admin-section.js
- Create: vitrine/admin/basket-admin-api.js
- Create: vitrine/admin/basket-admin-types.js
- Create: vitrine/admin/basket-admin-quantities.js
- Create: vitrine/admin/basket-admin-carousel.js
- Modify: vitrine/admin/index.html
- Modify: scripts/test-basket-mold-admin-v1.mjs

- [ ] Replace the exposed tabs with exactly three tabs and keep the existing Admin session bridge.
- [ ] Make type names/order/status editable; additions do not publish commercial templates.
- [ ] Render a responsive quantity matrix with Alimentos, Limpeza, Higiene and all defined basket types.
- [ ] Provide per-type product search, unlimited selections, explicit ordering, and clear 1º/2º/3º positions.
- [ ] Preserve independent legacy tools outside the new tab navigation until their remaining consumers are verified.
- [ ] Add focused browser/contract checks and verify no old tab or dead loader remains in the new shell.

## Task 4: Ordered carousel integration and verification

**Files:**
- Modify: supabase/functions/storefront-v2/index.ts
- Create: scripts/test-basket-admin-three-tabs.mjs
- Modify: .github/workflows/basket-mold-admin-ci.yml

- [ ] Save manual priority to the current mold position options for linked templates.
- [ ] Preserve stock filtering and pagination; return alternatives in saved priority order.
- [ ] Ensure existing saved selections outside the current page remain selectable as today.
- [ ] Run Node syntax checks, basket tests, git diff --check, and the repository Admin-runtime check.
- [ ] Open a draft PR; leave merge, production migration, deploy and public release gated on CI and staging end-to-end review.
