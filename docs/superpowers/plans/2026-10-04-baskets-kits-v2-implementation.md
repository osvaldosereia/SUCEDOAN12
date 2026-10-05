# Cestas e Kits V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir uma nova seção paralela **Cestas e Kits** com UX rápida, composição por produtos ou por múltiplas Cestas/Kits, financeiro correto, lotes FIFO e disponibilidade derivada, sem alterar destrutivamente a seção atual **Cestas** antes da homologação.

**Architecture:** A V2 usa tabelas próprias e uma Edge Function própria para isolar o novo fluxo do legado. Cesta/Kit é a entidade comercial; lotes existem apenas para itens montados com produtos; combinações referenciam outras Cestas/Kits base em relação 1→N e calculam disponibilidade pelo menor componente. A seção antiga, storefront atual e checkout atual continuam intactos até o cutover posterior.

**Tech Stack:** Supabase PostgreSQL, Supabase Edge Functions/Deno/TypeScript, HTML/CSS/JavaScript do Vitrine Admin, Node.js tests (`scripts/test-*.mjs`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-04-baskets-kits-v2-design.md`

## Global Constraints

- A seção atual `Cestas` permanece funcional e não deve ser removida, renomeada nem reapontada durante esta implementação.
- A nova entrada de menu será `Cestas e Kits` e usará estruturas `basket_v2_*` independentes das tabelas legadas.
- Para o operador e cliente, Cesta e Kit são a mesma entidade comercial.
- Categorias oficiais: `Cestas Completas`, `Cestas Só Alimento`, `Kits Limpeza e Higiene`, `Kits Limpeza`, `Kits Higiene`.
- Dois modos de composição: `products` e `combined_kits`.
- Combinações aceitam qualquer quantidade prática de componentes; o banco não terá limite artificial de 2 componentes.
- Combinação terá somente um nível: item `combined_kits` não pode ser componente de outra combinação.
- Preço final da combinação é manual e independente da soma das vendas dos componentes.
- Custo ausente é `NULL/unknown`, nunca `0` implícito; lote com custo ausente pode ser rascunho, mas não pode ser montado.
- Lotes montados congelam custo, valor dos produtos e preços unitários usados.
- Venda de lotes físicos segue FIFO.
- Disponibilidade de combinação = menor `floor(disponibilidade_componente / quantidade_necessaria)`.
- Estado `Pausado` prevalece sobre disponibilidade automática.
- Nenhum endpoint V2 pode escrever nas tabelas legadas de Cestas.
- Storefront/checkout atuais não mudam neste plano; a V2 terá preview/homologação paralela e cutover posterior.

## Review Focus

1. Produto ativo com `products.cost IS NULL` ou `<= 0`: rascunho salva, montagem falha com lista explícita dos produtos sem custo.
2. Combinação contendo componente pausado ou sem estoque: disponibilidade da combinação é zero sem alterar os outros componentes.
3. Tentativa de usar uma combinação como componente de outra: backend rejeita, mesmo que a UI tente enviar o payload manualmente.
4. Mesmo componente adicionado duas vezes: backend consolida em uma linha com quantidade somada, sem dupla contagem financeira.
5. Concorrência ao montar lote: disponibilidade e custo são relidos dentro do RPC de montagem; frontend nunca é autoridade.

---

## File Structure

### Banco
- Create: `supabase/migrations/20261005011000_baskets_kits_v2_core.sql`
- Create: `supabase/migrations/20261005011500_baskets_kits_v2_writes.sql`
- Create: `supabase/migrations/20261005012000_baskets_kits_v2_lot_mount.sql`
- Create: `supabase/migrations/20261005013000_baskets_kits_v2_import.sql`
- Test: `supabase/tests/baskets_kits_v2_core.sql`

### API V2
- Create: `supabase/functions/admin-baskets-v2-v1/index.ts`
- Test: `scripts/test-baskets-kits-v2-api.mjs`

### Admin
- Create: `vitrine/admin/cestas-kits-v2.js`
- Create: `vitrine/admin/cestas-kits-v2.css`
- Modify: `vitrine/admin/index.html`
- Test: `scripts/test-baskets-kits-v2-ui.mjs`

### Preview de homologação
- Create: `vitrine/cestas-kits-v2-preview/index.html`
- Create: `supabase/functions/storefront-baskets-v2-v1/index.ts`
- Test: `scripts/test-baskets-kits-v2-preview.mjs`

### CI
- Create: `.github/workflows/test-baskets-kits-v2.yml`

---

### Task 1: Schema V2 e invariantes de composição

**Files:**
- Create: `supabase/migrations/20261005011000_baskets_kits_v2_core.sql`
- Test: `supabase/tests/baskets_kits_v2_core.sql`
- Test: `scripts/test-baskets-kits-v2-schema.mjs`

**Interfaces:**
- Consumes: `public.products`, `public.basket_categories`.
- Produces:
  - `public.basket_v2_items`
  - `public.basket_v2_product_components`
  - `public.basket_v2_kit_components`
  - `public.basket_v2_lots`
  - `public.basket_v2_lot_items`
  - `public.basket_v2_item_availability_v1`
  - `public.basket_v2_item_financials_v1`
  - `public.basket_v2_item_detail_admin_v1(p_item_id uuid) returns jsonb`

- [ ] **Step 1: Write the failing schema contract test**

Create `scripts/test-baskets-kits-v2-schema.mjs` asserting:
- migration defines all five `basket_v2_*` tables;
- `basket_v2_items.composition_mode` accepts only `products|combined_kits`;
- `basket_v2_kit_components` has unique `(parent_item_id, component_item_id)`;
- self-reference is forbidden;
- component quantity is integer `>= 1`;
- no migration statement drops/alters legacy basket tables.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-baskets-kits-v2-schema.mjs`
Expected: FAIL because migration/tables do not exist.

- [ ] **Step 3: Implement `20261005011000_baskets_kits_v2_core.sql`**

Tables:
- `basket_v2_items`: `id`, `public_name`, `category_id`, `image_url`, `description_short`, `sale_price numeric(12,2)`, `composition_mode`, `paused`, `sort_order`, timestamps, `legacy_source_id uuid null`.
- `basket_v2_product_components`: `item_id`, `product_id`, `quantity numeric(12,3)`, `position_order`.
- `basket_v2_kit_components`: `parent_item_id`, `component_item_id`, `quantity integer`, `position_order`, unique parent+component.
- `basket_v2_lots`: `item_id`, `code`, `status draft|mounted|exhausted`, `quantity_built`, `quantity_available`, `cost_total_snapshot`, `retail_total_snapshot`, `mounted_at`, timestamps, `legacy_source_id uuid null`.
- `basket_v2_lot_items`: `lot_id`, `product_id`, `quantity_per_kit`, `unit_cost_snapshot`, `unit_price_snapshot`, `position_order`.

Use FK to existing `basket_categories`.

- [ ] **Step 4: Add `basket_v2_validate_component_v1()` trigger**

Reject parent=self and reject any component whose `composition_mode='combined_kits'`.

- [ ] **Step 5: Add canonical views/read RPC**

Rules:
- direct availability = sum mounted `quantity_available`, unless paused;
- combined availability = minimum `floor(component availability / quantity)`;
- direct current cost reference = oldest FIFO mounted lot with available quantity;
- combined current cost = sum component current costs × quantity;
- combined retail-products reference = sum component retail-products references × quantity;
- final sale price always comes from `basket_v2_items.sale_price`.

- [ ] **Step 6: Run GREEN and SQL rollback preflight**

Run: `node scripts/test-baskets-kits-v2-schema.mjs`
Expected: PASS.

Execute migration in `BEGIN; ... ROLLBACK;` against current Supabase schema.
Expected: no SQL errors and zero persistent writes.

- [ ] **Step 7: Commit**

`git commit -m "feat: add isolated baskets kits v2 schema"`

---

### Task 2: API administrativa V2 read-only e autoridade de custo

**Files:**
- Create: `supabase/functions/admin-baskets-v2-v1/index.ts`
- Create: `scripts/test-baskets-kits-v2-api.mjs`

**Interfaces:**
- Consumes Task 1.
- Produces GET actions: `health`, `list`, `detail`, `product_search`, `product_suggestions`, `component_candidates`.
- Product shape: `{id,name,sku,gtin,image_url,packaging,cost:number|null,price:number|null,loose_stock:number}`.

- [ ] **Step 1: Write failing API tests**

Assert `cost` is selected in product search and family suggestions; missing/zero cost maps to `null`, never implicit zero; V2 actions read only V2 basket structures.

- [ ] **Step 2: Run RED**

`node scripts/test-baskets-kits-v2-api.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement read API**

`list` returns `{id,public_name,category,price_cents,availability,composition_mode,state,image_url}`.

`detail` returns `{item,product_components,kit_components,lots,financial,availability}`.

- [ ] **Step 4: Add current cost bug regression**

Fixture cost `24.90` remains `24.90`; missing cost becomes `null`.

- [ ] **Step 5: Run GREEN and commit**

`node scripts/test-baskets-kits-v2-api.mjs`
Expected: PASS.

`git commit -m "feat: add baskets kits v2 admin read api"`

---

### Task 3: CRUD transacional da Cesta/Kit comercial

**Files:**
- Create: `supabase/migrations/20261005011500_baskets_kits_v2_writes.sql`
- Modify: `supabase/functions/admin-baskets-v2-v1/index.ts`
- Modify: `scripts/test-baskets-kits-v2-api.mjs`

**Interfaces:**
- Produces RPCs:
  - `basket_v2_item_save_v1(p_item jsonb, p_operator text) returns jsonb`
  - `basket_v2_product_components_save_v1(p_item_id uuid, p_components jsonb, p_operator text) returns jsonb`
  - `basket_v2_kit_components_save_v1(p_item_id uuid, p_components jsonb, p_operator text) returns jsonb`
  - `basket_v2_item_duplicate_v1(p_item_id uuid, p_operator text) returns jsonb`
  - `basket_v2_item_pause_v1(p_item_id uuid, p_paused boolean, p_operator text) returns jsonb`
- API POST actions: `item_save`, `item_duplicate`, `item_pause`, `product_components_save`, `kit_components_save`.

- [ ] **Step 1: Add failing write tests**

Cases: category required; sale price > 0; duplicate kit IDs consolidate quantity; combined component rejected; mode switch only changes V2 composition.

- [ ] **Step 2: Run RED**

`node scripts/test-baskets-kits-v2-api.mjs`
Expected: FAIL on write actions.

- [ ] **Step 3: Implement write RPCs**

All multi-row replaces happen inside PostgreSQL functions, not ordered client writes. Enforce invariants again in SQL.

- [ ] **Step 4: Wire Edge actions to RPCs**

Edge validates payload shape and operator, then delegates persistence to RPC.

- [ ] **Step 5: Run GREEN and commit**

`node scripts/test-baskets-kits-v2-api.mjs`
Expected: PASS.

`git commit -m "feat: add transactional v2 basket editing"`

---

### Task 4: Lotes físicos, custo confiável e snapshot FIFO

**Files:**
- Create: `supabase/migrations/20261005012000_baskets_kits_v2_lot_mount.sql`
- Modify: `supabase/functions/admin-baskets-v2-v1/index.ts`
- Create: `scripts/test-baskets-kits-v2-lots.mjs`
- Modify: `supabase/tests/baskets_kits_v2_core.sql`

**Interfaces:**
- Produces RPCs:
  - `basket_v2_lot_draft_save_v1(p_item_id uuid,p_lot_id uuid,p_quantity integer,p_items jsonb,p_operator text) returns jsonb`
  - `basket_v2_lot_mount_v1(p_lot_id uuid,p_operator text) returns jsonb`
  - `basket_v2_lot_draft_delete_v1(p_lot_id uuid,p_operator text) returns jsonb`
- API actions: `lot_draft_save`, `lot_mount`, `lot_delete_draft`.

- [ ] **Step 1: Write failing lot tests**

Cases: missing cost draft saves; mount returns `missing_cost_products`; server re-reads costs/prices; snapshots immutable after product price change; FIFO oldest available lot; quantity cannot exceed stock capacity.

- [ ] **Step 2: Run RED**

`node scripts/test-baskets-kits-v2-lots.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement draft RPC**

Persist product IDs/quantities and lot quantity; never trust client cost/price.

- [ ] **Step 4: Implement mount RPC**

Within one DB function: lock lot; re-read products; reject null/zero cost; verify stock; compute snapshots; write lot items; mark mounted with built/available quantity.

- [ ] **Step 5: Run GREEN and commit**

`node scripts/test-baskets-kits-v2-lots.mjs`
Expected: PASS.

`git commit -m "feat: add v2 lot mounting and financial snapshots"`

---

### Task 5: Combinações ilimitadas e Plano B financeiro

**Files:**
- Modify: `supabase/functions/admin-baskets-v2-v1/index.ts`
- Create: `scripts/test-baskets-kits-v2-combinations.mjs`
- Modify: `supabase/tests/baskets_kits_v2_core.sql`

**Interfaces:**
- Detail component: `{item_id,name,quantity,availability,current_cost_cents,retail_products_cents,sale_price_cents}`.
- Summary: `{cost_total_cents,retail_products_total_cents,component_sales_total_cents,final_sale_price_cents,commercial_adjustment_cents,availability}`.

- [ ] **Step 1: Write failing combination tests**

Accept 1, 3 and 20 components; availability uses min floor; duplicates consolidate; paused component zeroes availability; combined child rejected; final price independent from summed component sales.

- [ ] **Step 2: Run RED**

`node scripts/test-baskets-kits-v2-combinations.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement detail/summary**

Current cost of base component = next FIFO sellable lot snapshot. Ignore exhausted/history lots.

- [ ] **Step 4: Run GREEN and commit**

`node scripts/test-baskets-kits-v2-combinations.mjs`
Expected: PASS.

`git commit -m "feat: add unlimited v2 kit combinations"`

---

### Task 6: Nova seção Admin `Cestas e Kits`

**Files:**
- Create: `vitrine/admin/cestas-kits-v2.js`
- Create: `vitrine/admin/cestas-kits-v2.css`
- Modify: `vitrine/admin/index.html`
- Create: `scripts/test-baskets-kits-v2-ui.mjs`

**Interfaces:**
- Consumes Tasks 2–5.
- Produces menu/route key `baskets-kits-v2`, label `Cestas e Kits`.

- [ ] **Step 1: Write failing UI contract test**

Old `Cestas` remains; new `Cestas e Kits` exists; V2 assets load; list has search, 5 category filters and `+ Nova Cesta/Kit`; V2 file does not expose legacy technical labels.

- [ ] **Step 2: Run RED**

`node scripts/test-baskets-kits-v2-ui.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement compact list**

Card: photo, name, category, price, availability, mode, state; actions `Editar`, `Novo lote` for products mode, `Duplicar`, `Pausar/Retomar`.

- [ ] **Step 4: Implement single-screen editor**

Blocks: Dados; `Produtos | Combinar Cestas/Kits`; composition; sticky financial panel. Avoid nested modal chains for normal edit flow.

- [ ] **Step 5: Implement product composition UX**

Rows: photo, name, qty, cost, retail, stock, `Trocar`, `Remover`. Null cost renders `Custo não informado`, never `R$ 0,00`.

- [ ] **Step 6: Implement combination UX**

`+ Adicionar Cesta/Kit` repeatable. Each component card shows cost, total products, sale and availability. Re-adding same item increments quantity.

- [ ] **Step 7: Implement lot UX**

Products mode only: lots compact table, `+ Novo lote`, duplicate, draft, mount, missing-cost focus.

- [ ] **Step 8: Run GREEN and commit**

`node scripts/test-baskets-kits-v2-ui.mjs`
Expected: PASS.

`git commit -m "feat: add fast Cestas e Kits v2 admin section"`

---

### Task 7: Preview público paralelo para homologação

**Files:**
- Create: `supabase/functions/storefront-baskets-v2-v1/index.ts`
- Create: `vitrine/cestas-kits-v2-preview/index.html`
- Create: `scripts/test-baskets-kits-v2-preview.mjs`

**Interfaces:**
- GET actions: `health`, `categories`, `catalog`, `detail`.
- Read-only; no checkout/order write.

- [ ] **Step 1: Write failing preview tests**

Page is `noindex,nofollow`; only V2 API; 5 categories; products-mode expands products; combined-mode expands base kits without lot codes.

- [ ] **Step 2: Run RED**

`node scripts/test-baskets-kits-v2-preview.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement read API and preview page**

Catalog only returns not-paused V2 items with availability > 0. No buy button yet.

- [ ] **Step 4: Run GREEN and commit**

`node scripts/test-baskets-kits-v2-preview.mjs`
Expected: PASS.

`git commit -m "feat: add baskets kits v2 storefront preview"`

---

### Task 8: Importação não destrutiva para homologação

**Files:**
- Create: `supabase/migrations/20261005013000_baskets_kits_v2_import.sql`
- Modify: `supabase/functions/admin-baskets-v2-v1/index.ts`
- Create: `scripts/test-baskets-kits-v2-import.mjs`

**Interfaces:**
- RPCs: `basket_v2_import_legacy_preview_v1() returns jsonb`, `basket_v2_import_legacy_apply_v1(p_operator text) returns jsonb`.
- API actions: `import_preview`, `import_apply`.

- [ ] **Step 1: Write failing import tests**

Preview no writes; apply idempotent by `legacy_source_id`; legacy tables untouched; ambiguous linked-lot structures import as draft/review; categories map only to official five.

- [ ] **Step 2: Run RED**

`node scripts/test-baskets-kits-v2-import.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement preview/apply**

Copy models/lots into V2 for comparison. Never cut over storefront or checkout here.

- [ ] **Step 4: Run GREEN and commit**

`node scripts/test-baskets-kits-v2-import.mjs`
Expected: PASS.

`git commit -m "feat: add non destructive v2 basket import"`

---

### Task 9: CI, browser smoke e relatório de homologação

**Files:**
- Create: `.github/workflows/test-baskets-kits-v2.yml`
- Create: `scripts/test-baskets-kits-v2-browser.mjs`
- Create: `docs/superpowers/reports/2026-10-04-baskets-kits-v2-homologation.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces go/no-go report; does not switch storefront/checkout.

- [ ] **Step 1: Add CI workflow**

Run all V2 tests plus existing Cestas guards.

- [ ] **Step 2: Add browser smoke**

Prove old `Cestas` still works; open new section; create direct draft; show missing-cost warning; create 3-component combination; verify summary; pause/resume; preview categories/detail.

- [ ] **Step 3: Run full suite**

Run all seven V2 node tests plus existing basket family/editor/storefront guards.
Expected: all PASS.

- [ ] **Step 4: Preflight all migrations with rollback**

Run Task 1/3/4/8 migrations against current Supabase inside a transaction and `ROLLBACK`.
Expected: success and zero persistent writes.

- [ ] **Step 5: Produce homologation report**

Include old vs V2 item count, categories, availability differences, price differences, missing-cost products, imported draft/review items and blockers.

- [ ] **Step 6: Commit**

`git commit -m "test: add baskets kits v2 homologation gate"`

---

## Explicitly Out of Scope for This Plan

- Remover a seção atual `Cestas`.
- Alterar o checkout público atual para reservar V2.
- Alterar o storefront principal para vender V2.
- Apagar ou migrar destrutivamente tabelas legadas.
- Permitir combinação recursiva/multinível.
- Corrigir em massa todos os produtos ativos sem custo; a V2 identifica e bloqueia montagem quando necessário.

Esses itens entram em um plano separado de **cutover V2** somente depois da homologação paralela.