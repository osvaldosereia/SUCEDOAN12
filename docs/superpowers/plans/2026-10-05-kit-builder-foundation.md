# Criador de Kits — Fundação e Editor Interno Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a camada canônica de kits internos e o editor de três colunas, sem reservar estoque e sem ativar ainda a nova tela como fluxo principal de produção.

**Architecture:** Kits internos serão receitas independentes em `assembly_kits`, `assembly_kit_items` e `assembly_search_chips`. A Edge Function `admin-kit-builder-v1` cuidará somente do domínio de kits, chips, catálogo e agregados. A edição de custo/preço/estoque reutilizará diretamente as ações canônicas já existentes em `admin-products-live-v1`; não haverá um segundo mecanismo de escrita de produto.

**Tech Stack:** PostgreSQL/Supabase migrations e RPCs, Edge Functions TypeScript/Deno, JavaScript sem framework, Node 24 + Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-10-05-kit-builder-and-store-baskets-design.md`

## Global Constraints

- Salvar/editar kit nunca cria lote ou reserva.
- Tipos: `food`, `cleaning_hygiene`, `other`.
- Kit usado como base é expandido/copiado; `source_kit_id` é só histórico.
- Produto repetido é consolidado por `product_id`.
- Leitura de estoque: `ops2_loose_sellable_stock_v1`.
- Escrita rápida: `product_quick_save` para custo/preço e `product_stock_set` para estoque; nenhuma escrita direta em `products.stock` pela nova ferramenta.
- Se Bling for autoridade, prevalece exatamente o comportamento de `product_stock_set`; a UI exibe a resposta oficial e não simula estoque alterado.
- RPCs novas: `service_role` apenas.
- Módulo novo fica testado, mas não vira o fluxo visível de Cestas antes do cutover do plano 3.

## Review Focus

1. Estoque já reservado nunca pode ser apagado por edição rápida — Task 3.
2. Kit derivado não acompanha mudanças posteriores no kit-base — Task 1/3.
3. Adicionar o mesmo produto duas vezes soma quantidade — Task 1/3.
4. Autoridade Bling não pode ser contornada por patch local — Task 3.
5. Arquivamento de kit passa a ser bloqueado quando houver receita externa ativa no Plano 2 — contrato de extensão definido na Task 1.

---

### Task 1: Domínio de receitas internas

**Files:**
- Create: `supabase/migrations/20261005_assembly_kits_v1.sql`
- Create: `supabase/sql/20261005_assembly_kits_v1.sql`
- Create: `scripts/test-assembly-kits-domain-v1.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- `save_assembly_kit_v1(p_kit_id uuid, p_name text, p_type text, p_notes text, p_source_kit_id uuid, p_items jsonb, p_operator text) -> jsonb`
- `archive_assembly_kit_v1(p_kit_id uuid, p_operator text) -> jsonb`
- tables `assembly_kits`, `assembly_kit_items`, `assembly_search_chips`.

- [ ] **Step 1: Write RED test** — assert tables, constraints, positive quantity, unique `(kit_id,product_id)`, RLS/grants, RPC signatures, duplicate-product consolidation and zero references to reservation/lot writes.
- [ ] **Step 2: Run RED** — `node --disable-warning=ExperimentalWarning scripts/test-assembly-kits-domain-v1.mjs`; expected FAIL.
- [ ] **Step 3: Implement schema/RPCs** — transactional replace of kit items, validation, `source_kit_id` historical only, archive via `is_active=false`; add an internal helper/check hook that Plano 2 can extend to reject archive when a live store recipe references the kit.
- [ ] **Step 4: Run GREEN + transaction probe** — test PASS; create/edit kit inside `BEGIN...ROLLBACK` and assert `basket_locked_component_stock_v1` unchanged.
- [ ] **Step 5: Commit** — `feat: adicionar dominio de receitas internas de kits`.

---

### Task 2: API administrativa do Criador de Kits

**Files:**
- Create: `supabase/functions/admin-kit-builder-v1/index.ts`
- Create: `scripts/test-kit-builder-admin-api-v1.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Actions: `kits`, `kit`, `kit_save`, `kit_archive`, `products`, `most_used`, `chips`, `chip_save`, `chip_archive`, `chip_reorder`.
- `products` returns `{id,name,sku,gtin,packaging,image_url,cost_price,sale_price,effective_stock,basket_locked,loose_stock,stock_authority}`.

- [ ] **Step 1: Write RED API contract** — JWT/admin auth, viewer read-only, action allowlist, paginated name/SKU/EAN search, canonical stock fields, lazy kit detail, totals and `most_used` from active kits only.
- [ ] **Step 2: Run RED** — `node --disable-warning=ExperimentalWarning scripts/test-kit-builder-admin-api-v1.mjs`; expected FAIL.
- [ ] **Step 3: Implement gateway** — same auth pattern as `admin-basket-guided-v1`; writes de kit via RPCs; chips via Admin-only persistence; no product write action in this Edge Function.
- [ ] **Step 4: Run GREEN** — expected PASS.
- [ ] **Step 5: Commit** — `feat: adicionar api do criador de kits`.

---

### Task 3: UI de três colunas + edição rápida canônica

**Files:**
- Create: `vitrine/admin/kit-builder.js`
- Create: `scripts/test-kit-builder-ui-v1.mjs`
- Create: `scripts/test-kit-builder-browser.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Consumes `window.DonaAntoniaAdminBridge`.
- Reads kits/catalog through `admin-kit-builder-v1`.
- Writes produto through the existing Admin bridge actions `product_quick_save` and `product_stock_set` only.
- Exposes `window.DonaAntoniaKitBuilder={render,openKit,newKit,reset}`.

- [ ] **Step 1: Write RED static contract** — three columns; search; horizontally scrollable chips; product rows with photo/name/stock/cost/sale; central kit draft; sticky totals; `Mais usados | Kits existentes`; no families/positions/guided editor dependency.
- [ ] **Step 2: Write RED Playwright flow** — search/chip, add, duplicate consolidation, quantity change, remove, base-kit expansion, derived independence, save/update kit, inline cost/sale save via `product_quick_save`, stock save via `product_stock_set`, and display of official stock-write failure/authority response.
- [ ] **Step 3: Add reserved-stock assertion** — mock `basket_locked_quantity=30`; UI must never invent a lower post-save locked amount and must refresh from canonical response after stock write.
- [ ] **Step 4: Run RED** — both tests expected FAIL.
- [ ] **Step 5: Implement UI** — all draft state inside the module; incremental product loading; focused inputs preserved; cost/sale totals derived from items; desktop 3 columns, tablet collapse, mobile `Produtos | Kit | Mais usados`; only chip strip has horizontal scrolling.
- [ ] **Step 6: Run GREEN** — static/browser PASS at 1440x1000 and 390x844; page has no horizontal overflow.
- [ ] **Step 7: Commit** — `feat: criar editor visual de kits em tres colunas`.

---

### Task 4: CI e entrega ainda não visível

**Files:**
- Modify: `.github/workflows/basket-kit-editor-ci.yml`
- Optionally load: `vitrine/admin/kit-builder.js` from `vitrine/admin/index.html`, without routing the Cestas tab to it.
- Create: `scripts/test-kit-builder-not-active-before-cutover.mjs`

- [ ] **Step 1: Guard test** — module novo pode estar carregado, mas não pode haver dois fluxos Cestas visíveis antes do Plano 3.
- [ ] **Step 2: Run full Basket CI** — every workflow command plus new tests; expected all PASS.
- [ ] **Step 3: Commit** — `test: integrar criador de kits ao ci sem cutover`.

## PR boundary

1. schema/RPCs;
2. Edge Function de kits;
3. UI + browser tests.

Nenhuma das 9 cestas é migrada e nenhum cutover de produção ocorre neste plano.
