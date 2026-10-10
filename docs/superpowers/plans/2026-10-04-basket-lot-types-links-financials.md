# Basket Lot Types, Links and Financials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-lot business classification, an optional link to another ready lot, and a complete internal financial panel while preserving the existing hidden-value and original-basket stock rules.

**Architecture:** Extend `basket_stock_lots` with a business type and a generic linked-lot relation while retaining `linked_hygiene_lot_id` as a compatibility mirror. Commercial snapshots will distinguish the lot's own manual/component/hidden values from the effective combined values after a link. The Admin will calculate and display per-item and combined financials; the storefront/checkout will continue to consume the effective combined snapshots and linked ready lot without exposing costs.

**Tech Stack:** Supabase/PostgreSQL, Supabase Edge Functions (TypeScript), vanilla HTML/JS Admin, Node assertion/Playwright tests.

**Spec:** User requirements in the 2026-10-04 conversation for lot type, optional lot linking, hidden-value aggregation, and financial indicators.

## Global Constraints

- Lot types are exactly: `Cesta Básica Completa`, `Cesta Básica Só os Alimentos`, `Kit Limpeza e Higiene`, `Kit Limpeza`, `Kit Higiene`.
- Linking another lot is optional and must never allow self-link or a cycle.
- Effective product sale sum, manual commercial value and hidden adjustment must include the linked lot when present.
- Existing lots and checkout remain backward compatible with `linked_hygiene_lot_id`.
- Cost data and internal percentages must never be returned by the public storefront API.
- Existing rule remains: removing/reducing an original component turns the basket into loose rebuild; additions alone keep the original lot and extras separate.

## Review Focus

- Existing food/hygiene lots migrate to sensible types without changing stock quantities.
- A linked lot with zero availability cannot make a composite lot sale-ready.
- A lot cannot link to itself, form a cycle, or link to a cancelled/deleted lot.
- Zero total cost renders percentages safely as unavailable instead of `Infinity`/`NaN`.
- Duplicate/edit flows retain the lot's own manual price, not the already-combined effective price.

---

### Task 1: Schema and commercial snapshot contract

**Files:**
- Create: `supabase/sql/20261004_basket_lot_types_links_financials_v1.sql`
- Test: `scripts/test-basket-lot-types-links-financials.mjs`

**Interfaces:**
- Produces columns `business_type`, `linked_lot_id`, `own_sale_price_override`, `own_component_sum_snapshot`, `own_hidden_adjustment_snapshot`, `own_cost_sum_snapshot`, `cost_sum_snapshot`.
- Produces RPCs `create_basket_kit_lot_v4` and `save_basket_kit_lot_draft_v4` accepting `p_business_type` and `p_linked_lot_id`.

- [ ] Write failing contract tests for the five allowed types, generic link, own/effective snapshots, cycle protection, and combined hidden adjustment.
- [ ] Run the basket contract test and verify RED against current `main`.
- [ ] Add migration/RPCs/views preserving old columns and rules.
- [ ] Run the contract test and existing basket SQL-contract tests to GREEN.

### Task 2: Admin API and editor UI

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Modify: `vitrine/admin/index.html`
- Modify: `scripts/test-basket-kit-editor.mjs`
- Test: `scripts/test-basket-lot-types-links-financials.mjs`

**Interfaces:**
- Admin detail returns `linkable_lots` with type, code, availability, items, own/effective commercial snapshots and cost snapshots.
- Draft payload sends `business_type`, `linked_lot_id`, own manual `sale_price`.
- `basketKitDraftFinancials()` returns own and combined cost/retail/manual/hidden values plus two cost-difference percentages.

- [ ] Extend tests first for type selector, optional link selector, per-item cost/sale, linked-lot items, hidden total and both percentages.
- [ ] Verify RED.
- [ ] Implement API mappings and editor rendering/update logic.
- [ ] Verify browser/editor tests GREEN.

### Task 3: Storefront/checkout compatibility and verification

**Files:**
- Modify: `supabase/functions/storefront-v2/index.ts` only if required by the generalized linked-lot view contract.
- Modify: `supabase/sql/20261004_basket_lot_types_links_financials_v1.sql`
- Test: `scripts/test-basket-lot-types-links-financials.mjs`

**Interfaces:**
- Public basket price uses effective `sale_price_override` (own + linked lot).
- Public payload exposes no cost fields.
- Split availability consumes/limits by the generic linked lot while preserving legacy hygiene aliases for existing clients.

- [ ] Add failing assertions for effective price/availability and no public cost leakage.
- [ ] Verify RED.
- [ ] Implement compatibility view/checkout patch.
- [ ] Run full basket, checkout and Admin guard CI to GREEN.
- [ ] Apply migration to canonical Supabase, merge PR, deploy affected Edge Functions from the exact merge commit, and verify ACTIVE versions plus post-merge CI.
