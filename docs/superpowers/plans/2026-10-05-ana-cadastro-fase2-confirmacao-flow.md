# ANA Cadastro Fase 2 — Confirmação e Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a ANA própria peça dados faltantes, associe confirmações válidas a sugestões específicas e promova dados confirmados para o cadastro canônico, usando conversa natural primeiro e WhatsApp Flow quando a coleta estruturada ajudar.

**Architecture:** Esta fase parte das sugestões auditáveis da Fase 1. Cada pedido de confirmação recebe ID, escopo e expiração; mensagens inbound só confirmam dados quando estiverem ligadas a uma solicitação pendente. A promoção usa RPC server-side determinística e o caminho canônico de cadastro; Flow entra como uma fonte estruturada adicional, não como uma nova base.

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
- Flow reenviado/repetido deve ser idempotente — coberto no Task 4.
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
- Create: `scripts/test-ana-customer-confirmation-v1.mjs`
- Modify: canonical Meta inbound processing file that currently persists `whatsapp_messages_v1` only at the integration point proven during implementation; do not duplicate ingest.

**Interfaces:**
- Consumes: inbound canonical message + pending confirmation request.
- Produces: `classifyCustomerConfirmation({message,pendingRequest}) -> {decision:'confirm'|'correct'|'none',request_id}`; RPC `ops2_ana_customer_confirmation_apply_signal_v1(p_request_id uuid,p_message_id uuid,p_decision text) -> jsonb`.

- [ ] **Step 1: Write the failing classifier contract**

Test exact cases:
- `sim`, `está correto`, `confirmo` within an active request → `confirm`;
- `não`, `corrigir`, `está errado` → `correct`;
- no pending request → `none`;
- expired request → `none`;
- a generic `sim` sent before the request message timestamp → `none`;
- a later message supplying a different CPF/address invalidates the earlier request instead of confirming it.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-ana-customer-confirmation-v1.mjs`
Expected: FAIL because classifier does not exist.

- [ ] **Step 3: Implement classifier and hook after canonical inbound persistence**

The hook receives canonical message ID; it must not parse provider payload directly. Persist confirmation signal idempotently by `(request_id,message_id)`.

- [ ] **Step 4: Run classifier and existing inbound/Meta contracts**

Run: `node scripts/test-ana-customer-confirmation-v1.mjs` plus the existing Meta webhook/inbound contract suite.
Expected: PASS with no change to ordinary message ingest.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ana-customer-confirmation-v1.mjs scripts/test-ana-customer-confirmation-v1.mjs supabase/functions
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
- Produces: `ops2_ana_customer_profile_promote_v1(p_request_id uuid,p_source text) -> jsonb` where source is `ana_confirmed_customer` or `admin_manual`.

- [ ] **Step 1: Write the failing promotion contract**

Assert:
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
- Modify: `supabase/functions/_shared/ana-policy-v1.mjs` only to recognize an explicit registration context; do not make general ANA collect personal data by default.
- Modify/Create server action in the ANA worker/API that generates the registration question.
- Create: `scripts/test-ana-customer-registration-dialog-v1.mjs`
- Modify: `vitrine/admin/atendimento/attendance-customer-profile.js`

**Interfaces:**
- Consumes: missing fields from customer readiness state; pending confirmation state.
- Produces: `nextCustomerRegistrationPrompt({state,pending}) -> {field,text,requires_confirmation}` and an Admin action `Pedir dados ao cliente` that creates the draft/message through the existing official Meta outbound path.

- [ ] **Step 1: Write the failing dialog contract**

Assert priority:
1. name;
2. document only when needed for fiscal completion/order;
3. CEP/endereço;
4. number;
5. complement/reference only when useful.

Also assert general ANA does not spontaneously ask CPF/address outside `registration_context=true`.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-ana-customer-registration-dialog-v1.mjs`
Expected: FAIL because dialog policy does not exist.

- [ ] **Step 3: Implement dialog policy and Attendance action**

Initial cutover: `Pedir dados ao cliente` prepares/sends one controlled message using the existing direct Meta transport; no autonomous loop yet. Keep a server-side kill switch for any future automatic send.

- [ ] **Step 4: Run dialog, outbound and Meta transport contracts**

Expected: PASS, with existing send/idempotency rules unchanged.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ana-customer-registration-dialog-v1.mjs supabase/functions/_shared/ana-policy-v1.mjs scripts/test-ana-customer-registration-dialog-v1.mjs vitrine/admin/atendimento/attendance-customer-profile.js
git commit -m "feat: ask missing customer data with ANA"
```

### Task 5: WhatsApp Flow como coleta estruturada opcional

**Files:**
- Create: `supabase/migrations/20261005180000_customer_registration_flow_sessions_v1.sql`
- Create: `supabase/sql/20261005_customer_registration_flow_sessions_v1.sql`
- Create: `supabase/functions/_shared/customer-registration-flow-v1.mjs`
- Create: `scripts/test-whatsapp-customer-registration-flow-v1.mjs`
- Modify only the existing Meta interactive-message transport module confirmed at implementation time; do not add a second transport.
- Modify the existing Meta webhook normalizer confirmed at implementation time to map Flow completion into a canonical event.

**Interfaces:**
- Consumes: customer/conversation, missing fields, existing Meta channel credentials.
- Produces: flow session `{id,customer_id,conversation_id,requested_fields,expires_at,status}`; `buildCustomerRegistrationFlowPayload(session)`; `consumeCustomerRegistrationFlowResponse(event)`.

- [ ] **Step 1: Write the failing Flow contract**

Assert:
- Flow session is bound to customer + conversation and expires;
- only requested fields are accepted;
- response cannot supply/change phone identity;
- duplicate Flow completion is idempotent;
- Flow values pass the same deterministic validators as natural-chat values;
- Flow completion creates suggestions/confirmation data and uses Task 3 promotion path, never direct table writes.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-whatsapp-customer-registration-flow-v1.mjs`
Expected: FAIL because Flow adapter/session does not exist.

- [ ] **Step 3: Implement Flow session + adapter behind feature flag**

Feature flag defaults OFF until a Meta Flow ID/version is configured and homologated for both 0975 and 1018. Natural chat remains the primary path.

- [ ] **Step 4: Run Flow + webhook + transport suites**

Expected: PASS; ordinary text/media/template traffic unchanged.

- [ ] **Step 5: Commit and open Phase 2 PR**

```bash
git add supabase/migrations supabase/sql supabase/functions scripts/test-whatsapp-customer-registration-flow-v1.mjs .github/workflows vitrine/admin/atendimento
git commit -m "feat: add optional WhatsApp Flow customer registration"
```

Phase 2 acceptance gate: controlled tests must prove scoped confirmation, promotion idempotency, no phone override, and no personal-data collection by general ANA outside registration context.