# Checkout Address and Payment Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o checkout de `/comprar/` confirmar a identidade no WhatsApp oficial, exigir confirmação explícita do endereço, permitir as seis formas comerciais de pagamento na entrega e mostrar uma revisão final antes de criar o pedido.

**Architecture:** Manter o fluxo atual de `shopping-chat-v1` e o helper de identidade `shopping-chat-customer-v1`. Corrigir o número oficial em todos os fallbacks ativos, ampliar o domínio de `payment_method` de ponta a ponta, e deixar a UI principal do checkout responsável por endereço, pagamento e revisão. O addon `chat-checkout-quantity-v1.js` continua protegendo a identidade e enriquecendo o retorno ao WhatsApp.

**Tech Stack:** JavaScript no navegador, Supabase Edge Functions (Deno/TypeScript), PostgreSQL migrations, GitHub Actions.

**Spec:** Requisitos fornecidos na conversa de 14/09/2026: confirmação do cadastro via WhatsApp oficial `(65) 99815-0975`; endereço e forma de pagamento confirmados no site; pagamento somente na entrega por PIX, dinheiro, débito, crédito, vale-alimentação ou vale-refeição; revisão antes da confirmação do pedido.

## Global Constraints

- WhatsApp oficial: `5565998150975`.
- Não revelar endereço salvo antes da prova de posse do WhatsApp.
- Endereço salvo deve exigir escolha explícita; não selecionar automaticamente o primeiro endereço.
- O bloco do endereço salvo deve perguntar `Este endereço continua correto?` e oferecer `Sim` e `Quero usar outro endereço`.
- Formas de pagamento: `pix`, `cash`, `debit_card`, `credit_card`, `food_card`, `meal_card`.
- Todos os pagamentos deste checkout são na entrega.
- Não solicitar dados de cartão.
- O pedido só pode ser confirmado com endereço válido e forma de pagamento escolhida.
- A revisão final deve mostrar pelo menos total, entrega e pagamento.
- Preservar compatibilidade com pedidos antigos que usam `meal_card`.

---

### Task 1: Testes de regressão do checkout

**Files:**
- Modify: `scripts/test-light-shopping-chat-v2.mjs`

**Interfaces:**
- Consumes: código-fonte público do checkout e das Edge Functions.
- Produces: asserts para número oficial, modelo de confirmação de endereço, seis meios de pagamento e revisão final.

- [ ] **Step 1: Escrever asserts que falham no estado atual**

Adicionar verificações para `5565998150975`, `Este endereço continua correto?`, `debit_card`, `food_card`, os seis rótulos de pagamento, mensagem de pagamento confirmado e revisão `Entrega` + `Pagamento`.

- [ ] **Step 2: Rodar CI no branch e confirmar RED**

Esperado: falha porque o código atual ainda usa `556584491018`, não possui `debit_card`/`food_card` e não renderiza o novo modelo de revisão.

### Task 2: Corrigir identidade e retorno ao WhatsApp oficial

**Files:**
- Modify: `comprar/config.js`
- Modify: `comprar/chat-checkout-quantity-v1.js`
- Modify: `supabase/functions/shopping-chat-customer-v1/index.ts`
- Modify: `cesta/whatsapp-return.js`
- Modify: `supabase/functions/shopping-room-v1/index.ts`

**Interfaces:**
- Consumes: mensagem `DAWEB-<código>` e `whatsappFallback`.
- Produces: todos os links novos apontando para `https://wa.me/5565998150975`.

- [ ] **Step 1: Trocar somente os fallbacks ativos do número antigo pelo oficial**

- [ ] **Step 2: Manter a mensagem de verificação `Confirmar meu cadastro na Dona Antônia: DAWEB-<código>` inalterada**

### Task 3: Implementar seis formas de pagamento de ponta a ponta

**Files:**
- Modify: `comprar/chat-light-v2.js`
- Modify: `comprar/chat-checkout-quantity-v1.js`
- Modify: `supabase/functions/shopping-chat-v1/index.ts`
- Modify: `supabase/functions/shopping-chat-admin-test-v1/index.ts`
- Create: `supabase/migrations/20260914223000_shopping_chat_checkout_payment_methods_v2.sql`

**Interfaces:**
- Consumes: `payment_method` enviado pelo navegador.
- Produces: `pix`, `cash`, `debit_card`, `credit_card`, `food_card`, `meal_card` aceitos e persistidos em `orders.payment_method`.

- [ ] **Step 1: Ampliar a whitelist da Edge Function e do modo de teste**

- [ ] **Step 2: Criar migration que atualiza `orders_payment_method_check` com os seis códigos**

- [ ] **Step 3: Renderizar no checkout seis opções independentes**

Rótulos: `PIX`, `Dinheiro`, `Cartão de débito`, `Cartão de crédito`, `Vale-alimentação`, `Vale-refeição`.

- [ ] **Step 4: Ao escolher uma opção, mostrar `Forma de pagamento confirmada: <rótulo> — pagamento na entrega.`**

### Task 4: Corrigir confirmação do endereço e revisão final

**Files:**
- Modify: `comprar/chat-light-v2.js`
- Modify: `comprar/chat-checkout-quantity-v1.js`
- Modify: `comprar/chat-checkout-quantity-v1.css`

**Interfaces:**
- Consumes: `checkout.addresses`, campos de novo endereço e `state.payment`.
- Produces: endereço explicitamente confirmado e resumo final pronto para `confirm_order`.

- [ ] **Step 1: Remover seleção automática do primeiro endereço salvo**

- [ ] **Step 2: Mostrar o endereço salvo e perguntar `Este endereço continua correto?`**

Opções obrigatórias: `Sim` e `Quero usar outro endereço`.

- [ ] **Step 3: Exibir formulário de novo endereço somente quando necessário**

Campos: Rua, Número, Bairro, Complemento, Referência, Cidade, UF e CEP; novos endereços permanecem salvos para próximas compras.

- [ ] **Step 4: Criar revisão final do checkout**

Mostrar `Total`, `Entrega` e `Pagamento`. Atualizar em tempo real quando endereço ou pagamento mudar.

- [ ] **Step 5: Manter `Confirmar pedido` desabilitado até endereço e pagamento estarem válidos**

### Task 5: Cache busting e verificação

**Files:**
- Modify: `comprar/index.html`
- Modify: `comprar/config.js`

**Interfaces:**
- Consumes: novos assets do checkout.
- Produces: navegador carregando a versão corrigida sem cache antigo.

- [ ] **Step 1: Incrementar versões dos assets alterados e `build`**

- [ ] **Step 2: Rodar GitHub Actions completo**

Esperado: `node --check`, testes do chat, testes de checkout, `deno check` e verificações de segurança em verde.

- [ ] **Step 3: Aplicar migration e publicar as Edge Functions alteradas no projeto Supabase `ssbesxgaijknwsjbsbcz`**

- [ ] **Step 4: Mesclar no `main` e verificar a publicação do site**
