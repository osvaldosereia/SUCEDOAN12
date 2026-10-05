# Cestas do Site por Kits Internos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar as Cestas do Site exclusivamente a partir de kits internos, com consolidação, valor oculto, montagem/reserva e lista real de lotes, sem depender do antigo domínio de posições/famílias/templates.

**Architecture:** `basket_templates` continua sendo a identidade comercial pública usada pelo storefront/checkout. `store_basket_recipes` + `store_basket_recipe_kits` definem os kits que compõem cada cesta. Um resolver achata kits por `product_id`. Para montagem, será extraído um núcleo genérico de reserva que recebe composição consolidada diretamente; o fluxo guiado antigo vira adaptador de compatibilidade e não permanece como requisito do novo domínio.

**Tech Stack:** PostgreSQL/Supabase RPCs, Edge Function TypeScript/Deno, JavaScript Admin, Node 24 + Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-kit-builder-and-store-baskets-design.md`

## Global Constraints

- Cesta do Site usa somente kits internos ativos; nenhum produto avulso é configurado diretamente nesta aba.
- Receita não reserva estoque. `Montar` recebe a quantidade física e só então reserva.
- Produtos repetidos entre kits são consolidados por `product_id` antes de custo, venda, capacidade e reserva.
- `valor_oculto = preço_final - soma_venda_produtos` por cesta; negativo gera alerta, não bloqueio.
- Lote guarda snapshot dos kits, composição consolidada e custos/preços usados.
- O núcleo genérico de reserva é a única implementação de lock/recheck/reserva; adaptadores antigos e novos delegam a ele.
- O novo fluxo não cria `basket_kit_templates` nem `basket_kit_template_items` escondidos.
- `Ver lotes` retorna todos os lotes reais do modelo.
- RPCs novas: `service_role` apenas.

## Review Focus

1. Mesmo SKU em dois kits: uma linha consolidada e reserva somada — Tasks 1/4.
2. Kit arquivado depois de lote montado: snapshot histórico permanece legível — Tasks 1/5.
3. Receita editada com lotes existentes: só novas montagens mudam — Tasks 1/4.
4. Estoque muda entre preview e confirmar: lock/recheck falha sem reserva parcial — Task 3/4.
5. Compatibilidade: editor guiado antigo continua passando seus testes, mas delega a mesma reserva genérica — Task 3.

---

### Task 1: Receita externa e resolver consolidado

**Files:**
- Create: `supabase/migrations/20261005_store_basket_recipes_v1.sql`
- Create: `supabase/sql/20261005_store_basket_recipes_v1.sql`
- Create: `scripts/test-store-basket-recipes-domain-v1.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Tables: `store_basket_recipes(basket_id,updated_at,metadata)` and `store_basket_recipe_kits(basket_id,kit_id,sort_order)`.
- `save_store_basket_recipe_v1(p_basket_id uuid,p_kit_ids uuid[],p_operator text) -> jsonb`.
- `resolve_store_basket_recipe_v1(p_basket_id uuid) -> jsonb`.

- [ ] **Step 1: Write RED domain test** — FK to `basket_templates`/`assembly_kits`, unique links, active-kit validation, consolidated items, kit snapshots, current cost/sale, loose stock, duplicate SKU summing.
- [ ] **Step 2: Run RED** — `node --disable-warning=ExperimentalWarning scripts/test-store-basket-recipes-domain-v1.mjs`; expected FAIL.
- [ ] **Step 3: Implement schema/resolver** — resolver is read-only and returns `{kits,items,cost_sum,retail_sum,capacity}` sufficient for preview/mount.
- [ ] **Step 4: SQL transaction probe** — two temporary kits sharing one product resolve to one consolidated product with summed quantity; ROLLBACK.
- [ ] **Step 5: Run GREEN and commit** — `feat: adicionar receitas de cestas por kits internos`.

---

### Task 2: Criação/edição comercial da Cesta do Site

**Files:**
- Create: `supabase/migrations/20261005_store_basket_commercial_admin_v1.sql`
- Create: `supabase/sql/20261005_store_basket_commercial_admin_v1.sql`
- Create: `scripts/test-store-basket-commercial-admin-v1.mjs`

**Interfaces:**
- `save_store_basket_commercial_v1(p_basket_id uuid,p_name text,p_category_id uuid,p_image_url text,p_base_price numeric,p_kit_ids uuid[],p_operator text) -> jsonb`.
- Null `p_basket_id`: creates canonical `basket_templates` + recipe atomically.
- Existing `p_basket_id`: updates current commercial fields/recipe only; lots remain unchanged.

- [ ] **Step 1: RED test** — one/two kits, invalid/archived kit, name/category/image/price, edit without lot mutation, hidden value returned from resolver.
- [ ] **Step 2: Run RED** — expected FAIL.
- [ ] **Step 3: Implement atomic save** — reuse canonical category/public basket fields; explicitly assert no INSERT into `basket_kit_templates` or `basket_kit_template_items`.
- [ ] **Step 4: Run GREEN and commit** — `feat: salvar cestas do site por composicao de kits`.

---

### Task 3: Extrair núcleo genérico de reserva por componentes

**Files:**
- Create: `supabase/migrations/20261005_basket_component_reservation_core_v2.sql`
- Create: `supabase/sql/20261005_basket_component_reservation_core_v2.sql`
- Modify compatibility definitions for: `preview_basket_commercial_lot_v1`, `create_basket_commercial_lot_reserved_v1`.
- Create: `scripts/test-basket-component-reservation-core-v2.mjs`
- Reuse: `scripts/test-basket-guided-lot-flow-v1.mjs`, `scripts/test-basket-guided-builder-browser.mjs`.

**Interfaces:**
- `preview_basket_reserved_lot_from_components_v2(p_basket_id uuid,p_quantity integer,p_items jsonb,p_sale_price numeric default null) -> jsonb` where each item is `{product_id,quantity_per_basket,sort_order?,metadata?}`.
- `create_basket_reserved_lot_from_components_v2(p_basket_id uuid,p_quantity integer,p_items jsonb,p_public_name text,p_sale_price numeric,p_operator text,p_notes text default null,p_snapshot jsonb default '{}'::jsonb) -> jsonb`.
- Compatibility `create_basket_commercial_lot_reserved_v1(...)` keeps its public signature, validates the old guided/template semantics, converts items to generic components and delegates to `create_basket_reserved_lot_from_components_v2`.

- [ ] **Step 1: Inspect compatibility columns** — verify `basket_stock_lot_items.kit_template_item_id` and `source_template_item_id` allow NULL. If any are NOT NULL, migration makes only those compatibility fields nullable; do not create fake template rows.
- [ ] **Step 2: Write RED core test** — generic functions exist; no `basket_kit_templates`/`kit_template_item_id` requirement inside core; validates active products/positive qty; consolidates duplicate products; uses `pg_advisory_xact_lock` + product row lock + `ops2_loose_sellable_stock_v1`; inserts lot items/reservations; no partial reservation.
- [ ] **Step 3: Write compatibility assertion** — old guided function still rejects invalid positions/families as before but its final lock/reservation path calls the generic v2 core instead of duplicating lock code.
- [ ] **Step 4: Run RED** — new test expected FAIL before core exists.
- [ ] **Step 5: Implement core and compatibility adapter** — generic lot may have `kit_template_id=NULL`; `basket_id` remains canonical model identity; item compatibility IDs remain NULL for new-domain lots; snapshot is stored in lot/item metadata.
- [ ] **Step 6: Run GREEN including old guided suite** — new core test + guided lot flow + guided browser tests all PASS.
- [ ] **Step 7: Transaction concurrency smoke** — create one temporary generic reservation, verify locked-stock delta, second over-capacity attempt fails, cancel/release, ROLLBACK.
- [ ] **Step 8: Commit** — `refactor: extrair nucleo generico de reserva de cestas`.

---

### Task 4: Preview e montagem de Cesta do Site

**Files:**
- Create: `supabase/migrations/20261005_store_basket_mount_v1.sql`
- Create: `supabase/sql/20261005_store_basket_mount_v1.sql`
- Create: `scripts/test-store-basket-mount-v1.mjs`

**Interfaces:**
- `preview_store_basket_mount_v1(p_basket_id uuid,p_quantity integer) -> jsonb`.
- `create_store_basket_reserved_lot_v1(p_basket_id uuid,p_quantity integer,p_operator text,p_notes text default null) -> jsonb`.
- Both consume `resolve_store_basket_recipe_v1`; creator delegates to `create_basket_reserved_lot_from_components_v2`.

- [ ] **Step 1: RED tests** — quantity/capacity/requirements, duplicate products, insufficient stock, concurrency, no partial reserve, hidden value, snapshot kit IDs/names/items/cost/price, and post-creation kit edits do not mutate lot.
- [ ] **Step 2: Run RED** — expected FAIL.
- [ ] **Step 3: Implement thin wrappers** — preview computes from resolved recipe; creator passes consolidated components + snapshot to generic v2 core. No template compatibility IDs are manufactured.
- [ ] **Step 4: Transaction smoke** — preview/reserve/cancel/release temporary recipe; ROLLBACK.
- [ ] **Step 5: Run GREEN and commit** — `feat: montar cesta externa a partir de kits internos`.

---

### Task 5: API administrativa de Cestas do Site

**Files:**
- Create: `supabase/functions/admin-store-baskets-v1/index.ts`
- Create: `scripts/test-store-baskets-admin-api-v1.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Actions: `list`, `detail`, `save`, `preview_mount`, `mount`, `lots`, `lot_mount`, `lot_cancel`, `sale_toggle`.

- [ ] **Step 1: RED API test** — JWT/admin, viewer read-only, no arbitrary product list in recipe writes, full lot list, Portuguese domain errors, no direct stock writes.
- [ ] **Step 2: Run RED** — expected FAIL.
- [ ] **Step 3: Implement gateway** — RPCs Tasks 1–4 + existing lifecycle/sale toggle; normalized lot reader returns legacy and generic-v2 lots.
- [ ] **Step 4: Run GREEN and commit** — `feat: adicionar api das cestas do site`.

---

### Task 6: UI Cestas do Site

**Files:**
- Create: `vitrine/admin/store-baskets.js`
- Create: `scripts/test-store-baskets-ui-v1.mjs`
- Create: `scripts/test-store-baskets-browser.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Exposes `window.DonaAntoniaStoreBaskets={render,refresh}`.
- Consumes only Admin bridge + `admin-store-baskets-v1` for this domain.

- [ ] **Step 1: RED UI contract** — fields and actions exactly `Editar cesta`, `Montar`, `Ver lotes`, `Imprimir`, `Pausar/Ativar venda`; no `Editar lote` on basket card.
- [ ] **Step 2: RED browser flow** — one/two kits, hidden value, recipe edit, mount preview, shortage block, successful mount refresh, all lots visible, print selected snapshot, negative hidden value warns but saves.
- [ ] **Step 3: Run RED** — expected FAIL.
- [ ] **Step 4: Implement UI** — recipe editor separate from lot list; lot panel has clear vertical scroll; print never opens/mutates editor.
- [ ] **Step 5: GREEN desktop/mobile** — 1440x1000 and 390x844, no page-level horizontal overflow.
- [ ] **Step 6: Commit** — `feat: criar interface simplificada de cestas do site`.

## PR boundary

1. recipe schema/resolver;
2. commercial save;
3. generic reservation core + compatibility adapter;
4. store mount wrappers;
5. Admin API + hidden UI module.

O workspace ainda não substitui a seção Cestas até o Plano 3 migrar os modelos atuais e executar o cutover.
