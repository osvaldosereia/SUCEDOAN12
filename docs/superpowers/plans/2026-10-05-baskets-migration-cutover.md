# Migração das 9 Cestas e Cutover do Novo Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter as 9 cestas atualmente ativas em receitas de kits internos, preservar lotes/estoque exatamente como estão e substituir a interface antiga pelo workspace `Criador de Kits | Cestas do Site` sem fluxo paralelo.

**Architecture:** Este plano só começa depois de concluídos os planos `2026-10-05-kit-builder-foundation.md` e `2026-10-05-store-baskets-composer.md`. A migração ocorre em duas fases: relatório somente leitura; depois backfill transacional das receitas. O cutover visual só acontece quando todos os modelos alvo têm receita válida e estoque/disponibilidade antes/depois são idênticos. Lotes históricos não são migrados: uma camada única de normalização no `admin-store-baskets-v1` apresenta lotes legados e v2 no mesmo DTO.

**Tech Stack:** PostgreSQL/Supabase, scripts Node de auditoria, JavaScript Admin, GitHub Actions/Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-kit-builder-and-store-baskets-design.md`

## Global Constraints

- O relatório deve encontrar exatamente as cestas comerciais ativas/publicadas pretendidas para o cutover; o baseline esperado atual é 9. Se a contagem mudar, parar e revisar em vez de forçar “9”.
- Econômica Bonini fica apenas com kit `Alimentos`.
- As demais podem usar `Alimentos` + `Limpeza e Higiene`; composição de limpeza/higiene idêntica reutiliza o mesmo kit.
- Nenhum lote histórico é recriado, renumerado, reaberto ou reservado novamente.
- `basket_locked_component_stock_v1`, `basket_lot_public_availability_v1` e disponibilidade pública permanecem numericamente idênticos no backfill.
- Classificação automática ambígua gera `needs_review`; não adivinhar silenciosamente.
- Cutover remove carregamento operacional de `basket-admin-section.js` e `basket-guided-builder.js`; nenhum fluxo paralelo.
- Storefront/checkout mantêm `basket_templates` e os IDs comerciais atuais.

## Review Focus

1. Produto sem classificação clara: `needs_review` bloqueia aplicação — Task 1/2.
2. Kits iguais em ordem diferente: fingerprint normalizado deduplica — Task 1/2.
3. Qualquer delta de estoque/disponibilidade aborta — Task 2.
4. Lotes antigos e v2 aparecem juntos e imprimem corretamente — Task 3/4.
5. Scripts antigos não voltam por cache/código: retirement guards — Task 3/5.

---

### Task 1: Relatório somente leitura das cestas atuais

**Files:**
- Create: `supabase/sql/20261005_store_basket_migration_report_v1.sql`
- Create: `scripts/test-store-basket-migration-report-v1.mjs`
- Create: `scripts/report-store-basket-migration.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- `get_store_basket_migration_report_v1() -> jsonb` read-only.
- Per basket: `{basket_id,name,active,food_items,cleaning_hygiene_items,food_fingerprint,cleaning_fingerprint,lot_count,public_available,locked_component_snapshot,needs_review,review_reasons}`.

- [ ] **Step 1: RED contract** — stable/read-only function; fingerprints sorted by `product_id:quantity`; Econômica exception; no mutation statements.
- [ ] **Step 2: Run RED** — `node --disable-warning=ExperimentalWarning scripts/test-store-basket-migration-report-v1.mjs`; expected FAIL.
- [ ] **Step 3: Implement deterministic classification** — structured categories/subcategories + explicit exception mapping; unknown -> `needs_review=true`; no name guessing when structured data exists.
- [ ] **Step 4: Run against canonical Supabase** — output `Cesta | Kit Alimentos | Kit Limpeza/Higiene | compartilhado com | lotes | público | bloqueado | revisão`; expected current baseline 9 and zero writes.
- [ ] **Step 5: Commit** — `feat: gerar relatorio de migracao das cestas atuais`.

---

### Task 2: Backfill transacional de kits e receitas

**Files:**
- Create: `supabase/migrations/20261005_migrate_active_baskets_to_assembly_kits_v1.sql`
- Create: `supabase/sql/20261005_migrate_active_baskets_to_assembly_kits_v1.sql`
- Create: `scripts/test-store-basket-migration-v1.mjs`

**Interfaces:**
- Consumes report/fingerprints Task 1 + tables dos Planos 1/2.
- Produces `assembly_kits`, `assembly_kit_items` and `store_basket_recipe_kits` for existing basket IDs.
- Idempotent by migration fingerprint/metadata key.

- [ ] **Step 1: RED migration test** — no lot/reservation writes; shared fingerprint = one kit; Econômica one food kit; rerun no duplicates; `needs_review` aborts.
- [ ] **Step 2: Run RED** — expected FAIL.
- [ ] **Step 3: Implement** — snapshot public availability + locked totals inside transaction; upsert kits by fingerprint; link recipes; resolve; compare post state; raise on any delta.
- [ ] **Step 4: Dry-run `BEGIN...ROLLBACK`** — expected target count, dedupe, recipe count, unchanged lot IDs/status/quantities, zero stock/public delta.
- [ ] **Step 5: Apply only with zero blockers** — apply migration; immediately query report + invariants.
- [ ] **Step 6: Commit** — `feat: migrar cestas ativas para receitas de kits`.

---

### Task 3: Normalizador único de lotes históricos e v2

**Files:**
- Modify: `supabase/functions/admin-store-baskets-v1/index.ts`
- Create: `scripts/test-store-basket-historic-lots-v1.mjs`

**Interfaces:**
- Action `lots` always returns one normalized DTO for both legacy and generic-v2 lots:
  `{id,code,public_name,status,assembly_status,sale_enabled,quantity_built,quantity_available,built_at,price,hidden_adjustment,items,snapshot_kind}`.
- For v2, items/values come from the stored snapshot.
- For legacy, reader resolves existing lot items/products without altering them.

- [ ] **Step 1: RED compatibility test** — one legacy + one v2 fixture return same DTO shape and preserve quantities/status/sale state.
- [ ] **Step 2: Run RED** — expected FAIL until normalizer exists.
- [ ] **Step 3: Implement read-boundary normalizer** — no historical migration, no write to lots; fallback only for absent historical snapshot fields.
- [ ] **Step 4: Run GREEN and commit** — `fix: normalizar lotes historicos e v2`.

---

### Task 4: Workspace único e aposentadoria da UI antiga

**Files:**
- Create: `vitrine/admin/baskets-workspace.js`
- Modify: `vitrine/admin/index.html`
- Modify: `vitrine/admin/kit-builder.js`
- Modify: `vitrine/admin/store-baskets.js`
- Stop loading: `vitrine/admin/basket-admin-section.js`
- Stop loading: `vitrine/admin/basket-guided-builder.js`
- Create: `scripts/test-baskets-workspace-cutover-v1.mjs`
- Create: `scripts/test-baskets-workspace-browser.mjs`
- Create: `scripts/test-store-basket-print-browser-v1.mjs`

**Interfaces:**
- `window.DonaAntoniaBasketsWorkspace={render}`.
- Visible tabs only `Criador de Kits` and `Cestas do Site`.
- Print consumes normalized lot DTO and never touches editor/workspace state.

- [ ] **Step 1: RED cutover contract** — new scripts loaded; old controllers not loaded; Cestas navigation calls only workspace; old operational strings/buttons absent.
- [ ] **Step 2: RED browser smoke** — open Cestas, switch tabs, create/edit/base kit, list external baskets, `Ver lotes` lists all lots, print selected lot, verify vertical scrolling and 390px navigation.
- [ ] **Step 3: Run RED** — expected FAIL.
- [ ] **Step 4: Implement cutover** — workspace owns only tab/navigation state; modules own their domains; preserve Admin bridge/auth; remove old script tags/runtime calls.
- [ ] **Step 5: Convert retired-UI tests into guards** — never restore old selectors/functions merely to satisfy historical tests.
- [ ] **Step 6: Run GREEN + print test** — desktop/mobile, no hidden essential scroll and no page-level horizontal overflow.
- [ ] **Step 7: Commit** — `refactor: ativar workspace simples de kits e cestas`.

---

### Task 5: Storefront/checkout regression e pós-deploy

**Files:**
- Create: `scripts/test-baskets-v2-postdeploy.mjs`
- Modify workflow only to include all new tests.
- Update PR deployment checkpoint.

- [ ] **Step 1: Full regression** — Basket kit editor CI, product carousel, linked lot/categories, storefront canonical, checkout canonical, mixed order engine; expected PASS.
- [ ] **Step 2: Verify canonical DB** — new tables/RPC grants, migrated recipes, active kits, no mutation EXECUTE for anon/authenticated.
- [ ] **Step 3: Stock parity** — pre-recorded vs current availability/locked totals exact before new user activity.
- [ ] **Step 4: Transaction smoke** — temporary kit -> recipe -> preview -> reserve -> locked delta -> cancel/release -> ROLLBACK.
- [ ] **Step 5: Verify merge commit CI** — all Cestas/Kits workflows green on `main`.
- [ ] **Step 6: Record checkpoint** — migrations, Edge Function versions, commit SHA, invariants, retained backend compatibility only.

## PR boundary

1. migration report;
2. backfill with zero-stock-delta proof;
3. lot normalizer;
4. UI cutover + retirement guards + print;
5. postdeploy regression if a separate patch is needed.

O cutover UI é o único momento em que a seção Cestas visível muda.
