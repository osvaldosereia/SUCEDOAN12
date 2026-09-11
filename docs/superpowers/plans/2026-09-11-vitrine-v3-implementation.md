# Vitrine V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma vitrine pública extremamente simples e rápida para apoiar pedidos por WhatsApp, sem carregar o catálogo inteiro.

**Architecture:** `vitrine-v3/` usa uma nova Edge Function somente leitura `catalog-v3` para home, categoria, busca e cesta. O pedido continua usando `storefront-v2/create_order`, preservando validação transacional existente. O catálogo usa GET, cache HTTP curto e cache local stale-while-revalidate; a UI mostra uma categoria por vez em lotes de 12.

**Tech Stack:** HTML/CSS/JavaScript modular, Supabase Edge Functions/Deno, PostgreSQL existente.

**Spec:** `docs/superpowers/specs/2026-09-11-admin-v3-vitrine-v3-design.md`

## Global Constraints

- Manter `/vitrine-v2/` intacta.
- Sem framework novo.
- Visual neutro branco/cinza/preto com azul nas ações.
- Catálogo nunca baixa todos os produtos no boot.
- Produto por categoria em lotes de 12.
- Busca com debounce de 250 ms e cancelamento de requisição anterior.
- Pedido é persistido antes do WhatsApp e preço/estoque são validados pelo servidor.
- Nenhum segredo server-side no navegador.

---

### Task 1: Contratos e CI da Vitrine V3

**Files:**
- Create: `scripts/test-storefront-v3-ui.mjs`
- Create: `scripts/test-catalog-v3-contract.mjs`
- Create: `.github/workflows/test-storefront-v3.yml`

**Interfaces:**
- Produces: contrato que exige `catalog-v3`, cache público de leitura, `vitrine-v3/`, lote 12, debounce/cancelamento e preservação do `create_order` em `storefront-v2`.

- [ ] **Step 1: Write the failing tests** que verificam inexistência de carregamento integral, presença de `AbortController`, `250`, cache local, chips de categoria, `limit=12`, `Show more/Mostrar mais`, tipografia e ausência de segredos.
- [ ] **Step 2: Run CI and confirm RED** porque `vitrine-v3/` e `catalog-v3` ainda não existem.
- [ ] **Step 3: Commit the RED contract**.

### Task 2: API pública de catálogo V3

**Files:**
- Create: `supabase/functions/catalog-v3/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Produces GET resources:
  - `?resource=health`
  - `?resource=home`
  - `?resource=category&name=<category>&page=1&limit=12`
  - `?resource=search&q=<query>&page=1&limit=12`
  - `?resource=basket&id=<uuid>`

- [ ] **Step 1:** Implement official-domain CORS and GET-only reads.
- [ ] **Step 2:** `home` returns active baskets, category index and a small offers list only.
- [ ] **Step 3:** category/search query only active, physically verified, stock-positive products and return pagination metadata.
- [ ] **Step 4:** read responses use `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`; errors use no-store.
- [ ] **Step 5:** basket detail returns composition without writing anything.
- [ ] **Step 6:** set `[functions.catalog-v3] verify_jwt = false`.
- [ ] **Step 7:** run Deno/contract tests and commit.

### Task 3: Shell, home e navegação da Vitrine V3

**Files:**
- Create: `vitrine-v3/index.html`
- Create: `vitrine-v3/styles.css`
- Create: `vitrine-v3/config.js`
- Create: `vitrine-v3/catalog-api.js`
- Create: `vitrine-v3/app.js`

**Interfaces:**
- `catalog-api.js`: `catalog(resource, params, {signal, background})`.
- `app.js`: renders home, category, search results and basket detail.

- [ ] **Step 1:** Build a compact header with logo/name, search and `Pedido` button.
- [ ] **Step 2:** Home shows Cestas first, then one horizontal category chip row and optional offers; no technical loading placeholders.
- [ ] **Step 3:** A category click replaces the product result area; it never appends multiple category sections.
- [ ] **Step 4:** Product rows show small lazy image, name, packaging/brand, price and add control.
- [ ] **Step 5:** Add mobile fixed order bar only when cart has items.
- [ ] **Step 6:** Verify initial HTML/CSS/app shell remains lightweight and commit.

### Task 4: SWR cache, pagination and search

**Files:**
- Create: `vitrine-v3/cache.js`
- Create: `vitrine-v3/products.js`
- Modify: `vitrine-v3/catalog-api.js`
- Modify: `vitrine-v3/app.js`

**Interfaces:**
- Cache key format: `da_v3_catalog:<resource>:<normalized params>`.
- Cache TTL for fresh local data: 120000 ms; stale data may render while background refresh runs.

- [ ] **Step 1:** Implement local cache read/write with timestamps and safe JSON parsing.
- [ ] **Step 2:** On cached category hit, render immediately and revalidate silently.
- [ ] **Step 3:** Start each category at 12 products; implement explicit `Mostrar mais`.
- [ ] **Step 4:** Prefetch next page near bottom with `IntersectionObserver`, without adding it until the user requests more.
- [ ] **Step 5:** Search after at least 2 characters, debounce 250 ms, abort previous request with `AbortController`.
- [ ] **Step 6:** Run contract tests and commit.

### Task 5: Carrinho, cesta e fechamento no WhatsApp

**Files:**
- Create: `vitrine-v3/state.js`
- Create: `vitrine-v3/cart.js`
- Create: `vitrine-v3/baskets.js`
- Create: `vitrine-v3/checkout.js`
- Create: `vitrine-v3/order-api.js`
- Modify: `vitrine-v3/app.js`

**Interfaces:**
- `order-api.js` POSTs `{action:'create_order', ...payload}` to existing `storefront-v2` with `cache:'no-store'`.
- Cart localStorage stores product/basket selections but never phone.

- [ ] **Step 1:** Port only the proven V2 order payload semantics; do not send client price as truth.
- [ ] **Step 2:** Basket detail supports allowed quantity changes and adding extras.
- [ ] **Step 3:** Cart drawer is simple, large-tap and called `Pedido`.
- [ ] **Step 4:** Checkout asks only phone, calls existing `create_order`, clears cart after success, then exposes `wa.me` link.
- [ ] **Step 5:** Verify phone is absent from localStorage and order is saved before WhatsApp.
- [ ] **Step 6:** Run all V3 tests and commit.

### Task 6: Deploy and live verification

**Files:**
- No new functional files unless a verified defect requires a fix.

- [ ] **Step 1:** Deploy `catalog-v3` with JWT verification disabled according to config.
- [ ] **Step 2:** Smoke-test `health`, `home`, one category and one search without mutating data.
- [ ] **Step 3:** Open PR and require V3 contract + Deno/JS syntax checks to pass.
- [ ] **Step 4:** Merge only after green checks.
- [ ] **Step 5:** Wait for GitHub Pages deployment and verify `/vitrine-v3/` assets are on `main`.
