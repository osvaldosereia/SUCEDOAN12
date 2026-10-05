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
5. Concorrência ao montar lote: disponibilidade e custo são relidos no backend dentro da mesma transação lógica; frontend nunca é autoridade.

---

## File Structure

### Banco
- Create: `supabase/migrations/20261005XXXXXX_baskets_kits_v2_core.sql`
  - tabelas V2, constraints, índices, views/RPCs de leitura e disponibilidade.
- Create: `supabase/migrations/20261005XXXXXX_baskets_kits_v2_lot_mount.sql`
  - montagem transacional, snapshot financeiro e FIFO.
- Test: `supabase/tests/baskets_kits_v2_core.sql`

### API V2
- Create: `supabase/functions/admin-baskets-v2-v1/index.ts`
  - API administrativa isolada da função legada.
- Test: `scripts/test-baskets-kits-v2-api.mjs`

### Admin
- Create: `vitrine/admin/cestas-kits-v2.js`
  - estado, chamadas API, listagem, editor, lotes e combinações.
- Create: `vitrine/admin/cestas-kits-v2.css`
  - layout da V2.
- Modify: `vitrine/admin/index.html`
  - somente inclusão dos assets, item de menu e ponto de montagem da V2.
- Test: `scripts/test-baskets-kits-v2-ui.mjs`

### Preview de homologação
- Create: `vitrine/cestas-kits-v2-preview/index.html`
  - preview read-only da experiência pública V2, `noindex`.
- Create: `supabase/functions/storefront-baskets-v2-v1/index.ts`
  - API pública read-only paralela, sem checkout.
- Test: `scripts/test-baskets-kits-v2-preview.mjs`

### CI
- Create: `.github/workflows/test-baskets-kits-v2.yml`

---

### Task 1: Schema V2 e invariantes de composição

**Files:**
- Create: `supabase/migrations/20261005XXXXXX_baskets_kits_v2_core.sql`
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

- [ ] **Step 2: Run the test and verify RED**

Run: `node scripts/test-baskets-kits-v2-schema.mjs`
Expected: FAIL because migration/tables do not exist.

- [ ] **Step 3: Implement the core migration**

Exact table responsibilities:
- `basket_v2_items`: commercial item; fields `id`, `public_name`, `category_id`, `image_url`, `description_short`, `sale_price numeric(12,2)`, `composition_mode`, `paused`, `sort_order`, timestamps.
- `basket_v2_product_components`: direct recipe with `item_id`, `product_id`, `quantity numeric(12,3)`, `position_order`.
- `basket_v2_kit_components`: composition relation with `parent_item_id`, `component_item_id`, `quantity integer`, `position_order`.
- `basket_v2_lots`: `item_id`, `code`, `status draft|mounted|exhausted`, `quantity_built`, `quantity_available`, `cost_total_snapshot`, `retail_total_snapshot`, `mounted_at`, timestamps.
- `basket_v2_lot_items`: actual mounted composition with `lot_id`, `product_id`, `quantity_per_kit`, `unit_cost_snapshot`, `unit_price_snapshot`, `position_order`.

Use FK to existing `basket_categories`; do not duplicate category table.

- [ ] **Step 4: Add server-side one-level composition protection**

Add trigger/function `basket_v2_validate_component_v1()` that rejects:
- parent = component;
- component whose `composition_mode='combined_kits'`;
- component row pointing to inactive/deleted item if such state is introduced later.

- [ ] **Step 5: Add availability and financial views/functions**

Rules:
- direct product item availability = sum of `quantity_available` from mounted lots, unless `paused`;
- combined item availability = minimum of `floor(component availability / quantity)`;
- direct current cost reference = next FIFO mounted lot's `cost_total_snapshot`;
- combined current cost reference = sum(component current cost reference × quantity);
- retail-products reference for combined item = sum(component retail-products reference × quantity);
- sale price = `basket_v2_items.sale_price`.

- [ ] **Step 6: Run SQL/static tests GREEN**

Run: `node scripts/test-baskets-kits-v2-schema.mjs`
Expected: PASS.

Run SQL preflight in Supabase inside `BEGIN; ... ROLLBACK;` during execution.
Expected: no SQL errors and no persistent changes.

- [ ] **Step 7: Commit**

`git commit -m "feat: add isolated baskets kits v2 schema"`

---

### Task 2: API administrativa V2 read-only e autoridade de custo

**Files:**
- Create: `supabase/functions/admin-baskets-v2-v1/index.ts`
- Create: `scripts/test-baskets-kits-v2-api.mjs`

**Interfaces:**
- Consumes: Task 1 tables/views/functions; existing Supabase admin authentication pattern.
- Produces HTTP actions:
  - `health`
  - `list`
  - `detail?id=<uuid>`
  - `product_search?q=<text>&limit=<n>`
  - `product_suggestions?product_id=<uuid>`
  - `component_candidates?q=<text>`

`product_search`/`product_suggestions` product shape:
`{id,name,sku,gtin,image_url,packaging,cost:number|null,price:number|null,loose_stock:number}`.

- [ ] **Step 1: Write failing API contract tests**

Assert source code:
- selects `cost` in product search and family suggestions;
- maps missing/zero cost to `null` for financial completeness, not implicit zero;
- reads only V2 basket tables for V2 actions;
- returns five official categories through list/detail payloads.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-baskets-kits-v2-api.mjs`
Expected: FAIL because function does not exist.

- [ ] **Step 3: Implement read-only API**

Follow existing CORS/auth conventions but keep V2 logic in this new function.

`list` returns compact cards only:
`{id,public_name,category,price_cents,availability,composition_mode,state,image_url}`.

`detail` returns:
`{item,product_components,kit_components,lots,financial,availability}`.

- [ ] **Step 4: Add explicit regression for current cost bug**

Test fixture where suggestion has `cost=24.90`; expected response preserves `24.90`.
Test fixture where cost is missing; expected `cost:null`, never `0`.

- [ ] **Step 5: Run GREEN and commit**

Run: `node scripts/test-baskets-kits-v2-api.mjs`
Expected: PASS.

`git commit -m "feat: add baskets kits v2 admin read api"`

---

### Task 3: CRUD rápido da Cesta/Kit comercial

**Files:**
- Modify: `supabase/functions/admin-baskets-v2-v1/index.ts`
- Modify: `scripts/test-baskets-kits-v2-api.mjs`

**Interfaces:**
- Produces POST actions:
  - `item_save`
  - `item_duplicate`
  - `item_pause`
  - `product_components_save`
  - `kit_components_save`

`item_save` body:
`{id?, public_name, category_id, image_url?, description_short?, sale_price_cents, composition_mode}`.

`product_components_save` body:
`{item_id, components:[{product_id,quantity,position_order}]}`.

`kit_components_save` body:
`{item_id, components:[{component_item_id,quantity,position_order}]}`.

- [ ] **Step 1: Add failing tests for write validation**

Cases:
- missing category -> 400;
- invalid/non-positive sale price -> 400;
- duplicate kit component IDs are consolidated by quantity before persistence;
- `combined_kits` cannot include another `combined_kits` item;
- mode switch deletes only old V2 composition rows, never legacy rows.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-baskets-kits-v2-api.mjs`
Expected: FAIL on write actions.

- [ ] **Step 3: Implement minimal writes**

Use service-role transaction-safe RPCs or ordered DB writes with rollback-safe error handling. Enforce all composition invariants again server-side.

- [ ] **Step 4: Run GREEN and commit**

`node scripts/test-baskets-kits-v2-api.mjs`
Expected: PASS.

`git commit -m "feat: add baskets kits v2 commercial editing"`

---

### Task 4: Lotes físicos, custo confiável e snapshot FIFO

**Files:**
- Create: `supabase/migrations/20261005XXXXXX_baskets_kits_v2_lot_mount.sql`
- Modify: `supabase/functions/admin-baskets-v2-v1/index.ts`
- Create: `scripts/test-baskets-kits-v2-lots.mjs`
- Modify: `supabase/tests/baskets_kits_v2_core.sql`

**Interfaces:**
- Produces RPCs:
  - `basket_v2_lot_draft_save_v1(p_item_id uuid, p_lot_id uuid, p_quantity integer, p_items jsonb, p_operator text) returns jsonb`
  - `basket_v2_lot_mount_v1(p_lot_id uuid, p_operator text) returns jsonb`
- API actions:
  - `lot_draft_save`
  - `lot_mount`
  - `lot_delete_draft`

- [ ] **Step 1: Write failing financial/lot tests**

Cases:
- draft with missing cost saves;
- mount with missing/zero `products.cost` fails with `missing_cost_products` array;
- mount re-reads `products.cost` and `products.price`, ignoring client-provided cost/price;
- snapshots are written to lot and lot items;
- changing `products.cost` after mount does not mutate snapshot;
- FIFO reference selects oldest mounted lot with `quantity_available>0`;
- quantity cannot exceed component stock capacity.

- [ ] **Step 2: Run RED**

`node scripts/test-baskets-kits-v2-lots.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement draft save**

Draft may contain null cost in UI payload; persist product IDs/quantities only as mutable recipe state. Never trust client financial values.

- [ ] **Step 4: Implement mount RPC**

Inside database function:
1. lock draft lot row;
2. re-read every referenced product;
3. reject missing/zero cost;
4. verify stock/capacity;
5. calculate unit and total snapshots;
6. write `basket_v2_lot_items` snapshots;
7. set lot `mounted`, `quantity_available=quantity_built`, `mounted_at=now()`.

- [ ] **Step 5: Run GREEN and commit**

`node scripts/test-baskets-kits-v2-lots.mjs`
Expected: PASS.

`git commit -m "feat: add v2 lot mounting and financial snapshots"`

---

### Task 5: Combinações ilimitadas e resumo financeiro Plano B

**Files:**
- Modify: `supabase/functions/admin-baskets-v2-v1/index.ts`
- Create: `scripts/test-baskets-kits-v2-combinations.mjs`
- Modify: `supabase/tests/baskets_kits_v2_core.sql`

**Interfaces:**
- `detail` for `combined_kits` returns each component:
`{item_id,name,quantity,availability,current_cost_cents,retail_products_cents,sale_price_cents}`.
- Summary:
`{cost_total_cents,retail_products_total_cents,component_sales_total_cents,final_sale_price_cents,commercial_adjustment_cents,availability}`.

- [ ] **Step 1: Write failing combination tests**

Cases:
- 1, 3 and 20 components all accepted;
- availability uses minimum `floor(componentAvailability/quantity)`;
- same component sent twice is consolidated;
- paused component makes combination unavailable;
- combined component is rejected;
- summary arithmetic follows Plan B exactly;
- final price may be lower or higher than sum of component sales.

- [ ] **Step 2: Run RED**

`node scripts/test-baskets-kits-v2-combinations.mjs`
Expected: FAIL until API summary implemented.

- [ ] **Step 3: Implement component detail and summary**

Current cost of a base component = cost snapshot of its next FIFO sellable lot. Do not average historical/exhausted lots.

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
- Consumes Task 2–5 API.
- Produces route/menu section key `baskets-kits-v2` labeled `Cestas e Kits`.

- [ ] **Step 1: Write failing UI contract test**

Assert:
- old menu label/section `Cestas` remains;
- new menu label `Cestas e Kits` exists separately;
- V2 JS/CSS are loaded;
- list has search + 5 category filters + `+ Nova Cesta/Kit`;
- no legacy terms `ready`, `sale_enabled`, `legacy_full`, `split` appear in V2 UI file.

- [ ] **Step 2: Run RED**

`node scripts/test-baskets-kits-v2-ui.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement compact list**

Card content only:
photo, name, category, final price, availability, mode, state, actions `Editar`, `Novo lote` (products only), `Duplicar`, `Pausar/Retomar`.

- [ ] **Step 4: Implement single-screen editor**

Sections:
A. Dados;
B. mode selector `Produtos | Combinar Cestas/Kits`;
C. composition editor;
D. sticky financial panel.

Do not use nested modal chains for normal edit flow.

- [ ] **Step 5: Implement product composition UX**

Each row shows:
photo, name, qty, cost, retail price, stock, `Trocar`, `Remover`.

If cost is null show `Custo não informado` with warning styling; do not render `R$ 0,00`.

- [ ] **Step 6: Implement combination UX**

`+ Adicionar Cesta/Kit` can be repeated. Each component card shows requested per-kit financial values and availability. Re-adding same component increments quantity.

- [ ] **Step 7: Implement lot UX**

For products mode only:
- lots compact table;
- `+ Novo lote`;
- duplicate lot;
- draft/save/mount;
- missing-cost mount error focuses offending products.

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
- GET actions: `health`, `categories`, `catalog`, `detail?id=<uuid>`.
- Read-only; no checkout/order write.

- [ ] **Step 1: Write failing preview tests**

Assert:
- preview page is `noindex,nofollow`;
- it uses only V2 read API;
- category filtering uses five official categories;
- product-mode detail expands real product composition;
- combined-mode detail expands base kits and their product sections without exposing lot codes.

- [ ] **Step 2: Run RED**

`node scripts/test-baskets-kits-v2-preview.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement storefront read API**

Return only sellable (`availability>0`, not paused) V2 items.

- [ ] **Step 4: Implement preview page**

Simple public-like cards and detail; do not add buy/checkout action yet.

- [ ] **Step 5: Run GREEN and commit**

`node scripts/test-baskets-kits-v2-preview.mjs`
Expected: PASS.

`git commit -m "feat: add baskets kits v2 storefront preview"`

---

### Task 8: Importação não destrutiva para homologação

**Files:**
- Create: `supabase/migrations/20261005XXXXXX_baskets_kits_v2_import.sql`
- Modify: `supabase/functions/admin-baskets-v2-v1/index.ts`
- Create: `scripts/test-baskets-kits-v2-import.mjs`

**Interfaces:**
- RPC: `basket_v2_import_legacy_preview_v1() returns jsonb`
- RPC: `basket_v2_import_legacy_apply_v1(p_operator text) returns jsonb`
- API actions: `import_preview`, `import_apply`.

- [ ] **Step 1: Write failing import tests**

Assertions:
- preview performs no writes;
- apply is idempotent by legacy source IDs stored in V2 metadata/source columns;
- legacy tables are never updated/deleted;
- ambiguous legacy linked-lot structures import as V2 draft/review, not silently as sellable combinations;
- categories map only to the five official categories.

- [ ] **Step 2: Run RED**

`node scripts/test-baskets-kits-v2-import.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement preview/apply**

Copy current models/lots into V2 for comparison. Preserve old IDs in dedicated `legacy_source_id` columns or metadata. Never cut over storefront in this task.

- [ ] **Step 4: Run GREEN and commit**

`node scripts/test-baskets-kits-v2-import.mjs`
Expected: PASS.

`git commit -m "feat: add non destructive v2 basket import"`

---

### Task 9: CI, browser smoke and homologation report

**Files:**
- Create: `.github/workflows/test-baskets-kits-v2.yml`
- Create: `scripts/test-baskets-kits-v2-browser.mjs`
- Create: `docs/superpowers/reports/2026-10-04-baskets-kits-v2-homologation.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces a go/no-go report; does **not** switch current storefront or checkout.

- [ ] **Step 1: Add CI workflow**

Run all V2 node contract tests plus relevant existing Cestas guards.

- [ ] **Step 2: Add browser smoke**

Cover:
- open old `Cestas` and prove it still works;
- open new `Cestas e Kits`;
- create draft product item;
- show missing-cost warning;
- create 3-component combined item;
- verify consolidated financial summary;
- pause/resume state;
- preview page categories/detail.

- [ ] **Step 3: Run full suite**

Commands:
- `node scripts/test-baskets-kits-v2-schema.mjs`
- `node scripts/test-baskets-kits-v2-api.mjs`
- `node scripts/test-baskets-kits-v2-lots.mjs`
- `node scripts/test-baskets-kits-v2-combinations.mjs`
- `node scripts/test-baskets-kits-v2-ui.mjs`
- `node scripts/test-baskets-kits-v2-preview.mjs`
- `node scripts/test-baskets-kits-v2-import.mjs`
- existing basket family/editor/storefront guards.

Expected: all PASS.

- [ ] **Step 4: Preflight migrations with rollback**

Apply all V2 migrations inside a transaction against current Supabase schema and `ROLLBACK`.
Expected: compile/validation success and zero persistent writes.

- [ ] **Step 5: Create homologation report**

Report must include:
- old vs V2 item count;
- categories;
- availability differences;
- price differences;
- missing-cost products;
- migrated draft/review items;
- known blockers for cutover.

- [ ] **Step 6: Commit**

`git commit -m "test: add baskets kits v2 homologation gate"`

---

## Explicitly Out of Scope for This Plan

- Remover a seção atual `Cestas`.
- Alterar o checkout público atual para reservar V2.
- Alterar o storefront principal para vender V2.
- Apagar ou migrar destrutivamente tabelas legadas.
- Permitir combinação recursiva/multinível.
- Corrigir em massa todos os 178 produtos ativos sem custo; a V2 apenas identifica e bloqueia montagem quando necessário.

Esses itens entram em um plano separado de **cutover V2** somente depois da homologação paralela.