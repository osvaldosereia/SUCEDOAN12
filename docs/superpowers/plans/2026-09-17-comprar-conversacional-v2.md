# Comprar Conversacional V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o Comprar aguardar e registrar cada decisão do cliente como conversa, tornar ofertas explicitamente permissionadas e transformar o checkout em uma sequência progressiva sem alterar as regras comerciais do backend.

**Architecture:** Adicionar `conversation.js` como camada de apresentação/turnos sobre os módulos existentes. `baskets.js`, `upsell.js`, `app.js` e `checkout.js` continuam responsáveis por suas regras atuais, mas passam a pedir ao controlador conversacional para renderizar prompts, quick replies, typing e decisões. Nenhuma nova tabela ou endpoint será criado nesta rodada.

**Tech Stack:** JavaScript ES2022 no navegador, HTML/CSS estático, Supabase Edge Functions existentes, Node.js 22 para testes de contrato, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-17-comprar-conversacional-v2-design.md`

## Global Constraints

- Preservar carrinho, estoque, cesta, total, cliente, endereço, pagamento e persistência atuais.
- Nenhuma IA decide preço, estoque, pagamento ou pedido.
- Nenhum upsell durante revisão ou checkout.
- Ofertas só aparecem após consentimento explícito.
- Mobile-first.
- Usar TDD: teste falhando antes da mudança de produção.
- Não alterar schema Supabase nesta rodada.

---

### Task 1: Contrato do fluxo conversacional

**Files:**
- Create: `scripts/test-comprar-conversation-v2.mjs`
- Read: `comprar/baskets.js`, `comprar/upsell.js`, `comprar/app.js`, `comprar/checkout.js`, `comprar/index.html`

**Interfaces:**
- Consumes: arquivos atuais do Comprar.
- Produces: teste de contrato que falha enquanto o V2 não existir.

- [ ] **Step 1: Write the failing test**

O teste deve exigir:

```js
assert.match(index,/conversation\.js/);
assert.match(conversation,/function\s+ask/);
assert.match(conversation,/function\s+choose/);
assert.match(conversation,/Ana está digitando/);
assert.match(baskets,/Ver 6 ofertas de hoje/);
assert.doesNotMatch(baskets,/renderEntry\?\.\(\{auto:true\}\)/);
assert.doesNotMatch(app,/renderBeforeCheckout/);
assert.doesNotMatch(checkout,/upsell/);
assert.match(upsell,/showOffers/);
assert.match(checkout,/renderPaymentStep/);
assert.match(checkout,/renderConfirmationStep/);
```

Também verificar que `upsell.js` exige preço promocional menor que preço normal e estoque positivo.

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-comprar-conversation-v2.mjs`
Expected: FAIL porque `conversation.js`, `showOffers` e checkout progressivo ainda não existem e o fluxo ainda dispara produtos/upsell automaticamente.

- [ ] **Step 3: Commit failing contract test**

```bash
git add scripts/test-comprar-conversation-v2.mjs
git commit -m "test: definir contrato do Comprar Conversacional V2"
```

---

### Task 2: Controlador de conversa e respostas rápidas

**Files:**
- Create: `comprar/conversation.js`
- Modify: `comprar/index.html`
- Modify: `comprar/styles.css`
- Test: `scripts/test-comprar-conversation-v2.mjs`

**Interfaces:**
- Consumes: `window.DA_COMPRAR_APP.assistantMessage`, `userDecision`, `scrollTo`, `escapeHtml`, `state`.
- Produces: `state.modules.conversation` com `ask(options)`, `choose(label, options)`, `say(text, options)`, `clearPrompt()`, `typing(delay)`, `isBusy()`.

- [ ] **Step 1: Implement minimal controller**

`ask({text, options, className, delay})` deve:
- limpar quick replies anteriores;
- opcionalmente aguardar typing;
- renderizar a fala da Ana;
- renderizar botões abaixo da fala;
- ao clicar, desabilitar o turno, remover opções e chamar `choose`.

`choose(label,{onChoose,delay})` deve:
- renderizar `app.userDecision(label)` imediatamente;
- executar `onChoose` após a cadência curta;
- impedir clique duplicado.

- [ ] **Step 2: Add CSS**

Adicionar `.conversation-quick-replies`, `.conversation-quick-reply`, `.conversation-typing` e espaço inferior suficiente para barra fixa/composer.

- [ ] **Step 3: Load module before business modules**

Em `index.html`, carregar `conversation.js` após `app.js` e antes de `baskets.js`.

- [ ] **Step 4: Run contract test**

Run: `node scripts/test-comprar-conversation-v2.mjs`
Expected: ainda FAIL em pós-cesta/checkout, mas controller deve satisfazer suas asserções.

- [ ] **Step 5: Commit**

```bash
git add comprar/conversation.js comprar/index.html comprar/styles.css
git commit -m "feat: adicionar controlador conversacional ao Comprar"
```

---

### Task 3: Pós-cesta com consentimento explícito

**Files:**
- Modify: `comprar/baskets.js`
- Modify: `comprar/upsell.js`
- Test: `scripts/test-comprar-conversation-v2.mjs`

**Interfaces:**
- Consumes: `conversation.ask`, `conversation.say`, `upsell.showOffers`, `products.renderEntry`, `app.renderOrderReview`.
- Produces: `baskets.renderPostBasketPrompt()` e `upsell.showOffers(host?, limit=6)`.

- [ ] **Step 1: Remove automatic product and upsell launch**

Após `chooseBasket()`:
- manter balão `Quero <cesta>`;
- mostrar confirmação;
- renderizar resumo compacto;
- não chamar `renderAfterBasket()`;
- não chamar `products.renderEntry({auto:true})`.

- [ ] **Step 2: Add post-basket prompt**

Criar pergunta:

```text
Quer acrescentar alguma coisa antes de eu fechar?
```

Respostas:
- `Ver 6 ofertas de hoje` → `upsell.showOffers()`
- `Procurar outros produtos` → `products.renderEntry({auto:false})`
- `Não, revisar meu pedido` → `app.renderOrderReview()`

- [ ] **Step 3: Repurpose upsell module**

`showOffers()` deve buscar somente ofertas e filtrar:

```js
product.is_offer === true
Number(product.offer_price) < Number(product.price)
Number(product.stock) > 0
!cartProductIds().has(String(product.id))
```

Renderizar no máximo 6 cards. Se vazio, responder pela conversa e oferecer produtos/revisão.

- [ ] **Step 4: Run contract test**

Run: `node scripts/test-comprar-conversation-v2.mjs`
Expected: pós-cesta e ofertas passam; checkout ainda pode falhar.

- [ ] **Step 5: Commit**

```bash
git add comprar/baskets.js comprar/upsell.js
git commit -m "feat: tornar ofertas opcionais após escolha da cesta"
```

---

### Task 4: Revisão limpa, sem segunda oferta

**Files:**
- Modify: `comprar/app.js`
- Test: `scripts/test-comprar-conversation-v2.mjs`

**Interfaces:**
- Consumes: `conversation.choose`, `products.renderEntry`, `checkout.open`.
- Produces: revisão com somente alterar/finalizar.

- [ ] **Step 1: Remove `renderBeforeCheckout()`**

Excluir criação de `order-review-upsell` e chamada a `state.modules.upsell.renderBeforeCheckout`.

- [ ] **Step 2: Make review actions semantic**

Ao tocar `+ Produtos`, registrar decisão `Quero alterar meu pedido` antes de abrir produtos.

Ao tocar `Finalizar pedido`, registrar decisão `Finalizar pedido` antes de abrir checkout.

- [ ] **Step 3: Run contract and existing Comprar tests**

Run:

```bash
node scripts/test-comprar-conversation-v2.mjs
node scripts/test-comprar-clean-baskets-v1.mjs
node scripts/test-basket-preview-checkout-whatsapp-v1.mjs
```

Expected: novos testes de revisão passam; regressões existentes permanecem verdes ou são ajustadas apenas quando o comportamento esperado mudou pela especificação aprovada.

- [ ] **Step 4: Commit**

```bash
git add comprar/app.js scripts/test-comprar-conversation-v2.mjs
 git commit -m "feat: limpar revisão do pedido no Comprar"
```

---

### Task 5: Checkout progressivo

**Files:**
- Modify: `comprar/checkout.js`
- Modify: `comprar/styles.css`
- Test: `scripts/test-comprar-conversation-v2.mjs`

**Interfaces:**
- Consumes: endpoints atuais `lookup_customer`, `commit_customer`, `save_address`, `set_payment`, `confirm_order`.
- Produces: `renderIdentificationStep`, `renderAddressStep`, `renderPaymentStep`, `renderConfirmationStep`, `renderSuccess`.

- [ ] **Step 1: Split current checkout form by concern**

Identificação mostra apenas telefone + Continuar.

- [ ] **Step 2: Address step**

Cliente conhecido com endereço salvo recebe confirmação simples e ações `Sim, usar este endereço` / `Usar outro endereço`.

Cliente novo/outro endereço recebe campos de nome, WhatsApp e endereço; botão `Continuar para pagamento` salva apenas em memória local até confirmação final, preservando a ordem atual de persistência em `confirmAndSend`.

- [ ] **Step 3: Payment step**

Ana pergunta separadamente como pagar. Opções são quick replies e a escolha vira balão do cliente.

- [ ] **Step 4: Confirmation step**

Mostrar apenas endereço, pagamento, total e `Confirmar pedido`.

- [ ] **Step 5: Keep persistence sequence**

`confirmAndSend` continua:

```text
commit_customer → save_address → set_payment → confirmOrder → WhatsApp
```

- [ ] **Step 6: Run tests**

Run:

```bash
node scripts/test-comprar-conversation-v2.mjs
node scripts/test-basket-preview-checkout-whatsapp-v1.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add comprar/checkout.js comprar/styles.css
 git commit -m "feat: tornar checkout do Comprar progressivo"
```

---

### Task 6: Mobile polish e regressão final

**Files:**
- Modify: `comprar/styles.css`
- Modify: `comprar/index.html`
- Test: existing `scripts/test-comprar-*.mjs` and targeted checkout tests.

**Interfaces:**
- Consumes: componentes do V2 já implementados.
- Produces: experiência mobile com espaço, sem sobreposição e assets versionados.

- [ ] **Step 1: Polish spacing**

Em telas até 520 px:
- timeline com `gap` maior;
- bolhas com largura máxima entre 82% e 86%;
- quick replies empilhadas quando necessário;
- cards de oferta em rolagem horizontal compacta ou uma coluna confortável;
- barra fixa nunca cobre a última resposta;
- composer/ajuda respeita safe area.

- [ ] **Step 2: Update asset versions**

Alterar query strings dos scripts/CSS modificados em `index.html` para evitar cache antigo.

- [ ] **Step 3: Run full relevant suite**

Run todos os scripts localizados por `scripts/test-comprar-*.mjs` e `scripts/test-basket-preview-checkout-whatsapp-v1.mjs`.

Expected: PASS sem warnings de sintaxe.

- [ ] **Step 4: Verify no automatic upsell remains**

Search must return no production call to `renderBeforeCheckout` or `renderAfterBasket` under `comprar/`.

- [ ] **Step 5: Commit**

```bash
git add comprar/styles.css comprar/index.html
 git commit -m "style: dar mais respiro ao Comprar Conversacional V2"
```

---

### Task 7: Final verification and PR

**Files:**
- No production changes unless verification finds a bug.

- [ ] **Step 1: Review diff against spec**

Confirm every acceptance criterion from the spec is represented by code and tests.

- [ ] **Step 2: Run final tests again from clean branch state**

Run the full relevant Comprar suite.

- [ ] **Step 3: Open PR**

Title:

```text
feat: Comprar Conversacional V2
```

Body must summarize:
- conversation controller;
- optional offers;
- clean review;
- progressive checkout;
- no Supabase schema changes;
- tests executed.
