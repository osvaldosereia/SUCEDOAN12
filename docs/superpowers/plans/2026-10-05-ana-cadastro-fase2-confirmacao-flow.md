# ANA Cadastro Fase 2 — Confirmação e Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a ANA própria peça dados faltantes, associe confirmações válidas a sugestões específicas e promova dados confirmados para o cadastro canônico, usando conversa natural primeiro e WhatsApp Flow quando a coleta estruturada ajudar.

**Architecture:** Esta fase parte das sugestões auditáveis da Fase 1. Cada pedido de confirmação recebe ID, escopo e expiração; mensagens inbound só confirmam dados quando estiverem ligadas a uma solicitação pendente. A promoção usa RPC server-side determinística e o caminho canônico de cadastro; Flow entra como fonte estruturada adicional, não como nova base. As antigas Edge Functions `admin-whatsapp-flow-v1` e `whatsapp-flow-data-exchange-v1` estão aposentadas em produção com HTTP 410 e não serão reativadas; o cadastro usará funções novas e isoladas.

**Tech Stack:** Supabase Postgres/PLpgSQL, Supabase Edge Functions/Deno/TypeScript, WhatsApp Meta Cloud API já integrada, JavaScript ES modules no Admin, Node 22 contract tests.

**Spec:** `docs/superpowers/specs/2026-10-05-ana-cadastro-cliente-bling-design.md`

## Global Constraints

- Depende da conclusão e homologação da Fase 1.
- A ANA deve pedir no máximo uma coisa por mensagem, salvo confirmação conjunta de vários dados espontaneamente fornecidos.
- Solicitação de confirmação expira em 30 minutos e é invalidada se surgir conflito posterior antes da confirmação.
- `sim`/`confirmar` só vale para a solicitação pendente mais recente daquela conversa e nunca para uma solicitação expirada.
- CPF/CNPJ e endereço principal exigem confirmação contextual antes da promoção.
- Toda gravação canônica passa por serviço/RPC server-side, nunca por SQL livre do modelo.
- Telefone permanece derivado da conversa canônica.
- WhatsApp Flow é segunda opção; formulário externo fica fora desta fase, salvo fallback já existente.
- Não alterar preço, estoque, pedido, pagamento ou emissão fiscal.

## Review Focus

- `sim` antigo ou genérico não pode confirmar uma solicitação nova — coberto no Task 1 e Task 2.
- Correção do cliente após uma sugestão deve invalidar a sugestão antiga — coberto no Task 2.
- CPF pertencente a outro cliente deve bloquear promoção e abrir conflito — coberto no Task 3.
- Flow reenviado/repetido deve ser idempotente — coberto no Task 5.
- Mensagem de terceiro com endereço não pode virar endereço principal confirmado por simples `sim` fora do contexto — coberto no Task 2 e Task 3.

---

### Task 1: Solicitações de confirmação com escopo e expiração

**Files:**
- Create: `supabase/migrations/20261005170000_ana_customer_profile_confirmation_v1.sql`
- Create: `supabase/sql/20261005_ana_customer_profile_confirmation_v1.sql`
- Create: `scripts/test-ana-customer-profile-confirmation-schema-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: `customer_profile_suggestions_v1` da Fase 1.
- Produces: `customer_profile_confirmation_requests_v1`; RPC `ops2_ana_customer_confirmation_create_v1(p_conversation_id uuid,p_suggestion_ids uuid[]) -> jsonb`; RPC `ops2_ana_customer_confirmation_pending_v1(p_conversation_id uuid) -> jsonb`.

- [ ] **Step 1: Write the failing schema contract**

Assert:
- confirmation request stores customer, conversation, suggestion IDs, `expires_at`, outbound message ID and confirmation inbound message ID;
- status is constrained to `pending,confirmed,corrected,expired,cancelled`;
- expiry defaults to 30 minutes;
- only one active pending request per conversation is allowed;
- new conflicting request cancels prior pending request;
- anon cannot read/write the table.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-ana-customer-profile-confirmation-schema-v1.mjs`
Expected: FAIL because confirmation schema is absent.

- [ ] **Step 3: Implement schema and RPCs**

Creation RPC accepts only pending suggestions belonging to the same customer/conversation and returns a masked confirmation summary suitable for WhatsApp.

- [ ] **Step 4: Run schema contract**

Run: `node scripts/test-ana-customer-profile-confirmation-schema-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005170000_ana_customer_profile_confirmation_v1.sql supabase/sql/20261005_ana_customer_profile_confirmation_v1.sql scripts/test-ana-customer-profile-confirmation-schema-v1.mjs .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "feat: add ANA customer confirmation requests"
```

### Task 2: Interpretar confirmação inbound sem falso positivo

**Files:**
- Create: `supabase/functions/_shared/ana-customer-confirmation-v1.mjs`
- Modify: `supabase/functions/whatsapp-meta-webhook-v1/index.ts`
- Modify: `supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs` only if the canonical normalized-message shape needs a helper field; do not parse the provider payload twice.
- Create: `scripts/test-ana-customer-confirmation-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: canonical inbound message persisted by `whatsapp-meta-webhook-v1` + pending confirmation request.
- Produces: `classifyCustomerConfirmation({message,pendingRequest}) -> {decision:'confirm'|'correct'|'none',request_id}`; RPC `ops2_ana_customer_confirmation_apply_signal_v1(p_request_id uuid,p_message_id uuid,p_decision text) -> jsonb`.

- [ ] **Step 1: Write the failing classifier contract**

Test exact cases:
- `sim`, `está correto`, `confirmo` after an active request → `confirm`;
- `não`, `corrigir`, `está errado` → `correct`;
- no pending request → `none`;
- expired request → `none`;
- a generic `sim` with timestamp before the request outbound message → `none`;
- a later message supplying a different CPF/address invalidates the earlier request instead of confirming it.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-ana-customer-confirmation-v1.mjs`
Expected: FAIL because classifier does not exist.

- [ ] **Step 3: Implement classifier and hook after canonical inbound persistence**

The webhook hook must receive the canonical `whatsapp_messages_v1.id`; it must not decide from raw Meta JSON. Persist confirmation signal idempotently by `(request_id,message_id)`.

- [ ] **Step 4: Run classifier and existing inbound/Meta contracts**

Run: `node scripts/test-ana-customer-confirmation-v1.mjs && node scripts/test-whatsapp-meta-webhook-v1.mjs && node scripts/test-whatsapp-meta-template-events-v1.mjs`
Expected: PASS with no change to ordinary message ingest.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ana-customer-confirmation-v1.mjs supabase/functions/whatsapp-meta-webhook-v1/index.ts supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs scripts/test-ana-customer-confirmation-v1.mjs .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "feat: classify ANA customer confirmations"
```

### Task 3: Promoção server-side para cadastro canônico

**Files:**
- Create: `supabase/migrations/20261005173000_ana_customer_profile_promote_v1.sql`
- Create: `supabase/sql/20261005_ana_customer_profile_promote_v1.sql`
- Create: `scripts/test-ana-customer-profile-promote-v1.mjs`
- Modify: `vitrine/admin/atendimento/attendance-customer-profile.js`
- Modify: `vitrine/admin/atendimento/attendance-customer-api.js`

**Interfaces:**
- Consumes: confirmed request from Task 2; existing `ops2_admin_customer_save_v2`/canonical customer save primitives.
- Produces: `ops2_ana_customer_profile_promote_v1(p_request_id uuid,p_source text) -> jsonb` where source is constrained to `ana_confirmed_customer`, `admin_manual` or `flow`.

- [ ] **Step 1: Write the failing promotion contract**

Assert:
- migration extends suggestion status to support `confirmed` while preserving Phase 1 statuses;
- promotion rechecks conversation/customer identity;
- CPF validator runs again and duplicate document blocks promotion;
- address promotion requires confirmed request containing the exact address suggestions;
- existing confirmed values are not overwritten when the request was built from stale data;
- promotion is idempotent;
- audit stores source and suggestion IDs without logging full CPF in general-purpose logs.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-ana-customer-profile-promote-v1.mjs`
Expected: FAIL because promotion RPC is absent.

- [ ] **Step 3: Implement promotion RPC and UI status refresh**

Use/adapt canonical customer save primitives; do not grant direct table writes to browser. After success, mark suggestions `confirmed`, request `confirmed`, refresh Attendance customer context.

- [ ] **Step 4: Run promotion and existing customer-link contracts**

Run: `node scripts/test-ana-customer-profile-promote-v1.mjs && node scripts/test-admin-attendance-customer-link-v1.mjs && node scripts/test-admin-attendance-customer-rpc-production-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005173000_ana_customer_profile_promote_v1.sql supabase/sql/20261005_ana_customer_profile_promote_v1.sql scripts/test-ana-customer-profile-promote-v1.mjs vitrine/admin/atendimento/attendance-customer-profile.js vitrine/admin/atendimento/attendance-customer-api.js
git commit -m "feat: promote confirmed ANA customer data"
```

### Task 4: Pedir dados faltantes pela ANA própria

**Files:**
- Create: `supabase/functions/_shared/ana-customer-registration-dialog-v1.mjs`
- Modify: `supabase/functions/_shared/ana-policy-v1.mjs` only to recognize explicit `registration_context`; general ANA continues sem coleta de dados pessoais fora desse contexto.
- Modify: `vitrine/admin/atendimento/attendance-customer-profile.js`
- Modify: `vitrine/admin/atendimento/attendance-send.js` to accept an internal `attendance:prefill-draft` event and place controlled text in `#messageDraft`; do not auto-send in the first cutover.
- Create: `scripts/test-ana-customer-registration-dialog-v1.mjs`
- Create: `scripts/test-admin-attendance-customer-prefill-v1.mjs`

**Interfaces:**
- Consumes: missing fields from customer state; pending confirmation state.
- Produces: `nextCustomerRegistrationPrompt({state,pending}) -> {field,text,requires_confirmation}`; Attendance action `Pedir dados ao cliente` that preenche o composer; the existing `attendance-send.js` continues to send through `admin-whatsapp-ops-v1` / Meta when the human presses `Enviar`.

- [ ] **Step 1: Write the failing dialog/prefill contracts**

Assert priority:
1. name;
2. document only when needed for fiscal completion/order;
3. CEP/endereço;
4. number;
5. complement/reference only when useful.

Also assert:
- general ANA does not ask CPF/address outside `registration_context=true`;
- `attendance:prefill-draft` never auto-clicks/sends;
- currently selected conversation must match the profile action source.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-ana-customer-registration-dialog-v1.mjs && node scripts/test-admin-attendance-customer-prefill-v1.mjs`
Expected: FAIL because dialog/prefill behavior does not exist.

- [ ] **Step 3: Implement dialog policy and controlled composer prefill**

Initial cutover requires human press on `Enviar`. Automatic outbound remains a later rollout decision; no new Meta transport is introduced.

- [ ] **Step 4: Run dialog, composer and Meta send regressions**

Run the two new tests plus `scripts/test-admin-attendance-send-ui-v1.mjs` and the existing Meta transport contracts.
Expected: PASS with send/idempotency behavior unchanged.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ana-customer-registration-dialog-v1.mjs supabase/functions/_shared/ana-policy-v1.mjs scripts/test-ana-customer-registration-dialog-v1.mjs scripts/test-admin-attendance-customer-prefill-v1.mjs vitrine/admin/atendimento/attendance-customer-profile.js vitrine/admin/atendimento/attendance-send.js
git commit -m "feat: prepare missing customer data prompts with ANA"
```

### Task 5: WhatsApp Flow como coleta estruturada opcional

**Files:**
- Create: `supabase/migrations/20261005180000_customer_registration_flow_sessions_v1.sql`
- Create: `supabase/sql/20261005_customer_registration_flow_sessions_v1.sql`
- Create: `supabase/functions/_shared/customer-registration-flow-v1.mjs`
- Create: `supabase/functions/admin-whatsapp-customer-flow-v1/index.ts`
- Create: `supabase/functions/whatsapp-customer-flow-data-exchange-v1/index.ts`
- Modify: `supabase/config.toml`
- Create: `scripts/test-whatsapp-customer-registration-flow-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: customer/conversation, missing fields, existing Meta channel credentials/transport contracts.
- Produces: flow session `{id,customer_id,conversation_id,requested_fields,expires_at,status}`; `buildCustomerRegistrationFlowPayload(session)`; `consumeCustomerRegistrationFlowResponse(event)`; admin Edge starts a session; data-exchange Edge validates/decrypts the Meta Flow exchange according to the already-homologated Meta Flow protocol before turning values into profile suggestions.

- [ ] **Step 1: Write the failing Flow contract**

Assert:
- do not reactivate retired `admin-whatsapp-flow-v1` or `whatsapp-flow-data-exchange-v1`;
- new Flow session is bound to customer + conversation and expires;
- only requested fields are accepted;
- response cannot supply/change phone identity;
- duplicate Flow completion is idempotent;
- Flow values pass the same deterministic validators as natural-chat values;
- Flow completion creates suggestions/confirmation data and uses Task 3 promotion path with `p_source='flow'`, never direct customer table writes;
- feature flag defaults OFF.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-whatsapp-customer-registration-flow-v1.mjs`
Expected: FAIL because new Flow adapter/session functions do not exist.

- [ ] **Step 3: Implement isolated Flow functions behind feature flag**

Do not share state with retired PapoAI-era Flow functions. Natural chat remains primary. Enable only after a Meta Flow ID/version is configured and homologated for both 0975 and 1018.

- [ ] **Step 4: Run Flow + webhook + transport suites**

Run new Flow test plus Meta webhook/transport tests.
Expected: PASS; ordinary text/media/template traffic unchanged.

- [ ] **Step 5: Commit and open Phase 2 PR**

```bash
git add supabase/migrations/20261005180000_customer_registration_flow_sessions_v1.sql supabase/sql/20261005_customer_registration_flow_sessions_v1.sql supabase/functions/_shared/customer-registration-flow-v1.mjs supabase/functions/admin-whatsapp-customer-flow-v1 supabase/functions/whatsapp-customer-flow-data-exchange-v1 supabase/config.toml scripts/test-whatsapp-customer-registration-flow-v1.mjs .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "feat: add optional WhatsApp Flow customer registration"
```

Phase 2 acceptance gate: controlled tests must prove scoped confirmation, promotion idempotency, no phone override, and no personal-data collection by general ANA outside registration context.