# Marketing WhatsApp — Worker e Agendamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar fila executável, agendamento e worker de campanhas Meta no Supabase, reutilizando o transporte/outbox canônico, mas mantendo produção em `mode='off'` e `campaigns_enabled=false` até homologação separada.

**Architecture:** A campanha aprovada continua canônica em `marketing_campaigns_v1` e seu snapshot permanece imutável. A Fase E cria um ledger de execução por destinatário, usa `whatsapp_outbox_v1` como fila de transporte e um worker Edge que revalida cada destinatário imediatamente antes do envio. `pg_cron` apenas chama um tick server-side; o tick e o worker são no-op enquanto o runtime próprio estiver `off` ou o `campaigns_enabled` do canal estiver falso.

**Tech Stack:** PostgreSQL/Supabase migrations + PL/pgSQL, `pg_cron`, `pg_net`, Supabase Edge Functions/Deno TypeScript, `_shared/whatsapp-meta-transport-v1.mjs`, JavaScript/CSS do Vitrine Admin, Node contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-04-whatsapp-marketing-meta-campaigns-design.md`

## Global Constraints

- 0975 e 1018 continuam conectados ao PapoAI; `inbound_provider=papoai` permanece nos dois canais.
- `ana_enabled=false` permanece nos dois canais durante toda a Fase E.
- `campaigns_enabled=false` permanece nos dois canais durante desenvolvimento e deploy da Fase E.
- Runtime novo de execução nasce `mode='off'` e não pode ser promovido por UI nesta fase.
- Nenhum loop de envio roda no browser.
- Não usar Make/n8n.
- Campanha só usa template `MARKETING` com status `APPROVED`, da mesma `whatsapp_account_id`.
- Revalidar imediatamente antes do envio: consentimento atual, opt-out, telefone, cliente ativo, template, campanha, canal, runtime e kill-switch.
- Opt-out explícito continua soberano.
- Falha incerta (`MetaTransportError.uncertain=true`) nunca entra em retry automático.
- Retry automático somente para falha explicitamente `retryable=true`, com backoff controlado e limite de tentativas.
- Transporte Meta deve reutilizar `_shared/whatsapp-meta-transport-v1.mjs`; não criar segundo cliente Graph.
- `whatsapp_outbox_v1` é a fila canônica de transporte; o ledger de campanha referencia essa outbox em vez de substituí-la.
- Nenhuma graduação para clientes reais faz parte da Fase E; isso fica para a Fase F.

## File Structure

- Create: `supabase/migrations/20261005014000_marketing_campaign_execution_v1.sql` — runtime, estados executáveis, ledger por destinatário, schedule/claim/revalidate/finish RPCs e integração com `whatsapp_outbox_v1`.
- Create: `supabase/functions/whatsapp-marketing-worker-v1/index.ts` — worker Meta gated, usando `sendTemplateViaMeta`.
- Create: `supabase/migrations/20261005021000_marketing_campaign_worker_cron_v1.sql` — tick server-side + cron a cada minuto, fail-closed.
- Modify: `supabase/functions/admin-marketing-campaigns-v1/index.ts` — ações administrativas de schedule/start/pause/resume/cancel sem permitir promoção do runtime.
- Modify: `vitrine/admin/marketing/campaign-center.js` — agendamento/estado de execução, bloqueados visualmente enquanto campanhas estiverem desligadas.
- Modify: `vitrine/admin/marketing/campaign-center.css` — estados e responsividade.
- Create: `scripts/test-whatsapp-marketing-campaign-execution-v1.mjs`.
- Create: `scripts/test-whatsapp-marketing-worker-v1.mjs`.
- Create: `scripts/test-whatsapp-marketing-worker-cron-v1.mjs`.
- Create: `scripts/test-admin-marketing-campaign-scheduling-v1.mjs`.
- Create: `scripts/test-whatsapp-marketing-campaign-execution-ui-v1.mjs`.
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml` — incluir todos os contratos da Fase E.

## Review Focus

1. **Kill-switch acidentalmente ignorado:** nenhum claim ou envio pode ocorrer se `campaigns_enabled=false` ou runtime `mode='off'`.
2. **Opt-out depois do snapshot:** revalidação imediatamente antes do claim deve virar `skipped`, sem chamada Meta e sem retry.
3. **Timeout/5xx incerto:** marcar `uncertain`, preservar auditoria e nunca reenviar automaticamente.
4. **Clique duplo / cron concorrente:** `FOR UPDATE SKIP LOCKED`, idempotência por recipient/snapshot e outbox única devem impedir envio duplicado.
5. **Template/campanha muda durante execução:** worker deve bloquear/skipar novas tentativas quando template não estiver sendable, campanha estiver pausada/cancelada ou revisão/snapshot não corresponderem.

---

### Task 1: Runtime de execução, estados e ledger por destinatário

**Files:**
- Create: `supabase/migrations/20261005014000_marketing_campaign_execution_v1.sql`
- Create: `scripts/test-whatsapp-marketing-campaign-execution-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: `marketing_campaigns_v1`, `marketing_campaign_snapshots_v1`, `marketing_campaign_snapshot_recipients_v1`, consentimento canônico, `whatsapp_channel_runtime_v1`, `whatsapp_templates_v1`, `whatsapp_outbox_v1`.
- Produces:
  - `marketing_campaign_execution_runtime_v1` com uma linha por conta e `mode in ('off','canary','live')`, default `off`;
  - extensão dos estados de campanha para `scheduled`, `running`, `paused`, `completed`, `failed` sem remover estados atuais;
  - `marketing_campaign_dispatches_v1` append-only quanto à identidade do recipient e mutável apenas em campos de execução controlados;
  - RPCs service-role only: `marketing_schedule_campaign_v1`, `marketing_pause_campaign_v1`, `marketing_resume_campaign_v1`, `marketing_materialize_dispatches_v1`, `marketing_claim_dispatch_batch_v1`, `marketing_revalidate_dispatch_v1`, `marketing_finish_dispatch_v1`.

- [ ] **Step 1: Write failing execution-schema contract**

Assert runtime default `off`, estados novos, ledger com unique `(snapshot_id,customer_id)`, FK para snapshot/campaign/customer/account/outbox, estados `pending|claimed|skipped|accepted|retry|uncertain|failed`, `attempt_count`, `available_at`, `claimed_at`, `provider_message_id`, `last_error`, `skip_reason`, `outbox_id`, timestamps e ACL service-role only.

Contract must also assert no function can change execution runtime mode and no Graph URL/client exists in SQL.

- [ ] **Step 2: Verify RED via Central CI**

Expected: fail because migration/runtime/ledger are absent; earlier contracts stay green.

- [ ] **Step 3: Implement runtime + transitions + materialization**

Rules:
- `marketing_schedule_campaign_v1` requires campaign `approved`, current snapshot, future/immediate `scheduled_for`, runtime channel exists and template still sendable;
- if `campaigns_enabled=false` or execution runtime `mode='off'`, return `campaigns_disabled` and do not transition;
- materialization copies only snapshot rows into dispatch ledger; no Meta call;
- revalidation uses current consent/opt-out/phone/customer/template/campaign/channel state, never only snapshot eligibility;
- `skipped` means zero Meta attempts;
- dispatch unique per snapshot/customer and outbox idempotency key `campaign:<campaign_id>:snapshot:<snapshot_id>:customer:<customer_id>`.

- [ ] **Step 4: Verify GREEN + transactional smoke**

Inside `BEGIN/ROLLBACK`, temporarily set one execution runtime to `canary` and channel `campaigns_enabled=true`, schedule a synthetic approved campaign, materialize dispatches, prove revalidation and skip behavior, then rollback. Verify no persistent outbox or dispatch rows.

- [ ] **Step 5: Commit/review isolated PR**

---

### Task 2: Worker Meta fail-closed e idempotente

**Files:**
- Create: `supabase/functions/whatsapp-marketing-worker-v1/index.ts`
- Create: `scripts/test-whatsapp-marketing-worker-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: Task 1 RPCs/ledger, `whatsapp_accounts.phone_number_id`, Meta token/version server-side, `_shared/whatsapp-meta-transport-v1.mjs`.
- Produces: worker server-side que processa lote limitado e atualiza dispatch + `whatsapp_outbox_v1`/WAMID.

- [ ] **Step 1: Write failing worker contract**

Assert import obrigatório de `sendTemplateViaMeta` e `MetaTransportError`; proibir Graph raw URL; exigir revalidation antes do transport; exigir `campaigns_enabled`, execution runtime e mode; `mode='canary'` aceita somente números internos oficiais configurados server-side; `mode='off'` retorna no-op; batch default 10, máximo 25.

Test error mapping:
- success -> `accepted` + WAMID;
- `retryable=true && uncertain=false` -> `retry` com backoff `30s, 120s, 300s`, máximo 3 tentativas;
- `uncertain=true` -> `uncertain`, sem retry automático;
- erro permanente -> `failed`;
- revalidation fail -> `skipped` e transport não chamado.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement worker minimally**

Worker aceita apenas chamada interna autenticada por segredo server-side ou service-role JWT; browser não consegue fornecer destino, template, WABA ou phone_number_id. O worker deriva tudo do dispatch/snapshot/account atuais.

On success, registrar WAMID no dispatch e em `whatsapp_outbox_v1`; criar/atualizar mensagem canônica usando uma RPC específica de aceite de campanha, sem reutilizar RPC de atendimento que exija `purpose='human_attendance'`.

- [ ] **Step 4: Verify GREEN with transport mocked**

Nenhum teste CI chama Meta real. Provar exatamente uma chamada por claim e zero chamadas para off/canary-invalid/skipped/uncertain-retry.

- [ ] **Step 5: Commit/review isolated PR**

---

### Task 3: Tick server-side e pg_cron fail-closed

**Files:**
- Create: `supabase/migrations/20261005021000_marketing_campaign_worker_cron_v1.sql`
- Create: `scripts/test-whatsapp-marketing-worker-cron-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: execution runtime, campanhas scheduled/running, `pg_cron`, `pg_net`, worker Edge.
- Produces: `run_marketing_campaign_worker_tick_v1()` e job `marketing-campaign-worker-v1` a cada minuto.

- [ ] **Step 1: Write failing cron contract**

Assert:
- extensão existente `pg_cron`/`pg_net` é reutilizada;
- tick retorna sem HTTP quando não existe conta com `campaigns_enabled=true` + runtime `canary|live`;
- job é idempotentemente unscheduled/recreated por nome;
- chamada HTTP é apenas para `whatsapp-marketing-worker-v1`, sem telefone/template no payload;
- payload contém somente limite/tick id e autenticação interna é obtida server-side;
- um tick concorrente não duplica claim.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement tick + cron**

Schedule: `* * * * *`. Mesmo com cron ativo em produção, deploy inicial deve resultar em no-op porque execution runtime nasce `off` e `campaigns_enabled=false`.

- [ ] **Step 4: Verify GREEN + DB smoke**

Após deploy, observar pelo menos um ciclo do cron e provar zero HTTP worker invocation/send quando gates estão OFF, zero novas outboxes e zero mudança de status de campanha.

- [ ] **Step 5: Commit/review isolated PR**

---

### Task 4: API Admin de agendamento e controles operacionais

**Files:**
- Modify: `supabase/functions/admin-marketing-campaigns-v1/index.ts`
- Create: `scripts/test-admin-marketing-campaign-scheduling-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: Task 1 schedule/pause/resume RPCs.
- Produces actions Admin: `schedule`, `start_now`, `pause`, `resume`, `cancel_execution`, `execution_status`.

- [ ] **Step 1: Write failing Admin contract**

Assert Admin bearer auth; browser não fornece destination E.164, WABA, phone_number_id, outbox, runtime mode nem worker URL; `schedule/start_now` retornam `campaigns_disabled` enquanto gate/runtime estiverem OFF; pause/cancel permanecem permitidos para contenção.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement actions**

`start_now` é apenas `schedule` com `scheduled_for=now()`; nenhuma ação chama Meta diretamente.

- [ ] **Step 4: Verify GREEN + regression**

Rodar contratos de campanha Fase D + nova API + TypeScript syntax.

- [ ] **Step 5: Commit/review isolated PR**

---

### Task 5: UI de execução/agendamento com kill-switch visível

**Files:**
- Modify: `vitrine/admin/marketing/campaign-center.js`
- Modify: `vitrine/admin/marketing/campaign-center.css`
- Create: `scripts/test-whatsapp-marketing-campaign-execution-ui-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: Task 4 Admin API.
- Produces: controles visuais de agendamento/execução, sem loop no browser.

- [ ] **Step 1: Write failing UI contract**

Assert status `Agendada/Em execução/Pausada/Concluída/Falhou`; campo de data/hora local; botões `Enviar agora`/`Agendar` aparecem bloqueados com banner `Campanhas desligadas` enquanto gate/runtime OFF; `Pausar`/`Cancelar` disponíveis quando aplicável; nenhum fetch direto para Meta/Graph e nenhuma lista de telefones enviada pelo browser.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement UI lazy**

Exibir progresso por contagens do ledger: total, pendentes, pulados, aceitos, retry, incertos, falhas. Não expor token/phone_number_id.

- [ ] **Step 4: Verify GREEN + regressions**

Rodar UI de campanhas, Públicos, Templates, Marketing legado e sintaxe JS.

- [ ] **Step 5: Commit/review isolated PR**

---

### Task 6: Deploy controlado da Fase E sem graduação

**Files:**
- No feature files unless verification reveals a defect.
- Update issue/checkpoint after evidence.

- [ ] **Step 1: Baseline**

Registrar runtime dos dois canais, execution runtime ausente/off, campanhas existentes, outboxes, templates e Edge versions.

- [ ] **Step 2: Apply migrations in order**

Execution schema first, worker deploy second, cron last. Antes de cada etapa confirmar `campaigns_enabled=false` nos dois canais.

- [ ] **Step 3: Transactional execution smoke**

Com `BEGIN/ROLLBACK`, promover temporariamente 0975 a canary + `campaigns_enabled=true`, materializar/claim/revalidate e provar que o plano de despacho é correto; não chamar a Edge/Meta nesse smoke.

- [ ] **Step 4: Deploy worker with exact merged commit**

`verify_jwt=true` ou autenticação interna equivalente; runtime permanece `off` em produção. Não realizar canary Meta nesta fase.

- [ ] **Step 5: Deploy cron and observe no-op**

Provar que cron roda sem produzir outbox, dispatch claim ou Graph call com runtime OFF.

- [ ] **Step 6: Final safety verification**

Must prove:
- `campaigns_enabled=false` 0975/1018;
- execution runtime `mode='off'` 0975/1018;
- `ana_enabled=false` ambos;
- `inbound_provider=papoai` ambos;
- zero campanha real enviada;
- zero WAMID novo com purpose de marketing devido à Fase E;
- PapoAI intacto;
- worker/cron preparados para Fase F, mas incapazes de envio com gates atuais.

- [ ] **Step 7: Record checkpoint #630**

Próxima fase: **Fase F — graduação canário 0975**, com aprovação explícita antes de alterar execution runtime/campaigns_enabled e antes do primeiro template real de campanha.

## Self-review result

- **Spec coverage:** execução backend, revalidação, retries, uncertain, pausa global, pg_cron/pg_net, transporte existente e agendamento estão cobertos; status/resultados comerciais completos ficam para fase posterior.
- **Step scan:** cada Task possui RED→GREEN e fronteira revisável: schema, worker, cron, Admin API, UI, deploy.
- **Type consistency:** `campaign_id`, `snapshot_id`, `dispatch_id`, `outbox_id`, `revision` e `whatsapp_account_id` são os identificadores canônicos em todas as camadas.
- **Review Focus:** kill-switch, opt-out pós-snapshot, uncertain, concorrência e template/campanha mutável estão explicitamente testados.
- **Proportion:** a Fase E não inclui criação/gestão de templates nem resultados comerciais completos; reutiliza Fases A–D e prepara somente execução/agendamento segura.
