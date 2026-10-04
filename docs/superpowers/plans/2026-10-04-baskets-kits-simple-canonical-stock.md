# Cestas/Kits Simples com Estoque Canônico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar Cestas e Kits na operação, centralizar estoque/publicação em uma regra canônica e fazer Admin, site público e checkout usarem exatamente a mesma disponibilidade.

**Architecture:** A mudança preserva as tabelas e históricos atuais, mas cria uma camada SQL canônica para disponibilidade por lote e catálogo comercial. `admin-products-live-v1`, `storefront-v2` e o motor de reserva passam a consumir essa camada; o Admin é simplificado para um fluxo único de Cesta/Kit e o site usa as cinco categorias próprias de Cestas/Kits sem alterar as categorias do catálogo comum.

**Tech Stack:** PostgreSQL/PLpgSQL no Supabase, Supabase Edge Functions Deno/TypeScript, HTML/CSS/JavaScript estático, Node.js 24 + Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-04-baskets-kits-simple-canonical-stock-design.md`

## Global Constraints

- Para operação e cliente, cesta e kit são a mesma entidade comercial: **Cesta/Kit**.
- Preservar IDs, lotes, pedidos, alocações e histórico atuais; não fazer migração destrutiva de `basket_templates`, `basket_kit_templates` ou `basket_stock_lots`.
- As cinco categorias oficiais são: `cestas-completas`, `cestas-so-alimento`, `kits-limpeza-e-higiene`, `kits-limpeza`, `kits-higiene`.
- `sale_enabled` passa a significar somente **não pausado / pausado**; marcar lote como montado deve deixá-lo `sale_enabled=true` por padrão.
- Lote público exige `status=ready`, não pausado, quantidade > 0, modelo/categoria ativos e todos os componentes com estoque físico efetivo > 0.
- Para lotes conectados, estoque público é o menor saldo entre os lotes participantes; vínculo continua limitado a um nível.
- O checkout deve recalcular e reservar sob transação; nunca confiar no estoque previamente exibido ao cliente.
- As categorias gerais de produtos permanecem separadas das categorias de Cestas/Kits.
- Famílias de substituição já existentes continuam sendo a regra para o botão **Trocar**.
- Não reescrever lotes históricos ao editar um modelo.

## Review Focus

- **Estoque avulso zero com estoque físico reservado no lote:** a Cesta/Kit deve continuar vendável se `effective_sellable_stock` do componente for positivo; Task 1 cobre a diferença entre estoque físico e avulso.
- **Lote principal disponível e vínculo esgotado/pausado:** `public_available` deve ser zero e o motivo `linked_lot_unavailable`; Tasks 1 e 5 cobrem esse caso.
- **Dois lotes montados do mesmo modelo:** o lote público deve avançar em FIFO quando o primeiro esgotar sem intervenção humana; Tasks 1 e 6 cobrem o rollover.
- **Categorias de produto x categorias de Cesta/Kit:** o payload de `home()` deve manter `categories` atuais e acrescentar `basket_categories`; Tasks 3 e 6 cobrem a separação.
- **Concorrência no último estoque conectado:** dois checkouts simultâneos não podem consumir mais que o menor saldo; Task 5 cobre bloqueio transacional e decremento conjunto.

---

### Task 1: Camada SQL canônica de disponibilidade e catálogo

**Files:**
- Create: `supabase/migrations/20261004223000_basket_canonical_commerce_v1.sql`
- Create: `supabase/sql/20261004_basket_canonical_commerce_v1.sql`
- Create: `scripts/test-basket-canonical-commerce.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Consumes: `basket_stock_lots`, `basket_stock_lot_items`, `basket_templates`, `basket_kit_templates`, `basket_categories`, `ops2_sellable_stock_v1`.
- Produces: view `basket_lot_public_availability_v1`, view `basket_commercial_catalog_v1`, campos `public_available`, `availability_reason`, `public_lot_id`, `category_name`, `category_slug`, `linked_lot_id`, `linked_available`.

- [ ] **Step 1: Write the failing contract test**

Create `scripts/test-basket-canonical-commerce.mjs` asserting the new SQL file defines both canonical views, checks `effective_sellable_stock` rather than `loose_sellable_stock` for component existence, uses `least(...)` for linked lots, exposes all required `availability_reason` values, orders eligible lots by `built_at, created_at, id` for FIFO, and enforces category presence for every public commercial model.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-basket-canonical-commerce.mjs`
Expected: FAIL because `supabase/sql/20261004_basket_canonical_commerce_v1.sql` does not exist.

- [ ] **Step 3: Implement category normalization and availability views**

In both migration snapshots, add `category_id` to standalone `basket_kit_templates` if missing and backfill deterministically: baskets with `uses_hygiene_kit=true` → `cestas-completas`; false → `cestas-so-alimento`; standalone `Kit Limpeza e Higiene` → `kits-limpeza-e-higiene`. After backfill, make `basket_templates.category_id` mandatory and add a constraint requiring `basket_kit_templates.category_id` whenever `basket_id is null`; internal kit templates inherit the parent basket category and may keep their own `category_id` null. Define `basket_lot_public_availability_v1` with the exact output fields from Interfaces and the reasons from the spec.

- [ ] **Step 4: Implement model-level canonical catalog**

Define `basket_commercial_catalog_v1` to normalize `basket_templates` and standalone `basket_kit_templates` only, select the first `public_available>0` lot by FIFO, expose current price/name/category/image fields, use published lot image then model image as fallback, and never expose internal `basket_kit_templates` linked to a basket as duplicate public products.

- [ ] **Step 5: Add compatibility wrappers**

Replace logic in `basket_current_kit_lot_v2`, `basket_current_lot_v1` and `basket_split_availability_v1` only where necessary so their stock result derives from the canonical availability instead of maintaining a divergent public-stock rule.

- [ ] **Step 6: Verify GREEN**

Run: `node --disable-warning=ExperimentalWarning scripts/test-basket-canonical-commerce.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: add canonical basket commerce availability`.

### Task 2: Montagem automática e pausa como única intervenção manual

**Files:**
- Modify: `supabase/migrations/20261004223000_basket_canonical_commerce_v1.sql`
- Modify: `supabase/sql/20261004_basket_canonical_commerce_v1.sql`
- Modify: `scripts/test-basket-lot-ops-rules.mjs`
- Modify: `scripts/test-basket-kit-editor.mjs`

**Interfaces:**
- Consumes: `basket_lot_public_availability_v1` from Task 1 and existing draft/activate/reopen RPCs.
- Produces: mounting RPC behavior with `sale_enabled=true`; pause/resume behavior through existing sale toggle RPC semantics.

- [ ] **Step 1: Update tests to the new state contract**

Change assertions that currently require a separate `Ativar no site` action. New assertions: mounting sets the lot sellable by default; the daily UI contains `Pausar venda`/`Retomar venda`; no ordinary flow requires `Ativar no site`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-basket-lot-ops-rules.mjs`
Expected: FAIL on the legacy activation contract.

- [ ] **Step 3: Update lot activation RPCs**

When a draft becomes `ready`, set `sale_enabled=true` in the same transaction after linked-lot validation. Preserve explicit pause state for already-existing lots; do not automatically unpause a manually paused historical lot except when the user explicitly resumes it.

- [ ] **Step 4: Keep reopen safety unchanged**

Reopening a ready lot still requires no incompatible order history/partial consumption/dependency. Reopen must remove it from public eligibility while editing.

- [ ] **Step 5: Verify tests**

Run the two changed test scripts; expected PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: make mounted basket lots sellable by default`.

### Task 3: Admin API normalized for Cestas/Kits

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Create: `scripts/test-basket-admin-canonical-api.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Consumes: `basket_commercial_catalog_v1`, `basket_lot_public_availability_v1`.
- Produces: action `basket_commercial_admin` returning `{categories, models}`; every model includes `commercial_id`, `source_kind`, `name`, `category_id`, `category_name`, `category_slug`, `price`, `public_lot_id`, `public_lot_code`, `public_available`, `availability_reason`, `lot_count`, `ready_lot_count`, `draft_lot_count`.

- [ ] **Step 1: Write failing API source-contract test**

Assert the new action exists, reads both canonical views, and does not recalculate public stock from `quantity_available` in TypeScript.

- [ ] **Step 2: Run and verify RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-basket-admin-canonical-api.mjs`
Expected: FAIL because the action does not exist.

- [ ] **Step 3: Implement read model**

Add `basket_commercial_admin` to `LOCAL`; batch-read canonical model/lot data and append existing lot/item details only for editing. Keep current write RPCs as compatibility adapters in this phase.

- [ ] **Step 4: Normalize labels and state**

Map canonical reasons to short operational labels: `draft` → Em edição; `depleted` → Esgotado; `paused` → Pausado; available/component/link reasons keep state Montado with a concise availability explanation.

- [ ] **Step 5: Verify GREEN and existing suggestion test**

Run new API test plus `scripts/test-basket-kit-suggestions.mjs`; expected PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: expose canonical basket admin model`.

### Task 4: Simplificar a tela Admin para um fluxo Cesta/Kit

**Files:**
- Modify: `vitrine/admin/index.html`
- Modify: `scripts/test-basket-kit-editor.mjs`
- Modify: `scripts/test-basket-lot-ops-rules.mjs`
- Create: `scripts/test-basket-admin-simple-flow.mjs`

**Interfaces:**
- Consumes: `basket_commercial_admin` from Task 3 and existing save/draft/duplicate/print/substitution actions.
- Produces: one operational surface named **Cestas/Kits** with category filters and rapid actions.

- [ ] **Step 1: Write failing browser/source tests**

Cover: five category filters; card fields name/price/public stock/state/current lot; actions Editar, Novo lote, Duplicar lote, Pausar/Retomar, Imprimir; absence of technical `split`, `food`, `hygiene`, `business_type` controls in the primary view; absence of `Ativar no site`; criação de um novo modelo permite informar e salvar o primeiro lote sem sair do formulário.

- [ ] **Step 2: Verify RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-basket-admin-simple-flow.mjs`
Expected: FAIL on old screen structure.

- [ ] **Step 3: Replace primary listing**

Render the primary page from `basket_commercial_admin`; use category chips and compact cards. Keep destructive/archive operations secondary.

- [ ] **Step 4: Unify create/edit form**

The form must expose only Name, Category, Price, Composition, Lot Quantity and optional Linked Lot. For um novo modelo, a mesma confirmação deve criar/salvar o modelo e seu primeiro lote sem exigir navegação adicional. `Novo lote` usa a composição padrão; `Duplicar lote` copia composição/preço/vínculo, herda a categoria do modelo e gera novo código automaticamente. Preserve current family-based **Trocar** picker with stock display.

- [ ] **Step 5: Preserve advanced/history routes behind secondary actions**

Existing historical lot details, safe reopen, deletion/archiving and print remain reachable but do not dominate daily workflow.

- [ ] **Step 6: Verify browser tests on mobile and desktop**

Run `scripts/test-basket-kit-editor.mjs` with Playwright plus new simple-flow test. Expected: PASS, no horizontal viewport overflow.

- [ ] **Step 7: Commit**

Commit message: `refactor: simplify baskets kits admin workflow`.

### Task 5: Checkout/reservation must use canonical availability transactionally

**Files:**
- Modify: `supabase/migrations/20261004223000_basket_canonical_commerce_v1.sql`
- Modify: `supabase/sql/20261004_basket_canonical_commerce_v1.sql`
- Create: `scripts/test-basket-canonical-checkout.mjs`

**Interfaces:**
- Consumes: `basket_lot_public_availability_v1`; existing `create_vitrine_cart_order_v1` and `reserve_vitrine_order_stock_v1` flow.
- Produces: transaction-safe reservation that validates main + linked lot and decrements/reserves both atomically.

- [ ] **Step 1: Write failing checkout contract test**

Assert the SQL reservation path locks involved `basket_stock_lots` rows `FOR UPDATE`, checks canonical eligibility after locking, validates quantity against the minimum linked stock, and records allocations for all participating lots.

- [ ] **Step 2: Verify RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-basket-canonical-checkout.mjs`
Expected: FAIL on the current quantity-only validation.

- [ ] **Step 3: Implement transactional canonical validation**

Before reservation, lock lot rows in deterministic ID order, recompute required availability using the same component/linked rules from Task 1, reject with a specific basket-stock error if eligibility or stock changed, then create allocations/decrement within the same transaction.

- [ ] **Step 4: Preserve original-basket customization semantics**

Do not alter the current rule that distinguishes unchanged premounted composition from loose additions/removals; only replace stock eligibility/reservation source.

- [ ] **Step 5: Add concurrency-oriented SQL fixture assertions**

The test contract must demonstrate that a second reservation cannot pass using stale pre-lock availability when the first consumes the final connected unit.

- [ ] **Step 6: Verify GREEN**

Run new checkout test and existing `scripts/test-basket-lot-ops-rules.mjs`; expected PASS.

- [ ] **Step 7: Commit**

Commit message: `fix: reserve basket stock from canonical availability`.

### Task 6: Storefront API uses canonical catalog and separate basket categories

**Files:**
- Modify: `supabase/functions/storefront-v2/index.ts`
- Modify: `scripts/test-basket-carousel-service.mjs`
- Create: `scripts/test-basket-storefront-canonical.mjs`
- Modify: `.github/workflows/basket-carousel-ci.yml`

**Interfaces:**
- Consumes: `basket_commercial_catalog_v1`.
- Produces: `home()` response with existing `categories` unchanged plus `basket_categories`, and `baskets[]` sourced from canonical model stock.

- [ ] **Step 1: Write failing service tests**

Assert `categories` remains Mercearia/Limpeza/Higiene/Casa-Pet; `basket_categories` has exactly five official categories; baskets with `public_available=0` are absent; stock is copied from `public_available`; detail/quote reject a lot no longer canonical-available; quando o primeiro lote FIFO esgota, a resposta passa automaticamente ao próximo lote elegível do mesmo modelo.

- [ ] **Step 2: Verify RED**

Run service tests; expected FAIL because `home()` still selects legacy/split views independently and has no `basket_categories` field.

- [ ] **Step 3: Replace home/detail source**

Read `basket_commercial_catalog_v1` for Cesta/Kit list and current lot. Keep product catalog CATEGORIES untouched. Batch-load current lot component images/items by canonical lot IDs.

- [ ] **Step 4: Remove split/legacy public divergence**

Keep compatibility identifiers in payload if checkout still needs them, but no public visibility branch may calculate a second stock number from `basket_current_lot_v1` or `basket_split_availability_v1`.

- [ ] **Step 5: Verify GREEN**

Run `scripts/test-basket-carousel-service.mjs` and new canonical storefront test; expected PASS.

- [ ] **Step 6: Commit**

Commit message: `refactor: serve baskets kits from canonical catalog`.

### Task 7: Site público filtra Cestas/Kits pelas cinco categorias

**Files:**
- Modify: `vitrine/index.html`
- Modify: `index.html`
- Modify: `vitrine/basket-carousel.js`
- Modify: `scripts/test-basket-carousel-browser.mjs`

**Interfaces:**
- Consumes: `basket_categories` and canonical `baskets[]` from Task 6.
- Produces: category chips/sections specific to Cestas/Kits without changing normal product navigation.

- [ ] **Step 1: Extend browser fixture and write failing assertions**

Return five `basket_categories` in mocked home response and at least two baskets in different basket categories. Assert category controls appear and filtering changes only basket cards; normal product category navigation remains unchanged.

- [ ] **Step 2: Verify RED**

Run Playwright carousel browser test; expected FAIL because page does not render basket category controls.

- [ ] **Step 3: Implement basket category controls**

Render compact chips/sections near Cestas/Kits. Use `category_slug` as filter key. Do not reuse the normal `.nav` product-category state.

- [ ] **Step 4: Preserve card/detail behavior**

`BasketCarousel.card()` continues to show category tag, real lot composition and canonical stock; clicking still opens the same detail flow.

- [ ] **Step 5: Verify mobile/desktop**

Run browser test at 390px, 320px and 1440px; expected PASS with no horizontal page overflow.

- [ ] **Step 6: Commit**

Commit message: `feat: filter baskets kits by public category`.

### Task 8: End-to-end regression, data audit and rollout

**Files:**
- Modify: `.github/workflows/basket-kit-editor-ci.yml`
- Modify: `.github/workflows/basket-carousel-ci.yml`
- Update only if needed: documentation/status notes under `docs/projects/dona-antonia-operations-2/`.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: release candidate with canonical stock as sole public source.

- [ ] **Step 1: Run full basket CI locally/in branch**

Run every command currently present in `basket-kit-editor-ci.yml` plus `basket-carousel-ci.yml` and the new tests from Tasks 1, 3, 5 and 6. Expected: all PASS.

- [ ] **Step 2: Run database preflight on production data read-only**

Assert: exactly five active basket categories; zero commercial models without category after migration preview; no cyclic/composed linked-lot chains; current ready/draft/depleted lot counts are unchanged by the schema migration itself.

- [ ] **Step 3: Apply migration before Edge deployment**

Apply `basket_canonical_commerce_v1`; immediately query canonical views for existing baskets/kits and compare public quantities with the expected current lot/link states.

- [ ] **Step 4: Deploy `admin-products-live-v1` and `storefront-v2`**

Deploy functions from the exact reviewed commit. Confirm both ACTIVE and health endpoints successful.

- [ ] **Step 5: Smoke-test production read paths**

Verify Admin Cestas/Kits loads, five categories appear, public site only shows models with positive canonical availability, and no ordinary product category disappeared.

- [ ] **Step 6: Controlled stock scenarios**

Using non-customer test data or transaction rollback where possible, verify: last lot unit disappears; linked 8/3 exposes 3; component-out-of-stock hides lot; stock restoration returns non-paused lot; paused lot stays hidden.

- [ ] **Step 7: Merge only after verification evidence**

Record CI, migration, Edge versions and Pages deployment in the PR; merge only with all basket-specific checks green.
