# Comprar Visual e Checkout V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o Comprar visualmente mais limpo, com fotos maiores e detalhe de produto, e tornar o checkout linear com confirmação real de endereço, pagamento obrigatório e abertura confiável do WhatsApp.

**Architecture:** Manter `chat-light-v2.js` como orquestrador da jornada e extrair responsabilidades novas para módulos focados de produto e checkout. Adicionar RPC versionada para endereços, sem quebrar sessões existentes. Preservar carrinho, cestas e APIs atuais, alterando apenas os contratos necessários.

**Tech Stack:** JavaScript vanilla, CSS, Supabase Edge Functions/Deno, PostgreSQL RPC/migrations, GitHub Actions/Node tests.

**Spec:** `docs/superpowers/specs/2026-09-15-comprar-visual-checkout-design.md`

## Global Constraints

- Mobile-first.
- Manter verde escuro, branco e identidade Dona Antônia.
- Não alterar Admin V3, Bling ou regras comerciais.
- Pedido deve ser persistido antes da tentativa de abrir WhatsApp.
- `+` adiciona rápido; tocar foto/nome abre detalhe.
- Endereço antigo só é substituído quando o usuário escolher explicitamente `replace`.
- Não permitir conclusão sem endereço confirmado e pagamento selecionado.
- WhatsApp deve abrir uma única vez por confirmação, com fallback manual sem duplicar pedido.

---

### Task 1: Contratos de regressão do novo Comprar

**Files:**
- Modify: `scripts/test-basket-preview-checkout-whatsapp-v1.mjs`
- Create: `scripts/test-comprar-product-visual-v2.mjs`
- Modify: `.github/workflows/test-shopping-room.yml`

**Interfaces:**
- Consumes: HTML/JS/CSS públicos do Comprar.
- Produces: contratos para imagem maior, detalhe de produto, checkout linear, endereço versionado e navegação WhatsApp.

- [ ] **Step 1: Write failing tests**

Adicionar asserts para `product-detail-v1.js`, `checkout-final-v2.js`, grade de produtos, ausência de `target="_blank"` na confirmação de identidade e navegação direta após `confirm_order`.

- [ ] **Step 2: Run CI and verify RED**

Run: GitHub Actions workflow `Testar Sala de Compra`.
Expected: FAIL nos novos contratos porque os módulos ainda não existem.

- [ ] **Step 3: Commit tests only**

Commit: `test: definir contratos do Comprar visual checkout v2`

---

### Task 2: Produto com foto maior e detalhe ao toque

**Files:**
- Create: `comprar/product-detail-v1.js`
- Create: `comprar/product-detail-v1.css`
- Modify: `comprar/chat-light-v2.js`
- Modify: `comprar/chat-light-v2.css`
- Modify: `comprar/index.html`
- Modify: `index.html`
- Modify: `supabase/functions/shopping-chat-products-v1/index.ts`

**Interfaces:**
- Consumes: produto `{id,name,price,image_url,brand,packaging,description,quantity}`.
- Produces: `window.DA_PRODUCT_DETAIL.open(product,{quantity,onChange})`.

- [ ] **Step 1: Expose detail fields in product API**

Adicionar `description` ao select de `page` sem aumentar o conjunto de produtos retornados.

- [ ] **Step 2: Implement product modal/bottom sheet**

Criar módulo que abre sobre a lista atual, fecha por X/backdrop/Escape, mostra imagem grande e mantém quantidade sincronizada por callback.

- [ ] **Step 3: Make photo/name clickable but keep +/- independent**

Em `productCard`, tocar foto ou nome chama `DA_PRODUCT_DETAIL.open`; os botões `−/+` mantêm `stopPropagation()` e atualização rápida.

- [ ] **Step 4: Replace horizontal product rail with responsive grid**

Em listas extensas, usar 2 colunas no mobile e mais colunas em larguras maiores. Preservar paginação incremental usando sentinel/scroll da página.

- [ ] **Step 5: Increase images everywhere**

Aumentar imagens de produto, cesta e itens da composição; reduzir metadata visível e contornos.

- [ ] **Step 6: Run tests and commit**

Expected: contratos visuais/produto PASS.
Commit: `feat: ampliar produtos e adicionar detalhe ao toque`

---

### Task 3: Limpeza visual e barra inferior

**Files:**
- Modify: `comprar/chat-light-v2.css`
- Modify: `comprar/comprar-ux-polish-v1.css`
- Modify: `comprar/index.html`
- Modify: `index.html`
- Modify: `comprar/chat-light-v2.js`

**Interfaces:**
- Consumes: estado atual do carrinho e composer.
- Produces: cabeçalho com logo real e barra única de pedido com acesso secundário à Ana.

- [ ] **Step 1: Replace DA circle with real logo**

Usar `/img/logoantonia5.png` no cabeçalho com dimensões estáveis.

- [ ] **Step 2: Reduce nested visual chrome**

Remover fundos cinza e sombras duplicadas; usar borda somente quando separar conteúdo for necessário.

- [ ] **Step 3: Prioritize cart bar**

Mostrar `itens + total + Ver pedido/Finalizar` numa barra principal; composer fica recolhível por ação `Precisa de ajuda?` durante navegação comercial.

- [ ] **Step 4: Verify mobile layout and commit**

Commit: `style: simplificar Comprar e priorizar produtos`

---

### Task 4: Backend real de endereços add/replace

**Files:**
- Create: `supabase/migrations/20260915013000_room_address_save_v2.sql`
- Modify: `supabase/functions/shopping-room-v1/index.ts`
- Modify: `supabase/functions/shopping-chat-v1/index.ts`
- Modify: `.github/workflows/test-shopping-room.yml`

**Interfaces:**
- Produces RPC: `room_save_address_v2(p_public_token text,p_address jsonb,p_mode text default 'add',p_address_id uuid default null)`.
- Modes: `add`, `replace`.
- Returns: `{id,saved,mode,is_default}`.

- [ ] **Step 1: Add failing backend contract**

Assert migration contém `room_save_address_v2`, valida ownership do `address_id` e não desativa outros endereços no modo `add`.

- [ ] **Step 2: Implement RPC**

`replace`: atualizar somente endereço pertencente ao cliente da sessão; `add`: inserir novo; ambos podem torná-lo padrão e manter demais ativos.

- [ ] **Step 3: Wire Edge Functions**

A ação `save_address` passa `mode` e `address_id` para RPC v2, mantendo defaults para clientes antigos.

- [ ] **Step 4: Run Deno/static tests and commit**

Commit: `feat: permitir adicionar ou substituir endereço no checkout`

---

### Task 5: Checkout linear endereço → pagamento → resumo

**Files:**
- Create: `comprar/checkout-final-v2.js`
- Create: `comprar/checkout-final-v2.css`
- Modify: `comprar/chat-light-v2.js`
- Modify: `comprar/index.html`
- Modify: `index.html`

**Interfaces:**
- Consumes checkout preview `addresses`, `customer`, `cart`, `items`.
- Produces `window.DA_CHECKOUT_FINAL.mount(context)` com callbacks `identify`, `saveAddress`, `setPayment`, `confirmOrder`, `openWhatsApp`.

- [ ] **Step 1: Render address confirmation first**

Endereço salvo aparece em card com `Entregar aqui` e `Trocar endereço`. Nenhum vem confirmado silenciosamente.

- [ ] **Step 2: Implement edit/add choice**

Ao trocar, preencher formulário com endereço selecionado e mostrar `Substituir este endereço` ou `Adicionar como outro endereço`.

- [ ] **Step 3: Reveal payment only after address confirmation**

PIX, crédito, alimentação/refeição e dinheiro em botões grandes com estado selecionado inequívoco.

- [ ] **Step 4: Show compact final review**

Exibir endereço, pagamento, total e resumo do pedido. Botão `Confirmar e enviar no WhatsApp` desabilitado até tudo estar válido.

- [ ] **Step 5: Preserve GPS helper**

Geolocalização preenche endereço quando possível; falha mantém formulário manual.

- [ ] **Step 6: Run tests and commit**

Commit: `feat: criar checkout linear com endereço e pagamento confirmados`

---

### Task 6: Abertura confiável do WhatsApp sem retorno indevido

**Files:**
- Modify: `comprar/checkout-final-v2.js`
- Modify: `comprar/chat-checkout-quantity-v1.js`
- Modify: `scripts/test-basket-preview-checkout-whatsapp-v1.mjs`

**Interfaces:**
- Mobile URL: `whatsapp://send?phone=<digits>&text=<encoded>`.
- Desktop URL: `https://web.whatsapp.com/send?phone=<digits>&text=<encoded>`.

- [ ] **Step 1: Remove `_blank` from identity confirmation**

Usar navegação no contexto atual e polling apenas quando a página voltar a ficar visível.

- [ ] **Step 2: Confirm order once, then navigate from the click flow**

Consumir `whatsapp_url` retornada/enriquecida depois de `confirm_order`, convertendo para deep link no mobile. Remover timer automático como mecanismo principal.

- [ ] **Step 3: Add manual fallback without recreating order**

Tela de sucesso mantém `Abrir WhatsApp`; o botão reutiliza URL já calculada e nunca chama `confirm_order` novamente.

- [ ] **Step 4: Run regression test and commit**

Expected: WhatsApp regression contracts PASS.
Commit: `fix: abrir WhatsApp uma única vez após salvar pedido`

---

### Task 7: Integração, cache bust e verificação final

**Files:**
- Modify: `comprar/index.html`
- Modify: `index.html`
- Modify: `comprar/config.js` only if build identifier changes are needed.

**Interfaces:**
- Produces public root and `/comprar/` with identical module versions.

- [ ] **Step 1: Update asset versions**

Garantir raiz e `/comprar/` apontam para os mesmos JS/CSS novos.

- [ ] **Step 2: Run full workflow**

Run all commands from `.github/workflows/test-shopping-room.yml` including Node syntax/tests and Deno checks.
Expected: PASS.

- [ ] **Step 3: Review diff for accidental scope**

Confirmar que Admin V3, Bling e regras comerciais não foram alterados.

- [ ] **Step 4: Final commit and PR**

Commit: `feat: finalizar Comprar visual e checkout v2`.
Abrir PR para `main` com resumo dos testes.
