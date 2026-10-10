# Marketing WhatsApp — Campanhas em Rascunho Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar campanhas de WhatsApp em rascunho no Vitrine/Admin, vinculando canal, template `MARKETING`, público comercial, variáveis e snapshots versionados para revisão, sem worker, scheduler ou envio real.

**Architecture:** A campanha é um agregado canônico no Supabase. O público continua editável enquanto a campanha está em `draft`; cada alteração relevante incrementa a revisão. Um snapshot imutável congela os clientes encontrados naquela revisão e registra separadamente a elegibilidade técnica no momento do snapshot. A UI e a Edge Admin nunca enviam mensagem: `campaigns_enabled=false` permanece o kill-switch, e transporte Meta/Graph/outbox ficam fora desta fase.

**Tech Stack:** PostgreSQL/Supabase migrations + PL/pgSQL, Supabase Edge Functions/Deno TypeScript, JavaScript/CSS do Vitrine Admin, Node contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-04-whatsapp-marketing-meta-campaigns-design.md`

## Global Constraints

- 0975 e 1018 continuam conectados ao PapoAI; `inbound_provider=papoai` permanece nos dois canais.
- `ana_enabled=false` e `campaigns_enabled=false` permanecem nos dois canais durante toda a Fase D.
- Esta fase NÃO cria worker, cron de campanha, scheduler, outbox de campanha, WAMID nem chamada ao Graph/Meta para envio.
- O browser nunca recebe token Meta, `phone_number_id` arbitrário ou WABA arbitrário.
- Campanha usa somente template local sincronizado com `category=MARKETING`, `status=APPROVED`, `meta_missing=false` quando esse marcador existir, e pertencente à mesma `whatsapp_account_id` da campanha.
- A tela `Públicos` continua orientada à segmentação da base inteira; consentimento/elegibilidade ficam secundários na construção do público.
- Snapshot congela todos os clientes encontrados pelo filtro comercial, com `eligible_at_snapshot` e motivos de exclusão separados. Isso NÃO autoriza envio para linhas não elegíveis.
- Antes de qualquer envio futuro, a Fase E/F deverá revalidar consentimento, opt-out, telefone, template, canal e kill-switch novamente.
- Opt-out explícito continua soberano.
- Um E.164 pode aparecer no máximo uma vez como destinatário principal por snapshot; duplicidades ficam registradas como excluídas quando aplicável.
- Alterar nome apenas não invalida snapshot; alterar canal, template, filtros, variáveis ou deep-link incrementa `revision` e torna o snapshot anterior inadequado para aprovação daquela revisão.
- Snapshot é append-only/imutável. Novo snapshot cria nova versão; não atualiza linhas antigas.
- Aprovação de campanha nesta fase significa apenas “aprovada para futura execução”; não agenda nem dispara nada.
- Não usar Make/n8n e não criar loop de envio no navegador.

## Estado observado antes da implementação

- `main` após ajuste de Públicos: `682062ec1eb2cbead536a4ab2974e230a8784d46`.
- `whatsapp_templates_v1` é o cache canônico local de templates Meta e possui `id`, `whatsapp_account_id`, `meta_template_id`, `name`, `language`, `category`, `status`, `components`, `quality_rating`, timestamps e `metadata`.
- Fase C já possui `marketing_consent_events_v1`, `marketing_customer_consent_current_v1` e `marketing_preview_audience_v1`.
- Não existe ainda tabela canônica de campanhas/snapshots; estruturas antigas como `marketing_campaign_brand_rules_v1` não representam a nova campanha Meta.
- `marketing_preview_audience_v1` já implementa filtros comerciais, dados de compra, consentimento, E.164 e dedupe, mas hoje a query está embutida dentro da própria função de preview.
- Runtime produtivo segue `inbound_provider=papoai`, `outbound_provider=meta`, `ana_enabled=false`, `campaigns_enabled=false` nos dois canais.

## File Structure

- Create: `supabase/migrations/20261005002000_marketing_audience_candidates_v2.sql` — extrair núcleo reutilizável da audiência e recriar o preview sem mudança de contrato.
- Create: `supabase/migrations/20261005004000_marketing_campaign_drafts_v1.sql` — campanhas, snapshots, destinatários, eventos e RPCs de draft/revisão/snapshot.
- Create: `supabase/functions/admin-marketing-campaigns-v1/index.ts` — API Admin autenticada para CRUD de rascunho, templates válidos, snapshot, revisão/aprovação e preparação de teste interno sem envio.
- Create: `vitrine/admin/marketing/campaign-center.js` — UI lazy de Campanhas.
- Create: `vitrine/admin/marketing/campaign-center.css` — layout/responsividade.
- Modify: `vitrine/admin/marketing/template-center.js` — adicionar subview `Campanhas` e lazy-import do módulo.
- Modify: `vitrine/admin/marketing/audience-center.js` — ação `Criar campanha com este público`, passando somente filtros comerciais para o draft.
- Create: `scripts/test-whatsapp-marketing-audience-core-v2.mjs`.
- Create: `scripts/test-whatsapp-marketing-campaign-drafts-v1.mjs`.
- Create: `scripts/test-admin-marketing-campaigns-v1.mjs`.
- Create: `scripts/test-whatsapp-marketing-campaign-ui-v1.mjs`.
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml` — executar contratos da Fase D.

## Review Focus

1. **Drift entre preview e snapshot:** o mesmo `p_filters` deve retornar a mesma base comercial; o snapshot não pode ter uma segunda query independente com regras diferentes.
2. **Campanha editada depois do snapshot:** qualquer mudança de canal/template/filtros/variáveis/deep-link incrementa `revision`; `ready_for_review` exige snapshot da revisão atual.
3. **Template deixou de ser válido:** `ready_for_review`/`approved` deve falhar se o template não estiver `MARKETING + APPROVED + mesma conta` no momento da transição.
4. **Clique duplo/retry:** criar snapshot duas vezes com a mesma `revision` e mesma chave de idempotência não pode criar duas versões equivalentes nem duplicar destinatários.
5. **Campanhas OFF:** nenhuma ação desta fase pode criar outbox, WAMID, schedule ou chamar Graph; aprovação deve continuar sendo apenas estado administrativo.

---

### Task 1: Núcleo reutilizável de audiência sem mudar o preview atual

**Files:**
- Create: `supabase/migrations/20261005002000_marketing_audience_candidates_v2.sql`
- Create: `scripts/test-whatsapp-marketing-audience-core-v2.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: filtros já aceitos por `marketing_preview_audience_v1` e tabelas da Fase C.
- Produces:
  - `marketing_audience_candidates_v2(p_filters jsonb default '{}'::jsonb) returns table (...)` restrita ao `service_role`;
  - `marketing_preview_audience_v1(jsonb,integer,integer)` recriada sobre o núcleo v2, preservando exatamente seu JSON público atual.

Colunas mínimas do núcleo:
`customer_id`, `name`, `canonical_phone`, `masked_phone`, `consent_state`, `is_active`, `city`, `neighborhood`, `order_count`, `lifetime_value`, `last_purchase_at`, `phone_rank`, `eligible`, `exclusion_reason_list`.

- [ ] **Step 1: Write failing shared-audience contract**

Test must assert:
- função v2 existe e aceita exatamente os mesmos filtros suportados hoje;
- usa `canonical_whatsapp_e164_br_v2` e dedupe determinístico por E.164;
- mantém motivos `no_consent`, `opted_out`, `inactive_customer`, `invalid_phone`, `duplicate_phone`;
- preview v1 chama/consome o núcleo v2 em vez de manter uma segunda CTE de audiência independente;
- preview preserva `found_count`, `eligible_count`, `excluded_count`, `exclusion_reasons`, paginação e `items` com o contrato atual;
- ACL: `anon=false`, `authenticated=false`, `service_role=true`.

- [ ] **Step 2: Verify RED**

Run via PR: `WhatsApp Meta Central CI`.
Expected: contrato novo falha por ausência de `marketing_audience_candidates_v2`; contratos anteriores permanecem verdes até esse passo.

- [ ] **Step 3: Implement extraction minimally**

Mover validação/filtros e query de candidatos para a função v2. Recriar `marketing_preview_audience_v1` como agregador/paginador sobre a v2 sem alterar resposta ou ordenação observável.

- [ ] **Step 4: Verify GREEN + regression**

Rodar contrato novo + `test-whatsapp-marketing-audience-preview-v1.mjs` + UI de Públicos. Smoke read-only no Supabase deve confirmar o baseline atual sem filtros (quantidades podem mudar naturalmente com clientes novos, mas preview antigo e núcleo devem concordar na mesma transação).

- [ ] **Step 5: Commit/review isolated PR**

---

### Task 2: Schema canônico de campanha, revisão e snapshot imutável

**Files:**
- Create: `supabase/migrations/20261005004000_marketing_campaign_drafts_v1.sql`
- Create: `scripts/test-whatsapp-marketing-campaign-drafts-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: `marketing_audience_candidates_v2`, `whatsapp_templates_v1`, `whatsapp_accounts`, `whatsapp_channel_runtime_v1`.
- Produces tables:
  - `marketing_campaigns_v1`;
  - `marketing_campaign_snapshots_v1`;
  - `marketing_campaign_snapshot_recipients_v1`;
  - `marketing_campaign_events_v1` (append-only).
- Produces RPCs service-role only:
  - `marketing_create_campaign_v1(p_name text, p_whatsapp_account_id uuid, p_template_id uuid, p_filters jsonb, p_variable_values jsonb default '{}'::jsonb, p_deep_link jsonb default '{}'::jsonb, p_idempotency_key text default null) returns jsonb`;
  - `marketing_update_campaign_draft_v1(p_campaign_id uuid, p_expected_revision integer, p_patch jsonb) returns jsonb`;
  - `marketing_create_campaign_snapshot_v1(p_campaign_id uuid, p_expected_revision integer, p_idempotency_key text) returns jsonb`;
  - `marketing_transition_campaign_v1(p_campaign_id uuid, p_expected_revision integer, p_to_status text, p_reason text default null) returns jsonb`;
  - `marketing_campaign_detail_v1(p_campaign_id uuid) returns jsonb`.

**Campaign model:**
- statuses implemented in this phase: `draft`, `ready_for_review`, `approved`, `cancelled`;
- schema may reserve future timestamps, but MUST NOT create `scheduled`/`running` transition in this phase;
- `revision integer not null default 1`;
- fields that increment revision when changed: account, template, filters, variable values, deep-link;
- name/notes can update without invalidating snapshot if no delivery semantics change;
- campaign stores template FK plus snapshots of template name/language/category/components at review/snapshot time for audit.

**Snapshot model:**
- each snapshot has UUID, `campaign_id`, `campaign_revision`, monotonically increasing `snapshot_version`, template/account snapshots, filters snapshot, variable/deep-link snapshot, counts and `created_at`;
- unique `(campaign_id,campaign_revision)` prevents duplicate equivalent snapshot for the same revision;
- recipient rows reference `snapshot_id`; rows are immutable after insert;
- recipient stores `customer_id`, `phone_e164` snapshot, `whatsapp_account_id`, `eligible_at_snapshot`, exclusion reasons, commercial evidence (`city/neighborhood/order_count/lifetime_value/last_purchase_at`) and resolved parameter source metadata;
- one canonical primary row per candidate returned by the shared audience function. Duplicate phone records remain represented according to the shared audience output and are marked excluded when `phone_rank>1`.

- [ ] **Step 1: Write failing campaign schema contract**

Assert tables/columns/FKs/indexes, append-only snapshot/event triggers, service-role ACLs, state set, revision rules and absence of any outbox/Graph/worker function.

Tests must pin Review Focus cases 2–5.

- [ ] **Step 2: Verify RED**

Expected: migration/schema absent.

- [ ] **Step 3: Implement campaign draft + snapshot RPCs**

Validation rules:
- template must exist, belong to campaign account, `upper(category)='MARKETING'`, `upper(status)='APPROVED'`;
- runtime account must exist; no arbitrary phone/WABA from caller;
- filters are validated by calling/using the shared audience function;
- update uses optimistic locking by `p_expected_revision` and returns `revision_conflict` on stale writes;
- snapshot creation is idempotent for current revision;
- transition `draft -> ready_for_review` requires snapshot where `campaign_revision=current revision` and revalidates template;
- `ready_for_review -> draft` allowed;
- `ready_for_review -> approved` revalidates template and snapshot but creates zero execution work;
- `draft|ready_for_review|approved -> cancelled` allowed;
- no other transitions.

- [ ] **Step 4: Transactional smoke with rollback**

Inside `BEGIN/ROLLBACK` create one synthetic draft using an existing approved MARKETING template, snapshot it, prove immutable rows, revision invalidation, stale revision conflict, idempotent snapshot and administrative approval with `campaigns_enabled=false`. Verify zero rows created in existing WhatsApp outbox tables.

- [ ] **Step 5: Verify GREEN and commit isolated PR**

---

### Task 3: API Admin autenticada para Campanhas

**Files:**
- Create: `supabase/functions/admin-marketing-campaigns-v1/index.ts`
- Create: `scripts/test-admin-marketing-campaigns-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes campaign RPCs from Task 2, `whatsapp_templates_v1`, Admin auth pattern already used by `admin-marketing-audiences-v1`/`admin-whatsapp-templates-v1`.
- Produces actions:
  - `GET ?action=list&status=<optional>`;
  - `GET ?action=detail&campaign_id=<uuid>`;
  - `GET ?action=options&whatsapp_account_id=<uuid>` — somente templates `MARKETING/APPROVED` da conta;
  - `POST ?action=create`;
  - `POST ?action=update_draft`;
  - `POST ?action=create_snapshot`;
  - `POST ?action=transition`;
  - `POST ?action=prepare_internal_test` — somente valida/renderiza o teste interno e devolve destinos canários permitidos; NÃO envia.

- [ ] **Step 1: Write failing Edge contract**

Assert:
- Admin bearer auth obrigatório;
- service-role nunca vai ao browser;
- create/update body não aceita WABA, `phone_number_id`, destination E.164, outbox, send/schedule fields;
- `options` só retorna templates `MARKETING/APPROVED` da conta solicitada;
- create/transition ignoram qualquer status arbitrário do browser e chamam RPC canônica;
- `prepare_internal_test` aceita apenas campanha/revisão e deriva os destinos internos da configuração server-side; retorna `dispatch_allowed:false` nesta fase;
- fonte não contém `sendTemplateViaMeta`, `graph.facebook.com`, `whatsapp_outbox`, `ops2_whatsapp_outbox`, `pg_net` ou scheduler;
- limites de payload e filtros definidos.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement Edge minimally**

Use cliente service-role somente depois da autenticação Admin. Sanitizar respostas e mapear `revision_conflict`, `template_not_sendable`, `snapshot_stale`, `campaign_invalid_transition` e `campaigns_disabled` de forma explícita.

- [ ] **Step 4: Verify GREEN + TypeScript syntax**

Rodar CI completo da Central.

- [ ] **Step 5: Commit/review isolated PR**

---

### Task 4: UI Marketing > Campanhas em rascunho

**Files:**
- Create: `vitrine/admin/marketing/campaign-center.js`
- Create: `vitrine/admin/marketing/campaign-center.css`
- Modify: `vitrine/admin/marketing/template-center.js`
- Modify: `vitrine/admin/marketing/audience-center.js`
- Create: `scripts/test-whatsapp-marketing-campaign-ui-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: `admin-marketing-campaigns-v1`; filtros comerciais já coletados em `audience-center.js`.
- Produces: lazy view `Campanhas` + fluxo de draft/revisão, sem transporte.

- [ ] **Step 1: Write failing UI contract**

Assert:
- nav Marketing contém `Campanhas` entre `Públicos` e `Consentimentos`;
- módulo é lazy-loaded;
- lista mostra `Rascunho`, `Pronta para revisão`, `Aprovada`, `Cancelada` e revisão atual;
- wizard contém nome, canal, template MARKETING aprovado, público/filtros, variáveis do template, deep-link opcional, prévia e resumo;
- `Públicos` possui `Criar campanha com este público` e transfere somente os filtros atuais, nunca uma lista de telefones;
- campanha mostra `Clientes no público` como total principal e bloco técnico de elegibilidade secundário;
- snapshot mostra versão/revisão/data/total/aptos/inaptos e é somente leitura;
- editar filtro/template depois do snapshot mostra aviso de que uma nova revisão/snapshot será necessária;
- botão `Enviar`, `Disparar`, `Agendar agora` ou equivalente NÃO existe;
- ação `Preparar teste interno` deixa claro `Nenhuma mensagem será enviada nesta fase`;
- aprovação administrativa exige confirmação explícita e exibe `Campanhas desligadas`;
- loading/busy + mobile CSS.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement lazy campaign UI**

`template-center.js` só adiciona navegação/import. `campaign-center.js` possui lista, editor, snapshot e revisão. `audience-center.js` só expõe os filtros atuais para criar um draft; não conhece schema de recipient.

- [ ] **Step 4: Verify GREEN + regressions**

Rodar contratos novos + Templates + Públicos/Consentimentos + Marketing legado + sintaxe JS.

- [ ] **Step 5: Commit/review isolated PR**

---

### Task 5: Deploy controlado e homologação da Fase D

**Files:**
- No feature files unless verification reveals a defect.
- Update issue/checkpoint only after evidence.

**Interfaces:**
- Consumes exact merged migrations/Edge/UI from Tasks 1–4.
- Produces capability de criar/revisar/aprovar drafts e snapshots, com zero dispatch capability.

- [ ] **Step 1: Capture baseline**

Record runtime 0975/1018, campaign flags, current outbox/retry counts, template cache counts and current Edge versions.

- [ ] **Step 2: Apply audience-core migration**

Read-only smoke proving preview old/new parity for: sem filtros, cidade e um filtro de compra existente. No mutations.

- [ ] **Step 3: Apply campaign migration and transactional smoke**

Create/update/snapshot/review/approve/cancel inside rollback. Prove append-only and zero outbox/WAMID.

- [ ] **Step 4: Deploy `admin-marketing-campaigns-v1` from exact merged commit**

Preserve Admin auth conventions; record version/hash/rollback.

- [ ] **Step 5: Runtime smoke from Admin**

Operator may create a clearly named draft such as `TESTE RASCUNHO - NÃO ENVIAR`, calculate/snapshot and review. Do NOT create actual internal WhatsApp send in this phase. Delete/cancel the test draft only through supported state transition if needed; preserve audit.

- [ ] **Step 6: Final safety verification**

Must prove:
- `campaigns_enabled=false` both channels;
- `ana_enabled=false` both;
- `inbound_provider=papoai` both;
- no new rows in WhatsApp outboxes due to campaign actions;
- no Graph/send calls from campaign Edge;
- template sync and audience preview remain functional;
- PapoAI untouched.

- [ ] **Step 7: Record checkpoint #630**

Document RED/GREEN runs, migrations/Edge version, smoke evidence, campaign draft/snapshot evidence and next phase: **Fase E — worker/agendamento**, still without graduação para clientes reais.

## Self-review result

- **Spec coverage:** Fase D is covered: campaign, editable audience, immutable snapshot, review, administrative approval and internal-test preparation. Actual canary send remains deferred to Fase F, where the spec already places homologation/WAMID/delivery evidence.
- **Step scan:** each task owns one reviewable boundary: shared audience core, DB campaign model, Admin API, UI, production deployment.
- **Type consistency:** campaign `revision` is the optimistic-lock key across DB/Edge/UI; snapshot records the same `campaign_revision`; UI never sends recipient phones.
- **Review Focus:** drift, stale snapshots, template invalidation, retries and campaigns-off are explicitly pinned in Tasks 1–4.
- **Scope:** worker, scheduler, outbox, actual Meta dispatch, WAMID/status e results remain intentionally outside Fase D.