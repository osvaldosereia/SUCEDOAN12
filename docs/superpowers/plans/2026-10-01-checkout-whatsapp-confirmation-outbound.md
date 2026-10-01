# Checkout WhatsApp Confirmation Outbound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o pedido do site existir independentemente do WhatsApp, enfileirar uma confirmação transacional automática pelo canal correto e tentar retornar à conversa após ~3 segundos sem transformar essa navegação em requisito do checkout.

**Architecture:** `storefront-v2` continua sendo a única API pública do checkout. Após criar o pedido, o backend chama uma função interna idempotente que grava uma intenção na outbox server-side e resolve 0975/1018 a partir da conversa/conta WhatsApp quando disponível, com fallback controlado ao canal padrão. O frontend mostra sucesso imediato, não abre popup antes da criação do pedido e faz somente uma tentativa best-effort de retorno ao WhatsApp após 3 segundos; o gateway de envio fica isolado para o contrato oficial PapoAI/Meta, sem segredo no navegador.

**Tech Stack:** HTML/JavaScript estático, Supabase Edge Functions (Deno/TypeScript), PostgreSQL/PLpgSQL, scripts de contrato Node/Python existentes.

**Spec:** `docs/superpowers/specs/2026-10-01-checkout-whatsapp-confirmation-outbound-design.md`

## Global Constraints

- Pedido: Supabase / motor canônico do site.
- PapoAI/WhatsApp: canal de comunicação, nunca motor do pedido.
- Não usar Make/n8n no fluxo principal.
- Falha de WhatsApp não pode desfazer, duplicar nem invalidar pedido já criado.
- Origem 0975 envia pelo 0975; origem 1018 envia pelo 1018; site direto usa canal padrão.
- Um mesmo `order_id + message_kind` gera no máximo uma intenção efetiva.
- Retorno automático ocorre somente depois do sucesso e é best-effort; fallback manual é obrigatório.
- Nenhum segredo PapoAI/Meta pode ser exposto no frontend.

## Review Focus

- Pedido criado quando o provedor de WhatsApp está indisponível: checkout continua sucesso e outbox registra estado reenviável.
- Repetição/retry do mesmo pedido: não cria segunda confirmação `order_received`.
- Cliente vindo do 1018: não pode cair silenciosamente no 0975 quando a conversa/conta identifica 1018.
- Navegador bloqueia abertura automática após 3 s: tela de sucesso continua válida e botão manual funciona.
- Duplo clique/reenvio do request de checkout: não pode produzir dois pedidos/mensagens quando o backend já protege a criação canônica.

---

### Task 1: Outbox transacional e resolução de canal

**Files:**
- Create: `supabase/sql/20261001_checkout_whatsapp_outbox_v1.sql`
- Create: `scripts/test-checkout-whatsapp-outbox.mjs`

**Interfaces:**
- Consumes: `orders`, `customers`, `conversations`, `whatsapp_accounts`, `canonical_whatsapp_e164_br_v2` e vínculo de conversa já usados pelo Operations 2.0.
- Produces: `ops2_whatsapp_outbox_v1`, `ops2_enqueue_order_whatsapp_v1(p_order_id uuid, p_message_kind text default 'order_received') returns jsonb`, com retorno `{ok,outbox_id,status,channel_origin,channel_phone_e164,phone_e164,reused}`.

- [ ] **Step 1: Write the failing contract test**

Criar `scripts/test-checkout-whatsapp-outbox.mjs` afirmando que a migration contém: tabela `ops2_whatsapp_outbox_v1`, índice/constraint único para `order_id + message_kind`, estados `pending/sending/sent/retry/failed/suppressed`, colunas de canal e `external_message_id`, função `ops2_enqueue_order_whatsapp_v1`, busca por `conversations.whatsapp_account_id -> whatsapp_accounts.phone_e164`, e revogação para `public/anon/authenticated` com `service_role` autorizado.

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-checkout-whatsapp-outbox.mjs`
Expected: FAIL porque a migration ainda não existe.

- [ ] **Step 3: Implement the migration and enqueue RPC**

A função deve: validar pedido existente; obter telefone canônico do cliente/pedido; preferir a conversa ligada ao pedido/cliente mais recente; resolver `channel_origin` pelos finais 0975/1018 da conta ativa; usar 0975 somente quando não houver origem válida; montar snapshot transacional do pedido salvo; inserir com idempotência por `(order_id,message_kind)`; em repetição retornar a linha existente com `reused=true`.

- [ ] **Step 4: Run contract test**

Run: `node scripts/test-checkout-whatsapp-outbox.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(whatsapp): add idempotent order confirmation outbox`

---

### Task 2: Enfileirar confirmação sem acoplar a criação do pedido ao WhatsApp

**Files:**
- Modify: `supabase/functions/storefront-v2/index.ts`
- Modify: `scripts/test-site-only-order-registration.mjs`
- Modify: `scripts/test-checkout-whatsapp-outbox.mjs`

**Interfaces:**
- Consumes: `ops2_enqueue_order_whatsapp_v1` da Task 1.
- Produces: resposta de `submit_order` preserva o pedido canônico e acrescenta `whatsapp_confirmation` com estado informativo; falha de enqueue vira aviso server-side, nunca erro de criação do pedido.

- [ ] **Step 1: Extend failing tests**

Adicionar asserts de que `storefront-v2` chama `ops2_enqueue_order_whatsapp_v1` somente depois de obter `order_id`, envolve essa chamada em proteção de erro e retorna status de confirmação sem trocar `ok:true` do pedido por falha de WhatsApp.

- [ ] **Step 2: Run tests to verify failure**

Run: `node scripts/test-site-only-order-registration.mjs && node scripts/test-checkout-whatsapp-outbox.mjs`
Expected: FAIL nos novos asserts de enqueue/status.

- [ ] **Step 3: Implement enqueue best-effort in `submit`**

Após criação e vínculo PapoAI existentes, chamar `db.rpc('ops2_enqueue_order_whatsapp_v1',{p_order_id:orderId,p_message_kind:'order_received'})`. Capturar erro em `console.error`, retornar `whatsapp_confirmation:{status:'pending'|'unavailable',...}` e nunca lançar erro após pedido confirmado.

- [ ] **Step 4: Run tests**

Run: `node scripts/test-site-only-order-registration.mjs && node scripts/test-checkout-whatsapp-outbox.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(storefront): enqueue WhatsApp confirmation after order creation`

---

### Task 3: Checkout sem popup obrigatório e retorno best-effort em 3 segundos

**Files:**
- Modify: `index.html`
- Modify: `vitrine/index.html`
- Create: `scripts/test-checkout-whatsapp-return.mjs`
- Modify: `scripts/test-marketing-intelligence-contract.py` somente se o rename/estrutura do bloco exigir manter o contrato de sinais existente.

**Interfaces:**
- Consumes: resposta de pedido criada pela Task 2 e `resolveWhatsappDestination()`/`WHATSAPP_CHANNELS` já existentes.
- Produces: `renderOrderSuccess(saved)` e `scheduleWhatsAppReturn(url, delayMs=3000)`; nenhum `window.open('about:blank')` antes do primeiro `await` do checkout.

- [ ] **Step 1: Write failing frontend contract test**

Criar asserts para: botão final com texto `Finalizar pedido`; ausência de reserva antecipada `window.open('about:blank')` no fluxo de submit; tela `Pedido recebido`; texto de confirmação enviada ao WhatsApp; `setTimeout`/delay de 3000 ms somente após pedido salvo; botão real `Voltar ao WhatsApp`; botão `Voltar à vitrine`; `index.html` e `vitrine/index.html` idênticos; manutenção das linhas `INTERESSES_MKT` e `MARCAS_MKT` hoje exigidas pelo contrato de marketing quando ainda aplicáveis ao snapshot do pedido.

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-checkout-whatsapp-return.mjs`
Expected: FAIL porque o fluxo ainda abre WhatsApp imediatamente/reserva popup.

- [ ] **Step 3: Implement success UX and scheduled return**

Renomear semântica do botão/handler conforme necessário, preservar criação do pedido atual, limpar carrinho só após `ok:true`, montar URL da conversa sem texto de pedido como requisito, renderizar sucesso antes do timer, programar tentativa de `window.location.assign(url)` em ~3000 ms e manter link manual. Falha/bloqueio de navegação não altera estado do pedido.

- [ ] **Step 4: Run frontend and marketing contract tests**

Run: `node scripts/test-checkout-whatsapp-return.mjs && python scripts/test-marketing-intelligence-contract.py`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(checkout): finalize before optional WhatsApp return`

---

### Task 4: Gateway server-side preparado para envio oficial e observabilidade segura

**Files:**
- Create: `supabase/functions/whatsapp-order-outbound-v1/index.ts`
- Modify: `supabase/config.toml`
- Modify: `supabase/sql/20261001_checkout_whatsapp_outbox_v1.sql`
- Modify: `scripts/test-checkout-whatsapp-outbox.mjs`

**Interfaces:**
- Consumes: linhas `pending/retry` de `ops2_whatsapp_outbox_v1` e configuração server-side do provedor.
- Produces: endpoint interno/service-only que reivindica uma intenção idempotentemente, envia quando o contrato oficial PapoAI estiver configurado, grava `sent/external_message_id` ou `retry/failed/last_error`; quando não configurado, retorna `provider_not_configured` sem marcar pedido como falho.

- [ ] **Step 1: Extend failing contract test**

Exigir Edge Function sem CORS público permissivo, autenticação por segredo interno/service role conforme padrão do projeto, leitura de uma única intenção, transição atômica `pending/retry -> sending`, gravação de `external_message_id`, política de retry limitada e ausência de credenciais literais/URLs inventadas no código.

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-checkout-whatsapp-outbox.mjs`
Expected: FAIL nos asserts do gateway.

- [ ] **Step 3: Implement provider-neutral gateway**

Usar apenas variáveis server-side para o contrato externo. Se URL/token/identificador oficial não estiverem configurados, devolver `provider_not_configured` e manter a intenção reenviável. Não inventar endpoint PapoAI; o adapter recebe configuração depois da validação da conta real.

- [ ] **Step 4: Run tests**

Run: `node scripts/test-checkout-whatsapp-outbox.mjs && node scripts/test-checkout-whatsapp-return.mjs && node scripts/test-site-only-order-registration.mjs && python scripts/test-marketing-intelligence-contract.py`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(whatsapp): add safe outbound dispatcher contract`

---

### Task 5: Validação final e handoff PapoAI

**Files:**
- Create: `docs/projects/dona-antonia-operations-2/CHECKOUT-WHATSAPP-OUTBOUND-HANDOFF-2026-10-01.md`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: checklist objetivo para Work/PapoAI contendo somente o que não pode ser concluído pelo repositório: endpoint/ação oficial de envio, template de utilidade se necessário, canais 0975/1018 e teste controlado.

- [ ] **Step 1: Run complete regression set named above**

Expected: todos PASS.

- [ ] **Step 2: Verify changed frontend copies are identical**

Run: comparação byte a byte de `index.html` e `vitrine/index.html` no ambiente de execução.
Expected: idênticos.

- [ ] **Step 3: Write handoff document**

Registrar o que já está implementado, o que permanece `provider_not_configured`, como conectar 0975/1018 sem duplicidade, como testar com contato controlado e a regra de que campanha/follow-up não participa deste fluxo.

- [ ] **Step 4: Final review**

Revisar contra a spec: pedido independente do WhatsApp; outbox idempotente; canal correto; retorno em 3 s best-effort; fallback manual; nenhum segredo frontend; nenhum endpoint externo inventado.

- [ ] **Step 5: Commit**

Commit message: `docs: hand off WhatsApp outbound provider setup`
