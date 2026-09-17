# PapoAI → Comprar Identidade V1 — Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** receber nome/telefone do contato pelo webhook PapoAI, identificar cliente existente, criar/reutilizar uma sessão segura do Chat Comprar e aproveitar essa identidade para saudação personalizada e checkout sem pedir o telefone novamente.

**Architecture:** criar uma Edge Function pública com autenticação por segredo compartilhado guardado no Supabase Vault. A função normaliza o telefone, consulta `lookup_customer_by_phone`, reutiliza/cria a conversa WhatsApp vinculada à conta ativa e chama `room_start_for_conversation_v1`. O Comprar continuará consumindo somente o token opaco `s`; `shopping-chat-v1/open` já entrega `state.customer` quando a sessão contém `customer_id`. O frontend apenas passa a personalizar a saudação pelo primeiro nome. O checkout conversacional existente já pula a identificação quando `state.customer.id` está presente.

**Tech Stack:** Supabase Edge Functions + PostgreSQL/Vault + JavaScript do Comprar + GitHub Actions/Node contract tests.

---

### Task 1: contrato RED da Etapa 1

**Files:**
- Create: `scripts/test-papo-comprar-identity-v1.mjs`

**Contrato:**
- roadmap existe e mantém etapas 2–6 futuras;
- migration cria segredo do webhook e getter service-role;
- Edge Function exige autenticação e usa `lookup_customer_by_phone` + `room_start_for_conversation_v1`;
- identidade é determinada pelo telefone, não pelo nome;
- resposta expõe URL opaca da sala e dados mínimos;
- `renderStart()` personaliza pelo primeiro nome quando `state.customer.name` existe;
- checkout preserva fast path de cliente conhecido e não chama `renderIdentificationStep` nesse caso.

### Task 2: fundação segura do webhook

**Files:**
- Create: `supabase/migrations/20260917160500_papo_comprar_identity_v1.sql`
- Create: `supabase/functions/papo-comprar-webhook-v1/index.ts`

**Comportamento:**
- token compartilhado no Vault `dona_antonia_papo_comprar_webhook_token_v1`;
- `verify_jwt=false`, mas autenticação customizada obrigatória;
- aceitar parâmetros Papo explícitos `phone`, `name`, `message`, `contact_id`, com aliases tolerantes;
- normalizar telefone BR e rejeitar número inválido;
- buscar cliente somente por telefone;
- usar conta WhatsApp ativa existente;
- reutilizar conversa aberta do telefone ou criar uma nova;
- não criar cadastro de cliente automaticamente;
- chamar `room_start_for_conversation_v1` com intent `home`;
- registrar metadados `entry_source=papoai` na sessão;
- devolver `shopping_url`, `customer_found` e perfil mínimo.

### Task 3: saudação personalizada no Comprar

**Files:**
- Modify: `comprar/app.js`
- Modify: `comprar/index.html`
- Modify: `index.html`

**Comportamento:**
- helper de primeiro nome sanitizado;
- cliente conhecido: `Oi, Maria 😊 Como posso ajudar na sua compra?`;
- desconhecido: manter saudação genérica;
- bump de versão de `app.js` nas duas entradas para evitar cache.

### Task 4: preservar fast checkout conhecido

**Files:**
- Test existing: `comprar/conversation.js`

Não criar novo formulário. Confirmar por teste que `openCheckoutConversation` usa `state.checkout?.customer || state.customer` e chama `renderAddressStep()` diretamente quando existe `customer_id`.

### Task 5: deploy e verificação

1. Rodar os contratos via GitHub Actions.
2. Aplicar migration no projeto `ssbesxgaijknwsjbsbcz`.
3. Deploy `papo-comprar-webhook-v1` com `verify_jwt=false` e autenticação customizada interna.
4. Testar 401/403 sem token e payload inválido.
5. Testar payload sintético autenticado com telefone de cliente de teste, sem expor dados pessoais em logs/resposta além do mínimo.
6. Confirmar CI verde.
7. Só então integrar ao `main`.

### Configuração externa PapoAI necessária após deploy

No PapoAI, apontar o webhook para a Edge Function e enviar pelo menos:
- `phone`
- `name`
- `message`
- `contact_id` (se disponível)
- segredo compartilhado do webhook.

A documentação pública do Papo não confirma que o retorno HTTP do webhook pode alimentar dinamicamente um botão/link. Por isso a Etapa 1 deixa o `shopping_url` pronto na resposta e a ligação desse URL à mensagem/botão do Papo deve ser feita conforme o recurso real disponível na conta; integração outbound pela API Papo fica na Etapa 3.