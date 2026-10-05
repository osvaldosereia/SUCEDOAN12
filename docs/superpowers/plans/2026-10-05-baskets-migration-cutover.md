# Migração das 9 Cestas e Cutover do Novo Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter as 9 cestas atualmente ativas em receitas de kits internos, preservar lotes/estoque exatamente como estão e substituir a interface antiga pelo workspace `Criador de Kits | Cestas do Site` sem fluxo paralelo.

**Architecture:** A migração será em duas fases: primeiro um relatório somente leitura que deriva/deduplica as composições propostas; depois uma migração transacional que cria `assembly_kits` e `store_basket_recipe_kits` sem tocar nos lotes atuais. O cutover de UI ocorre somente quando os 9 modelos têm receita válida e as métricas de estoque público/reservado antes/depois são idênticas. Os módulos antigos deixam de ser carregados pelo Admin no mesmo PR de cutover.

**Tech Stack:** PostgreSQL/Supabase, scripts Node de auditoria, JavaScript Admin, GitHub Actions/Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-kit-builder-and-store-baskets-design.md`

## Global Constraints

- Exatamente as cestas comerciais ativas/publicadas atuais são analisadas; não inventar novas cestas durante a migração.
- Econômica Bonini fica apenas com kit `Alimentos`.
- As demais cestas podem usar `Alimentos` + `Limpeza e Higiene`; composição de limpeza/higiene idêntica deve reutilizar o mesmo kit.
- Nenhum lote histórico é recriado, renumerado, reaberto ou reservado novamente.
- `basket_locked_component_stock_v1`, `basket_lot_public_availability_v1` e disponibilidade pública devem ser numericamente idênticos antes/depois do backfill de receitas.
- Classificação automática de produto em Alimentos vs Limpeza/Higiene deve produzir relatório de exceção quando não houver regra determinística; não adivinhar silenciosamente.
- Cutover de UI remove o carregamento operacional de `basket-admin-section.js` e `basket-guided-builder.js`; não manter dois editores visíveis.
- Storefront/checkout mantêm `basket_templates` e IDs comerciais atuais.

## Review Focus

1. Produto sem categoria/classificação clara: relatório marca `needs_review` e a migração não aplica aquele modelo; Task 1.
2. Dois kits de limpeza iguais em ordens diferentes: deduplicação usa composição normalizada e deve tratá-los como iguais; Task 1/2.
3. Estoque/reserva: qualquer delta antes/depois aborta a migração; Task 2.
4. Lotes antigos continuam imprimíveis/listáveis pela nova UI; Task 3.
5. Cache/script antigo: após cutover só os módulos v2 são carregados e testes falham se globals antigos voltarem; Task 3/4.

---

### Task 1: Relatório somente leitura das 9 cestas

**Files:**
- Create: `supabase/sql/20261005_store_basket_migration_report_v1.sql`
- Create: `scripts/test-store-basket-migration-report-v1.mjs`
- Create: `scripts/report-store-basket-migration.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Produces `get_store_basket_migration_report_v1() -> jsonb` read-only.
- Output per basket: `{basket_id,name,active,food_items,cleaning_hygiene_items,food_fingerprint,cleaning_fingerprint,lot_count,public_available,locked_component_snapshot,needs_review,review_reasons}`.

- [ ] **Step 1: Write RED contract test**

Require read-only/stable function, normalized fingerprints sorted by `product_id:quantity`, explicit Econômica exception and no INSERT/UPDATE/DELETE statements.

- [ ] **Step 2: Run RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-store-basket-migration-report-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement deterministic classification**

Use existing product categories/subcategories plus explicit mapping table/CTE for known exceptions. Do not infer from free-form name when structured category is sufficient. Unknown/ambiguous classification sets `needs_review=true`.

- [ ] **Step 4: Run report against canonical Supabase**

Generate the table:
`Cesta | Kit Alimentos proposto | Kit Limpeza/Higiene proposto | compartilhado com | lotes atuais | estoque público | bloqueado | revisão`.

Expected: exactly the active public models intended for cutover; no write activity.

- [ ] **Step 5: Commit**

Commit: `feat: gerar relatorio de migracao das cestas atuais`

---

### Task 2: Backfill transacional de kits e receitas

**Files:**
- Create: `supabase/migrations/20261005_migrate_active_baskets_to_assembly_kits_v1.sql`
- Create: `supabase/sql/20261005_migrate_active_baskets_to_assembly_kits_v1.sql`
- Create: `scripts/test-store-basket-migration-v1.mjs`

**Interfaces:**
- Consumes report/fingerprints from Task 1 and tables from Plans 1/2.
- Produces assembly kits and recipe links for existing `basket_templates` IDs.
- Must be idempotent through stable metadata keys/fingerprints.

- [ ] **Step 1: Write RED migration test**

Assert: no `basket_stock_lots` INSERT/UPDATE/DELETE; no reservation-table writes; shared fingerprint creates one assembly kit; each basket gets correct recipe links; Econômica has one food kit; re-running does not duplicate kits/links; `needs_review=true` aborts rather than guessing.

- [ ] **Step 2: Run RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-store-basket-migration-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement migration**

Take pre-migration snapshots of public availability and locked component totals inside the transaction. Insert/upsert kits by migration fingerprint, copy items, create recipe links, resolve recipes, compare the post state and raise exception on any stock/public-availability delta.

- [ ] **Step 4: Dry-run in `BEGIN ... ROLLBACK`**

Against canonical Supabase, assert proposed counts, deduplication, 9 recipes, zero stock delta and unchanged lot IDs/status/quantities.

- [ ] **Step 5: Apply only after the dry-run has zero blockers**

Use Supabase migration application; immediately query report + stock invariants.

- [ ] **Step 6: Commit**

Commit: `feat: migrar cestas ativas para receitas de kits`

---

### Task 3: Workspace único e aposentadoria da UI antiga

**Files:**
- Create: `vitrine/admin/baskets-workspace.js`
- Modify: `vitrine/admin/index.html`
- Modify: `vitrine/admin/kit-builder.js`
- Modify: `vitrine/admin/store-baskets.js`
- Stop loading: `vitrine/admin/basket-admin-section.js`
- Stop loading: `vitrine/admin/basket-guided-builder.js`
- Create: `scripts/test-baskets-workspace-cutover-v1.mjs`
- Create: `scripts/test-baskets-workspace-browser.mjs`

**Interfaces:**
- Exposes one controller: `window.DonaAntoniaBasketsWorkspace={render}`.
- Tabs visible: `Criador de Kits` and `Cestas do Site` only.

- [ ] **Step 1: Write RED cutover contract**

Assert Admin loads `baskets-workspace.js`, `kit-builder.js`, `store-baskets.js`; does not load old operational controllers; Cestas navigation calls only `DonaAntoniaBasketsWorkspace.render`; strings/buttons `Editar lote`, `Novo lote`, `família`, `posição` from old flow are absent from the live workspace.

- [ ] **Step 2: Write RED browser smoke**

With mocked bridge/API: enter Cestas; switch tabs; create/edit a kit; use kit as base; view Cestas do Site; open one basket; view all its lots; verify vertical scrolling and 390px mobile navigation.

- [ ] **Step 3: Run RED**

Run both tests; expected FAIL until workspace is wired.

- [ ] **Step 4: Implement cutover**

`baskets-workspace.js` owns only navigation/tab state. It does not duplicate kit/store basket logic. Preserve Admin bridge/authentication from `index.html`. Remove old script tags and old runtime calls.

- [ ] **Step 5: Run GREEN plus all historical Basket tests**

Tests that intentionally describe the retired UI must be converted into retirement guards, not satisfied by reintroducing legacy selectors/functions.

- [ ] **Step 6: Commit**

Commit: `refactor: ativar workspace simples de kits e cestas`

---

### Task 4: Lotes históricos, impressão e storefront regression

**Files:**
- Modify: `supabase/functions/admin-store-baskets-v1/index.ts` if historic lot reader needs compatibility mapping.
- Modify: `vitrine/admin/store-baskets.js`
- Create: `scripts/test-store-basket-historic-lots-v1.mjs`
- Create: `scripts/test-store-basket-print-browser-v1.mjs`
- Reuse: existing storefront/checkout tests.

**Interfaces:**
- `lots` action returns both legacy and new lots in one normalized DTO.
- Print accepts only one normalized lot DTO and never mutates editor/workspace state.

- [ ] **Step 1: RED compatibility tests**

Require legacy lot + new lot list, correct quantities/status/sale state, snapshots when present, fallback composition for historical lots, and print content with name/code/product photo/per-basket/total quantity.

- [ ] **Step 2: Run RED**

Expected FAIL only if compatibility mapper is missing.

- [ ] **Step 3: Implement minimal normalizer**

Do not migrate historical lots to new schema. Normalize at read boundary.

- [ ] **Step 4: Full regression**

Run Basket kit editor CI, product carousel, linked lot/categories, storefront canonical, checkout canonical and mixed order engine.
Expected: all PASS.

- [ ] **Step 5: Commit**

Commit: `fix: preservar lotes historicos no novo workspace`

---

### Task 5: Pós-deploy e invariantes

**Files:**
- Create: `scripts/test-baskets-v2-postdeploy.mjs`
- Update docs/checkpoint in the PR.

- [ ] **Step 1: Verify canonical database**

Check new tables/RPC grants; 9 migrated recipes; active kits; no `anon/authenticated` execute on mutation RPCs.

- [ ] **Step 2: Verify stock parity**

Compare pre-recorded snapshot vs current for public availability and `basket_locked_component_stock_v1`; expected exact equality before any new user action.

- [ ] **Step 3: Smoke one temporary kit and one temporary external basket in a transaction**

Create kit → create recipe → preview mount → reserve → verify locked delta → cancel → verify release → ROLLBACK.

- [ ] **Step 4: Verify UI CI on the merge commit**

All Cestas/Kits workflows must be green on `main`, not only on the PR branch.

- [ ] **Step 5: Record deployment checkpoint**

Document migrations, Edge Function versions, commit SHA, invariants and any intentionally retained compatibility backend.

## PR boundary

Recommended PRs:
1. migration report only;
2. data backfill with zero-stock-delta proof;
3. UI cutover + retirement guards;
4. historical-lot compatibility and final regression if needed.

The cutover PR is the only point where the operator-visible Cestas section changes.
