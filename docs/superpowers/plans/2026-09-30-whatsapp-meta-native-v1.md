# WhatsApp Meta Native V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar um núcleo WhatsApp próprio e provider-neutral dentro do Vitrine/Admin, capaz de coexistir com o PapoAI, operar 0975 e 1018, registrar mensagens/status/mídia, executar ANA V1/Flows/automações/campanhas e migrar para Meta Cloud API somente após homologação por número.

**Architecture:** O Supabase canônico recebe um núcleo de dados e serviços independente do provedor. PapoAI e Meta entram como adaptadores de entrada/saída; qualquer envio passa por uma outbox única e idempotente. Eventos estruturados de cadastro/Flow convergem em um contrato canônico, e campanhas/recompra usam um único scheduler pequeno. A interface WhatsApp nasce separada do `vitrine/admin/index.html` monolítico e é incorporada ao Admin por uma superfície isolada.

**Tech Stack:** PostgreSQL/Supabase, Supabase Edge Functions em Deno/TypeScript, JavaScript/HTML/CSS sem bundler, Supabase Storage privado, Meta WhatsApp Cloud API, OpenAI somente para transcrição/fallback ANA quando habilitado.

**Spec:** `docs/superpowers/specs/2026-09-30-whatsapp-meta-native-v1-design.md`

## Global Constraints

- Supabase único: `ssbesxgaijknwsjbsbcz`.
- PapoAI permanece em produção durante construção e homologação.
- Nenhum número é desconectado antecipadamente; 0975 e 1018 migram independentemente.
- Meta outbound começa bloqueado: `send_enabled=false`.
- Nenhum token Meta fica no navegador ou em tabela pública.
- Todo webhook é persistido antes de qualquer regra de negócio.
- Todo envio externo passa por `whatsapp_outbox_v1`.
- Texto livre nunca cria pedido automaticamente.
- Clientes, pedidos, conversas e `catalogo_####` existentes são reaproveitados.
- Flow/evento estruturado pode cadastrar/atualizar cliente apenas pelo contrato canônico e idempotente; nunca por parsing de texto livre.
- Opt-out bloqueia marketing no snapshot e novamente antes do envio.
- Não usar Make/n8n.
- Conversas são event-driven; marketing/recompra podem usar somente um scheduler, com cadência máxima inicial de 5 minutos.
- Não criar microserviços, cron ou tabela sem necessidade comprovada.
- Tabelas WhatsApp novas: RLS habilitado e sem grants `anon`/`authenticated`, salvo necessidade explicitamente testada.
- Funções antigas `whatsapp-meta-direct-v1` e `admin-whatsapp-direct-v1` permanecem aposentadas.
- A primeira implementação não remove campos/tabelas PapoAI legados.

## Review Focus

- Webhook repetido ou fora de ordem não pode duplicar mensagem nem regredir `status_current`.
- Um evento do 0975 nunca pode ser associado ao 1018 apenas pelo telefone do cliente.
- Opt-out entre criação da campanha e despacho precisa cancelar aquele destinatário.
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
- Create: `supabase/functions/whatsapp-scheduler-v1/index.ts`
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
- RPCs: `whatsapp_resolve_conversation_v1(...) -> jsonb`, `whatsapp_ingest_event_v1(...) -> jsonb`, `whatsapp_record_status_v1(...) -> jsonb`, `whatsapp_enqueue_outbound_v1(...) -> jsonb`.

- [ ] Escrever `scripts/test-whatsapp-core-v1.mjs` exigindo tabelas, FKs, índices de idempotência, constraints, RLS e grants privados.
- [ ] Rodar `node scripts/test-whatsapp-core-v1.mjs`; esperado FAIL.
- [ ] Implementar SQL mínimo do core.
- [ ] Inicializar runtime dos dois números com PapoAI como provider oficial e gates Meta desligados.
- [ ] Implementar projeção de status que nunca permita `read -> delivered/sent` por webhook atrasado; eventos continuam append-only.
- [ ] Rodar teste; esperado PASS.
- [ ] Aplicar migration no Supabase canônico e fazer apenas consultas de verificação.
- [ ] Rodar advisors de segurança/performance; nenhum novo achado crítico.
- [ ] Commit: `feat(whatsapp): add canonical core schema`.

### Task 2: Provider-neutral normalization library

**Files:**
- Create: `supabase/functions/_shared/whatsapp-core-v1.mjs`
- Create: `supabase/functions/_shared/whatsapp-core-v1.test.ts`

**Interfaces:**
- Produces: `normalizePhone(value)`, `hashPayload(raw)`, `canonicalMessageFromPapoAi(payload, context)`, `canonicalEventsFromMeta(payload, accountResolver)`, `statusEventsFromMeta(payload)`, `redactWebhookPayload(value)`.

- [ ] Escrever testes de telefone BR/E.164, texto, áudio, imagem, documento, interactive/template, Flow response, status Meta e redaction.
- [ ] Rodar `deno test supabase/functions/_shared/whatsapp-core-v1.test.ts`; esperado FAIL.
- [ ] Implementar módulo puro, sem Supabase client.
- [ ] Testar ausência de account/`phone_number_id`: resultado precisa ser `unresolved`, nunca escolher 0975/1018 por aproximação.
- [ ] Rodar Deno test; esperado PASS.
- [ ] Commit: `feat(whatsapp): add canonical normalization library`.

### Task 3: Mirror PapoAI into the canonical core

**Files:**
- Modify: `supabase/functions/papo-external-agent-v1/index.ts`
- Modify: `scripts/test-whatsapp-core-v1.mjs`

**Interfaces:**
- Consumes Tasks 1–2.
- Produces shadow rows `provider='papoai'`; contrato de resposta PapoAI atual permanece igual.

- [ ] Testar que captura PapoAI chama core após a persistência existente e não altera response/status externo.
- [ ] Integrar mirror fail-open: erro no core é logado, mas não derruba operação PapoAI.
- [ ] Backfill idempotente apenas do que for seguro; ambiguidades viram `review_required`.
- [ ] Deploy mantendo PapoAI oficial de entrada/saída.
- [ ] Confirmar zero outbox nova causada pelo mirror.
- [ ] Commit: `feat(whatsapp): mirror PapoAI into canonical core`.

### Task 4: Meta webhook receiver em shadow

**Files:**
- Create: `supabase/functions/whatsapp-meta-webhook-v1/index.ts`
- Modify: `supabase/config.toml`
- Create: `scripts/test-whatsapp-meta-transport-v1.mjs`

**Interfaces:** GET verification + POST webhook; nunca envia outbound.

- [ ] Testar challenge correto/incorreto e assinatura POST inválida.
- [ ] Testar inbound, Flow response, `sent/delivered/read/failed` e duplicata.
- [ ] Implementar verify token e `X-Hub-Signature-256` server-side.
- [ ] Persistir evento bruto redigido antes da normalização.
- [ ] Resolver conta somente por `phone_number_id`/binding canônico.
- [ ] Enquanto runtime oficial for PapoAI, Meta recebido é shadow: não aciona ANA.
- [ ] Rodar Node + Deno tests e deploy sem trocar webhook produtivo dos números.
- [ ] Commit: `feat(whatsapp): add Meta webhook shadow receiver`.

### Task 5: Outbox claiming, retry and status correlation

**Files:**
- Extend core migration antes de aplicar; se já aplicada, Create: `supabase/sql/20260930_whatsapp_meta_native_outbox_v1.sql`
- Create: `supabase/functions/whatsapp-outbox-dispatch-v1/index.ts`
- Extend: `scripts/test-whatsapp-meta-transport-v1.mjs`

**Interfaces:** `whatsapp_claim_outbox_v1(p_limit int)`, `whatsapp_finish_outbox_v1(...)`, `whatsapp_cancel_outbox_v1(...)`; adapters `sendViaPapoAi()` e `sendViaMeta()`.

- [ ] Testar claim concorrente: um item só pode ser claimed uma vez.
- [ ] Testar retry/`available_at`/limite de tentativa.
- [ ] Testar Meta com `send_enabled=false`: zero HTTP externo.
- [ ] Implementar dispatcher por provider/gate.
- [ ] Correlacionar `wamid` com outbox e mensagem.
- [ ] Mesma `idempotency_key` nunca cria segundo envio.
- [ ] Commit: `feat(whatsapp): add idempotent outbound dispatcher`.

### Task 6: Templates Meta controlados

**Files:**
- Create/extend: `supabase/functions/admin-whatsapp-v1/index.ts`
- Extend: `scripts/test-whatsapp-meta-transport-v1.mjs`

**Interfaces:** `templates_list`, `templates_sync`, `template_create`, `template_update`, `template_send_test_prepare`.

- [ ] Testar template não aprovado => nenhuma outbox.
- [ ] Sincronização idempotente por WABA + ID/nome/idioma.
- [ ] Implementar sync/create/update sem persistir access token.
- [ ] Conta sem WABA/phone_number_id retorna erro da própria conta, sem fallback.
- [ ] `template_send_test_prepare` somente enfileira quando gate canary permitir.
- [ ] Commit: `feat(whatsapp): manage Meta templates safely`.

### Task 7: Mídia privada e transcrição

**Files:**
- Create: `supabase/functions/whatsapp-media-worker-v1/index.ts`
- Extend: `scripts/test-whatsapp-meta-transport-v1.mjs`

**Interfaces:** pending `whatsapp_media_v1` -> Storage privado `whatsapp-media` + hash/size/transcrição.

- [ ] Testar media ID ausente, download falho, MIME inesperado e limite de tamanho.
- [ ] Fetch de mídia somente server-side.
- [ ] Salvar em `account/YYYY/MM/message/media` no bucket privado.
- [ ] Áudio transcreve somente quando setting permitir; original permanece preservado.
- [ ] Falha marca status e não perde mensagem/conversa.
- [ ] Admin recebe somente signed URL temporária.
- [ ] Commit: `feat(whatsapp): add private media and transcription pipeline`.

### Task 8: ANA V1 + Flow canônico + handoff

**Files:**
- Create: `supabase/sql/20260930_whatsapp_meta_native_automation_v1.sql`
- Create: `supabase/functions/_shared/whatsapp-ana-rules-v1.mjs`
- Create: `supabase/functions/_shared/whatsapp-ana-rules-v1.test.ts`
- Create: `supabase/functions/whatsapp-ana-worker-v1/index.ts`
- Create: `scripts/test-whatsapp-automation-v1.mjs`

**Interfaces:**
- Tables: `whatsapp_ana_settings_v1`, `whatsapp_automation_rules_v1`, `whatsapp_automation_runs_v1`.
- Pure decision: `decideAnaAction(context) -> AnaDecision`.
- RPC neutra de cadastro estruturado: `whatsapp_apply_customer_flow_v1(p_event_key text, p_account_id uuid, p_phone text, p_name text, p_payload jsonb) -> jsonb`.

- [ ] Testar saudação, catálogo, cesta, pagamento, entrega/cidades, mínimo R$75, cadastro, atendente, opt-out e áudio transcrito.
- [ ] Testar conversa `human/paused`: zero resposta automática.
- [ ] Testar Flow PapoAI e Flow Meta com mesma chave lógica: cliente/conversa só processados uma vez.
- [ ] Implementar `whatsapp_apply_customer_flow_v1` reaproveitando customers/phones/addresses e emitindo/reutilizando `catalogo_####`; não criar sistema de clientes paralelo.
- [ ] Eventos estruturados usam essa RPC; texto livre nunca chama cadastro estruturado.
- [ ] Implementar rule-first; AI fallback atrás de `ai_fallback_enabled` e limitado a intenção/resposta permitida.
- [ ] Pedido explícito de humano ou erro repetido muda conversa para `human`; mensagem humana pausa ANA pela janela configurada.
- [ ] Toda resposta ANA entra na outbox.
- [ ] Rodar Deno + Node tests.
- [ ] Commit: `feat(whatsapp): add ANA V1 and canonical Flow`.

### Task 9: Opt-out, campanhas, recompra e scheduler único

**Files:**
- Extend automation migration antes de aplicar; se já aplicada, migration follow-up.
- Create: `supabase/functions/whatsapp-scheduler-v1/index.ts`
- Extend: `scripts/test-whatsapp-automation-v1.mjs`

**Interfaces:**
- Tables: `whatsapp_campaigns_v1`, `whatsapp_campaign_recipients_v1`.
- RPCs: `whatsapp_capture_optout_v2(...)`, `whatsapp_campaign_snapshot_v1(uuid)`, `whatsapp_campaign_enqueue_v1(uuid)`, `whatsapp_campaign_tick_v1() -> jsonb`.
- Scheduler chama somente `whatsapp_campaign_tick_v1`/recompra vencida; não executa IA nem varre conversas.

- [ ] Testar opt-out canônico e migração segura de evidência PapoAI v1.
- [ ] Campanha salva definição de público; destinatários são congelados apenas na execução.
- [ ] Opt-out após snapshot e antes do claim cancela recipient/outbox.
- [ ] Recompra +10 dias gera uma única outbox por pedido elegível.
- [ ] Implementar scheduler com uma única cadência de até 5 minutos, sem cron adicional por campanha/regra.
- [ ] Com `campaigns_enabled=false`, tick não cria envio naquela conta.
- [ ] Scheduler não processa ANA/chat e não chama OpenAI.
- [ ] Commit: `feat(whatsapp): add campaigns repurchase and single scheduler`.

### Task 10: Admin WhatsApp API

**Files:**
- Complete: `supabase/functions/admin-whatsapp-v1/index.ts`
- Create: `supabase/sql/20260930_whatsapp_meta_native_admin_v1.sql`
- Create: `scripts/test-whatsapp-admin-v1.mjs`

**Interfaces:**
- Reads: `overview`, `accounts`, `conversations`, `conversation`, `templates`, `automations`, `campaigns`, `campaign`, `settings`.
- Writes: `conversation_takeover`, `conversation_resume`, `human_send`, template actions, `automation_save`, `campaign_save`, `campaign_cancel`, `settings_save`, `channel_gate_prepare`.

- [ ] Testar paginação por recentes e histórico cronológico.
- [ ] Testar signed media URL.
- [ ] Envio humano sempre via outbox; gate false bloqueia.
- [ ] Overview mostra 0975/1018 separadamente, provider oficial, webhook, fila e erros.
- [ ] Gate validation lista IDs Meta, webhook, template, canary e status; nunca efetua cutover silencioso.
- [ ] Não adicionar senha/identificação de operador nova.
- [ ] Commit: `feat(whatsapp): add admin API`.

### Task 11: UI modular WhatsApp no Vitrine/Admin

**Files:**
- Create: `vitrine/admin/whatsapp/index.html`
- Create: `vitrine/admin/whatsapp/app.js`
- Create: `vitrine/admin/whatsapp/styles.css`
- Modify: `vitrine/admin/index.html`
- Extend: `scripts/test-whatsapp-admin-v1.mjs`

**Interfaces:** consome somente `admin-whatsapp-v1`.

- [ ] Testar rota modular e impedir implementação do chat dentro do monólito.
- [ ] Adicionar menu `WhatsApp` e shell/iframe isolado.
- [ ] Implementar Visão Geral, Conversas, Templates, Automações, Campanhas e Configurações.
- [ ] Conversa mostra áudio/transcrição, mídia, status, cliente, pedidos e handoff.
- [ ] Automação mostra cards de cadastro/Flow, pós-venda, recompra, opt-out, catálogo e handoff com último uso/erro.
- [ ] Campanha mostra resolvidos, bloqueados, enviados, entregues, lidos e falhas.
- [ ] Mobile: sem sobreposição; controles de toque >=44px; lista/painel adaptável.
- [ ] Rodar `node scripts/test-whatsapp-admin-v1.mjs`.
- [ ] Commit: `feat(admin): add modular WhatsApp workspace`.

### Task 12: Shadow verification + security

**Files:**
- Create: `docs/projects/dona-antonia-operations-2/WHATSAPP-META-NATIVE-HOMOLOGATION.md`
- Extend quatro scripts de teste.

- [ ] Comparar amostra PapoAI x canonical shadow: conta, telefone, conversa, direção e conteúdo.
- [ ] Repetir fixtures => zero duplicatas.
- [ ] Status fora de ordem => projeção correta.
- [ ] Outbox Meta com gate false => zero chamada externa.
- [ ] Campanha com opt-out concorrente => cancelada.
- [ ] Flow repetido => zero cliente/conversa duplicada.
- [ ] Rodar advisors de segurança/performance e separar achados prévios dos novos.
- [ ] Documentar rollback por conta sem drop/delete.
- [ ] Commit: `test(whatsapp): add shadow homologation suite`.

### Task 13: Canary Meta por número

**Files:**
- Update: `docs/projects/dona-antonia-operations-2/WHATSAPP-META-NATIVE-HOMOLOGATION.md`

- [ ] Confirmar IDs, WABA, webhook e credenciais de um número canary.
- [ ] Ativar captura Meta shadow e confirmar inbound real de contato de teste.
- [ ] Habilitar somente canary de envio para contato autorizado; confirmar `wamid` e estados observáveis.
- [ ] Testar template, mídia/áudio, Flow e ANA com contato controlado; nenhum cliente real.
- [ ] Falhou qualquer gate => PapoAI continua oficial e registrar NO-GO.
- [ ] Segundo número só depois do primeiro estável.

### Task 14: Cutover controlado e rollback

**Files:**
- Update homologation doc.
- Runtime rows somente após autorização operacional explícita.

- [ ] Confirmar fila sem duplicidade entre providers.
- [ ] Migrar um número por vez alterando apenas runtime/gates.
- [ ] Manter outro número no PapoAI durante observação inicial.
- [ ] Validar inbound, humano, ANA, Flow, template, status e `catalogo_####`.
- [ ] Rollback = runtime volta para `papoai`; não deletar dados e não depender de deploy emergencial.
- [ ] Remoção de legado PapoAI vira projeto separado somente após os dois números estáveis.

---

## Full verification before completion

```bash
node scripts/test-whatsapp-core-v1.mjs
deno test supabase/functions/_shared/whatsapp-core-v1.test.ts
deno test supabase/functions/_shared/whatsapp-ana-rules-v1.test.ts
node scripts/test-whatsapp-meta-transport-v1.mjs
node scripts/test-whatsapp-automation-v1.mjs
node scripts/test-whatsapp-admin-v1.mjs
```

No Supabase canônico:
- validar constraints/índices/RLS/grants;
- security advisor + performance advisor;
- logs das novas Edge Functions;
- runtime explícito de 0975 e 1018;
- confirmar que não houve outbound Meta de produção antes da Task 13.

## Execution strategy

Usar **Native / executing-plans** nesta sessão. As tarefas são sequenciais e compartilham contratos de banco/API, e este ambiente não expõe harness separado de subagentes. Executar em rodadas médias e parar em gates seguros.

1. **R1 — Fundação:** Tasks 1–3.
2. **R2 — Meta transport shadow:** Tasks 4–7.
3. **R3 — ANA/Flow/marketing:** Tasks 8–9.
4. **R4 — Admin:** Tasks 10–11.
5. **R5 — Verificação:** Task 12.
6. **R6 — Homologação externa:** Task 13.
7. **R7 — Cutover:** Task 14, somente com autorização operacional explícita.

R1–R5 não desconectam o PapoAI. R6 pode exigir configuração/credenciais externas ainda não disponíveis. R7 muda transporte ao vivo e fica deliberadamente separado.