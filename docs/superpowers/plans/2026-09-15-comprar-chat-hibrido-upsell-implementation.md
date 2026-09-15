# Comprar em Chat Híbrido com Upsell Suave — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Comprar da Dona Antônia em um atendimento mobile-first com linguagem de chat, ferramentas visuais recolhíveis, cestas em grade, checkout conversacional e upsell suave por regras, preservando backend, pedido, pagamento e WhatsApp atuais.

**Architecture:** O front continua modular em `comprar/app.js`, `baskets.js`, `products.js`, `checkout.js` e `help.js`. A mudança adiciona um módulo novo `comprar/upsell.js` que apenas escolhe e renderiza sugestões; ele não altera carrinho diretamente além de chamar a interface pública do módulo de produtos. `app.js` passa a oferecer helpers conversacionais e um estado visual simples para recolher ferramentas concluídas. O backend comercial permanece intacto nesta primeira entrega.

**Tech Stack:** HTML/CSS/JavaScript sem framework, Supabase Edge Functions já existentes, GitHub Pages, testes Node `.mjs` por contrato/estrutura e workflows atuais do repositório.

**Spec:** `docs/superpowers/specs/2026-09-15-comprar-chat-hibrido-upsell-design.md`

## Global Constraints

- Mobile-first: 2 colunas para cestas e produtos no celular.
- Não imitar visualmente o WhatsApp; manter sensação de conversa.
- Não criar chamadas de IA para mensagens operacionais da Ana.
- Não mudar regras comerciais, cálculo de cesta, persistência do pedido, forma de pagamento ou WhatsApp final.
- Não reintroduzir carregamento automático de produtos; manter `Ver mais` manual.
- Depois que o checkout começar, não mostrar upsell.
- No máximo 2 intervenções de upsell por compra: até 4 produtos após escolha da cesta e até 3 antes do checkout.
- Não renderizar upsell se não houver pelo menos 2 sugestões elegíveis e relevantes.
- Não transformar cliques utilitários (`+`, `−`, filtro, `Ver mais`) em bolhas do cliente; apenas decisões semânticas importantes.
- `admin_test=1` continua sem criar pedido real e sem abrir WhatsApp real.
- Pedido concluído continua fechando a sala; nova compra usa nova sala.

---

### Task 1: Base visual e linguagem de chat

**Files:**
- Modify: `comprar/app.js`
- Modify: `comprar/styles.css`
- Test: `scripts/test-comprar-chat-hybrid-v1.mjs`

**Interfaces:**
- Produces: `app.assistantMessage(text, options)`, `app.userDecision(text, options)`, `app.compactToolSummary(options)`.
- `assistantMessage` e `userDecision` inserem mensagens curtas na timeline sem alterar backend.
- `compactToolSummary` cria um bloco compacto reutilizável para cesta, produtos e checkout concluídos.

- [ ] **Step 1: Write the failing test**

Criar `scripts/test-comprar-chat-hybrid-v1.mjs` com asserts de contrato:

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync('comprar/app.js','utf8');
const css=fs.readFileSync('comprar/styles.css','utf8');

assert.match(app,/function assistantMessage\(/);
assert.match(app,/function userDecision\(/);
assert.match(app,/function compactToolSummary\(/);
assert.match(css,/\.conversation-message/);
assert.match(css,/\.conversation-tool-summary/);
assert.doesNotMatch(css,/\.stage-no\{[^}]*display:grid/);
console.log('ok');
```

- [ ] **Step 2: Run test and verify RED**

Run: `node scripts/test-comprar-chat-hybrid-v1.mjs`
Expected: FAIL porque helpers e classes ainda não existem.

- [ ] **Step 3: Implement the conversational helpers**

Em `app.js`, criar helpers independentes do backend:

```js
function conversationMessage(textValue,who='assistant',className=''){
  const timeline=$('timeline');
  if(!timeline||!textValue)return null;
  const node=document.createElement('div');
  node.className=`conversation-message ${who} ${className}`.trim();
  node.textContent=String(textValue);
  timeline.appendChild(node);
  return node;
}
function assistantMessage(textValue,options={}){
  return conversationMessage(textValue,'assistant',options.className||'');
}
function userDecision(textValue,options={}){
  return conversationMessage(textValue,'user',options.className||'decision');
}
function compactToolSummary({className='',title='',meta='',actions=[]}={}){
  const node=document.createElement('section');
  node.className=`conversation-tool-summary ${className}`.trim();
  const copy=document.createElement('div');
  copy.className='conversation-tool-summary-copy';
  copy.innerHTML=`<strong>${escapeHtml(title)}</strong>${meta?`<small>${escapeHtml(meta)}</small>`:''}`;
  node.appendChild(copy);
  if(actions.length){
    const host=document.createElement('div');host.className='conversation-tool-summary-actions';
    for(const action of actions){
      const button=document.createElement('button');button.type='button';button.className=action.primary?'primary':'text-button';button.textContent=action.label;button.onclick=action.onClick;host.appendChild(button);
    }
    node.appendChild(host);
  }
  return node;
}
```

Exportar esses helpers em `window.DA_COMPRAR_APP`.

No CSS, criar `.conversation-message`, `.conversation-message.assistant`, `.conversation-message.user`, `.conversation-tool-summary` e reduzir visual de `.stage-head`/`.stage-no`; `stage-no` deve permanecer no DOM apenas por compatibilidade, mas ficar oculto no novo visual.

- [ ] **Step 4: Run targeted test**

Run: `node scripts/test-comprar-chat-hybrid-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Run existing clean architecture tests**

Run: `node scripts/test-comprar-clean-architecture-v1.mjs && node scripts/test-comprar-clean-activation-v1.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `Criar base visual conversacional do Comprar`

---

### Task 2: Cestas em grade e confirmação recolhível

**Files:**
- Modify: `comprar/baskets.js`
- Modify: `comprar/styles.css`
- Test: `scripts/test-comprar-chat-baskets-v1.mjs`

**Interfaces:**
- Consumes: `app.assistantMessage`, `app.userDecision`, `app.compactToolSummary`.
- Produces: `baskets.renderSelectedBasketSummary()` e `baskets.expandSelectedBasket()`.

- [ ] **Step 1: Write failing test**

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';
const baskets=fs.readFileSync('comprar/baskets.js','utf8');
const css=fs.readFileSync('comprar/styles.css','utf8');
assert.match(baskets,/Quero esta cesta/);
assert.match(baskets,/renderSelectedBasketSummary/);
assert.match(baskets,/Ver composição/);
assert.match(baskets,/Alterar/);
assert.match(css,/\.basket-grid/);
assert.doesNotMatch(css,/\.basket-picker\{[^}]*grid-auto-flow:column/);
console.log('ok');
```

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-comprar-chat-baskets-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Replace basket rail with two-column grid**

Em `renderPicker()`:
- inserir antes da ferramenta `app.assistantMessage('Escolha a cesta que combina melhor com você.')`;
- usar `rail.className='basket-grid'`;
- manter cada card com imagem, nome, preço e `Ver produtos`;
- não transformar `Ver produtos` em bolha do cliente.

CSS:

```css
.basket-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:4px 12px 14px}
.basket-mini{min-width:0;border:1px solid #e2e9e4;border-radius:14px;padding:9px;background:#fff;display:flex;flex-direction:column;gap:7px}
.basket-mini img{width:100%;aspect-ratio:1/1;object-fit:contain;border-radius:10px;background:#f5f7f5}
```

- [ ] **Step 4: Make basket preview conversational**

Ao abrir `previewBasket()`:
- recolher/remover a grade ativa da timeline;
- mostrar a composição editável como ferramenta;
- trocar CTA de `Escolher esta cesta` para `Quero esta cesta`.

- [ ] **Step 5: Collapse basket after confirmation**

Após `chooseBasket()`:
- inserir `app.userDecision('Quero '+nomeDaCesta)`;
- inserir `app.assistantMessage('Certo! Sua cesta já está no pedido. Quer acrescentar alguma coisa?')`;
- não deixar lista completa aberta;
- renderizar `renderSelectedBasketSummary()` com nome, número de itens e total;
- oferecer `Ver composição` e `Alterar`;
- `Ver composição` expande sem criar nova cesta;
- `Alterar` volta ao picker e mantém estado somente até nova escolha confirmada.

- [ ] **Step 6: Run tests**

Run:
`node scripts/test-comprar-chat-baskets-v1.mjs && node scripts/test-comprar-clean-baskets-v1.mjs && node scripts/test-basket-preview-checkout-whatsapp-v1.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `Transformar cestas em grade conversacional`

---

### Task 3: Barra inferior compacta e resumo do pedido

**Files:**
- Modify: `comprar/index.html`
- Modify: `index.html`
- Modify: `comprar/app.js`
- Modify: `comprar/styles.css`
- Test: `scripts/test-comprar-chat-cartbar-v1.mjs`

**Interfaces:**
- `setCart(cart)` continua fonte única do total e contagem.
- Barra inferior apresenta apenas resumo e `Ver pedido`.

- [ ] **Step 1: Write failing test**

```js
import fs from 'node:fs';import assert from 'node:assert/strict';
for(const file of ['index.html','comprar/index.html']){
  const html=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(html,/id="cartAddProducts"/);
  assert.match(html,/id="cartSummaryText"/);
  assert.match(html,/id="checkoutButton"/);
}
console.log('ok');
```

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-comprar-chat-cartbar-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Simplify markup**

Trocar a barra por:

```html
<div id="cartBar" class="cart-bar">
  <div class="cart-bar-total">
    <small>Seu pedido</small>
    <strong id="cartSummaryText">0 itens · R$ 0,00</strong>
  </div>
  <button id="checkoutButton" type="button" disabled>Ver pedido</button>
</div>
```

- [ ] **Step 4: Update `setCart`**

Atualizar `cartSummaryText` com `${count} ${count===1?'item':'itens'} · ${money(total)}`. Manter `cartCount` do topo apenas como indicador compacto.

- [ ] **Step 5: Remove obsolete shell binding**

Retirar dependência de `cartAddProducts` em `bindShell()`. O acesso a produtos permanece dentro do fluxo conversacional e do resumo de cesta/pedido, não como botão concorrente fixo.

- [ ] **Step 6: Run tests**

Run: `node scripts/test-comprar-chat-cartbar-v1.mjs && node scripts/test-comprar-root-home-v1.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `Simplificar barra fixa do pedido`

---

### Task 4: Motor de upsell suave por regras

**Files:**
- Create: `comprar/upsell.js`
- Modify: `comprar/products.js`
- Test: `scripts/test-comprar-upsell-v1.mjs`

**Interfaces:**
- `upsell.renderAfterBasket()` — primeira oportunidade, máximo 4.
- `upsell.renderBeforeCheckout()` — segunda oportunidade, máximo 3.
- `upsell.stop()` — encerra sugestões ao iniciar checkout.
- Consumes: `state.cart`, `productApi('page', ...)`, `products.addSuggestedProduct(product)`.
- Produces no backend changes.

- [ ] **Step 1: Write failing test**

```js
import fs from 'node:fs';import assert from 'node:assert/strict';
const u=fs.readFileSync('comprar/upsell.js','utf8');
assert.match(u,/MAX_AFTER_BASKET=4/);
assert.match(u,/MAX_BEFORE_CHECKOUT=3/);
assert.match(u,/MIN_RELEVANT=2/);
assert.match(u,/function renderAfterBasket/);
assert.match(u,/function renderBeforeCheckout/);
assert.match(u,/function stop/);
assert.match(u,/suggestedProductIds/);
console.log('ok');
```

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-comprar-upsell-v1.mjs`
Expected: FAIL porque arquivo não existe.

- [ ] **Step 3: Implement deterministic scoring**

Criar módulo com estado local:

```js
const MAX_AFTER_BASKET=4;
const MAX_BEFORE_CHECKOUT=3;
const MIN_RELEVANT=2;
const suggestedProductIds=new Set();
let stopped=false;
```

Elegibilidade:
- `price > 0`;
- produto não está no carrinho com quantidade > 0;
- produto não foi sugerido antes;
- Edge Function já garante ativo/estoque vendável; não duplicar regra de estoque no front.

Pontuação v1, apenas com dados disponíveis no feed:
- `+30` se `is_offer===true`;
- `+20` se categoria/subcategoria não estiver representada no carrinho;
- `+10` se preço <= 10% do total do carrinho;
- `+5` se preço <= 20% do total;
- `-20` se preço > 35% do total;
- `-1000` se produto já estiver no carrinho ou já tiver sido sugerido.

Se campos de categoria não existirem no item retornado, o scorer simplesmente não atribui o bônus de categoria; não inventar relação.

- [ ] **Step 4: Fetch candidate pool without infinite loading**

Para cada oportunidade, obter no máximo duas páginas pequenas:
- primeiro `offers:true` limit 12;
- depois seção `Para Você` ou `Para Casa` limit 12 conforme disponibilidade;
- unir por `id`;
- ordenar por score decrescente e preço crescente como desempate;
- se restarem menos de `MIN_RELEVANT`, não renderizar nada.

- [ ] **Step 5: Render micro-vitrine**

Criar ferramenta `upsell-strip` com mensagem da Ana e grid horizontal/2 colunas de no máximo 4 ou 3 cards. Cada card mostra imagem, nome, preço e botão `+ Adicionar`.

Ao clicar, chamar `products.addSuggestedProduct(product)` e atualizar card para `Adicionado` sem criar nova fala da Ana.

- [ ] **Step 6: Expose `addSuggestedProduct` from products module**

Em `products.js`:

```js
function addSuggestedProduct(product){
  const sync=productState(product);
  if(sync.desiredQuantity>0)return;
  changeQuantity(product,1);
}
```

Exportar no `registerModule('products', ...)`.

- [ ] **Step 7: Run tests**

Run: `node scripts/test-comprar-upsell-v1.mjs && node scripts/test-comprar-clean-products-v1.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

Commit message: `Adicionar upsell suave por regras`

---

### Task 5: Integrar upsell ao fluxo sem bloquear compra

**Files:**
- Modify: `comprar/baskets.js`
- Modify: `comprar/app.js`
- Modify: `comprar/checkout.js`
- Test: `scripts/test-comprar-upsell-flow-v1.mjs`

**Interfaces:**
- `baskets.chooseBasket` chama `upsell.renderAfterBasket()` após resumo da cesta.
- `app.openCheckout` pode chamar `upsell.renderBeforeCheckout()` uma única vez antes do checkout real.
- `checkout.open` chama `upsell.stop()` imediatamente.

- [ ] **Step 1: Write failing flow test**

```js
import fs from 'node:fs';import assert from 'node:assert/strict';
const baskets=fs.readFileSync('comprar/baskets.js','utf8');
const app=fs.readFileSync('comprar/app.js','utf8');
const checkout=fs.readFileSync('comprar/checkout.js','utf8');
assert.match(baskets,/renderAfterBasket/);
assert.match(app,/renderBeforeCheckout/);
assert.match(checkout,/modules\.upsell\?\.stop/);
console.log('ok');
```

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-comprar-upsell-flow-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Add first opportunity**

Após `Quero esta cesta`, renderizar resumo, mensagem da Ana e chamar `state.modules.upsell?.renderAfterBasket?.()`.

- [ ] **Step 4: Add second opportunity without trapping checkout**

Ao primeiro `Ver pedido`, mostrar resumo do pedido e, se ainda não usada, a segunda micro-vitrine acima do CTA `Finalizar pedido`. O CTA continua visível e clicável mesmo que a sugestão falhe ou não exista.

- [ ] **Step 5: Stop on checkout**

No início de `checkout.open()` chamar `state.modules.upsell?.stop?.()` e remover qualquer `.upsell-strip` da timeline.

- [ ] **Step 6: Run tests**

Run: `node scripts/test-comprar-upsell-flow-v1.mjs && node scripts/test-comprar-clean-checkout-v1.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `Integrar upsell ao atendimento sem bloquear checkout`

---

### Task 6: Checkout com aparência conversacional

**Files:**
- Modify: `comprar/checkout.js`
- Modify: `comprar/styles.css`
- Test: `scripts/test-comprar-conversational-checkout-v1.mjs`

**Interfaces:**
- Preserva `lookup_customer`, `commit_customer`, `save_address`, `set_payment`, `confirm_order` e WhatsApp atuais.
- Apenas muda apresentação e ordem visual.

- [ ] **Step 1: Write failing test**

```js
import fs from 'node:fs';import assert from 'node:assert/strict';
const c=fs.readFileSync('comprar/checkout.js','utf8');
assert.doesNotMatch(c,/sectionTitle\(1,/);
assert.doesNotMatch(c,/sectionTitle\(2,/);
assert.match(c,/Digite seu WhatsApp com DDD/);
assert.match(c,/Encontrei seu cadastro|Confira seus dados/);
assert.match(c,/Como você prefere pagar na entrega/);
console.log('ok');
```

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-comprar-conversational-checkout-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Replace numbered headers with Ana messages**

No `open()`, depois do preview, inserir `assistantMessage('Para finalizar, vou confirmar seus dados de entrega.')`.

Em identificação, usar mensagem curta “Digite seu WhatsApp com DDD para localizar seu cadastro.” acima do campo.

Depois do lookup:
- cliente encontrado: “Encontrei seu cadastro. Confira se está tudo certo.”;
- novo cliente: “Não encontrei um cadastro com esse número. Preencha os dados abaixo para entrega.”

- [ ] **Step 4: Keep form as one tool**

Manter todos os campos atuais e endereços salvos dentro de um único `.checkout-tool`, sem subcards numerados.

- [ ] **Step 5: Payment question**

Acima de `.checkout-payments`, renderizar texto “Como você prefere pagar na entrega?”. Botões permanecem em 2 colunas e apenas seleção ativa usa verde preenchido.

- [ ] **Step 6: Final summary**

Antes de `Confirmar e enviar pedido`, exibir endereço resumido, pagamento e total. Não adicionar ofertas.

- [ ] **Step 7: Run tests**

Run: `node scripts/test-comprar-conversational-checkout-v1.mjs && node scripts/test-comprar-clean-checkout-v1.mjs && node scripts/test-basket-preview-checkout-whatsapp-v1.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

Commit message: `Tornar checkout conversacional`

---

### Task 7: Ajuda integrada ao composer sem sobreposição

**Files:**
- Modify: `comprar/index.html`
- Modify: `index.html`
- Modify: `comprar/help.js`
- Modify: `comprar/styles.css`
- Test: `scripts/test-comprar-help-composer-v1.mjs`

**Interfaces:**
- `helpToggle` abre o composer.
- Novo `helpClose` fecha o composer.
- Quando aberto, `helpToggle` fica oculto; não muda para texto “Fechar ajuda”.

- [ ] **Step 1: Write failing test**

```js
import fs from 'node:fs';import assert from 'node:assert/strict';
const help=fs.readFileSync('comprar/help.js','utf8');
for(const file of ['index.html','comprar/index.html']){
  const html=fs.readFileSync(file,'utf8');
  assert.match(html,/id="helpClose"/);
}
assert.doesNotMatch(help,/Fechar ajuda/);
assert.match(help,/help\.classList\.toggle\('hidden',open/);
console.log('ok');
```

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-comprar-help-composer-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Add close icon inside composer**

Adicionar ao final do form:

```html
<button id="helpClose" class="composer-close" type="button" aria-label="Fechar ajuda">×</button>
```

- [ ] **Step 4: Change help behavior**

Em `setOpen(open)`:
- manter `aria-expanded`;
- não trocar texto para `Fechar ajuda`;
- ocultar `helpToggle` quando `open===true`;
- mostrar `helpClose` apenas quando aberto.

No `init()`, `helpClose.onclick=close`.

- [ ] **Step 5: CSS**

`.composer-close` deve estar dentro do composer e nunca usar `position:fixed`. Ajustar grid/flex para caber no iPhone sem sobrepor `+`, input, microfone e enviar.

- [ ] **Step 6: Run tests**

Run: `node scripts/test-comprar-help-composer-v1.mjs && node scripts/test-light-shopping-chat-v2.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `Integrar fechamento da ajuda ao composer`

---

### Task 8: Ativação do módulo de upsell e cache-bust

**Files:**
- Modify: `comprar/index.html`
- Modify: `index.html`
- Test: `scripts/test-comprar-chat-hybrid-activation-v1.mjs`

**Interfaces:**
- Ordem de scripts: `config`, `admin-test-bridge`, `app`, `baskets`, `products`, `upsell`, `checkout`, `help`, `start`.

- [ ] **Step 1: Write failing test**

```js
import fs from 'node:fs';import assert from 'node:assert/strict';
for(const file of ['index.html','comprar/index.html']){
  const h=fs.readFileSync(file,'utf8');
  assert.match(h,/upsell\.js\?v=/);
  assert.ok(h.indexOf('products.js')<h.indexOf('upsell.js'));
  assert.ok(h.indexOf('upsell.js')<h.indexOf('checkout.js'));
}
console.log('ok');
```

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-comprar-chat-hybrid-activation-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Add script and bump versions**

Adicionar `<script src=".../upsell.js?v=20260915-chat-01"></script>` e atualizar versões de `styles.css`, `app.js`, `baskets.js`, `products.js`, `checkout.js`, `help.js` para o mesmo release visual.

- [ ] **Step 4: Run activation tests**

Run: `node scripts/test-comprar-chat-hybrid-activation-v1.mjs && node scripts/test-comprar-clean-activation-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `Ativar Comprar híbrido e atualizar cache`

---

### Task 9: Verificação integrada e proteção de regressões

**Files:**
- Modify only if a stale test asserts the old visual contract: the exact failing test file.
- No production change unless a real regression is demonstrated.

- [ ] **Step 1: Run new tests**

Run:
```bash
node scripts/test-comprar-chat-hybrid-v1.mjs
node scripts/test-comprar-chat-baskets-v1.mjs
node scripts/test-comprar-chat-cartbar-v1.mjs
node scripts/test-comprar-upsell-v1.mjs
node scripts/test-comprar-upsell-flow-v1.mjs
node scripts/test-comprar-conversational-checkout-v1.mjs
node scripts/test-comprar-help-composer-v1.mjs
node scripts/test-comprar-chat-hybrid-activation-v1.mjs
```
Expected: todos PASS.

- [ ] **Step 2: Run existing critical suite**

Run:
```bash
node scripts/test-comprar-clean-architecture-v1.mjs
node scripts/test-comprar-clean-activation-v1.mjs
node scripts/test-comprar-clean-products-v1.mjs
node scripts/test-comprar-clean-baskets-v1.mjs
node scripts/test-comprar-clean-checkout-v1.mjs
node scripts/test-comprar-root-home-v1.mjs
node scripts/test-basket-preview-checkout-whatsapp-v1.mjs
node scripts/test-light-shopping-chat-v2.mjs
```
Expected: todos PASS. Se um teste falhar apenas porque exige o visual antigo, atualizar somente essa expectativa e registrar no commit.

- [ ] **Step 3: Verify static forbidden regressions**

Confirmar:
- nenhum `window.fetch=`;
- nenhum `MutationObserver` usado como patch global;
- nenhum auto-scroll loader de produtos;
- nenhum `Fechar ajuda` flutuante;
- nenhum upsell chamado dentro de `confirmAndSend` ou após início do checkout.

- [ ] **Step 4: Open PR and run GitHub Actions**

PR da branch de implementação para `main`.
Checks obrigatórios antes de merge:
- Comprar Clean Refactor;
- Comprar na raiz;
- Testar Sala de Compra;
- Chat quantity and phone checkout;
- Admin V3 real Chat test mode;
- Validar site público.

- [ ] **Step 5: Merge only after green relevant CI**

Usar squash merge. Não bloquear por workflow legado não relacionado se o mesmo erro já existir na `main` e os checks do Comprar estiverem verdes.

- [ ] **Step 6: Verify Pages deployment**

Confirmar GitHub Pages `completed/success` para o commit final publicado.

- [ ] **Step 7: Production smoke checklist**

Sem criar pedido real:
- abrir site em viewport mobile;
- grade de cestas 2 colunas;
- `Ver produtos` abre composição;
- `Quero esta cesta` recolhe para resumo;
- primeira micro-vitrine aparece somente quando há >=2 sugestões;
- produtos extras têm `Ver mais` manual;
- barra fixa mostra itens + total + `Ver pedido`;
- segunda micro-vitrine não impede finalizar;
- checkout não mostra números de etapas;
- ajuda abre e fecha pelo `×` interno sem sobreposição;
- `admin_test=1` continua sem pedido/WhatsApp real.

- [ ] **Step 8: Final commit if test-only adjustments were needed**

Commit message: `Validar experiência híbrida do Comprar`
