# WhatsApp Meta Native V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar um núcleo WhatsApp próprio e provider-neutral dentro do Vitrine/Admin, capaz de coexistir com o PapoAI, operar 0975 e 1018, registrar mensagens/status/mídia, executar ANA V1/automações/campanhas e migrar para Meta Cloud API somente após homologação por número.

**Architecture:** O Supabase canônico recebe um núcleo de dados e serviços independente do provedor. PapoAI e Meta entram como adaptadores de entrada/saída; qualquer envio passa por uma outbox única e idempotente. A interface WhatsApp nasce separada do `vitrine/admin/index.html` monolítico e é incorporada ao Admin por uma superfície isolada, preservando o PapoAI até o cutover.

**Tech Stack:** PostgreSQL/Supabase, Supabase Edge Functions em Deno/TypeScript, JavaScript/HTML/CSS sem bundler, Supabase Storage privado, Meta WhatsApp Cloud API, OpenAI somente para transcrição/fallback ANA quando habilitado.

**Spec:** `docs/superpowers/specs/2026-09-30-whatsapp-meta-native-v1-design.md`

## Global Constraints

- Supabase único: `ssbesxgaijknwsjbsbcz`.
- PapoAI permanece em produção durante toda a construção e homologação.
- Nenhum número é desconectado antecipadamente.
- 0975 e 1018 migram independentemente.
- Meta outbound começa bloqueado: `send_enabled=false`.
- Nenhum token Meta fica no navegador ou em tabela pública.
- Todo webhook é persistido antes de qualquer regra de negócio.
- Todo envio externo passa por `whatsapp_outbox_v1`.
- Texto livre nunca cria pedido automaticamente.
- Clientes, pedidos, conversas e `catalogo_####` existentes são reaproveitados.
- Opt-out bloqueia marketing no momento do snapshot da campanha e novamente antes do envio.
- Não usar Make/n8n.
- Não criar microserviços, cron ou tabela sem necessidade comprovada.
- Tabelas WhatsApp novas ficam com RLS habilitado e sem acesso `anon`/`authenticated`, salvo necessidade explicitamente testada.
- Funções antigas `whatsapp-meta-direct-v1` e `admin-whatsapp-direct-v1` permanecem aposentadas.
- A primeira implementação não remove campos/tabelas PapoAI legados.

## Review Focus

- Webhook repetido ou fora de ordem não pode duplicar mensagem nem regredir `status_current`.
- Um evento do 0975 nunca pode ser associado ao 1018 apenas pelo telefone do cliente.
- Opt-out ocorrido entre a criação da campanha e o despacho precisa cancelar aquele destinatário.
- Falha de mídia/transcrição não pode perder a mensagem original nem travar a conversa.
- Rollback de um número para PapoAI deve ser possível sem apagar histórico Meta nem afetar o outro número.

---

## File map

### Banco
- Create: `supabase/sql/20260930_whatsapp_meta_native_core_v1.sql`
- Create: `supabase/sql/20260930_whatsapp_meta_native_automation_v1.sql`
- Create: `supabase/sql/20260930_whatsapp_meta_native_admin_v1.sql`

### Shared runtime
- Create: `supabase/functions/_shared/whatsapp-core-v1.mjs`
- Create: `supabase/functions/_shared/whatsapp-core-v1.test.ts`
- Create: `supabase/functions/_shared/whatsapp-ana-rules-v1.mjs`
- Create: `supabase/functions/_shared/whatsapp-ana-rules-v1.test.ts`

### Edge Functions
- Create: `supabase/functions/whatsapp-meta-webhook-v1/index.ts`
- Create: `supabase/functions/whatsapp-outbox-dispatch-v1/index.ts`
- Create: `supabase/functions/whatsapp-media-worker-v1/index.ts`
- Create: `supabase/functions/whatsapp-ana-worker-v1/index.ts`
- Create: `supabase/functions/admin-whatsapp-v1/index.ts`
- Modify: `supabase/functions/papo-external-agent-v1/index.ts`
- Modify: `supabase/config.toml`

### Admin
- Create: `vitrine/admin/whatsapp/index.html`
- Create: `vitrine/admin/whatsapp/app.js`
- Create: `vitrine/admin/whatsapp/styles.css`
- Modify: `vitrine/admin/index.html`

### Verification
- Create: `scripts/test-whatsapp-core-v1.mjs`
- Create: `scripts/test-whatsapp-meta-transport-v1.mjs`
- Create: `scripts/test-whatsapp-automation-v1.mjs`
- Create: `scripts/test-whatsapp-admin-v1.mjs`
- Create: `docs/projects/dona-antonia-operations-2/WHATSAPP-META-NATIVE-HOMOLOGATION.md`

---

### Task 1: Canonical schema, runtime gates and RLS

**Files:**
- Create: `supabase/sql/20260930_whatsapp_meta_native_core_v1.sql`
- Create: `scripts/test-whatsapp-core-v1.mjs`

**Interfaces:**
- Consumes: `whatsapp_accounts`, `customers`, `customer_phones`, `conversations`, `storefront_identity_tokens`.
- Produces: `whatsapp_channel_runtime_v1`, `whatsapp_webhook_events_v1`, `whatsapp_messages_v1`, `whatsapp_message_status_events_v1`, `whatsapp_media_v1`, `whatsapp_templates_v1`, `whatsapp_outbox_v1`, `marketing_optout_events_v2`.
- Produces RPCs: `whatsapp_resolve_conversation_v1(...) -> jsonb`, `whatsapp_ingest_event_v1(...) -> jsonb`, `whatsapp_record_status_v1(...) -> jsonb`, `whatsapp_enqueue_outbound_v1(...) -> jsonb`.

- [ ] **Step 1: Write failing structural test**

`node scripts/test-whatsapp-core-v1.mjs` deve exigir todas as tabelas, índices de idempotência, constraints de provider/status, RLS e revogação de `anon/authenticated`.

- [ ] **Step 2: Run and verify failure**

Run: `node scripts/test-whatsapp-core-v1.mjs`
Expected: FAIL indicando SQL/estruturas ausentes.

- [ ] **Step 3: Implement core SQL**

Criar as tabelas e RPCs do spec. `whatsapp_channel_runtime_v1` deve iniciar ambos os números com `inbound_provider='papoai'`, `outbound_provider='papoai'`, `capture_enabled=true` e todos os gates Meta novos desligados.

- [ ] **Step 4: Add status projection guard**

`whatsapp_record_status_v1` grava sempre o evento append-only, mas só atualiza `whatsapp_messages_v1.status_current` quando o evento for semanticamente mais avançado ou representar `failed/cancelled` válido para o estado atual; timestamp externo não pode fazer `read -> delivered`.

- [ ] **Step 5: Run structural tests**

Run: `node scripts/test-whatsapp-core-v1.mjs`
Expected: PASS.

- [ ] **Step 6: Apply migration and verify read-only**

Aplicar no Supabase canônico. Consultar contagens e runtime; não criar mensagens/outbox reais nesta etapa.

- [ ] **Step 7: Run Supabase security/performance advisors**

Esperado: nenhum novo achado crítico causado pelas tabelas/funções desta task.

- [ ] **Step 8: Commit**

Commit: `feat(whatsapp): add canonical core schema`

---

### Task 2: Provider-neutral normalization library

**Files:**
- Create: `supabase/functions/_shared/whatsapp-core-v1.mjs`
- Create: `supabase/functions/_shared/whatsapp-core-v1.test.ts`

**Interfaces:**
- Produces: `normalizePhone(value) -> string|null`; `hashPayload(raw) -> Promise<string>`; `canonicalMessageFromPapoAi(payload, context) -> CanonicalInbound|null`; `canonicalMessagesFromMeta(payload, accountResolver) -> CanonicalEvent[]`; `statusEventsFromMeta(payload) -> CanonicalStatus[]`; `redactWebhookPayload(value) -> object`.
- Consumes: nenhuma escrita no banco; módulo puro/testável.

- [ ] Escrever testes para E.164 brasileiro, payload duplicado, texto, áudio, imagem, interactive/template e status Meta.
- [ ] Rodar `deno test supabase/functions/_shared/whatsapp-core-v1.test.ts` e confirmar FAIL.
- [ ] Implementar funções puras sem dependência de Supabase client.
- [ ] Testar payload com campos secretos e confirmar `redactWebhookPayload` remove token/authorization/secret.
- [ ] Testar que account/phone-number-id ausente retorna evento não associável, nunca escolhe 0975/1018 por aproximação.
- [ ] Rodar Deno test e confirmar PASS.
- [ ] Commit: `feat(whatsapp): add canonical normalization library`.

---

### Task 3: Mirror PapoAI into the canonical core without changing production behavior

**Files:**
- Modify: `supabase/functions/papo-external-agent-v1/index.ts`
- Modify: `scripts/test-whatsapp-core-v1.mjs`

**Interfaces:**
- Consumes: library Task 2 + RPCs Task 1.
- Produces: shadow rows `provider='papoai'` em webhook/message canônicos.
- Existing PapoAI response contract must remain unchanged.

- [ ] Adicionar teste estático exigindo chamada canônica após captura PapoAI e proibindo qualquer alteração do retorno operacional atual.
- [ ] Rodar teste e confirmar FAIL.
- [ ] Integrar mirror depois da persistência PapoAI atual; falha do mirror deve ser logada e não derrubar o webhook PapoAI.
- [ ] Garantir idempotência pela chave externa/event hash já capturada.
- [ ] Implementar backfill SQL idempotente somente para eventos históricos que possam ser normalizados com segurança; registros ambíguos ficam como evento canônico `review_required`, não inventam mensagem.
- [ ] Deploy da função mantendo PapoAI como provider oficial de entrada/saída.
- [ ] Observar somente contagens/erros; nenhum envio é acionado.
- [ ] Commit: `feat(whatsapp): mirror PapoAI into canonical core`.

---

### Task 4: Meta webhook receiver in shadow mode

**Files:**
- Create: `supabase/functions/whatsapp-meta-webhook-v1/index.ts`
- Modify: `supabase/config.toml`
- Create/extend: `scripts/test-whatsapp-meta-transport-v1.mjs`

**Interfaces:**
- Consumes: Task 1 core RPCs + Task 2 normalizer.
- Produces: GET verification endpoint + POST webhook Meta; never sends outbound.

- [ ] Testar GET challenge correto/incorreto e POST com assinatura inválida.
- [ ] Testar mensagem inbound, status `sent/delivered/read/failed` e payload repetido.
- [ ] Implementar validação de verify token e `X-Hub-Signature-256` usando segredo somente server-side.
- [ ] Persistir evento bruto redigido antes de normalizar.
- [ ] Resolver conta exclusivamente por `phone_number_id`/binding canônico.
- [ ] Manter `whatsapp_channel_runtime_v1.inbound_provider='papoai'`: Meta recebido nesta fase é `shadow`, não aciona ANA nem altera atendimento oficial.
- [ ] Rodar `node scripts/test-whatsapp-meta-transport-v1.mjs` e Deno tests.
- [ ] Deploy sem configurar webhook produtivo dos números ainda.
- [ ] Commit: `feat(whatsapp): add Meta webhook shadow receiver`.

---

### Task 5: Outbox claiming, retries and status correlation

**Files:**
- Extend: `supabase/sql/20260930_whatsapp_meta_native_core_v1.sql` only before migration commit; otherwise create follow-up migration `20260930_whatsapp_meta_native_outbox_v1.sql`.
- Create: `supabase/functions/whatsapp-outbox-dispatch-v1/index.ts`
- Extend: `scripts/test-whatsapp-meta-transport-v1.mjs`

**Interfaces:**
- Produces RPCs: `whatsapp_claim_outbox_v1(p_limit int) -> setof`; `whatsapp_finish_outbox_v1(...) -> jsonb`; `whatsapp_cancel_outbox_v1(...) -> jsonb`.
- Dispatcher routes by `whatsapp_channel_runtime_v1.outbound_provider` and gates.

- [ ] Testar dois workers tentando claim simultâneo: um item só pode ser claimed uma vez.
- [ ] Testar retry com `available_at` e limite de tentativas configurado.
- [ ] Testar `send_enabled=false`: dispatcher deve retornar bloqueado sem chamada externa.
- [ ] Implementar dispatcher com transport adapters internos `sendViaPapoAi()` e `sendViaMeta()`, mantendo Meta bloqueado por runtime.
- [ ] Ao receber `wamid`, gravar `provider_message_id` na outbox e mensagem canônica.
- [ ] Reprocessamento com mesma `idempotency_key` deve reutilizar item, nunca criar segundo envio.
- [ ] Testar falha definitiva e status/códigos de erro.
- [ ] Commit: `feat(whatsapp): add idempotent outbound dispatcher`.

---

### Task 6: Meta template synchronization and controlled outbound

**Files:**
- Create/extend: `supabase/functions/admin-whatsapp-v1/index.ts`
- Extend: `scripts/test-whatsapp-meta-transport-v1.mjs`

**Interfaces:**
- Admin actions: `templates_list`, `templates_sync`, `template_create`, `template_update`, `template_send_test_prepare`.
- No action sends directly; `template_send_test_prepare` creates outbox only when channel gate permits a test recipient.

- [ ] Testar que template não aprovado não gera outbox.
- [ ] Testar sincronização idempotente por `waba_id + meta_template_id/name/language`.
- [ ] Implementar leitura/sync Meta e persistência em `whatsapp_templates_v1`.
- [ ] Implementar create/update com resposta Meta preservada em metadata sem gravar token.
- [ ] Testar conta sem WABA/phone_number_id: erro operacional claro, sem fallback para outro número.
- [ ] Manter 0975 sem envio Meta até dados e homologação próprios existirem.
- [ ] Commit: `feat(whatsapp): manage Meta templates safely`.

---

### Task 7: Media download, private storage and audio transcription

**Files:**
- Create: `supabase/functions/whatsapp-media-worker-v1/index.ts`
- Extend: `scripts/test-whatsapp-meta-transport-v1.mjs`

**Interfaces:**
- Consumes: `whatsapp_media_v1` pending rows.
- Produces: private Storage object, hash, size, transcription/status.

- [ ] Testar mídia sem ID, download HTTP falho, MIME inesperado e arquivo acima do limite configurado.
- [ ] Implementar fetch server-side da mídia Meta/PapoAI quando suportado.
- [ ] Salvar em bucket privado `whatsapp-media` usando caminho `account/YYYY/MM/message/media`.
- [ ] Para áudio, transcrever apenas se setting ANA permitir; transcrição nunca substitui o arquivo/original message.
- [ ] Em falha, marcar `transcription_status='failed'` e preservar mensagem/conversa.
- [ ] Testar que frontend nunca recebe Storage path público permanente; Admin API gera signed URL temporária.
- [ ] Commit: `feat(whatsapp): add private media and transcription pipeline`.

---

### Task 8: ANA V1 deterministic engine and AI fallback gate

**Files:**
- Create: `supabase/sql/20260930_whatsapp_meta_native_automation_v1.sql`
- Create: `supabase/functions/_shared/whatsapp-ana-rules-v1.mjs`
- Create: `supabase/functions/_shared/whatsapp-ana-rules-v1.test.ts`
- Create: `supabase/functions/whatsapp-ana-worker-v1/index.ts`
- Create: `scripts/test-whatsapp-automation-v1.mjs`

**Interfaces:**
- Produces tables: `whatsapp_ana_settings_v1`, `whatsapp_automation_rules_v1`, `whatsapp_automation_runs_v1`.
- Produces pure function `decideAnaAction(context) -> AnaDecision`.
- Worker consumes inbound canonical messages only when account runtime says `ana_enabled=true` and provider is official inbound provider.

- [ ] Testar regras: saudação, catálogo, cesta, pagamento, entrega/cidades, mínimo R$75, cadastro, atendente, opt-out e áudio transcrito.
- [ ] Testar que pergunta fora de escopo retorna `handoff` quando AI fallback desligado.
- [ ] Testar que mensagem em conversa `human/paused` não recebe resposta automática.
- [ ] Implementar rule-first com resposta curta e no máximo uma pergunta.
- [ ] Implementar geração/reuso de `catalogo_####` via mecanismo existente, nunca por token novo paralelo.
- [ ] Implementar AI fallback atrás de `ai_fallback_enabled`; saída IA só pode selecionar intenção/resposta permitida, nunca criar pedido/conceder condição comercial.
- [ ] Toda resposta ANA vira `whatsapp_outbox_v1`, nunca chamada direta ao provider.
- [ ] Rodar Deno + Node tests.
- [ ] Commit: `feat(whatsapp): add ANA V1 rules and safe fallback`.

---

### Task 9: Canonical opt-out, recompra and dynamic campaigns

**Files:**
- Extend: `supabase/sql/20260930_whatsapp_meta_native_automation_v1.sql` before apply or follow-up migration.
- Extend: `scripts/test-whatsapp-automation-v1.mjs`

**Interfaces:**
- Produces: `whatsapp_campaigns_v1`, `whatsapp_campaign_recipients_v1`.
- Produces RPCs: `whatsapp_capture_optout_v2(...)`, `whatsapp_campaign_snapshot_v1(p_campaign_id uuid)`, `whatsapp_campaign_enqueue_v1(p_campaign_id uuid)`.
- Consumes: `marketing_repurchase_state_v1`, `customers.marketing_opt_in`.

- [ ] Testar opt-out por mensagem canônica e migração idempotente de evidência PapoAI v1 quando segura.
- [ ] Testar campanha criada hoje e mudança de opt-in antes do horário: snapshot deve refletir estado novo.
- [ ] Testar mudança para opt-out depois do snapshot e antes do claim: outbox deve cancelar destinatário.
- [ ] Testar recompra +10 dias gerando campanha/outbox uma única vez por pedido elegível.
- [ ] Implementar audience_definition V1 somente com filtros necessários: lista/segmento, cidade, histórico/recompra e inclusão/exclusão explícita; não criar query builder genérico.
- [ ] Persistir motivo de bloqueio em recipients.
- [ ] Commit: `feat(whatsapp): add canonical campaigns and opt-out`.

---

### Task 10: Admin WhatsApp API

**Files:**
- Create/complete: `supabase/functions/admin-whatsapp-v1/index.ts`
- Create: `supabase/sql/20260930_whatsapp_meta_native_admin_v1.sql`
- Create: `scripts/test-whatsapp-admin-v1.mjs`

**Interfaces:**
- Read actions: `overview`, `accounts`, `conversations`, `conversation`, `templates`, `automations`, `campaigns`, `campaign`, `settings`.
- Write actions: `conversation_takeover`, `conversation_resume`, `human_send`, `template_*`, `automation_save`, `campaign_save`, `campaign_cancel`, `settings_save`, `channel_gate_prepare`.
- `channel_gate_prepare` may validate but must not silently cut over a number.

- [ ] Testar paginação de conversas e mensagens mais recentes.
- [ ] Testar signed media URL.
- [ ] Testar envio humano sempre via outbox e bloqueado quando `human_send_enabled=false`.
- [ ] Implementar overview com saúde 0975/1018 separada, últimos webhooks, fila/erros e provider oficial atual.
- [ ] Implementar gate validation que lista pendências de Meta IDs, webhook, template, status e canary.
- [ ] Não adicionar senha/identificação de operador nova ao Admin; respeitar padrão atual do Vitrine/Admin.
- [ ] Rodar testes.
- [ ] Commit: `feat(whatsapp): add admin API`.

---

### Task 11: Modular WhatsApp UI inside Vitrine/Admin

**Files:**
- Create: `vitrine/admin/whatsapp/index.html`
- Create: `vitrine/admin/whatsapp/app.js`
- Create: `vitrine/admin/whatsapp/styles.css`
- Modify: `vitrine/admin/index.html`
- Extend: `scripts/test-whatsapp-admin-v1.mjs`

**Interfaces:**
- Consumes: `admin-whatsapp-v1` only.
- Produces Admin tabs: Visão Geral, Conversas, Templates, Automações, Campanhas, Configurações.

- [ ] Testar presença da rota modular e que o monólito não recebe implementação do chat internamente.
- [ ] Adicionar item `WhatsApp` no menu do Admin e carregar `/vitrine/admin/whatsapp/` em shell/iframe isolado seguindo padrão já usado para ferramentas independentes.
- [ ] Implementar Overview com cards separados 0975/1018 e aviso visual explícito de provider atual/gates.
- [ ] Implementar conversas com lista + painel de mensagens, mídia, transcrição, handoff e envio humano.
- [ ] Implementar templates, automações e campanhas com formulários V1 deliberadamente simples.
- [ ] Implementar Configurações ANA sem prompt gigante como configuração principal.
- [ ] Validar mobile: sem textos sobrepostos, botões com 44px mínimos, lista/painel adaptável.
- [ ] Rodar `node scripts/test-whatsapp-admin-v1.mjs`.
- [ ] Commit: `feat(admin): add modular WhatsApp workspace`.

---

### Task 12: Shadow verification and synthetic tests

**Files:**
- Create: `docs/projects/dona-antonia-operations-2/WHATSAPP-META-NATIVE-HOMOLOGATION.md`
- Extend all four test scripts.

**Interfaces:**
- Produces: checklist de evidência por conta e decisão GO/NO-GO sem cutover automático.

- [ ] Comparar amostra de eventos PapoAI com canonical shadow: conta, telefone, conversa, direção e conteúdo devem coincidir.
- [ ] Reenviar fixtures duplicadas e confirmar zero duplicatas canônicas.
- [ ] Simular status fora de ordem e confirmar projeção correta.
- [ ] Criar outbox sintética com Meta gate desligado e confirmar zero chamada externa.
- [ ] Simular campanha com opt-out concorrente e confirmar cancelamento.
- [ ] Executar advisors Supabase e registrar achados novos/antigos separadamente.
- [ ] Documentar rollback por conta: alterar runtime de volta para PapoAI; nenhum drop/delete faz parte do rollback.
- [ ] Commit: `test(whatsapp): add shadow homologation suite`.

---

### Task 13: Meta canary homologation per number

**Files:**
- Update: `docs/projects/dona-antonia-operations-2/WHATSAPP-META-NATIVE-HOMOLOGATION.md`

**Interfaces:**
- Consumes sistema completo das Tasks 1–12.
- Produces homologation evidence only; no automatic PapoAI disconnect.

- [ ] Confirmar `phone_number_id`, WABA, webhook e credenciais de **um** número de teste/canary.
- [ ] Ativar somente captura Meta shadow para esse número e confirmar eventos reais.
- [ ] Enviar somente para contato de teste autorizado via outbox canary; confirmar `wamid -> sent -> delivered -> read` ou registrar limitação observada.
- [ ] Testar template aprovado, texto dentro de janela quando aplicável e mídia/áudio.
- [ ] Testar ANA com contato controlado; sem cliente real.
- [ ] Se qualquer gate falhar, manter PapoAI como oficial e registrar NO-GO.
- [ ] Repetir para o segundo número somente depois do primeiro estar estável.

---

### Task 14: Controlled cutover and rollback readiness

**Files:**
- Update: `docs/projects/dona-antonia-operations-2/WHATSAPP-META-NATIVE-HOMOLOGATION.md`
- Update runtime rows only after explicit operational approval.

**Interfaces:**
- Runtime change per account only: `inbound_provider`, `outbound_provider`, `send_enabled`, `ana_enabled`, `campaigns_enabled`, `human_send_enabled`, `homologated_at`.

- [ ] Antes do corte, confirmar fila vazia/entendida e nenhum envio duplicado entre providers.
- [ ] Migrar um número por vez.
- [ ] Manter o outro número no PapoAI como fallback operacional durante observação inicial.
- [ ] Validar inbound, humano, ANA, template, status e `catalogo_####` no número migrado.
- [ ] Rollback precisa exigir apenas mudar runtime para `papoai`; não deletar dados nem redeploy emergencial.
- [ ] Só após os dois números estáveis planejar remoção de funções/tabelas PapoAI legadas em projeto separado.

---

## Full verification before completion

Run locally/static where available:

```bash
node scripts/test-whatsapp-core-v1.mjs
deno test supabase/functions/_shared/whatsapp-core-v1.test.ts
deno test supabase/functions/_shared/whatsapp-ana-rules-v1.test.ts
node scripts/test-whatsapp-meta-transport-v1.mjs
node scripts/test-whatsapp-automation-v1.mjs
node scripts/test-whatsapp-admin-v1.mjs
```

Then on Supabase canônico:

- verify counts and constraints;
- verify RLS/grants;
- run security advisors;
- run performance advisors;
- inspect Edge Function logs for new errors;
- verify `whatsapp_channel_runtime_v1` shows explicit provider/gates for 0975 and 1018;
- confirm no production Meta outbound occurred before Task 13.

## Execution strategy

Use **Native / executing-plans** in this ChatGPT session. The tasks are strongly sequential and share database/API contracts, and this environment does not expose a separate subagent execution harness. Execute in medium rounds, stopping at safe gates rather than after every tiny code edit.

Recommended round grouping:

1. **R1 — Foundation:** Tasks 1–3.
2. **R2 — Meta transport shadow:** Tasks 4–7.
3. **R3 — ANA/marketing:** Tasks 8–9.
4. **R4 — Admin:** Tasks 10–11.
5. **R5 — Verification:** Task 12.
6. **R6 — External homologation:** Task 13.
7. **R7 — Cutover:** Task 14, only after explicit operational authorization.

R1–R5 can be implemented without disconnecting PapoAI. R6 may require Meta/PapoAI configuration or credentials not currently present. R7 is intentionally separated because it changes live transport.