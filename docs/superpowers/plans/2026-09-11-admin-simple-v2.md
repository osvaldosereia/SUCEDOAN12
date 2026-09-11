# Admin Simple V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir o Admin oficial às telas Produtos, Cestas básicas e Clientes, removendo Contagens, Fila Bling da navegação e toda UI/código de WhatsApp/Meta/IA de atendimento.

**Architecture:** Manter `admin/index.html` como shell único e `admin/app-lite.js` como runtime central de autenticação/rotas. Substituir os módulos legados `admin-v3/enhancements.js` e `admin-v3/customer-intelligence.js` por módulos pequenos focados em produtos/cestas/clientes, compartilhando um único cliente HTTP autenticado.

**Tech Stack:** HTML, CSS, JavaScript vanilla, Supabase Edge Functions autenticadas existentes.

**Spec:** `docs/superpowers/specs/2026-09-11-vitrine-v2-admin-simple-design.md`

## Global Constraints

- Menu visível somente: Produtos, Cestas básicas, Clientes.
- Nenhuma UI ativa de WhatsApp/Meta/IA.
- Cliente = cadastro/edição simples; telefone é dado cadastral comum.
- Não reintroduzir hooks escondidos apenas para satisfazer testes legados.
- Mobile e desktop; controles grandes; sem framework.

---

### Task 1: Teste contratual do Admin mínimo

**Files:**
- Create: `scripts/test-admin-simple-v2.mjs`
- Modify: `.github/workflows/test-admin-v3.yml`

**Interfaces:**
- Consumes: HTML/JS do Admin.
- Produces: contrato automatizado que impede regressão de menus e termos removidos.

- [ ] **Step 1: Escrever o teste falhando**

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('admin/index.html','utf8');
const app=fs.readFileSync('admin/app-lite.js','utf8');
for (const route of ['products','baskets','customers']) assert.match(html,new RegExp(`data-route="${route}"`));
for (const forbidden of ['data-route="counts"','data-route="queue"','WhatsApp ativos','Somente WhatsApp','Inteligência do Atendimento','whatsapp-flow-key']) assert.doesNotMatch(html,new RegExp(forbidden,'i'));
assert.doesNotMatch(app,/toggleWhatsapp|loadCounts|loadQueue|retryCommand/i);
console.log('admin-simple-v2 ok');
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node scripts/test-admin-simple-v2.mjs`
Expected: FAIL porque `counts`, `queue` e WhatsApp ainda existem.

- [ ] **Step 3: Adicionar o teste ao workflow oficial**

Run no workflow: `node scripts/test-admin-simple-v2.mjs`

- [ ] **Step 4: Commit**

```bash
git add scripts/test-admin-simple-v2.mjs .github/workflows/test-admin-v3.yml
git commit -m "test: lock Admin Simple V2 contract"
```

### Task 2: Reduzir shell e runtime

**Files:**
- Modify: `admin/index.html`
- Modify: `admin/app-lite.js`
- Modify: `admin/config.js`
- Modify: `admin/simple.css`

**Interfaces:**
- Produces: rotas `products`, `baskets`, `customers`; helper global `window.DAAdminApi.call(functionName, action, payload)`.

- [ ] **Step 1: Remover do HTML Contagens, Abrir contagem e Fila Bling**
- [ ] **Step 2: Remover filtro/coluna WhatsApp de Produtos e filtro de perfil de Clientes**
- [ ] **Step 3: Remover de `app-lite.js` `loadCounts`, `openCount`, `loadQueue`, `retryCommand`, `toggleWhatsapp` e listeners correspondentes**
- [ ] **Step 4: Centralizar refresh de sessão/API no `app-lite.js`**

```js
window.DAAdminApi={call:api,toast,openModal,closeModal};
```

- [ ] **Step 5: Remover de `admin/config.js` `customerEdgeFunction` antigo e `countAppUrl`; manter apenas endpoints realmente usados**
- [ ] **Step 6: Rodar** `node scripts/test-admin-simple-v2.mjs`
Expected: PASS.
- [ ] **Step 7: Commit**

```bash
git add admin/index.html admin/app-lite.js admin/config.js admin/simple.css
git commit -m "refactor: reduce Admin to products baskets customers"
```

### Task 3: Editor de produtos focado na vitrine

**Files:**
- Create: `admin/products.js`
- Modify: `admin/index.html`
- Delete after replacement: `admin-v3/enhancements.js` only when basket functionality has also moved.

**Interfaces:**
- Consumes: `DAAdminApi.call('admin-ops-v1', ...)`.
- Produces: `loadProducts()`, `openProduct(id)`, `saveProduct(id, patch)`.

- [ ] **Step 1: Escrever teste de ausência de campos WhatsApp**
- [ ] **Step 2: Implementar editor com nome, SKU/EAN, preço, estoque somente leitura, categoria, marca, imagem, oferta, ordem, ativo/inativo**
- [ ] **Step 3: Remover `whatsapp_category`, `is_whatsapp_active`, upsell e histórico de atendimento do payload de edição**
- [ ] **Step 4: Preservar campos operacionais que ainda forem necessários para Bling sem exibi-los como módulo separado**
- [ ] **Step 5: Testar abertura/salvamento com fixture de resposta de `admin-ops-v1`**
- [ ] **Step 6: Commit**

```bash
git add admin/products.js admin/index.html scripts/test-admin-simple-v2.mjs
git commit -m "feat: add storefront-focused product editor"
```

### Task 4: Editor de cestas focado na vitrine

**Files:**
- Create: `admin/baskets.js`
- Modify: `admin/index.html`

**Interfaces:**
- Consumes: `admin-baskets-v1` actions `list`, `get`, `save`, composition operations.
- Produces: cadastro de cesta e composição editável sem flags de WhatsApp.

- [ ] **Step 1: Testar que `is_whatsapp_active` não aparece na UI/payload**
- [ ] **Step 2: Implementar lista e editor com nome, imagem, preço base, ordem, ativo, composição, quantidade, removível e quantidade editável**
- [ ] **Step 3: Manter busca de produto por nome/EAN para adicionar composição**
- [ ] **Step 4: Rodar teste contratual e teste de sintaxe**
- [ ] **Step 5: Commit**

```bash
git add admin/baskets.js admin/index.html
git commit -m "feat: simplify basket management for storefront"
```

### Task 5: Clientes = cadastro e edição

**Files:**
- Create: `admin/customers.js`
- Modify: `admin/index.html`
- Delete: `admin-v3/customer-intelligence.js`
- Remove stylesheet load: `admin-v3/customer-intelligence.css`

**Interfaces:**
- Consumes: endpoint administrativo de clientes; se `customer-intelligence-v1` não oferecer CRUD simples, criar/estender endpoint no plano de backend.
- Produces: busca, cadastro, abertura e edição de cliente.

- [ ] **Step 1: Testar ausência de `shopping_mode`, `catalog_skill_score`, recomendações e criação de catálogo personalizado**
- [ ] **Step 2: Implementar tabela com nome, telefone, CPF e ação Abrir**
- [ ] **Step 3: Implementar formulário de nome, telefone, CPF, e-mail e endereço**
- [ ] **Step 4: Ao salvar telefone, normalizar e permitir o backend vincular pedidos órfãos**
- [ ] **Step 5: Remover módulo de inteligência e CSS legado**
- [ ] **Step 6: Rodar workflow do Admin**
- [ ] **Step 7: Commit**

```bash
git add admin/customers.js admin/index.html admin/simple.css
git rm admin-v3/customer-intelligence.js admin-v3/customer-intelligence.css
git commit -m "feat: replace customer intelligence with simple customer CRUD"
```

### Task 6: Verificação do Admin

**Files:**
- Test: `scripts/test-admin-simple-v2.mjs`
- Test: `.github/workflows/test-admin-v3.yml`

- [ ] **Step 1:** `node --check admin/app-lite.js admin/products.js admin/baskets.js admin/customers.js`
- [ ] **Step 2:** `node scripts/test-admin-simple-v2.mjs`
- [ ] **Step 3:** abrir `/admin/` em largura 390 px e desktop; validar navegação e modais.
- [ ] **Step 4:** confirmar no Network que scripts de WhatsApp/IA não são carregados.
- [ ] **Step 5:** commit de correções finais, se houver.
