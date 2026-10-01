# Admin Order WhatsApp Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar à tela de Pedidos o envio idempotente da confirmação do pedido e um cadastro avulso com vínculo automático ao pedido.

**Architecture:** O Admin chama ações autenticadas em `admin-products-live-v1`. A confirmação usa uma outbox server-side e o gateway PapoAI já desenhado para templates utilitários. O cadastro usa capability opaca de 24h ligada a pedido+telefone e é consumida pelo `storefront-v2` ao concluir `customer_register`.

**Tech Stack:** HTML/JS estático, Deno Edge Functions, Supabase Postgres/RPC, PapoAI webhooks utilitários.

**Spec:** `docs/superpowers/specs/2026-10-01-admin-order-whatsapp-registration-design.md`

## Global Constraints

- Não reativar Flow legado.
- Não expor URL secreta do PapoAI em código, documento ou resposta.
- Não enviar mensagem real durante testes.
- Preservar autenticação existente do Vitrine/Admin.
- Envio interno para 0975 deve sair pelo canal 1018.
- Token de cadastro: opaco, hash no banco, uso único, 24h.

## Review Focus

- Pedido sem telefone: UI e backend devem bloquear envio/link sem erro genérico.
- Clique repetido em enviar: não pode duplicar mensagem já enviada.
- Token expirado/reutilizado: não pode vincular cadastro.
- Telefone diferente do token: não pode vincular pedido errado.
- Pedido já vinculado a outro cliente: não pode ser reassociado silenciosamente.

---

### Task 1: Contratos e testes estáticos

**Files:**
- Create: `scripts/test-admin-order-whatsapp-registration.mjs`
- Test: `scripts/test-admin-order-whatsapp-registration.mjs`

**Interfaces:**
- Consumes: design acima.
- Produces: assertions dos nomes de ações, RPCs, campos da UI e regras de segurança.

- [ ] **Step 1:** criar teste que exija `order_whatsapp_send`, `order_registration_link_issue`, `order_registration_link_status`, `order_token`, hash/expiração/uso único e controles da UI.
- [ ] **Step 2:** executar e confirmar FAIL porque a implementação ainda não existe.
- [ ] **Step 3:** manter o teste como contrato para as tasks seguintes.

### Task 2: Capability de cadastro ligada ao pedido

**Files:**
- Create: `supabase/sql/20261001_order_registration_link_v1.sql`
- Modify: `supabase/functions/storefront-v2/index.ts`

**Interfaces:**
- Consumes: `orders`, `customers`, `ops2_refresh_customer_registration_journeys_v1`, `customer_register`.
- Produces: `ops2_issue_order_registration_link_v1(uuid) -> jsonb`, `ops2_resolve_order_registration_link_v1(text) -> jsonb`, `ops2_consume_order_registration_link_v1(text,uuid,text) -> jsonb`; `customer_register` aceita `order_token`.

- [ ] **Step 1:** ampliar o teste com cenários de token expirado, telefone divergente, reuso e pedido já ligado a terceiro.
- [ ] **Step 2:** executar e confirmar FAIL.
- [ ] **Step 3:** implementar tabela/RPCs com SHA-256, validade 24h e consumo único.
- [ ] **Step 4:** integrar `order_token` em `storefront-v2` após cadastro bem-sucedido.
- [ ] **Step 5:** executar teste e confirmar PASS dos contratos desta task.

### Task 3: Outbox manual para cliente + cópia operacional

**Files:**
- Create: `supabase/sql/20261001_admin_order_whatsapp_outbox_v1.sql`
- Create: `supabase/functions/whatsapp-order-outbound-v1/index.ts`

**Interfaces:**
- Consumes: `orders`, `conversations`, `whatsapp_accounts`, secrets `PAPOAI_ORDER_TEMPLATE_WEBHOOK_0975_URL` e `PAPOAI_ORDER_TEMPLATE_WEBHOOK_1018_URL`.
- Produces: `ops2_enqueue_admin_order_whatsapp_v1(uuid) -> jsonb`, claim/finish outbox e gateway de entrega.

- [ ] **Step 1:** ampliar teste para exigir unique por `order_id,message_kind,recipient_kind` e `ops_0975` via 1018.
- [ ] **Step 2:** executar e confirmar FAIL.
- [ ] **Step 3:** implementar outbox idempotente para `customer` e `ops_0975`.
- [ ] **Step 4:** implementar gateway sem retry automático em falha ambígua e sem segredos hardcoded.
- [ ] **Step 5:** executar teste e confirmar PASS dos contratos desta task.

### Task 4: Ações autenticadas do Admin

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/index.ts`

**Interfaces:**
- Consumes: RPCs das Tasks 2 e 3.
- Produces: ações `order_whatsapp_send`, `order_registration_link_issue`, `order_registration_link_status`.

- [ ] **Step 1:** ampliar teste para exigir ações em `LOCAL`/`WRITE_ACTIONS` e respostas estruturadas.
- [ ] **Step 2:** executar e confirmar FAIL.
- [ ] **Step 3:** implementar handlers com validação de UUID/telefone e sem acesso público direto às RPCs sensíveis.
- [ ] **Step 4:** executar teste e confirmar PASS.

### Task 5: UI de Pedidos e cadastro público

**Files:**
- Modify: `vitrine/admin/index.html`
- Modify: `cadastro/index.html`

**Interfaces:**
- Consumes: ações da Task 4 e `customer_register(order_token)`.
- Produces: bloco `WhatsApp e cadastro`, botões de envio/link, status e propagação segura de `order_token`.

- [ ] **Step 1:** ampliar teste para exigir textos, botões, chamadas e ausência de `order_id` no link público.
- [ ] **Step 2:** executar e confirmar FAIL.
- [ ] **Step 3:** implementar UX no modal do pedido.
- [ ] **Step 4:** atualizar `/cadastro/` para resolver token e enviá-lo em `customer_register`.
- [ ] **Step 5:** executar teste e confirmar PASS.

### Task 6: Verificação integrada e produção controlada

**Files:**
- Test: `scripts/test-admin-order-whatsapp-registration.mjs`
- Test: testes existentes de checkout/cadastro/Admin relevantes.

**Interfaces:**
- Consumes: todas as tasks anteriores.
- Produces: branch verificável; produção só após conferir dependências PapoAI/secrets.

- [ ] **Step 1:** rodar novo teste e testes existentes relevantes.
- [ ] **Step 2:** revisar diff e confirmar que não há URL/segredo PapoAI versionado.
- [ ] **Step 3:** aplicar migration/deploy apenas se as dependências externas estiverem prontas; caso contrário, deixar branch pronta e registrar bloqueio exato.
- [ ] **Step 4:** validar banco/funções sem enviar mensagem real.
