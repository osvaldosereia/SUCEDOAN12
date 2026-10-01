# Purchase Product Identification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make purchase-NF-e product review safe and fast by distinguishing unit GTIN from package GTIN, linking existing products deterministically, and allowing inline identity/canonical-field correction before authorization.

**Architecture:** Evolve the existing purchase XML flow in place. Add a normalized alternate-identifier table alongside `products` and `product_supplier_packaging`, make the importer deterministic-first and conservative, then expose matching evidence and inline resolution actions in `vitrine/admin/index.html`. Stock remains untouched by this flow.

**Tech Stack:** PostgreSQL/Supabase, Supabase Edge Functions (TypeScript/Deno), static Vitrine/Admin HTML/CSS/JS.

**Spec:** `docs/superpowers/specs/2026-09-30-purchase-product-identification-design.md`

## Global Constraints

- `products` remains the canonical commercial record.
- `products.gtin` represents the preferred sellable/base-unit barcode when known.
- Package GTIN must never overwrite the canonical unit GTIN merely because it appears in an XML.
- Name similarity alone never creates or binds automatically.
- Newly created products remain inactive until explicitly activated elsewhere.
- This workflow must not alter stock balances, payable rules, finance eligibility, or current fiscal classification behavior.
- Preserve `purchase_xml_items`, `purchase_xml_documents`, `product_supplier_packaging`, and `product_purchase_history`.

## Review Focus

- XML `uCom=CX` + conversion >1 + unknown GTIN must become unresolved/package candidate, not an automatic new unit product.
- Known package GTIN must resolve to the existing base-unit product and reuse its conversion factor.
- Same supplier item code must resolve only within the same supplier identity; cross-supplier collisions remain unresolved.
- Ambiguous description/NCM candidates must be suggestions only and excluded from `Autorizar seguros`.
- Per-item authorization and batch authorization must leave `products.stock` unchanged.

---

### Task 1: Product identifier schema

**Files:**
- Create: Supabase migration for `public.product_identifiers`
- Modify: database objects only as required for indexes/RLS

**Interfaces:**
- Produces table `product_identifiers(product_id, identifier_value, identifier_kind, packaging_unit, conversion_factor, supplier_document, source, confidence, status, metadata, created_at, updated_at)`.
- Identifier kinds: `base_gtin`, `package_gtin`, `supplier_code`, `sku_alias`.

- [ ] Write SQL verification queries proving unique confirmed identifier semantics and package factor support.
- [ ] Apply schema in Supabase with RLS and indexes.
- [ ] Backfill safe existing canonical `products.gtin` values as confirmed `base_gtin` identifiers without changing products.
- [ ] Verify counts, duplicates, and RLS/advisors.
- [ ] Commit migration/schema representation to GitHub.

### Task 2: Deterministic purchase matching

**Files:**
- Modify: `supabase/functions/purchase-xml-v1/index.ts`
- Modify: `supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts` only if it remains a deployed mirror of the same function.

**Interfaces:**
- Consumes `product_identifiers` and `product_supplier_packaging`.
- Produces purchase item metadata with `identity_state`, `match_method`, `match_reason`, `gtin_role`, `candidate_product_id`, and deterministic conversion evidence.

- [ ] Add failing cases for exact base GTIN, package GTIN, supplier-code repeat purchase, ambiguous candidate, and unknown packaged GTIN.
- [ ] Change matching precedence to base GTIN -> package GTIN -> supplier code + supplier -> existing binding -> candidates -> unresolved.
- [ ] Remove automatic creation triggered solely by a missing exact GTIN when packaging evidence is ambiguous.
- [ ] Persist confirmed package/supplier identifiers after explicit resolution so later imports resolve automatically.
- [ ] Run read-only/import tests using existing purchase rows, including Marata CX 48, and verify no stock mutation.
- [ ] Commit importer changes.

### Task 3: Admin receiving-review cards and inline resolution

**Files:**
- Modify: `vitrine/admin/index.html`

**Interfaces:**
- Consumes purchase item identity metadata, current canonical product, identifiers, and candidate search.
- Produces inline actions: edit proposed name, search/select product, choose GTIN role, edit conversion, reject suggestion, confirm/create inactive product, authorize visible changes.

- [ ] Add UI-state tests/smoke assertions for `Produto existente`, `Possível correspondência`, and `Produto novo` with plain-language reasons.
- [ ] Render card sections `Identificação`, `Compra e conversão`, `Alterações propostas`.
- [ ] Show XML commercial/tax GTIN, inferred role, supplier code, match method/reason, and current canonical product data.
- [ ] Add inline editable canonical name and existing-product search by name/EAN/SKU.
- [ ] Add explicit existing-product link, GTIN-role selection, conversion correction, and create-new-inactive action.
- [ ] Update `Autorizar seguros` eligibility so unresolved/ambiguous identity never enters the batch.
- [ ] Ensure authorization changes only checked/visible canonical fields and never stock.
- [ ] Smoke-test desktop and mobile layout.
- [ ] Commit admin changes.

### Task 4: End-to-end verification and documentation

**Files:**
- Modify: `docs/projects/dona-antonia-operations-2/HANDOFF.md`
- Modify: `docs/projects/dona-antonia-operations-2/CURRENT-STATE.md` if applicable.

**Interfaces:**
- Verifies Task 1-3 together against live-safe data.

- [ ] Verify a known unit GTIN resolves automatically.
- [ ] Verify a confirmed package GTIN resolves to its unit product and conversion.
- [ ] Verify a supplier-code repeat purchase resolves automatically only for the same supplier.
- [ ] Verify an ambiguous/name-only case remains human-review and outside batch authorization.
- [ ] Verify explicit new-product creation produces an inactive product.
- [ ] Snapshot `products.stock` before/after identity authorization and assert unchanged.
- [ ] Verify existing purchase history rows remain intact.
- [ ] Run Supabase advisors and relevant repository smoke checks; document any unrelated pre-existing issue separately.
- [ ] Update handoff/current-state and commit verification evidence.
