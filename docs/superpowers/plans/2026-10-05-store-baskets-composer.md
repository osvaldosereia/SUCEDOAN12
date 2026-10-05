# Cestas do Site por Kits Internos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a camada de receitas das cestas externas usando exclusivamente kits internos, com consolidação, valor oculto, montagem/reserva e lista real de lotes.

**Architecture:** `basket_templates` continua sendo a identidade comercial pública já usada pelo storefront/checkout; a nova camada `store_basket_recipes` e `store_basket_recipe_kits` define quais kits internos compõem cada cesta. Um resolver SQL achata os kits por `product_id`, calcula custo/venda/capacidade e alimenta o motor de lote/reserva existente. A nova UI `store-baskets.js` é independente do antigo editor guiado e ainda permanece fora do fluxo principal até o cutover do plano 3.

**Tech Stack:** PostgreSQL/Supabase RPCs, Edge Function TypeScript/Deno, JavaScript Admin, Node 24 + Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-kit-builder-and-store-baskets-design.md`

## Global Constraints

- Cesta do Site usa somente kits internos ativos; nenhum produto avulso é configurado diretamente nesta aba.
- A receita não reserva estoque. A ação `Montar` recebe a quantidade física e só então reserva.
- Produtos repetidos entre kits são consolidados por `product_id` antes de todos os cálculos e reservas.
- `valor_oculto = preço_final - soma_venda_produtos` por cesta; pode ser negativo e deve ser destacado, não bloqueado.
- Lote guarda snapshot dos kits, dos itens consolidados e dos custos/preços usados.
- O motor `create_basket_commercial_lot_reserved_v1`/lifecycle existente continua sendo a única autoridade de reserva.
- `Ver lotes` mostra todos os lotes do modelo; nunca escolhe silenciosamente apenas `operational_lot_id`.
- RPCs novas: service-role only.

## Review Focus

1. Mesmo produto em dois kits: uma única linha consolidada e reserva somada; Task 1/3.
2. Kit arquivado depois de lote montado: histórico/snapshot continua legível; Task 1/4.
3. Receita editada enquanto há lotes: somente novas montagens usam a nova receita; Task 1/3.
4. Estoque muda entre preview e confirmar: criação revalida e falha sem reserva parcial; Task 3.
5. Valor oculto negativo: UI alerta e permite salvar/montar; Task 2/4.

---

### Task 1: Receita externa e resolver consolidado

**Files:**
- Create: `supabase/migrations/20261005_store_basket_recipes_v1.sql`
- Create: `supabase/sql/20261005_store_basket_recipes_v1.sql`
- Create: `scripts/test-store-basket-recipes-domain-v1.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Tables: `store_basket_recipes(basket_id, updated_at, metadata)` and `store_basket_recipe_kits(basket_id, kit_id, sort_order)`.
- Produces: `save_store_basket_recipe_v1(p_basket_id uuid, p_kit_ids uuid[], p_operator text) -> jsonb`.
- Produces: `resolve_store_basket_recipe_v1(p_basket_id uuid) -> jsonb`.

- [ ] **Step 1: Write failing domain test**

Assert FK to `basket_templates` and `assembly_kits`; unique `(basket_id,kit_id)`; only active kits accepted for new recipe saves; resolver returns kits, consolidated items, cost sum, retail sum and per-product quantities; duplicate products across kits are summed.

- [ ] **Step 2: Run RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-store-basket-recipes-domain-v1.mjs`
Expected: FAIL because schema/RPCs do not exist.

- [ ] **Step 3: Implement schema and resolver**

`resolve_store_basket_recipe_v1` must read current product cost/price for recipe preview, return `loose_stock` from `ops2_loose_sellable_stock_v1`, and return source kit snapshots sufficient for the lot-creation wrapper. It must not write stock.

- [ ] **Step 4: Run GREEN and SQL transaction probe**

Create two temporary kits sharing one product, resolve one temporary basket recipe, assert consolidated quantity, then ROLLBACK.

- [ ] **Step 5: Commit**

Commit: `feat: adicionar receitas de cestas por kits internos`

---

### Task 2: Criação/edição comercial da Cesta do Site

**Files:**
- Create: `supabase/migrations/20261005_store_basket_commercial_admin_v1.sql`
- Create: `supabase/sql/20261005_store_basket_commercial_admin_v1.sql`
- Create: `scripts/test-store-basket-commercial-admin-v1.mjs`

**Interfaces:**
- Produces `save_store_basket_commercial_v1(p_basket_id uuid, p_name text, p_category_id uuid, p_image_url text, p_base_price numeric, p_kit_ids uuid[], p_operator text) -> jsonb`.
- When `p_basket_id` is null, create the canonical `basket_templates` row and recipe atomically.
- When editing, preserve all existing lots; only current recipe/commercial fields change.

- [ ] **Step 1: RED test**

Cover new basket with one kit, two kits, invalid/archived kit, zero/negative price rules, image/category/name persistence, update without touching existing lots, and hidden-value calculation returned from resolved recipe.

- [ ] **Step 2: Run RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-store-basket-commercial-admin-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement atomic save**

Reuse category/basket semantics already used by `basket_commercial_catalog_v1`. Do not create `basket_kit_templates` as a second editable recipe; the new assembly kits are the recipe source.

- [ ] **Step 4: Run GREEN**

Run test; expected PASS.

- [ ] **Step 5: Commit**

Commit: `feat: salvar cestas do site por composicao de kits`

---

### Task 3: Preview e montagem usando o motor de reserva existente

**Files:**
- Create: `supabase/migrations/20261005_store_basket_mount_v1.sql`
- Create: `supabase/sql/20261005_store_basket_mount_v1.sql`
- Create: `scripts/test-store-basket-mount-v1.mjs`

**Interfaces:**
- Produces `preview_store_basket_mount_v1(p_basket_id uuid, p_quantity integer) -> jsonb`.
- Produces `create_store_basket_reserved_lot_v1(p_basket_id uuid, p_quantity integer, p_operator text, p_notes text default null) -> jsonb`.
- Wrapper resolves recipe, calculates hidden value, builds item payload, calls existing reservation engine and stores recipe/snapshot metadata on the created lot.

- [ ] **Step 1: Write failing tests**

Cover quantity 10; capacity; exact required quantities; duplicate product across kits; insufficient loose stock; concurrent stock change; no partial reservation; snapshot contains kit IDs/names/items/cost/price and hidden value; editing kit after creation does not change lot items.

- [ ] **Step 2: Run RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-store-basket-mount-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement thin wrapper**

Do not duplicate row locking/reservation logic. Build the flattened `items` payload and delegate to `create_basket_commercial_lot_reserved_v1`. Add snapshot metadata in the same transaction or via extension point inside the canonical RPC so failure is atomic.

- [ ] **Step 4: Transaction smoke**

Against canonical Supabase: preview a real basket-compatible recipe, create temporary reservation, confirm locked stock delta, cancel/release it, ROLLBACK.

- [ ] **Step 5: Commit**

Commit: `feat: montar cesta externa a partir de kits internos`

---

### Task 4: API administrativa de Cestas do Site

**Files:**
- Create: `supabase/functions/admin-store-baskets-v1/index.ts`
- Create: `scripts/test-store-baskets-admin-api-v1.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Actions: `list`, `detail`, `save`, `preview_mount`, `mount`, `lots`, `lot_mount`, `lot_cancel`, `sale_toggle`.
- Read models include image/name/category/kits/base price/retail sum/cost sum/hidden value/public availability/lot count.

- [ ] **Step 1: RED API test**

Assert JWT/admin authorization, viewer read-only, API never accepts arbitrary product list for basket recipe, `lots` returns the full lot list, Portuguese domain errors, no direct stock writes.

- [ ] **Step 2: Run RED**

Run: `node --disable-warning=ExperimentalWarning scripts/test-store-baskets-admin-api-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement gateway**

Use RPCs from Tasks 1–3 and existing lot lifecycle/sale toggle operations. `lots` joins snapshots/products for print/read without modifying editor state.

- [ ] **Step 4: Run GREEN**

Expected PASS.

- [ ] **Step 5: Commit**

Commit: `feat: adicionar api das cestas do site`

---

### Task 5: UI Cestas do Site

**Files:**
- Create: `vitrine/admin/store-baskets.js`
- Create: `scripts/test-store-baskets-ui-v1.mjs`
- Create: `scripts/test-store-baskets-browser.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Consumes `DonaAntoniaAdminBridge`, `DonaAntoniaKitBuilder` summaries and `admin-store-baskets-v1`.
- Exposes `window.DonaAntoniaStoreBaskets={render,refresh}`.

- [ ] **Step 1: RED UI contract**

Require card/list fields and exactly the operational actions `Editar cesta`, `Montar`, `Ver lotes`, `Imprimir`, `Pausar/Ativar venda`. No `Editar lote` on the basket card.

- [ ] **Step 2: RED browser flow**

Create basket from one kit; create from two; verify hidden value; edit recipe; `Montar` asks quantity then shows required/available; insufficient stock blocks; successful mount refreshes; `Ver lotes` opens all lot rows; print uses selected lot snapshot; negative hidden value warns but does not disable save.

- [ ] **Step 3: Run RED**

Run both new tests; expected FAIL.

- [ ] **Step 4: Implement UI**

Keep recipe editing separate from lot list. `Ver lotes` is a dedicated panel/modal with its own vertical scrolling. Print creates print markup directly from lot snapshot, never opens an editor.

- [ ] **Step 5: Run GREEN desktop/mobile**

Expected PASS at 1440x1000 and 390x844, with no page-level horizontal overflow.

- [ ] **Step 6: Commit**

Commit: `feat: criar interface simplificada de cestas do site`

## PR boundary

Recommended PRs:
1. recipe schema + resolver;
2. commercial save + mount wrappers;
3. Admin API + hidden UI module.

The new workspace is still not the live Cestas tab until Plan 3 migrates the 9 current baskets and flips the UI atomically.
