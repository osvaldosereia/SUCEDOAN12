# Storefront V2 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir uma vitrine pública mobile-first, extremamente leve, com cestas básicas, personalização, navegação por seções, produtos extras, carrinho simples e checkout somente por telefone.

**Architecture:** Nova vitrine criada em paralelo em `vitrine-v2/`, sem framework, com um HTML, um CSS principal e módulos JS pequenos. Toda leitura/gravação passa por `storefront-v2`; nenhuma dependência de Firebase/Make/Meta. O corte para a raiz só acontece após homologação.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Supabase Edge Function via `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-11-vitrine-v2-admin-simple-design.md`

## Global Constraints

- Mobile-first; desktop simples.
- Não carregar catálogo inteiro na inicialização.
- Sem IA, Meta SDK, Firebase, Make ou bibliotecas pesadas.
- Pedido salvo antes de mostrar botão que abre WhatsApp.
- Imagens de produto devem apontar para variante ≤15 KB.
- Carrinho local pode usar `localStorage`, mas pedido oficial só existe após confirmação do backend.

---

### Task 1: Contrato de performance e estrutura

**Files:**
- Create: `scripts/test-storefront-v2-ui.mjs`
- Create: `vitrine-v2/index.html`
- Create: `vitrine-v2/styles.css`

**Interfaces:**
- Produces: shell com `#app`, cabeçalho, botão de carrinho e região de toast.

- [ ] **Step 1: Criar teste falhando**

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('vitrine-v2/index.html','utf8');
assert.doesNotMatch(html,/firebase|make\.com|facebook\.net|meta\.com|whatsapp.*sdk/i);
assert.match(html,/type="module"/);
assert.match(html,/viewport-fit=cover/);
console.log('storefront-v2-ui ok');
```

- [ ] **Step 2: Criar shell mínimo sem preload de catálogo**
- [ ] **Step 3: Criar CSS principal com tipografia do sistema, cards simples, botões de 44px e breakpoints mobile/desktop**
- [ ] **Step 4: Rodar teste e commit**

### Task 2: Cliente de API e estado local

**Files:**
- Create: `vitrine-v2/api.js`
- Create: `vitrine-v2/state.js`
- Create: `vitrine-v2/app.js`

**Interfaces:**
- `api(action,payload)` -> JSON da Edge Function.
- `state` contém `basket`, `basketItems`, `extras`, `cart`, `selectedSections`, `order`.

- [ ] **Step 1: Testar serialização de carrinho e limpeza**
- [ ] **Step 2: Implementar `api()` com timeout e mensagens de erro amigáveis**
- [ ] **Step 3: Implementar estado persistido somente para carrinho/seleções; nunca persistir dados privados além do telefone necessário**
- [ ] **Step 4: Implementar boot chamando apenas `list_baskets`**
- [ ] **Step 5: Commit**

### Task 3: Home de cestas

**Files:**
- Create: `vitrine-v2/baskets.js`
- Modify: `vitrine-v2/app.js`

**Interfaces:**
- `renderBasketList(baskets)`.
- `openBasket(id)` chama `get_basket`.

- [ ] **Step 1: Escrever teste DOM/fixture para 9 cestas sem carregar produtos extras**
- [ ] **Step 2: Renderizar cards com foto, nome, preço e botão Abrir**
- [ ] **Step 3: Abrir cesta e renderizar composição com quantidades**
- [ ] **Step 4: Adicionar controles `+`, `−`, retirar respeitando regras recebidas do backend**
- [ ] **Step 5: Recalcular visualmente apenas estimativa; total oficial será confirmado pelo servidor no checkout**
- [ ] **Step 6: Commit**

### Task 4: Seções e produtos extras sob demanda

**Files:**
- Create: `vitrine-v2/products.js`
- Modify: `vitrine-v2/app.js`

**Interfaces:**
- `openSections()` -> `list_sections`.
- `loadProducts(section,cursor)` -> `list_products`.

- [ ] **Step 1: Testar que nenhum request `list_products` ocorre antes da seleção de seção/busca**
- [ ] **Step 2: Renderizar seções como botões/chips grandes com seleção múltipla**
- [ ] **Step 3: Carregar primeira página somente das seções escolhidas**
- [ ] **Step 4: Implementar botão `Carregar mais` ou sentinel incremental; limite máximo 40 por request**
- [ ] **Step 5: Implementar busca por nome/EAN sem varrer o catálogo no navegador**
- [ ] **Step 6: Produto: foto, nome, preço, quantidade `−/+` e Adicionar**
- [ ] **Step 7: Commit**

### Task 5: Carrinho simples

**Files:**
- Create: `vitrine-v2/cart.js`
- Modify: `vitrine-v2/index.html`

**Interfaces:**
- `addProduct`, `setQuantity`, `clearCart`, `cartSnapshot`.

- [ ] **Step 1: Testar adicionar/alterar/remover/limpar**
- [ ] **Step 2: Exibir botão fixo `Minha compra` com quantidade de itens**
- [ ] **Step 3: Abrir painel simples com cesta personalizada + extras**
- [ ] **Step 4: Incluir botão `Limpar carrinho` com confirmação mínima**
- [ ] **Step 5: Commit**

### Task 6: Checkout somente por telefone

**Files:**
- Create: `vitrine-v2/checkout.js`

**Interfaces:**
- `submitPhone(phone)` -> `create_order`.
- `renderOrderSuccess(result)` mostra número e botão WhatsApp.

- [ ] **Step 1: Testar telefone válido com 10/11 dígitos e rejeição de entrada inválida**
- [ ] **Step 2: Tela de checkout contém somente resumo, total estimado e campo telefone com DDD**
- [ ] **Step 3: Ao confirmar, enviar IDs/quantidades/regras de cesta; não enviar preço como verdade comercial**
- [ ] **Step 4: Bloquear botão durante request para evitar duplicação**
- [ ] **Step 5: Só após `create_order` retornar sucesso, mostrar `Pedido #... salvo` e botão `Enviar pedido no WhatsApp`**
- [ ] **Step 6: Montar link padrão `https://wa.me/<numero>?text=<mensagem>` usando texto retornado pelo servidor**
- [ ] **Step 7: Não chamar Meta API nem webhook**
- [ ] **Step 8: Commit**

### Task 7: Acessibilidade, performance e homologação paralela

**Files:**
- Modify: `vitrine-v2/styles.css`
- Modify: `vitrine-v2/*.js`
- Test: `scripts/test-storefront-v2-ui.mjs`

- [ ] **Step 1: Garantir labels/aria nos controles de quantidade e checkout**
- [ ] **Step 2: Todas as imagens não críticas usam `loading="lazy"` e `decoding="async"`**
- [ ] **Step 3: Medir peso inicial estático e registrar no PR; não incluir bundles de legado**
- [ ] **Step 4: Testar em 390x844 e desktop 1440x900**
- [ ] **Step 5: Testar fluxo completo com cliente cadastrado e não cadastrado**
- [ ] **Step 6: Confirmar pedido salvo antes de clicar no WhatsApp**
- [ ] **Step 7: Commit final do módulo UI**
