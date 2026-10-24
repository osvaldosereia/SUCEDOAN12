# WhatsApp Meta Template Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar no Vitrine/Admin uma Central de Templates Meta que permita listar, sincronizar, criar, editar, excluir e acompanhar templates oficiais da WhatsApp Business Platform, sem ativar campanhas e sem retirar 0975 ou 1018 do PapoAI.

**Architecture:** Reutilizar `admin-whatsapp-templates-v1`, `whatsapp_templates_v1`, `_shared/whatsapp-meta-templates-v1.mjs` e o webhook Meta existente. O browser continua sem token Meta e chama apenas a Edge autenticada. A Meta continua fonte de verdade do template remoto; o Supabase mantém cache e histórico/auditoria local. A UI nova fica em módulo próprio em `vitrine/admin/marketing/` para não ampliar ainda mais o `vitrine/admin/index.html`.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), Postgres, JavaScript ESM, Vitrine/Admin HTML/JS, Meta Graph API, Node.js 22, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-04-whatsapp-marketing-meta-campaigns-design.md`

## Global Constraints

- Não retirar o 0975 do PapoAI nesta fase.
- Não retirar o 1018 do PapoAI nesta fase.
- `inbound_provider=papoai` permanece nos dois canais.
- `ana_enabled=false` permanece nos dois canais.
- `campaigns_enabled=false` permanece nos dois canais.
- Nenhuma tarefa desta fase pode enviar campanha real.
- Token Meta nunca vai para browser, logs ou commits.
- O envio individual de template já homologado no Atendimento não pode regredir.
- A Meta é fonte de verdade para estado, categoria e qualidade do template remoto.
- Criar template usa `POST /{WABA-ID}/message_templates`.
- Editar template usa `POST /{TEMPLATE_ID}`.
- Excluir template usa `DELETE /{WABA-ID}/message_templates` com nome e, quando disponível, ID.
- Na V1, builder suporta somente BODY texto, HEADER texto opcional, FOOTER opcional, botão URL, QUICK_REPLY e catálogo quando já aceito pela conta.
- Não implementar header de mídia, autenticação OTP, Flow ou multi-product nesta fase.

## Review Focus

1. **Payload malformado/excessivo:** rejeitar no backend antes de chamar Meta; nome inválido não pode ser “consertado” silenciosamente.
2. **Erro ambíguo Meta:** não assumir mutation concluída; exigir sync antes de nova tentativa.
3. **Template muda remotamente entre leitura e ação:** mutation sempre termina em sync do WABA afetado.
4. **UTILITY confundido com marketing:** categoria deve ficar explícita; nenhuma flag de campanha é ligada nesta fase.
5. **Webhook de template sem WABA conhecida:** registrar/ignorar com segurança, sem alterar cache de outra conta nem causar retry storm.

---

## File Structure

### Existing files to modify

- `supabase/functions/_shared/whatsapp-meta-templates-v1.mjs` — cliente Meta e validação de payload de template.
- `supabase/functions/admin-whatsapp-templates-v1/index.ts` — API Admin autenticada para list/sync/create/edit/delete e envio individual existente.
- `supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs` — normalização de status/qualidade de template.
- `supabase/functions/whatsapp-meta-webhook-v1/index.ts` — aplicação de eventos de template.
- `vitrine/admin/index.html` — host e navegação para o módulo Marketing/Templates.
- `.github/workflows/whatsapp-meta-central-ci.yml` — contratos da nova gestão.

### New files

- `vitrine/admin/marketing/template-center.js` — estado, fetch, filtros, dialogs e ações da Central de Templates.
- `vitrine/admin/marketing/template-center.css` — estilos isolados da nova subárea.
- `supabase/sql/20261004_whatsapp_template_events_v1.sql` — histórico append-only de eventos Meta e RPC service-role-only.
- `scripts/test-whatsapp-meta-template-mutations-v1.mjs` — contratos create/edit/delete.
- `scripts/test-whatsapp-meta-template-events-v1.mjs` — webhook/status/qualidade.
- `scripts/test-whatsapp-marketing-template-admin-v1.mjs` — contrato da UI.
- `scripts/fixtures/meta-webhook-template-status-approved.redacted.json`.
- `scripts/fixtures/meta-webhook-template-status-rejected.redacted.json`.

---

### Task 1: Meta template mutation helper

**Files:**
- Modify: `supabase/functions/_shared/whatsapp-meta-templates-v1.mjs`
- Create: `scripts/test-whatsapp-meta-template-mutations-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Produces: `validateTemplateDraft(input)`.
- Produces: `createTemplateViaMeta({accessToken,wabaId,graphVersion,template,fetchImpl,timeoutMs})`.
- Produces: `editTemplateViaMeta({accessToken,templateId,graphVersion,template,fetchImpl,timeoutMs})`.
- Produces: `deleteTemplateViaMeta({accessToken,wabaId,graphVersion,name,templateId,fetchImpl,timeoutMs})`.

- [ ] **Step 1: Write the failing helper contract**

Assert a valid MARKETING draft normalizes without mutation, and reject:
- template name outside lower-case letters/numbers/underscore;
- unsupported category;
- missing BODY;
- blank/oversized BODY;
- unsupported component V1;
- invalid variables/examples;
- arbitrary Graph host/path injection.

Assert exact HTTP contracts:
- create -> `POST /{WABA-ID}/message_templates`;
- edit -> `POST /{TEMPLATE_ID}`;
- delete -> `DELETE /{WABA-ID}/message_templates?name=...&hsm_id=...` when ID exists.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-whatsapp-meta-template-mutations-v1.mjs
```

Expected: FAIL because mutation helpers do not exist.

- [ ] **Step 3: Implement minimal mutation helpers**

Use existing `MetaTemplatesError`, bearer token server-side, AbortController timeout, JSON parsing and retryability only for timeout/network/408/429/5xx. Do not invent local approval state from a mutation response.

- [ ] **Step 4: Run GREEN + regression**

```bash
node scripts/test-whatsapp-meta-template-mutations-v1.mjs
node scripts/test-whatsapp-meta-templates-v1.mjs
node scripts/test-whatsapp-meta-template-admin-v1.mjs
node --check supabase/functions/_shared/whatsapp-meta-templates-v1.mjs
```

- [ ] **Step 5: Add CI step and commit**

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
- Produces: POST actions `create`, `edit`, `delete` in `admin-whatsapp-templates-v1`.

- [ ] **Step 1: Extend contract tests first**

Assert:
- Admin JWT + active `admin_users` remain mandatory;
- create accepts local `account_id` and resolves WABA server-side;
- edit/delete accept local `template_id` and resolve remote ID/name server-side;
- browser cannot submit `waba_id`, access token, `phone_number_id` or arbitrary destination;
- existing `send`/`send_template` branch is unchanged;
- successful mutation triggers account sync;
- provider errors do not leak token/body.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-whatsapp-meta-template-admin-v1.mjs
```

- [ ] **Step 3: Implement actions**

```text
POST ?action=create
POST ?action=edit
POST ?action=delete
```

Rules:
- create: validate account + draft -> Meta -> sync;
- edit: resolve local row -> validate -> Meta -> sync;
- delete: resolve local row -> Meta -> sync;
- timeout/network uncertainty returns `meta_template_mutation_uncertain`; do not change local status optimistically.

- [ ] **Step 4: Run GREEN + existing send regression**

```bash
node scripts/test-whatsapp-meta-template-admin-v1.mjs
node scripts/test-whatsapp-meta-template-mutations-v1.mjs
node scripts/test-admin-attendance-template-send-v1.mjs
node --experimental-strip-types --check supabase/functions/admin-whatsapp-templates-v1/index.ts
```

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
- Produces: `templateEventsFromMeta(payload)` -> normalized template events.
- Produces DB RPC: `whatsapp_apply_template_event_v1(...) -> jsonb`, service-role-only.

- [ ] **Step 1: Write failing event tests**

Prove:
- APPROVED updates only matching WABA/template;
- REJECTED stores reason;
- quality update stores quality;
- unknown WABA cannot affect another account;
- duplicate provider event is idempotent;
- redaction removes secret-bearing fields.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-whatsapp-meta-template-events-v1.mjs
```

- [ ] **Step 3: Implement migration**

Create `whatsapp_template_events_v1` append-only with WABA/account/template identity, event/status/quality/reason, unique `provider_event_key`, redacted payload, `occurred_at` and `received_at`.

Create `whatsapp_apply_template_event_v1` to resolve account by WABA, insert idempotently and update `whatsapp_templates_v1` only on unambiguous match. Grant execute only to `service_role`.

- [ ] **Step 4: Extend webhook helper/Edge**

Handle template status/quality events in addition to current message/status payloads. Preserve signature verification and current message flow. Unknown WABA template event returns safe 200/ignore after observability recording, not 5xx retry storm.

- [ ] **Step 5: Run GREEN**

```bash
node scripts/test-whatsapp-meta-template-events-v1.mjs
node scripts/test-whatsapp-meta-webhook-v1.mjs
node --experimental-strip-types --check supabase/functions/whatsapp-meta-webhook-v1/index.ts
```

- [ ] **Step 6: Add CI and commit**

```bash
git add supabase/sql/20261004_whatsapp_template_events_v1.sql supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs supabase/functions/whatsapp-meta-webhook-v1/index.ts scripts/test-whatsapp-meta-template-events-v1.mjs scripts/fixtures/meta-webhook-template-status-*.redacted.json .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "feat: track Meta template status events"
```

---

### Task 4: Marketing > Templates Meta UI module

**Files:**
- Modify: `vitrine/admin/index.html`
- Create: `vitrine/admin/marketing/template-center.js`
- Create: `vitrine/admin/marketing/template-center.css`
- Create: `scripts/test-whatsapp-marketing-template-admin-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: Task 2 Admin Edge actions.
- Produces: `window.DAMarketingTemplateCenter.mount({root, adminAccessToken, supabaseUrl, anonKey})`.

- [ ] **Step 1: Write failing UI contract**

Assert:
- `index.html` loads the isolated JS/CSS module;
- Marketing subnav has `Visão geral` and `Templates Meta`;
- lazy load: no templates fetch before subview is opened;
- channel selector 0975/1018;
- filters status/category/language/search;
- template rows/cards show name/category/status/quality/language/last sync;
- create/sync/detail/edit/delete controls;
- preview panel;
- visible `Campanhas desligadas` state while guard is false;
- no token/WABA secret in frontend;
- no send-to-customer action in this subview.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-whatsapp-marketing-template-admin-v1.mjs
```

- [ ] **Step 3: Implement host + lazy module**

Keep current Marketing content as `Visão geral`. `index.html` only creates the host/subnav and passes existing Admin auth context into `DAMarketingTemplateCenter.mount`.

- [ ] **Step 4: Implement create/edit/delete builder**

Builder fields:
- channel;
- name;
- language;
- category;
- optional text header;
- body;
- optional footer;
- URL button;
- quick replies;
- variable examples;
- preview.

Rules:
- client validation is UX only;
- delete confirmation must name template;
- edit disabled when remote ID absent;
- rejected reason and quality visible;
- raw provider payload never rendered.

- [ ] **Step 5: Run GREEN + regression**

```bash
node scripts/test-whatsapp-marketing-template-admin-v1.mjs
python scripts/test-marketing-intelligence-contract.py
node scripts/test-whatsapp-meta-no-secrets-v1.mjs
node --check vitrine/admin/marketing/template-center.js
```

- [ ] **Step 6: Add CI path/step and commit**

Ensure workflow watches `vitrine/admin/index.html` and `vitrine/admin/marketing/**`.

```bash
git add vitrine/admin/index.html vitrine/admin/marketing/template-center.js vitrine/admin/marketing/template-center.css scripts/test-whatsapp-marketing-template-admin-v1.mjs .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "feat: add Meta template center to marketing admin"
```

---

### Task 5: Production migration + deploy, still no campaigns

**Files:**
- Update after verification: `docs/RETOMADA-WHATSAPP-CENTRAL-PROPRIA.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces deployed template-management capability only.

- [ ] **Step 1: Run complete verification before deploy**

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
node --check vitrine/admin/marketing/template-center.js
```

Expected: all PASS and PR CI green.

- [ ] **Step 2: Apply migration to canonical Supabase**

Apply only `20261004_whatsapp_template_events_v1.sql`.

Verify:
- table/RPC exist;
- RPC service-role-only;
- existing template cache preserved;
- `campaigns_enabled=false` both channels;
- `ana_enabled=false` both channels;
- `inbound_provider=papoai` both channels.

- [ ] **Step 3: Deploy Edge Functions**

Deploy merged/reviewed commit only:
- `admin-whatsapp-templates-v1` with `verify_jwt=true`;
- `whatsapp-meta-webhook-v1` preserving its current webhook auth/`verify_jwt` setting.

- [ ] **Step 4: Read-only production smoke**

Run authenticated sync for 0975 and 1018. Verify template counts/statuses update and zero customer message/outbox is created.

- [ ] **Step 5: Optional mutation smoke requires explicit operator approval at that moment**

Creating/editing/deleting a real Meta template changes the external WABA. If approved, use one clearly named homologation template and do not send it to any customer. If not approved, stop after read-only sync; deployed mutation UI remains unexercised against Meta.

- [ ] **Step 6: Final checkpoint**

Record in issue `#630`:
- PR/commit;
- CI run;
- migration;
- deployed Edge versions;
- template counts/statuses after sync;
- `campaigns_enabled=false`;
- `ana_enabled=false`;
- `inbound_provider=papoai` both channels;
- zero campaign sends.

Update canonical handoff.

---

## Deferred to later plans

Not implemented in Phase 1:

1. consent ledger / opt-out ingestion;
2. audience builder and eligibility engine;
3. campaign tables and immutable snapshot;
4. campaign approval workflow;
5. batch worker / pg_cron scheduling;
6. campaign template send outbox;
7. campaign analytics/attribution;
8. automatic pause by quality threshold;
9. enabling `campaigns_enabled`;
10. removing PapoAI from either number.

Each receives a separate plan only after Phase 1 is merged, deployed and verified.