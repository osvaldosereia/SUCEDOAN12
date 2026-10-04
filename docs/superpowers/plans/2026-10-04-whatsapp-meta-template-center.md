# WhatsApp Meta Template Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar no Vitrine/Admin uma Central de Templates Meta que permita listar, sincronizar, criar, editar, excluir e acompanhar templates oficiais da WhatsApp Business Platform, sem ativar campanhas e sem retirar 0975 ou 1018 do PapoAI.

**Architecture:** Reutilizar `admin-whatsapp-templates-v1`, `whatsapp_templates_v1`, `_shared/whatsapp-meta-templates-v1.mjs` e o webhook Meta existente. O browser continua sem token Meta e chama apenas a Edge autenticada. A Meta continua fonte de verdade do template remoto; o Supabase mantém cache e histórico/auditoria local.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), Supabase/Postgres, JavaScript ESM, Vitrine/Admin HTML/JS, Meta Graph API, Node.js 22 para testes, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-04-whatsapp-marketing-meta-campaigns-design.md`

## Global Constraints

- Não retirar o 0975 do PapoAI nesta fase.
- Não retirar o 1018 do PapoAI nesta fase.
- `inbound_provider=papoai` permanece nos dois canais.
- `ana_enabled=false` permanece nos dois canais.
- `campaigns_enabled=false` permanece nos dois canais.
- Nenhuma tarefa desta fase pode enviar campanha real.
- Token Meta nunca vai para o browser nem para logs/commits.
- O envio individual de template já homologado no Atendimento não pode regredir.
- A Meta é fonte de verdade para estado/categoria/qualidade do template remoto.
- Criar template usa `POST /{WABA-ID}/message_templates`.
- Editar template usa `POST /{TEMPLATE_ID}`.
- Excluir template usa `DELETE /{WABA-ID}/message_templates` com nome e, quando disponível, ID.
- Na V1, builder suporta somente: BODY texto, HEADER texto opcional, FOOTER opcional, botão URL, QUICK_REPLY e catálogo quando o formato já for aceito pela conta.
- Não implementar mídia de header, autenticação OTP, Flow ou multi-product nesta fase.

## Review Focus

1. **Payload malformado ou excessivo:** rejeitar no backend antes de chamar a Meta, sem sanitizar silenciosamente nomes/categorias/IDs inválidos.
2. **Erro ambíguo da Meta:** não assumir que criação/edição/exclusão ocorreu; responder estado incerto e exigir sync antes de nova tentativa.
3. **Template remoto muda entre leitura e ação:** sempre re-sincronizar o item afetado após mutation e mostrar o estado devolvido pela Meta/cache.
4. **Template `UTILITY` confundido com campanha:** a UI deve exibir categoria claramente e não criar qualquer `campaign_enabled` implícito nesta fase.
5. **Webhook de template sem WABA conhecida:** capturar de forma segura/observável sem alterar cache de outra conta e sem criar retry storm.

---

## File Structure

### Existing files to modify

- `supabase/functions/_shared/whatsapp-meta-templates-v1.mjs` — cliente Meta e validação de payload de template.
- `supabase/functions/admin-whatsapp-templates-v1/index.ts` — API Admin autenticada para list/sync/create/edit/delete e envio individual existente.
- `supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs` — normalização de eventos de status/qualidade de template.
- `supabase/functions/whatsapp-meta-webhook-v1/index.ts` — persistência/aplicação de eventos de template.
- `vitrine/admin/index.html` — nova subárea `Templates Meta` dentro de Marketing.
- `.github/workflows/whatsapp-meta-central-ci.yml` — contratos da nova gestão de templates.

### New files

- `supabase/sql/20261004_whatsapp_template_events_v1.sql` — histórico append-only de eventos Meta de template e RPC service-role-only para aplicar eventos ao cache.
- `scripts/test-whatsapp-meta-template-mutations-v1.mjs` — create/edit/delete helper contracts.
- `scripts/test-whatsapp-meta-template-events-v1.mjs` — webhook + persistência de status/qualidade.
- `scripts/test-whatsapp-marketing-template-admin-v1.mjs` — contrato da UI Marketing/Templates Meta.
- `scripts/fixtures/meta-webhook-template-status-approved.redacted.json` — fixture de status.
- `scripts/fixtures/meta-webhook-template-status-rejected.redacted.json` — fixture de rejeição.

---

### Task 1: Meta template mutation helper

**Files:**
- Modify: `supabase/functions/_shared/whatsapp-meta-templates-v1.mjs`
- Create: `scripts/test-whatsapp-meta-template-mutations-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Produces: `validateTemplateDraft(input) -> normalized template draft`
- Produces: `createTemplateViaMeta({accessToken,wabaId,graphVersion,template,fetchImpl,timeoutMs})`
- Produces: `editTemplateViaMeta({accessToken,templateId,graphVersion,template,fetchImpl,timeoutMs})`
- Produces: `deleteTemplateViaMeta({accessToken,wabaId,graphVersion,name,templateId,fetchImpl,timeoutMs})`

- [ ] **Step 1: Write the failing helper contract**

Create tests that assert:

```js
assert.equal(validateTemplateDraft({
  name:'ofertas_outubro_01',
  language:'pt_BR',
  category:'MARKETING',
  components:[{type:'BODY',text:'Oi {{1}}, veja nossas ofertas.'}]
}).category,'MARKETING');
```

Also assert failures for:
- invalid template name;
- unsupported category;
- missing BODY;
- blank/oversized BODY;
- unsupported component in V1;
- variable placeholders without examples when examples are required by the payload;
- arbitrary Graph host/path injection.

Assert exact HTTP contracts:
- create -> `POST /{WABA-ID}/message_templates`;
- edit -> `POST /{TEMPLATE_ID}`;
- delete -> `DELETE /{WABA-ID}/message_templates?name=...&hsm_id=...` when ID exists.

- [ ] **Step 2: Run RED**

Run:

```bash
node scripts/test-whatsapp-meta-template-mutations-v1.mjs
```

Expected: FAIL because mutation helpers do not exist.

- [ ] **Step 3: Implement minimal mutation helpers**

Implement the four exported functions above using:
- existing `MetaTemplatesError`;
- bearer token server-side;
- timeout/abort pattern already used by list;
- JSON response parsing;
- `retryable=true` only for timeout, network, 408, 429 and 5xx;
- mutation response returned without inventing approval state.

- [ ] **Step 4: Run GREEN and existing template tests**

```bash
node scripts/test-whatsapp-meta-template-mutations-v1.mjs
node scripts/test-whatsapp-meta-templates-v1.mjs
node scripts/test-whatsapp-meta-template-admin-v1.mjs
node --check supabase/functions/_shared/whatsapp-meta-templates-v1.mjs
```

Expected: PASS.

- [ ] **Step 5: Add CI step and commit**

Add `Meta template mutation contract` to `whatsapp-meta-central-ci.yml`.

```bash
git add supabase/functions/_shared/whatsapp-meta-templates-v1.mjs scripts/test-whatsapp-meta-template-mutations-v1.mjs .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "feat: add Meta template mutation client"
```

---

### Task 2: Admin API for create/edit/delete

**Files:**
- Modify: `supabase/functions/admin-whatsapp-templates-v1/index.ts`
- Modify: `scripts/test-whatsapp-meta-template-admin-v1.mjs`
- Test: `scripts/test-whatsapp-meta-template-mutations-v1.mjs`

**Interfaces:**
- Consumes: Task 1 helper functions.
- Produces POST actions: `create`, `edit`, `delete` in `admin-whatsapp-templates-v1`.

- [ ] **Step 1: Extend contract tests first**

Assert the Edge:
- still requires Admin JWT + active `admin_users` row;
- accepts `account_id` only for create;
- derives WABA from server-side `whatsapp_accounts`;
- accepts `template_id` only as local UUID for edit/delete and resolves remote ID/name server-side;
- never accepts browser-supplied `waba_id`, access token, `phone_number_id` or destination;
- keeps existing `send`/`send_template` behavior unchanged;
- calls sync after successful mutation;
- returns provider error code without leaking provider body or token.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-whatsapp-meta-template-admin-v1.mjs
```

Expected: FAIL on missing create/edit/delete branches.

- [ ] **Step 3: Implement actions**

Add:

```text
POST ?action=create
POST ?action=edit
POST ?action=delete
```

Rules:
- `create`: validate `account_id` + draft, call Meta, then `syncTemplates(account)`.
- `edit`: resolve local `template_id` -> account + remote template ID, validate draft, call Meta, sync account.
- `delete`: resolve local template -> account + remote name/ID, call Meta, sync account.
- if mutation result is ambiguous/network timeout, do not mutate local status optimistically; return `meta_template_mutation_uncertain` and require sync.

- [ ] **Step 4: Run GREEN and syntax checks**

```bash
node scripts/test-whatsapp-meta-template-admin-v1.mjs
node scripts/test-whatsapp-meta-template-mutations-v1.mjs
node scripts/test-admin-attendance-template-send-v1.mjs
node --experimental-strip-types --check supabase/functions/admin-whatsapp-templates-v1/index.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-whatsapp-templates-v1/index.ts scripts/test-whatsapp-meta-template-admin-v1.mjs
git commit -m "feat: manage Meta templates from admin API"
```

---

### Task 3: Template status/quality webhook and audit

**Files:**
- Create: `supabase/sql/20261004_whatsapp_template_events_v1.sql`
- Modify: `supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs`
- Modify: `supabase/functions/whatsapp-meta-webhook-v1/index.ts`
- Create: `scripts/test-whatsapp-meta-template-events-v1.mjs`
- Create: `scripts/fixtures/meta-webhook-template-status-approved.redacted.json`
- Create: `scripts/fixtures/meta-webhook-template-status-rejected.redacted.json`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Produces: `templateEventsFromMeta(payload)` returning normalized `{waba_id, meta_template_id, name, language, event, reason, quality, occurred_at, payload}` items.
- Produces DB RPC: `whatsapp_apply_template_event_v1(...) -> jsonb` service-role-only.

- [ ] **Step 1: Write failing event tests**

Tests must prove:
- APPROVED updates only the matching WABA/template;
- REJECTED stores reason;
- quality update stores quality when supplied;
- unknown WABA produces audit event with `unmatched`/safe result and does not touch another account;
- duplicate provider event is idempotent;
- no raw secret-bearing payload is stored.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-whatsapp-meta-template-events-v1.mjs
```

Expected: FAIL because normalizer/migration/RPC do not exist.

- [ ] **Step 3: Implement migration**

Create append-only `whatsapp_template_events_v1` with:
- `id` UUID;
- `waba_id`;
- `whatsapp_account_id` nullable until matched;
- `meta_template_id`;
- `template_name`;
- `language`;
- `event_type`;
- `status`/`quality_rating`/`reason`;
- `provider_event_key` unique;
- redacted `payload` JSONB;
- `occurred_at`, `received_at`.

Create `whatsapp_apply_template_event_v1` that:
- resolves account by WABA;
- writes event idempotently;
- updates `whatsapp_templates_v1` only when WABA + remote identity match;
- never creates a fake `APPROVED` row from incomplete webhook data;
- is executable only by `service_role`.

- [ ] **Step 4: Extend webhook normalizer/Edge**

`whatsapp-meta-webhook-v1` must handle template events in addition to existing message/status events while preserving:
- signature verification;
- current message/status behavior;
- HTTP 200 for safely ignored unmapped template events to avoid retry storm.

- [ ] **Step 5: Run GREEN**

```bash
node scripts/test-whatsapp-meta-template-events-v1.mjs
node scripts/test-whatsapp-meta-webhook-v1.mjs
node --experimental-strip-types --check supabase/functions/whatsapp-meta-webhook-v1/index.ts
```

Expected: PASS.

- [ ] **Step 6: Add CI and commit**

```bash
git add supabase/sql/20261004_whatsapp_template_events_v1.sql supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs supabase/functions/whatsapp-meta-webhook-v1/index.ts scripts/test-whatsapp-meta-template-events-v1.mjs scripts/fixtures/meta-webhook-template-status-*.redacted.json .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "feat: track Meta template status events"
```

---

### Task 4: Marketing > Templates Meta UI

**Files:**
- Modify: `vitrine/admin/index.html`
- Create: `scripts/test-whatsapp-marketing-template-admin-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: Task 2 Admin Edge actions.
- Produces UI subview `Templates Meta` under Marketing.

- [ ] **Step 1: Write failing UI contract**

Assert presence of:
- Marketing sub-navigation with `Visão geral` and `Templates Meta`;
- channel selector 0975/1018;
- lazy load: templates are not fetched until `Templates Meta` is opened;
- filters status/category/language/search;
- cards/table showing name, category, status, quality, language, last sync;
- create button;
- sync button;
- detail/edit/delete actions;
- preview panel;
- explicit badge `Campanhas desligadas` while `campaigns_enabled=false`;
- no access token/WABA secret in HTML;
- no send-to-customer action in this screen.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-whatsapp-marketing-template-admin-v1.mjs
```

Expected: FAIL because the subview does not exist.

- [ ] **Step 3: Implement the lazy UI shell**

Keep current Marketing content under `Visão geral` initially. Add `Templates Meta` that loads account/templates only when selected.

- [ ] **Step 4: Implement create/edit/delete dialogs**

Builder fields:
- channel;
- name;
- language;
- category;
- optional text header;
- body;
- optional footer;
- URL button;
- quick reply buttons;
- examples for variables;
- preview.

Behavior:
- client validation is UX only; backend remains authoritative;
- delete requires explicit confirmation naming the template;
- edit disabled when no remote ID is known;
- rejected reason shown when present;
- never show raw provider payload.

- [ ] **Step 5: Run GREEN + regression tests**

```bash
node scripts/test-whatsapp-marketing-template-admin-v1.mjs
python scripts/test-marketing-intelligence-contract.py
node scripts/test-whatsapp-meta-no-secrets-v1.mjs
```

Expected: PASS.

- [ ] **Step 6: Add CI and commit**

Add `Marketing Meta template admin UI contract` to the central workflow and ensure `vitrine/admin/index.html` is included in workflow path filters.

```bash
git add vitrine/admin/index.html scripts/test-whatsapp-marketing-template-admin-v1.mjs .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "feat: add Meta template center to marketing admin"
```

---

### Task 5: Production migration + Edge deploy, still no campaigns

**Files:**
- No new product code unless deploy verification finds a real defect.
- Update: `docs/RETOMADA-WHATSAPP-CENTRAL-PROPRIA.md`

**Interfaces:**
- Consumes all previous tasks.
- Produces deployed template-management capability only.

- [ ] **Step 1: Run complete local/CI verification before deploy**

Required green commands:

```bash
node scripts/test-whatsapp-meta-template-mutations-v1.mjs
node scripts/test-whatsapp-meta-template-admin-v1.mjs
node scripts/test-whatsapp-meta-template-events-v1.mjs
node scripts/test-whatsapp-meta-webhook-v1.mjs
node scripts/test-whatsapp-marketing-template-admin-v1.mjs
node scripts/test-whatsapp-meta-no-secrets-v1.mjs
python scripts/test-marketing-intelligence-contract.py
node --experimental-strip-types --check supabase/functions/admin-whatsapp-templates-v1/index.ts
node --experimental-strip-types --check supabase/functions/whatsapp-meta-webhook-v1/index.ts
```

- [ ] **Step 2: Apply migration to canonical Supabase**

Apply only `20261004_whatsapp_template_events_v1.sql`.

Verify:
- table/RPC exist;
- RPC execute privilege restricted to `service_role`;
- existing 15 cached templates preserved;
- `campaigns_enabled=false` and `ana_enabled=false` both channels;
- `inbound_provider=papoai` both channels.

- [ ] **Step 3: Deploy Edge Functions**

Deploy from merged/reviewed commit only:
- `admin-whatsapp-templates-v1` with `verify_jwt=true`;
- `whatsapp-meta-webhook-v1` preserving its existing custom webhook auth/signature setting (`verify_jwt` unchanged from current production).

- [ ] **Step 4: Read-only sync smoke**

Use authenticated Admin sync for 0975 and 1018. Verify:
- remote templates sync;
- no customer message/outbox created;
- no PapoAI runtime change;
- existing individual send path still available but not exercised against real customers.

- [ ] **Step 5: Controlled mutation smoke**

Create one clearly named homologation template only if the operator explicitly approves submission to Meta at this stage. Otherwise stop after read-only sync and keep create/edit/delete UI deployed but unexercised against Meta.

If exercised:
- create a harmless `UTILITY` or `MARKETING` homologation draft following current Meta rules;
- confirm Meta response/cache state;
- do not send it to any customer;
- delete it only if Meta state and API permit and deletion is part of the approved smoke.

- [ ] **Step 6: Final checkpoint**

Record in `#630`:
- commit/PR;
- CI run;
- migration applied;
- Edge versions;
- template counts/statuses after sync;
- `campaigns_enabled=false`;
- `ana_enabled=false`;
- `inbound_provider=papoai` both channels;
- zero campaign sends.

Update canonical handoff.

---

## Deferred to later plans

Not implemented in this Phase 1 plan:

1. consent ledger / opt-out ingestion;
2. audience builder and eligibility engine;
3. campaign tables and immutable snapshot;
4. campaign approval workflow;
5. batch worker / pg_cron scheduling;
6. campaign template send outbox;
7. campaign analytics, attribution and revenue;
8. automatic pause by quality threshold;
9. enabling `campaigns_enabled`;
10. removing PapoAI from either number.

These receive separate plans only after Phase 1 is merged, deployed and verified.