# Admin V3 + Chat Comprar Final Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a aba Atendimento do Admin V3 e ativar o Chat Comprar com roteamento próprio, estruturado e desacoplado do WhatsApp.

**Architecture:** O Admin V3 terá um único controlador para menu, regras e simulador. O `shopping-chat-v1` responderá diretamente ao Chat Comprar, usando ações determinísticas e regras publicadas antes de recorrer à IA; nenhuma mensagem do Chat Comprar passará pelo worker/outbound/handoff do WhatsApp.

**Tech Stack:** HTML/CSS/JavaScript, Node 22 contract tests, Supabase Edge Functions (Deno 2), PostgreSQL/Supabase, OpenAI Responses API.

**Spec:** `docs/superpowers/specs/2026-09-14-admin-v3-shopping-chat-final-design.md`

## Global Constraints

- Não controlar WhatsApp nativo, Meta Flow, templates Meta ou PapoAI no Admin V3.
- Não oferecer atendimento humano no Chat Comprar.
- IA somente quando texto livre não puder ser resolvido pelo fluxo determinístico/regras diretas.
- Não expor `SUPABASE_SERVICE_ROLE_KEY` nem `OPENAI_API_KEY` ao navegador.
- Não alterar o projeto `ame-mais/`; apenas remover seu link do Admin V3.
- Não ativar `ai_enabled`, `conversation_worker_enabled`, `conversation_worker_dispatch_enabled` ou `whatsapp_auto_reply_enabled` para fazer o Chat Comprar funcionar.

---

### Task 1: Contratos vermelhos da arquitetura final

**Files:**
- Create: `tests/admin-v3-service-strategy-shopping-chat-final.mjs`
- Create: `scripts/test-shopping-chat-routing-v1.mjs`
- Modify: `.github/workflows/admin-v3-service-strategy-tests.yml`
- Modify: `.github/workflows/test-shopping-room.yml`

**Interfaces:**
- Consumes: arquivos atuais do Admin e Chat Comprar.
- Produces: contratos que falham enquanto houver Ame Mais, scripts concorrentes, humano/WhatsApp no editor ou dependência do worker antigo.

- [ ] Escrever testes que expressem a arquitetura final.
- [ ] Rodar em PR e confirmar falha pelas incompatibilidades atuais.
- [ ] Não alterar código de produção antes de observar o vermelho.

### Task 2: Corrigir o Admin V3 e remover o travamento

**Files:**
- Modify: `admin-v3/index.html`
- Modify: `admin-v3/atendimento.html`
- Modify: `admin-v3/service-strategy.js`
- Modify: `supabase/functions/admin-service-intelligence-simple-v1/index.ts`

**Interfaces:**
- Consumes: `admin-chat-menu-v1`, `service_simple_rules`, `service_simple_runtime_config`.
- Produces: três áreas estáveis (`flow`, `rules`, `test`) e um único controlador JS.

- [ ] Remover link Ame Mais do menu.
- [ ] Remover carregamento de `service-strategy-addon.js`, `service-chat-center.js` e `service-strategy-own-tools.js` da página Atendimento.
- [ ] Reescrever `service-strategy.js` para controlar as três áreas sem MutationObserver ou controladores concorrentes.
- [ ] Limitar modos às ações do Chat Comprar.
- [ ] Implementar `simulate` no backend administrativo sem efeitos colaterais.
- [ ] Rodar contratos até ficarem verdes.

### Task 3: Desacoplar o Chat Comprar do WhatsApp

**Files:**
- Modify: `supabase/functions/shopping-chat-v1/index.ts`
- Modify: `supabase/functions/shopping-chat-products-v1/index.ts`
- Modify: `supabase/functions/shopping-chat-menu-v1/index.ts`
- Modify: `comprar/chat-light-v2.js`

**Interfaces:**
- Consumes: sessão pública por token, tabelas de cestas/produtos, regras publicadas.
- Produces: `send_text -> {reply, ui, routing}` direto ao navegador.

- [ ] Remover leitura de `automation_config` e criação de `ai_jobs` de conversa.
- [ ] Remover escrita em `whatsapp_sales_state` do pagamento do Chat Comprar.
- [ ] Implementar roteamento determinístico para checkout/cestas/ofertas/categorias/produtos.
- [ ] Implementar correspondência direta das regras publicadas.
- [ ] Implementar classificação OpenAI opcional somente quando necessária.
- [ ] Persistir resposta outbound como mensagem do `shopping_room`, sem outbound WhatsApp.
- [ ] Implementar UI de chips/link/produto no frontend.
- [ ] Retirar `is_whatsapp_active` dos filtros comerciais do Chat Comprar.
- [ ] Rodar contratos e `deno check`.

### Task 4: Ajustar configuração viva para lançamento

**Files:**
- Create: `supabase/migrations/20260914_shopping_chat_final_activation_v1.sql`

**Interfaces:**
- Consumes: 4 regras publicadas atuais e runtime simples.
- Produces: regras coerentes com Chat Comprar, sem `human`, e fallback seguro.

- [ ] Arquivar/remapear regra de atendimento humano.
- [ ] Converter regra de cestas para modo `baskets`.
- [ ] Corrigir saudação para resposta pronta + chips sem opção humana.
- [ ] Manter consulta de produto.
- [ ] Fixar `fallback_mode='silence'` para impedir legado humano.
- [ ] Aplicar migration no Supabase e validar dados resultantes.

### Task 5: Deploy e homologação

**Files:**
- Deploy: `admin-service-intelligence-simple-v1`
- Deploy: `shopping-chat-v1`
- Deploy: `shopping-chat-products-v1`
- Deploy: `shopping-chat-menu-v1`

**Interfaces:**
- Consumes: código verde e migração aplicada.
- Produces: atendimento real do Chat Comprar operante.

- [ ] Fazer deploy das Edge Functions mantendo autenticação atual apropriada.
- [ ] Consultar banco para provar que Chat Comprar não precisa dos gates globais WhatsApp.
- [ ] Testar criação de sessão pública, `open`, cestas/produtos e envio de texto.
- [ ] Confirmar que os testes não criam `human_handoffs`, `outbound_jobs` WhatsApp ou `ai_jobs` de conversa.
- [ ] Rodar CI final e revisar diff do PR.
- [ ] Só então integrar ao `main`.
