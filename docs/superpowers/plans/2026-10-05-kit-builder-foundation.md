# Criador de Kits — Fundação e Editor Interno Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a camada canônica de kits internos e o editor de três colunas, sem reservar estoque e sem ativar ainda a nova tela como fluxo principal de produção.

**Architecture:** Kits internos serão receitas independentes em tabelas próprias (`assembly_kits`, `assembly_kit_items`, `assembly_search_chips`). Uma Edge Function dedicada `admin-kit-builder-v1` fornecerá catálogo, CRUD de kits/chips e agregados de “mais usados”. A UI `vitrine/admin/kit-builder.js` será autocontida e consumirá somente a `DonaAntoniaAdminBridge`; ela ficará pronta e testada, mas o cutover da seção Cestas ocorrerá apenas no plano de migração.

**Tech Stack:** PostgreSQL/Supabase migrations e RPCs, Supabase Edge Functions em TypeScript/Deno, JavaScript sem framework no Admin, Node 24 + Playwright 1.62.1 no CI.

**Spec:** `docs/superpowers/specs/2026-10-05-kit-builder-and-store-baskets-design.md`

## Global Constraints

- Salvar/editar kit interno nunca cria lote, reserva ou altera `basket_locked_component_stock_v1`.
- Tipos permitidos: `food`, `cleaning_hygiene`, `other`.
- Kit usado como base é copiado/expandido; `source_kit_id` é apenas histórico.
- Produtos duplicados em um kit são consolidados por `product_id`.
- Estoque exibido vem de `ops2_loose_sellable_stock_v1`.
- Custo/preço usam o cadastro oficial de `products`.
- Edição rápida reutiliza os caminhos oficiais `product_quick_save` e `product_stock_set`; não criar um segundo mecanismo de estoque.
- Se a autoridade de estoque for Bling, a UI deve respeitar o comportamento oficial de `product_stock_set` e nunca falsificar alteração local de estoque.
- Apenas `service_role` executa RPCs novas; `anon` e `authenticated` permanecem sem EXECUTE.
- A UI antiga não será removida neste plano; também não será carregada junto com a nova UI em produção.

## Review Focus

1. Produto já reservado: edição de estoque nunca pode reduzir a disponibilidade física abaixo do bloqueado; teste no Task 3.
2. Kit base alterado depois: kit derivado permanece inalterado; teste no Task 1 e browser no Task 4.
3. Produto repetido: adicionar duas vezes soma quantidade e não cria duas linhas; teste no Task 1 e Task 4.
4. Autoridade Bling: edição de estoque segue `product_stock_set` e a UI mostra o erro/estado oficial; teste no Task 3/4.
5. Kit arquivado em uso futuro por cesta externa: API deve expor uso/referência para o plano 2 e bloquear quando houver vínculo ativo; contrato inicial no Task 2.

---

### Task 1: Domínio de receitas internas

**Files:**
- Create: `supabase/migrations/20261005_assembly_kits_v1.sql`
- Create: `supabase/sql/20261005_assembly_kits_v1.sql`
- Create: `scripts/test-assembly-kits-domain-v1.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Produces: `save_assembly_kit_v1(p_kit_id uuid, p_name text, p_type text, p_notes text, p_source_kit_id uuid, p_items jsonb, p_operator text) -> jsonb`
- Produces: `archive_assembly_kit_v1(p_kit_id uuid, p_operator text) -> jsonb`
- Produces tables `assembly_kits`, `assembly_kit_items`, `assembly_search_chips`.

- [ ] **Step 1: Write the failing domain test**

Assert that the migration creates the three tables, the `type` check, unique `(kit_id,product_id)`, positive quantity, RLS/service-role-only grants, and both RPC signatures. Assert that `save_assembly_kit_v1` aggregates duplicate product IDs before storing and never references basket reservation/lot tables.

- [ ] **Step 2: Run RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-assembly-kits-domain-v1.mjs`
Expected: FAIL because the migration/RPCs do not exist.

- [ ] **Step 3: Implement schema and RPCs**

`save_assembly_kit_v1` must validate non-empty name/type/items, lock the kit row on update, replace its items transactionally, aggregate duplicates, preserve `source_kit_id` only as metadata/history and return the saved kit plus item count. `archive_assembly_kit_v1` sets `is_active=false`; no physical delete.

- [ ] **Step 4: Run GREEN and transaction probe**

Run: `node --disable-warning=ExperimentalWarning scripts/test-assembly-kits-domain-v1.mjs`
Expected: PASS.

Probe the SQL inside `BEGIN ... ROLLBACK` against the canonical Supabase and assert creating/editing a kit does not change `basket_locked_component_stock_v1`.

- [ ] **Step 5: Commit**

Commit: `feat: adicionar dominio de receitas internas de kits`

---

### Task 2: API administrativa do Criador de Kits

**Files:**
- Create: `supabase/functions/admin-kit-builder-v1/index.ts`
- Create: `scripts/test-kit-builder-admin-api-v1.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Consumes RPCs from Task 1 and `ops2_loose_sellable_stock_v1`.
- Produces actions: `kits`, `kit`, `kit_save`, `kit_archive`, `products`, `most_used`, `chips`, `chip_save`, `chip_archive`, `chip_reorder`.
- `products` returns `{id,name,sku,gtin,packaging,image_url,cost_price,sale_price,effective_stock,basket_locked,loose_stock,stock_authority}`.

- [ ] **Step 1: Write failing API contract test**

Assert JWT/admin auth, viewer read-only behavior, explicit action allowlist, paginated product search by name/SKU/EAN, stock fields from the canonical view, kit summary totals, lazy kit detail and `most_used` grouped only across active kits.

- [ ] **Step 2: Run RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-kit-builder-admin-api-v1.mjs`
Expected: FAIL because `admin-kit-builder-v1` does not exist.

- [ ] **Step 3: Implement minimal gateway**

Use the same admin authentication pattern as `admin-basket-guided-v1`. Do not add business writes directly in the Edge Function when an RPC exists. Chips may be saved through service-role DB calls because they are Admin-only configuration.

- [ ] **Step 4: Run GREEN**

Run: `node --disable-warning=ExperimentalWarning scripts/test-kit-builder-admin-api-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: adicionar api do criador de kits`

---

### Task 3: Edição rápida de produto sem duplicar estoque

**Files:**
- Modify: `supabase/functions/admin-kit-builder-v1/index.ts`
- Modify: `supabase/functions/admin-products-live-v1/index.ts` only if an explicit return field needed by the UI is missing; do not create alternate stock logic.
- Create: `scripts/test-kit-builder-product-quick-edit-v1.mjs`

**Interfaces:**
- `admin-kit-builder-v1` action `product_quick_update` delegates cost/price to the canonical product write and stock to the official stock write, returning the remapped product.
- Input: `{product_id,cost_price,sale_price,stock_quantity?,operator}`.

- [ ] **Step 1: Write failing tests**

Cover: cost < 0 rejected; sale < 0 rejected; viewer forbidden; cost/sale update returns refreshed stock breakdown; target stock below current locked quantity is rejected or normalized by the official stock path; Bling-authority behavior is returned transparently and never replaced by `products.stock` patching.

- [ ] **Step 2: Run RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-kit-builder-product-quick-edit-v1.mjs`
Expected: FAIL for missing action.

- [ ] **Step 3: Implement delegation**

Prefer extracting/reusing the canonical functions already used by `product_quick_save`/`product_stock_set`. If direct function sharing is impractical, call the canonical Admin endpoint from the browser as two explicit operations and keep `admin-kit-builder-v1` read-only for product writes; choose one path and make the test enforce that there is only one stock authority.

- [ ] **Step 4: Run GREEN plus existing product tests**

Run the new test and all existing product/Admin stock tests touched by the change.
Expected: PASS with no stock-authority regression.

- [ ] **Step 5: Commit**

Commit: `feat: permitir ajuste rapido de produto no criador de kits`

---

### Task 4: UI de três colunas do Criador de Kits

**Files:**
- Create: `vitrine/admin/kit-builder.js`
- Create: `scripts/test-kit-builder-ui-v1.mjs`
- Create: `scripts/test-kit-builder-browser.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Consumes `window.DonaAntoniaAdminBridge` and `admin-kit-builder-v1`.
- Exposes `window.DonaAntoniaKitBuilder = {render, openKit, newKit, reset}`.
- No dependency on `DonaAntoniaBasketGuided`, positions, families or legacy composers.

- [ ] **Step 1: Write RED static/UI contract**

Require three columns on desktop; search; horizontal chip strip; product rows with photo/name/stock/cost/sale; inline save; central draft with name/type/items/totals; third-column modes `Mais usados` and `Kits existentes`; `Usar como base`; sticky summary; only chips may have intentional horizontal overflow.

- [ ] **Step 2: Write RED Playwright flow**

Mock the API and verify: search, chip click, add product, duplicate product consolidates, quantity edit updates cost/sale, remove, choose a base kit copies items, modify derived kit without changing source fixture, save new kit, edit kit, inline product save, desktop 3 columns, mobile internal tabs and usable vertical scrolling.

- [ ] **Step 3: Run RED**

Run both new tests. Expected: FAIL because module does not exist.

- [ ] **Step 4: Implement UI**

Keep all kit-draft state inside `kit-builder.js`. Do not mutate DOM state from `index.html`. Product list and most-used use incremental loading. Preserve focus while editing quantities/prices. Summary cost/sale is derived from current draft items, never stored as independent editable values.

- [ ] **Step 5: Run GREEN**

Run static + browser tests at desktop and 390x844 viewport.
Expected: PASS and `document.documentElement.scrollWidth <= viewportWidth` except the chip strip’s own scroll container.

- [ ] **Step 6: Commit**

Commit: `feat: criar editor visual de kits em tres colunas`

---

### Task 5: CI e entrega oculta da fundação

**Files:**
- Modify: `.github/workflows/basket-kit-editor-ci.yml`
- Modify: `vitrine/admin/index.html` only to preload/load `kit-builder.js` if it remains unreachable from normal navigation; do not switch the Cestas tab yet.
- Create: `scripts/test-kit-builder-not-active-before-cutover.mjs`

**Interfaces:**
- Produces a tested module available for Plan 2/3, without replacing the live Cestas workflow yet.

- [ ] **Step 1: Add cutover guard test**

Assert the live Cestas tab still has one active controller until the migration plan flips it; `kit-builder.js` may load but must not create a second visible Cestas workflow.

- [ ] **Step 2: Run full Basket CI**

Run every command in `.github/workflows/basket-kit-editor-ci.yml` including the new tests.
Expected: all pass.

- [ ] **Step 3: Commit**

Commit: `test: integrar criador de kits ao ci sem cutover`

## PR boundary

Recommended PRs for this plan:
1. schema/RPCs;
2. Edge Function + product write integration;
3. UI + browser tests.

No migration of the 9 active baskets and no production cutover occurs in this plan.
