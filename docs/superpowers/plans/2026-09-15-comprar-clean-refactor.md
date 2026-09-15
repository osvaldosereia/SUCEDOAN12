# Comprar Clean Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o front atual do Comprar por uma implementação modular com estado único, sem interceptadores globais, preservando as APIs existentes e eliminando os travamentos de produto, checkout e ajuda.

**Architecture:** `app.js` vira o controlador central e dono do estado/HTTP. `baskets.js`, `products.js`, `checkout.js` e `help.js` recebem dependências explícitas e não sobrescrevem `window.fetch` nem observam globalmente o DOM. A troca do front ativo só acontece no fim, após testes de contrato e regressão.

**Tech Stack:** JavaScript ES2022 no navegador, HTML/CSS estático, Supabase Edge Functions existentes, Node.js 22 para testes de contrato, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-comprar-clean-refactor-design.md`

## Global Constraints

- Nenhum módulo comercial pode sobrescrever `window.fetch`.
- Nenhum módulo comercial pode usar `MutationObserver` global para descobrir/corrigir componentes.
- Cada botão possui um único handler de ação.
- Um único estado de carrinho em memória.
- Sincronização de quantidade bloqueia apenas o produto envolvido.
- APIs e schema atuais do Supabase devem ser preservados nesta refatoração.
- Ajuda não pode modificar carrinho/cesta/produtos.
- Código legado só é removido após busca de referências em todo o repositório.
- `admin_test=1` continua sem criar pedido real.
- `/comprar` e a raiz devem carregar a mesma versão do novo front.

---

### Task 1: Contrato arquitetural e cliente HTTP central

**Files:**
- Create: `scripts/test-comprar-clean-architecture-v1.mjs`
- Replace: `comprar/app.js`

**Interfaces:**
- Produces `window.DA_COMPRAR_APP` com `{state, api, productApi, customerApi, checkoutApi, basketStorefrontApi, setCart, toast, scrollTo, registerModule, start}`.
- `api(action,payload)`, `productApi(action,payload)`, `customerApi(action,payload)`, `checkoutApi(action,payload)` retornam JSON validado e lançam `Error` em falha.

- [ ] **Step 1: Write the failing architecture test**

Criar teste que leia os arquivos ativos do novo front e exija explicitamente:

```js
assert.doesNotMatch(app,/window\.fetch\s*=/);
assert.doesNotMatch(app,/new\s+MutationObserver/);
assert.match(app,/window\.DA_COMPRAR_APP/);
assert.match(app,/pendingProductSyncs/);
```

O teste também deve falhar enquanto `app.js` não expuser as funções HTTP explícitas e estado único.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-comprar-clean-architecture-v1.mjs`
Expected: FAIL porque o `app.js` atual não possui a arquitetura aprovada.

- [ ] **Step 3: Implement minimal central app**

Criar estado central contendo `session`, `customer`, `baskets`, `selectedBasket`, `basketItems`, `cart`, `checkout`, `payment`, `productFilters`, `pendingProductSyncs` e `modules`. Implementar um único `post(url,action,payload)` e wrappers de API. `setCart(cart)` atualiza estado e barra `cartCount/cartTotal`.

- [ ] **Step 4: Run GREEN and syntax**

Run:
`node scripts/test-comprar-clean-architecture-v1.mjs && node --check comprar/app.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `refactor: criar núcleo único do Comprar`.

### Task 2: Cestas sem mutação antes da escolha e etapa 2 automática

**Files:**
- Create: `comprar/baskets.js`
- Create: `scripts/test-comprar-clean-baskets-v1.mjs`

**Interfaces:**
- Consumes `DA_COMPRAR_APP.api`, `basketStorefrontApi`, `setCart`, `scrollTo`, shared state.
- Produces module `{renderPicker, previewBasket, chooseBasket, renderSelectedBasket}`.
- Após `chooseBasket`, dispara `app.modules.products.renderEntry({auto:true})`.

- [ ] **Step 1: Write failing basket-flow test**

O teste deve exigir os textos/contratos: `Ver produtos`, `Voltar às cestas`, `Escolher esta cesta`, `Finalizar pedido`, `Adicionar mais produtos`; exigir que `previewBasket` use apenas `baskets/detail` e não `start_basket`; exigir que `start_basket` apareça apenas em `chooseBasket`.

Também deve exigir que a etapa 2 seja aberta após sucesso e que a rolagem use um anchor junto ao botão Finalizar, não volte à lista de cestas.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-comprar-clean-baskets-v1.mjs`
Expected: FAIL porque `baskets.js` ainda não existe.

- [ ] **Step 3: Implement basket module**

A prévia mantém quantidades locais `{product_id, quantity, base_quantity, min_quantity, max_quantity, quantity_editable}`. `+/-` altera somente o objeto local e o total visual. `chooseBasket` chama `start_basket`, depois aplica somente diferenças com `set_basket_quantity`, atualiza `app.state.cart`, renderiza cesta escolhida e abre Etapa 2. `Voltar` simplesmente remove a prévia.

- [ ] **Step 4: Run GREEN**

Run: `node scripts/test-comprar-clean-baskets-v1.mjs && node --check comprar/baskets.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `refactor: isolar fluxo de cestas do Comprar`.

### Task 3: Produtos, filtros sticky e sincronização independente

**Files:**
- Create: `comprar/products.js`
- Create: `scripts/test-comprar-clean-products-v1.mjs`
- Create later in Task 7: CSS selectors in `comprar/styles.css`

**Interfaces:**
- Consumes `DA_COMPRAR_APP.productApi`, `api`, `setCart`, state.
- Produces module `{renderEntry, openSection, resetProducts, loadMore, changeQuantity, openDetail, closeDetail, waitForPending}`.

- [ ] **Step 1: Write failing product behavior test**

Exigir no código: geração incremental (`generation`), `desiredQuantity`, `confirmedQuantity`, `syncing`, `pendingProductSyncs`, categorias/subcategorias com `Todos`, e ausência de recursão de sincronização. Exigir `waitForPending()` para checkout aguardar somente operações reais.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-comprar-clean-products-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement product module**

`renderEntry` mostra Etapa 2 com chips `Para Você`, `Para Casa`, `Ofertas`. `openSection` cria busca, categorias e subcategorias, mais a grade. Cada mudança de busca/filtro incrementa `generation`; respostas antigas são descartadas. `changeQuantity` atualiza visual imediatamente, ajusta `desiredQuantity` e inicia um único loop por produto. O loop envia `set_quantity` até `desiredQuantity === confirmedQuantity`. Em erro, volta somente o produto para `confirmedQuantity`.

- [ ] **Step 4: Run GREEN**

Run: `node scripts/test-comprar-clean-products-v1.mjs && node --check comprar/products.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `refactor: reconstruir produtos e quantidades`.

### Task 4: Checkout explícito e sem interceptação de fetch

**Files:**
- Create: `comprar/checkout.js`
- Create: `scripts/test-comprar-clean-checkout-v1.mjs`

**Interfaces:**
- Consumes `app.api`, `customerApi`, `checkoutApi`, `products.waitForPending`, shared state.
- Produces `{open, render, confirmOrder}`.

- [ ] **Step 1: Write failing checkout test**

Exigir sequência textual/estrutural `await products.waitForPending()` -> `checkout_preview` -> renderização, `busy` com `try/finally`, identificação por WhatsApp, cadastro novo, endereço salvo/novo, pagamento e `confirm_order`. Proibir `window.fetch =`, `MutationObserver` e timers usados como dependência de montagem.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-comprar-clean-checkout-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement checkout module**

Migrar o comportamento útil do checkout v2 para chamadas explícitas. `open(button)` protege apenas o botão clicado, aguarda pendências de produtos, busca preview e renderiza. Lookup/verification/identify/save_address atualizam explicitamente `state.checkout` com a resposta ou com novo `checkout_preview`, sem interceptar outra requisição. `confirmOrder` usa transporte comercial ou adapter de teste fornecido por `app`.

- [ ] **Step 4: Run GREEN**

Run: `node scripts/test-comprar-clean-checkout-v1.mjs && node --check comprar/checkout.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `refactor: tornar checkout explícito e independente`.

### Task 5: Ajuda simples sem catálogo paralelo

**Files:**
- Create: `comprar/help.js`
- Create: `scripts/test-comprar-clean-help-v1.mjs`

**Interfaces:**
- Consumes somente compositor e APIs de mensagem/upload já expostas pelo app.
- Produces `{open, close, toggle}`.

- [ ] **Step 1: Write failing help test**

Exigir que `help.js` não contenha `start_basket`, `set_quantity`, `baskets`, `productsApi` nem menu de catálogo; exigir suporte aos ids `messageInput`, `photoInput`, `micButton`, `composer`, `helpToggle`.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-comprar-clean-help-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement simple help**

Ajuda apenas abre/fecha compositor. Envio de texto, foto e áudio usa funções explícitas do app e acrescenta mensagens à timeline. Durante checkout, o botão pode ser ocultado por chamada direta do módulo de checkout, não por observação do DOM.

- [ ] **Step 4: Run GREEN**

Run: `node scripts/test-comprar-clean-help-v1.mjs && node --check comprar/help.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `refactor: simplificar ajuda do Comprar`.

### Task 6: Admin V3 sem sobrescrever fetch

**Files:**
- Replace: `comprar/admin-test-bridge.js`
- Remove from active loading: `comprar/admin-test-after-checkout.js`
- Modify: `tests/admin-v3-real-chat-test-mode.mjs`

**Interfaces:**
- Admin bridge produz `window.DA_ADMIN_TEST_TRANSPORT = {confirmOrder(payload)}` somente em `admin_test=1` dentro de iframe autorizado.
- `app.js` escolhe esse adapter apenas para `confirm_order`.

- [ ] **Step 1: Update test first**

Alterar teste para reprovar qualquer `window.fetch=` nos scripts de teste e exigir `DA_ADMIN_TEST_TRANSPORT` e autenticação `Authorization: Bearer` apenas no endpoint de simulação.

- [ ] **Step 2: Run RED**

Run: `node tests/admin-v3-real-chat-test-mode.mjs`
Expected: FAIL porque bridge atual intercepta `window.fetch`.

- [ ] **Step 3: Implement adapter**

Remover interceptador global. Manter handshake `postMessage`, token administrativo e diagnóstico. `confirmOrder(payload)` envia diretamente ao `adminTestApi`, retorna resposta JSON e nunca abre WhatsApp real.

- [ ] **Step 4: Run GREEN**

Run: `node tests/admin-v3-real-chat-test-mode.mjs && node --check comprar/admin-test-bridge.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `refactor: isolar transporte de teste do Admin V3`.

### Task 7: Consolidar HTML/CSS e ativar o novo front

**Files:**
- Create: `comprar/styles.css`
- Modify: `comprar/index.html`
- Modify: `index.html`
- Modify: `scripts/test-comprar-mobile-v1.mjs`
- Modify: `scripts/check-public-site.mjs`
- Modify relevant workflow assertions in `.github/workflows/app-next-tests.yml`, `.github/workflows/update-public-data.yml`, `.github/workflows/test-shopping-room.yml`, `.github/workflows/comprar-root-home.yml`.

**Interfaces:**
- Load order: `config.js`, `app.js`, `baskets.js`, `products.js`, `checkout.js`, `help.js`, conditional `admin-test-bridge.js`.

- [ ] **Step 1: Write/update failing integration contracts**

Os testes devem exigir a nova sequência de scripts nas duas entradas, um único `styles.css`, ausência dos scripts comerciais antigos e CSS contendo `.products-filter-sticky{position:sticky...}` e `.chips-subcategories .chip` com dimensões menores que chips principais.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-comprar-mobile-v1.mjs && node scripts/check-public-site.mjs`
Expected: FAIL enquanto HTML ainda carregar stack antiga.

- [ ] **Step 3: Consolidate markup and CSS**

Preservar topbar, timeline, cart bar, help/composer e toast. Carregar apenas novos módulos comerciais. Consolidar visual atual em `styles.css`, incluindo sticky da busca/categorias/subcategorias e grade mobile. O anchor da etapa 2 deve considerar a altura da topbar sticky.

- [ ] **Step 4: Run GREEN plus syntax**

Run all clean tests plus `node --check` nos novos módulos e os testes públicos existentes relevantes.

- [ ] **Step 5: Commit**

Commit message: `refactor: ativar front limpo do Comprar`.

### Task 8: Remover código legado somente após prova de não uso

**Files:**
- Candidate delete after repository search: `comprar/chat-helper-menu.js`, `comprar/chat-checkout-quantity-v1.js`, `comprar/checkout-final-v2.js`, `comprar/checkout-message-context-v1.js`, `comprar/phone-retry-v1.js`, `comprar/product-detail-v1.js`, `comprar/storefront-visual-v2.js` and corresponding obsolete CSS.
- Legacy candidates: `comprar/chat-light.js`, `comprar/chat-light.css`, `comprar/room-v2.css`, `comprar/style.css`, `comprar/sales-intelligence.js`, `comprar/sales-intelligence.css`, `comprar/search-entry.js` only if repo-wide reference count is zero.
- Modify tests/workflows that only syntax-check deleted files.

- [ ] **Step 1: Search repository references**

For each candidate, search exact filename across repository. Keep any file with an active consumer. Record retained exceptions in commit message/PR description.

- [ ] **Step 2: Add negative regression assertions**

`test-comprar-clean-architecture-v1.mjs` must assert active HTML does not reference deleted/obsolete modules and active commercial JS contains neither `window.fetch =` nor `new MutationObserver`.

- [ ] **Step 3: Run RED if stale references remain**

Expected: FAIL for every reference that still must be cleaned.

- [ ] **Step 4: Delete proven-dead files and update checks**

Remove only zero-consumer files. Re-run all relevant test scripts.

- [ ] **Step 5: Commit**

Commit message: `chore: remover legado sem uso do Comprar`.

### Task 9: Full regression, PR and deployment gate

**Files:**
- No production change unless a failing regression reveals a defect.

**Interfaces:**
- Final branch must satisfy spec completion criteria.

- [ ] **Step 1: Run complete local/static suite**

Run the new clean tests, existing basket/checkout tests that remain applicable, Admin V3 test, mobile test, root-home test, public-site check and `node --check` for every active module.

- [ ] **Step 2: Verify forbidden patterns**

Repository search in active Comprar modules must return zero commercial `window.fetch =` and zero commercial global `new MutationObserver`. Verify old help menu is absent from both HTML entry points.

- [ ] **Step 3: Open PR**

Create PR from `refactor/comprar-clean-20260915` to `main`, summarizing architecture, deleted legacy files, user-visible flow changes, and test evidence.

- [ ] **Step 4: Wait/check relevant GitHub Actions**

Required green: Comprar root, Shopping Room, Admin V3 real Chat test mode, public-data checks relevant to Comprar. Unrelated legacy workflows must be reported separately rather than falsely claimed green.

- [ ] **Step 5: Finish branch**

Only after verification, invoke `superpowers:finishing-a-development-branch` and merge according to the approved completion path.
