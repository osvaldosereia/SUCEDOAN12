# Compras XML Core Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Compras XML work queue simple and reliable while safely applying confirmed invoice data to products, keeping new products inactive until review, and honoring a persistent product stock preference.

**Architecture:** Keep the existing 12-hour Supabase cron and 31-day recovery window, but skip complete known invoices before downloading their XML and correct duplicate metrics. A shared, idempotent catalog processor will match only confirmed identifiers, apply invoice cost and supplier/fiscal evidence, create eligible local products as inactive, and preserve unresolved identities for manual review. Product publication will confirm or create its Bling record before enabling the storefront product.

**Tech Stack:** Supabase Postgres migrations, Supabase Edge Functions (Deno/TypeScript), Bling API v3, browser JavaScript IIFE, generated Admin runtime, Node.js contract tests.

**Spec:** `docs/superpowers/specs/2026-10-21-compras-xml-ux-automation-design.md`

## Global Constraints

- Run the existing scheduled import every 12 hours and retain a 31-day recovery window.
- Match automatically only on a confirmed base GTIN, package GTIN, or supplier item code scoped to the supplier CNPJ.
- A conflict, missing identifier, or name-only similarity stays in manual review.
- New XML products remain `is_active=false` and `is_whatsapp_active=false` until an operator publishes them.
- Update confirmed supplier and unit-cost data from the invoice; preserve existing sale price.
- Record NCM/CEST from the invoice with fiscal review pending; keep CFOP/CST/CSOSN linked to invoice evidence.
- Save packaging conversion by product, supplier, and purchase unit.
- Persist the stock-entry preference on the product. Keep its current default of true for products without a prior selection.
- Never write local stock directly from the XML agent; use the existing Bling receipt plan and verification path.
- Do not create financial entries or call AI/image search in this core delivery.
- Keep the two purchase XML Edge Function source copies identical.
- Rebuild `admin-runtime.js` from `runtime-src`; do not edit the generated runtime by hand.

## Review Focus

- A fully imported Bling invoice reappears inside the 31-day window: the worker skips XML retrieval and counts one duplicate with zero new review items; test in Task 1.
- A known invoice is incomplete or failed recovery: the worker does not skip it and leaves it in the repair path; test in Task 1.
- The XML EAN conflicts with an existing product or supplier code belongs to another CNPJ: no automatic link or new product; test in Task 2.
- A package has no confirmed divisor or has an invalid divisor: cost is not applied and the item cannot enter a receipt plan; test in Task 2.
- A product preference changes after a receipt plan is prepared: the old plan remains locked and only future invoice items inherit the new setting; test in Task 2.

---

## File Structure

- `supabase/migrations/20261022090000_purchase_xml_product_stock_policy_v1.sql` — adds and backfills the durable stock preference on `products`.
- `supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts` — canonical purchase XML worker, duplicate handling, matching, and product updates.
- `supabase/functions/purchase-xml-v1/index.ts` — identical deployment/source copy required by the existing test and deploy layout.
- `supabase/functions/admin-products-live-v1/index.ts` — returns/saves the product stock preference and gates publication of XML-created products on Bling confirmation.
- `vitrine/admin/runtime-src/06-purchases.part.js.txt` — note queue, item controls, stock-policy display, and review states.
- `vitrine/admin/runtime-src/04-products.part.js.txt` — durable product preference field in the product editor.
- `vitrine/admin/runtime-src/07-customers.part.js.txt` — Compras XML section layout and collapsed secondary tools.
- `vitrine/admin/purchase-xml-simple.css` — compact queue layout without introducing extra primary buttons.
- `vitrine/admin/index.html` — update the Admin asset cache version after rebuilding.
- `vitrine/admin/admin-runtime.js` — generated artifact, rebuilt from the three runtime fragments.
- `scripts/test-purchase-xml-daily-dedup-v1.mjs` — worker duplicate/recovery regression.
- `scripts/test-purchase-xml-product-policy-v1.mjs` — stock policy, conversion, and receipt safety regression.
- `scripts/test-purchase-xml-automation-v1.mjs` — safe identity and inactive product creation regression.
- `scripts/test-purchase-xml-publish-bling-v1.mjs` — Bling publication gate and retry regression.
- `scripts/test-purchase-xml-simple-queue-v1.mjs` — simple UI, cache, and runtime build regression.

## Task 1: Stop reprocessing complete duplicate invoices

**Files:**
- Modify: `supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts`
- Modify: `supabase/functions/purchase-xml-v1/index.ts`
- Create: `scripts/test-purchase-xml-daily-dedup-v1.mjs`

**Interfaces:**
- Produces: `function isCompleteImportedInvoice(document: KnownPurchaseDocument | null): boolean`; true only when document key, storage path, content hash, and catalog processing state prove the invoice is complete.
- Produces: `async function knownBlingDocuments(rows: BlingNfeRow[]): Promise<Map<string, KnownPurchaseDocument>>`; keys by Bling invoice ID and access key.

- [ ] **Step 1: Write failing regression assertions** for an already complete invoice, an incomplete invoice, a previously unseen invoice, and a duplicate run with 0 new item-review counts.
- [ ] **Step 2: Run** `node scripts/test-purchase-xml-daily-dedup-v1.mjs`; expected: fail because current worker downloads and replays duplicates and counts their items as review.
- [ ] **Step 3: Implement** lookup of existing invoice IDs/keys once per run. Skip XML and Bling detail fetch for complete rows; preserve the repair path for incomplete rows. Set duplicate item/review counters to zero and store error counts separately.
- [ ] **Step 4: Copy** the canonical function file to the second source copy and assert byte-for-byte equality in the test.
- [ ] **Step 5: Run** the new regression and `node scripts/test-xml-catalog-details-v2.mjs`; expected: PASS and source copies identical.
- [ ] **Step 6: Commit** `fix: skip complete duplicate purchase XML invoices`.

## Task 2: Persist product stock preference and automate only safe XML updates

**Files:**
- Create: `supabase/migrations/20261022090000_purchase_xml_product_stock_policy_v1.sql`
- Modify: both purchase XML Edge Function source copies.
- Create: `scripts/test-purchase-xml-product-policy-v1.mjs`
- Create: `scripts/test-purchase-xml-automation-v1.mjs`

**Interfaces:**
- Database: `products.purchase_xml_stock_update boolean not null default true`.
- Produces: `async function processCatalogItems(documentId: string, source: "bling_daily" | "manual_xml" | "bulk_xml"): Promise<{matched:number; created:number; review:number; failed:number}>`.
- Consumes: `ensureProductSafe`, `product_identifiers`, `product_supplier_packaging`, and the existing invoice evidence upsert.
- Produces: automatic processing uses the same helper for scheduled and manual XML imports; it does not use name-only matching.

- [ ] **Step 1: Write failing migration/behavior tests** for preference column/default, latest recorded item choice backfill, new product default, per-supplier divisor, and receipt-plan lock.
- [ ] **Step 2: Run** `node scripts/test-purchase-xml-product-policy-v1.mjs`; expected: fail because `products.purchase_xml_stock_update` is absent and current preference is item-scoped.
- [ ] **Step 3: Add the migration.** Add the non-null boolean with default true. Backfill each product from its latest invoice item preference without changing old invoice rows or receipt plans.
- [ ] **Step 4: Write failing worker tests** for exact confirmed base GTIN, exact package GTIN, supplier code with matching CNPJ, conflicting IDs, missing GTIN, and package with no divisor.
- [ ] **Step 5: Run** `node scripts/test-purchase-xml-automation-v1.mjs`; expected: fail until the shared processor exists.
- [ ] **Step 6: Implement** `processCatalogItems`. For a single safe match, save identity, supplier, confirmed divisor, unit cost, NCM/CEST review fields, and fiscal evidence. Preserve sale price. For a valid new identity with no local/Bl­ing conflict, create one inactive local draft populated from the XML. Do not auto-create on identity conflict or uncertain packaging.
- [ ] **Step 7: Apply the product stock preference** to future invoice items at linking/processing time. Preserve the invoice-level snapshot used by the current receipt RPC; do not rewrite a locked/verified plan.
- [ ] **Step 8: Call** `processCatalogItems` after successful XML evidence persistence in scheduled, single-file, and bulk imports. Keep failures isolated by item so one bad product does not discard its invoice.
- [ ] **Step 9: Copy** the canonical function into its second source path and run both new tests plus `node scripts/test-purchase-xml-note-data-stock-toggle-v1.mjs`; expected: PASS and byte-identical function sources.
- [ ] **Step 10: Commit** migration, worker, and tests with `feat: apply safe purchase XML catalog updates`.

## Task 3: Require a confirmed Bling record before publishing XML-created products

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Modify: `vitrine/admin/runtime-src/04-products.part.js.txt`
- Create: `scripts/test-purchase-xml-publish-bling-v1.mjs`

**Interfaces:**
- Produces: `async function ensureXmlProductInBling(product: ProductDraft): Promise<{ok:boolean; bling_product_id?:number; error?:string}>`.
- Consumes: approved local product fields and confirmed product GTIN.
- The publish operation for `metadata.purchase_xml_created=true` must call this helper before setting storefront active flags.

- [ ] **Step 1: Write failing tests** for existing exact Bling GTIN link, successful create-and-link, duplicate retry, missing GTIN, and Bling timeout/failure.
- [ ] **Step 2: Run** `node scripts/test-purchase-xml-publish-bling-v1.mjs`; expected: fail because product publication currently saves local state without this gate.
- [ ] **Step 3: Implement** exact GTIN lookup before create; persist the returned `bling_product_id` and sync metadata. Use an idempotency check so retry cannot create a second Bling product.
- [ ] **Step 4: Gate publication.** Only XML-created products use this path. If Bling does not confirm a link/create, leave `is_active=false` and `is_whatsapp_active=false`, return a clear retryable error, and do not affect other products.
- [ ] **Step 5: Run** the new test and existing product-editor tests; expected: XML draft is not published on Bling failure, regular non-XML product saves are unchanged.
- [ ] **Step 6: Commit** `feat: confirm Bling product before XML draft publication`.

## Task 4: Simplify the Compras XML work queue

**Files:**
- Modify: `vitrine/admin/runtime-src/04-products.part.js.txt`
- Modify: `vitrine/admin/runtime-src/06-purchases.part.js.txt`
- Modify: `vitrine/admin/runtime-src/07-customers.part.js.txt`
- Modify: `vitrine/admin/purchase-xml-simple.css`
- Modify: `vitrine/admin/index.html`
- Modify: generated `vitrine/admin/admin-runtime.js`
- Create: `scripts/test-purchase-xml-simple-queue-v1.mjs`

**Interfaces:**
- Purchase item renderer reads `products.purchase_xml_stock_update`; missing/null legacy values fall back to the existing item setting.
- Product editor saves `purchase_xml_stock_update` through the existing `product_save` route.
- Keep existing event names and purchase actions; no new primary navigation tab.

- [ ] **Step 1: Write failing UI tests** for pending items ordered first, one compact state label, per-product stock policy label, divisor shown only when needed, secondary tools collapsed, and unchanged loading fast path.
- [ ] **Step 2: Run** `node scripts/test-purchase-xml-simple-queue-v1.mjs`; expected: fail on current duplicate index/controls and absent product preference.
- [ ] **Step 3: Implement** the focused note queue and product editor preference field. Preserve the existing product search, exact EAN preselection, manual review, and receipt-stage safety controls.
- [ ] **Step 4: Rebuild** `admin-runtime.js` with `python3 scripts/build-vitrine-admin-runtime.py`; bump the cache tag in `index.html`.
- [ ] **Step 5: Run** `python3 scripts/build-vitrine-admin-runtime.py --check`, the new UI test, `node scripts/test-purchase-xml-guided-r31.mjs`, and `node scripts/test-purchase-xml-compact-r33.mjs`; expected: all PASS.
- [ ] **Step 6: Commit** `feat: simplify purchase XML review queue`.

## Task 5: Stage and verify the production rollout

**Files:**
- Modify: relevant existing purchase XML GitHub Actions workflow only if new test paths are not already covered.
- Verify: Supabase project `ssbesxgaijknwsjbsbcz`, active cron `purchase-xml-daily-v1`, active `admin-service-intelligence-v1`.

**Interfaces:**
- Consumes: migrations and Edge Function source from Tasks 1–3; generated UI from Task 4.
- Produces: rollout evidence containing migration result, active function version, runtime build result, and first-run counts.

- [ ] **Step 1: Run all XML regression tests** and verify both Edge Function source copies are identical.
- [ ] **Step 2: Apply the stock preference migration** to the canonical Supabase project and query the new column, defaults, and backfilled values.
- [ ] **Step 3: Deploy the purchase XML and product Admin Edge Function updates** to the canonical project. Keep the existing cron cadence unchanged.
- [ ] **Step 4: Run a dry-run import against the current 31-day window** and verify duplicate invoices produce no XML downloads, no new products, and no increment to item-review counts.
- [ ] **Step 5: Run one new invoice through the worker** with product/stock writes constrained to the approved policy. Confirm new products are inactive, matched products receive correct unit cost and fiscal evidence, and no local stock is written.
- [ ] **Step 6: Verify publish gate** on a test XML-created product: Bling exact-match/create success links the record; simulated failure leaves the product inactive.
- [ ] **Step 7: Verify active cron schedule and read the first production run**. Confirm duplicate/new/review/failure counters are accurate before considering rollout complete.
- [ ] **Step 8: Commit any workflow update** as `ci: run purchase XML automation regressions`.

## Deferred follow-up

AI name/divisor suggestions and image search/generation are isolated from this core plan. They require their own source-provider and cost design. They must not block XML import, product matching, or manual review.
