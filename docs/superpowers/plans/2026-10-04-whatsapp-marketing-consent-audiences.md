# Marketing WhatsApp — Consentimentos e Públicos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a camada canônica de consentimento/opt-out e um construtor de públicos somente-leitura que mostre encontrados, elegíveis, excluídos e motivos, sem habilitar campanhas ou enviar mensagens.

**Architecture:** O estado atual continua em `customers.marketing_opt_in`, mas toda mudança futura passa a ter trilha append-only em `marketing_consent_events_v1`; um trigger funciona como rede de segurança para alterações legadas diretas. A segmentação é calculada server-side por RPC/Edge autenticada, deduplicada por E.164 e separa filtro comercial de elegibilidade obrigatória. A UI fica modular em `vitrine/admin/marketing/` e só consulta/edita consentimento; não possui transporte de campanha.

**Tech Stack:** PostgreSQL/Supabase migrations + PL/pgSQL, Supabase Edge Functions/Deno TypeScript, JavaScript/CSS do Vitrine Admin, Node contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-04-whatsapp-marketing-meta-campaigns-design.md`

## Global Constraints

- 0975 e 1018 continuam no PapoAI nesta fase.
- `inbound_provider=papoai` permanece nos dois canais.
- `outbound_provider=meta` permanece como está.
- `ana_enabled=false` e `campaigns_enabled=false` permanecem nos dois canais durante toda a Fase 2.
- Nenhuma rotina desta fase pode criar outbox, WAMID ou chamar transporte Meta.
- `marketing_opt_in=false` sem evidência de opt-out NÃO significa revogação; deve aparecer como `never_consented`/não elegível.
- Opt-out explícito prevalece sobre qualquer segmentação.
- Etiquetas são filtros auxiliares e nunca substituem consentimento.
- Segmentação deve usar somente sinais comerciais explicáveis; não inferir atributos sensíveis.
- Telefone de audiência é sempre normalizado com `canonical_whatsapp_e164_br_v2` e deduplicado por E.164.
- RPCs de escrita de consentimento e preview interno ficam restritas ao `service_role`; browser usa Edge autenticada.
- Não usar Make/n8n e não criar loop de envio no navegador.

## Estado observado antes da implementação

- `customers`: 519 registros; 8 com `marketing_opt_in=true`, 511 com `false`.
- `marketing_optout_events_v1`: 0 registros.
- `marketing_optout_events_v2`: 0 registros.
- Etiquetas ativas: `Segunda`, `Terça`, `Quarta`; atualmente 0 vínculos de conversa.
- `attendance_conversation_labels_v1.conversation_id` referencia `conversations.id`; `conversations` possui `customer_id` e `wa_contact_e164`.
- Pedidos atuais usam estados `storefront_received`, `confirmed`, `processing`, `ready`, `delivered`, `cancelled`.
- Compra histórica para segmentação deve considerar pedido comercial confirmado/andando/entregue e excluir cancelados/devolvidos; `storefront_received` isolado não prova compra concluída.

## File Structure

- Create: `supabase/migrations/20261004233000_marketing_consent_ledger_v1.sql` — ledger append-only, estado atual, trigger de segurança, RPC atômico e adaptação do opt-out do Atendimento.
- Create: `supabase/migrations/20261004234500_marketing_audience_preview_v1.sql` — função server-side de preview/eligibilidade e motivos de exclusão.
- Create: `supabase/functions/admin-marketing-audiences-v1/index.ts` — API Admin autenticada para overview, preview, histórico e registro manual de consentimento.
- Create: `vitrine/admin/marketing/audience-center.js` — UI lazy de Públicos e Consentimentos.
- Create: `vitrine/admin/marketing/audience-center.css` — layout/responsividade da Fase 2.
- Modify: `vitrine/admin/marketing/template-center.js` — acrescentar subviews `Públicos` e `Consentimentos` e lazy-importar `audience-center.js`.
- Modify: `vitrine/admin/basket-lot-image.js` — carregar o CSS adicional sem mover o bootstrap existente nesta fase.
- Create: `scripts/test-whatsapp-marketing-consent-ledger-v1.mjs`.
- Create: `scripts/test-whatsapp-marketing-audience-preview-v1.mjs`.
- Create: `scripts/test-admin-marketing-audiences-v1.mjs`.
- Create: `scripts/test-whatsapp-marketing-audience-ui-v1.mjs`.
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml` — executar os quatro contratos da Fase 2.

## Review Focus

1. **False sem histórico:** cliente com `marketing_opt_in=false` e nenhum evento precisa ser `never_consented`, nunca `opt_out`.
2. **Retry/idempotência:** mesma ação explícita com `source_event_key` repetida não pode criar dois eventos nem oscilar estado.
3. **Duplicidade de telefone:** dois clientes com o mesmo E.164 devem resultar em no máximo um elegível, com o outro explicitamente excluído como `duplicate_phone`.
4. **Mudança legada direta:** qualquer UPDATE de `customers.marketing_opt_in` fora da RPC deve gerar evento de segurança no ledger, sem quebrar checkout/cadastro existentes.
5. **Filtro comercial x elegibilidade:** um cliente pode corresponder ao segmento e ainda ser excluído por consentimento/telefone/atividade; contagens e motivos precisam refletir isso sem esconder o encontrado.

---

### Task 1: Ledger canônico de consentimento e opt-out

**Files:**
- Create: `supabase/migrations/20261004233000_marketing_consent_ledger_v1.sql`
- Create: `scripts/test-whatsapp-marketing-consent-ledger-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: `customers(id, primary_whatsapp_e164, marketing_opt_in, marketing_consent_updated_at)`, `canonical_whatsapp_e164_br_v2(text)`, `ops2_admin_attendance_marketing_optout_v1(uuid)`.
- Produces:
  - table `marketing_consent_events_v1`;
  - view `marketing_customer_consent_current_v1`;
  - function `marketing_record_consent_v1(p_customer_id uuid, p_decision text, p_source text, p_source_ref text default null, p_source_event_key text default null, p_consent_text_version text default null, p_consent_text_snapshot text default null, p_occurred_at timestamptz default now(), p_recorded_by text default 'system', p_metadata jsonb default '{}'::jsonb) returns jsonb`;
  - safety trigger on `customers.marketing_opt_in` changes.

- [ ] **Step 1: Write the failing ledger contract**

Test must assert:
- table contains `decision` restricted to `opt_in|opt_out`, customer/phone snapshot, source/source_ref/source_event_key, consent text version/snapshot, occurred_at, recorded_by, metadata, created_at;
- UPDATE/DELETE on ledger are blocked by append-only trigger;
- `anon`/`authenticated` have no table write nor RPC execute;
- `service_role` can execute `marketing_record_consent_v1`;
- RPC validates customer and decision, canonicalizes phone, is idempotent on non-null `source_event_key`, inserts event and updates `customers` atomically;
- explicit `opt_out` records evidence even if current boolean already false;
- current view emits `opt_in`, `opt_out`, or `never_consented`;
- safety trigger records direct legacy changes with source `customer_state_change` unless the canonical RPC has explicitly suppressed the trigger for its own update;
- migration backfills only existing `marketing_opt_in=true` customers as `opt_in` with `source='legacy_current_state'`, plus any rows that may exist in legacy opt-out event tables; false-without-evidence stays without `opt_out` event;
- recreated `ops2_admin_attendance_marketing_optout_v1` delegates to `marketing_record_consent_v1` with source `attendance_manual_optout`.

- [ ] **Step 2: Run CI to verify RED**

Run via PR: `WhatsApp Meta Central CI`.
Expected: new ledger contract fails before production migration exists; pre-existing steps remain green until that contract.

- [ ] **Step 3: Implement the migration minimally**

Use UUID PK, FK to `customers`, normalized phone snapshot, partial unique index on non-null `source_event_key`, timestamp/indexes by customer and occurred_at. Implement trigger guard for append-only and a second trigger for legacy direct state changes. Canonical RPC must use transaction semantics of one PL/pgSQL call and `set_config(..., true)` only to suppress duplicate audit from its own customer update.

- [ ] **Step 4: Verify GREEN and SQL safety**

Expected:
- new contract green;
- existing Attendance opt-out contract green;
- no campaign/send tests regress;
- migration contains no grant to `anon`/`authenticated` for critical writes.

- [ ] **Step 5: Commit/review as isolated PR**

PR scope only consent ledger/RPC/contract/CI.

---

### Task 2: Preview server-side de público e elegibilidade

**Files:**
- Create: `supabase/migrations/20261004234500_marketing_audience_preview_v1.sql`
- Create: `scripts/test-whatsapp-marketing-audience-preview-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: `marketing_customer_consent_current_v1`, `customers`, `customer_addresses`, `orders`, `order_items`, `products`, `conversations`, `attendance_labels_v1`, `attendance_conversation_labels_v1`.
- Produces: `marketing_preview_audience_v1(p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_offset integer default 0) returns jsonb` restricted to `service_role`.

- [ ] **Step 1: Write failing audience contract**

Contract must pin accepted filter keys:
- `customer_ids`;
- `search` (name/phone only);
- `city`, `neighborhood`;
- `label_ids`;
- `product_ids`;
- `brand`, `category`;
- `last_purchase_before`, `last_purchase_after`, `inactive_days`;
- `min_order_count`, `max_order_count`;
- `min_lifetime_value`, `max_lifetime_value`.

Mandatory output:
- `found_count` after commercial filters;
- `eligible_count`;
- `excluded_count`;
- `exclusion_reasons` count map;
- paginated `items`, each with customer id/name/masked phone, consent state, eligibility boolean, exclusion reasons and only commercial summary needed by Admin.

Eligibility reasons must include at least:
- `no_consent`;
- `opted_out`;
- `inactive_customer`;
- `invalid_phone`;
- `duplicate_phone`.

Contract must assert use of `canonical_whatsapp_e164_br_v2`, deterministic `row_number() over (partition by phone)` dedupe and no sensitive demographic inference.

- [ ] **Step 2: Verify RED**

Expected: fail because migration/function does not exist.

- [ ] **Step 3: Implement preview SQL**

Commercial purchase joins count only orders with `cancelled_at is null`, `returned_at is null`, and confirmed/processing/ready/delivered semantics (`confirmed_at is not null` or status in the accepted commercial set). Address filter uses active/default address deterministically. Label filter joins `conversations.customer_id` to attendance label links. Unknown filter keys return `unsupported_filter` instead of being silently ignored.

- [ ] **Step 4: Verify behavior with transactional smoke**

Inside one transaction/rollback, create or select non-sensitive synthetic/customer-safe fixtures sufficient to prove:
- opt-in eligible;
- false/no-ledger => `no_consent`;
- explicit opt-out => `opted_out`;
- duplicate E.164 => one row excluded `duplicate_phone`;
- commercial filter counts found separately from eligible.

No message/outbox call is allowed.

- [ ] **Step 5: Commit/review as isolated PR**

---

### Task 3: API Admin autenticada para Consentimentos/Públicos

**Files:**
- Create: `supabase/functions/admin-marketing-audiences-v1/index.ts`
- Create: `scripts/test-admin-marketing-audiences-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes:
  - `marketing_preview_audience_v1`;
  - `marketing_record_consent_v1`;
  - `marketing_customer_consent_current_v1`;
  - existing Admin auth convention used by `admin-whatsapp-templates-v1`.
- Produces HTTP actions:
  - `GET ?action=overview`;
  - `POST ?action=preview` body `{filters,limit,offset}`;
  - `GET ?action=consent_history&customer_id=<uuid>`;
  - `POST ?action=record_consent` body `{customer_id,decision,source_ref?,source_event_key?,consent_text_version?,consent_text_snapshot?,metadata?}`.

- [ ] **Step 1: Write failing API contract**

Assert:
- Admin auth is mandatory;
- browser never sends service-role key;
- only allowlisted actions/fields accepted;
- `record_consent` forces `source='admin_marketing'` server-side;
- `opt_in` via Admin requires non-empty `consent_text_version` and `consent_text_snapshot` so operator cannot manufacture consent without recorded evidence;
- `opt_out` may be recorded immediately with explicit reason metadata;
- preview cannot request send, template, WABA, phone_number_id, outbox or Graph endpoint;
- response masks phone for audience lists but history can return canonical phone only to authenticated Admin when needed.

- [ ] **Step 2: Verify RED**

Expected: function/file missing.

- [ ] **Step 3: Implement Edge minimally**

Use the same Admin bearer verification pattern already proven in `admin-whatsapp-templates-v1`. Use service-role Supabase client only after Admin authorization. Bound `limit` to 1..100 and reject oversized/filter payloads.

- [ ] **Step 4: Verify GREEN + TypeScript syntax**

Run full Central CI and dedicated contract/syntax step.

- [ ] **Step 5: Commit/review as isolated PR**

---

### Task 4: UI Marketing > Públicos e Consentimentos

**Files:**
- Create: `vitrine/admin/marketing/audience-center.js`
- Create: `vitrine/admin/marketing/audience-center.css`
- Modify: `vitrine/admin/marketing/template-center.js`
- Modify: `vitrine/admin/basket-lot-image.js`
- Create: `scripts/test-whatsapp-marketing-audience-ui-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: `admin-marketing-audiences-v1` through `attendanceAuthorizedFetch`; current Marketing subnavigation.
- Produces lazy views `Públicos` and `Consentimentos`.

- [ ] **Step 1: Write failing UI contract**

Assert UI contains:
- Marketing nav: `Visão geral`, `Templates Meta`, `Públicos`, `Consentimentos`;
- visible badge `Campanhas desligadas`;
- lazy import/load only on opening new views;
- audience filter controls for customer/search, city/bairro, label, product, brand/category, last purchase/inactive days, order count, lifetime value;
- result counters `Encontrados`, `Elegíveis`, `Excluídos`;
- excluded-reason chips/details;
- no `Enviar`, `Disparar`, transport Meta, WABA or destination injection;
- consent view with search, current state, last update and history;
- manual opt-out action has confirmation;
- manual opt-in requires evidence/version fields and explicit confirmation;
- loading buttons show working state and cannot double-submit;
- mobile CSS.

- [ ] **Step 2: Verify RED**

Expected: missing module/nav/contracts.

- [ ] **Step 3: Implement modular lazy UI**

`template-center.js` only adds nav + dynamic import. `audience-center.js` owns data fetching/state/rendering. Initial opening fetches overview only; preview runs when operator clicks `Calcular público`.

- [ ] **Step 4: Verify GREEN + legacy Marketing regression**

Run:
- new UI contract;
- existing `test-whatsapp-marketing-template-admin-v1.mjs`;
- existing Marketing intelligence legacy contract;
- JavaScript syntax;
- Basket bootstrap workflow because CSS/loader integration is shared.

- [ ] **Step 5: Commit/review as isolated PR**

---

### Task 5: Deploy controlado e homologação da Fase 2

**Files:**
- No new feature files unless verification reveals a defect.
- Update checkpoint docs/issues only after evidence.

**Interfaces:**
- Consumes exact merged migrations/Edge/UI from Tasks 1–4.
- Produces production-ready consent/audience read/write capability with zero campaign dispatch capability.

- [ ] **Step 1: Capture pre-deploy baseline**

Record:
- both channel runtime rows;
- count opt-in/non-opt-in;
- current ledger absence/count;
- outbox problematic/recent count;
- current Edge versions to enable rollback.

- [ ] **Step 2: Apply ledger migration and smoke with rollback**

Verify:
- 8 current opt-ins are represented by backfill (or current count at deployment time, if changed naturally);
- false/no-event remains `never_consented`;
- ACL/append-only rules;
- manual opt-out and idempotency in transaction rollback;
- existing Attendance opt-out still returns expected contract.

- [ ] **Step 3: Apply audience migration and smoke with rollback**

Use synthetic/reversible data only. Confirm counts/reasons/dedupe. No Graph/Meta call.

- [ ] **Step 4: Deploy Admin audience Edge from exact merged commit**

Preserve auth mode consistent with existing Admin functions. Record version/hash/rollback version.

- [ ] **Step 5: Runtime smoke from Admin**

Operator opens Marketing > Públicos and runs a preview. Expected: counts only, no outbox/WAMID. Then open Consentimentos and inspect history. Do not alter real customer's opt-in merely to test UI; mutation smoke stays transactional unless user explicitly chooses a controlled record.

- [ ] **Step 6: Final safety verification**

Must prove:
- `campaigns_enabled=false` on both channels;
- `inbound_provider=papoai` on both;
- no new campaign/outbound queue caused by preview;
- no Graph calls from audience Edge;
- Fase 1 template sync remains functional;
- PapoAI untouched.

- [ ] **Step 7: Record checkpoint #630**

Document RED/GREEN runs, migration/Edge versions, smoke evidence, counts and next phase (`Campanhas em rascunho`, still no real dispatch).

## Self-review result

- Spec coverage: Phase C is fully covered; campaign snapshot/worker/results remain intentionally deferred to later phases.
- Type consistency: consent RPC/view feed audience RPC; audience RPC feeds Admin Edge; Admin Edge feeds lazy UI.
- Privacy: no sensitive segmentation fields are exposed or inferred.
- Failure modes: false-without-evidence, retries, duplicate E.164, legacy direct writes and found-vs-eligible are each pinned by tests.
- Scope: no campaign tables, scheduler, outbox or Meta transport are introduced here.
