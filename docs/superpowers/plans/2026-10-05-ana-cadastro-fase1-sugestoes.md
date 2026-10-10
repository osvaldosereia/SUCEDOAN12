# ANA Cadastro Fase 1 — Sugestões Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a ANA própria analisar a conversa, extrair candidatos cadastrais estruturados e permitir revisão no Atendimento sem gravar automaticamente CPF/endereço nem alterar o envio ao cliente.

**Architecture:** Criar um pipeline separado da ANA de resposta: contexto canônico da conversa → extração estruturada por modelo → validação determinística → persistência de sugestões auditáveis → revisão na lateral do Atendimento. Nesta fase, a IA nunca grava diretamente em `customers`; o atendente pode usar uma sugestão para preencher o editor existente e salvar pelo caminho canônico atual.

**Tech Stack:** Supabase Postgres/PLpgSQL, Supabase Edge Functions/Deno/TypeScript, OpenAI Responses API com JSON Schema, JavaScript ES modules no Vitrine/Admin, Node 22 contract tests.

**Spec:** `docs/superpowers/specs/2026-10-05-ana-cadastro-cliente-bling-design.md`

## Global Constraints

- Supabase/Admin permanece a fonte canônica do cliente.
- A inteligência é da ANA própria; não usar PapoAI para extração, cadastro ou sincronização.
- O telefone da identidade vem de `conversations.wa_contact_e164`, nunca do modelo nem do navegador.
- Analisar no máximo as últimas 30 mensagens de texto canônicas da conversa.
- O modelo produz candidatos estruturados; nunca produz SQL nem comandos operacionais livres.
- CPF/CNPJ e endereço principal nunca são autoaplicados nesta fase.
- Confiança abaixo de `0.80` não gera sugestão utilizável; `0.98` fica reservado para autoaplicação futura de baixo risco.
- Falha da ANA não pode bloquear chat, cadastro manual ou atendimento humano.
- Não alterar transporte Meta, templates, mídia, WABA, canais 0975/1018 nem o modo Humano × IA.

## Review Focus

- Conversa com telefone ambíguo deve bloquear extração vinculante e nunca escolher cliente sozinho — coberto no Task 1 e Task 3.
- Mensagem citando endereço de terceiro deve gerar candidato `ambiguous`/`confirm`, nunca candidato aplicável direto — coberto no Task 2.
- CPF inválido ou pertencente a outro cliente não pode aparecer como sugestão aplicável — coberto no Task 2 e Task 5.
- Um prompt do cliente tentando instruir a ANA a alterar cadastro não pode virar ação operacional — coberto no Task 2 e Task 3.
- Reexecução da extração sobre a mesma conversa não pode criar duplicatas infinitas de sugestões idênticas — coberto no Task 1 e Task 3.

---

### Task 1: Persistência auditável de extrações e sugestões

**Files:**
- Create: `supabase/migrations/20261005160000_ana_customer_profile_suggestions_v1.sql`
- Create: `supabase/sql/20261005_ana_customer_profile_suggestions_v1.sql`
- Create: `scripts/test-ana-customer-profile-schema-v1.mjs`
- Modify: `.github/workflows/attendance-papoai-send-ci.yml`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: `conversations(id, customer_id, wa_contact_e164)`, `whatsapp_messages_v1`, `customers`, `resolve_customer_by_phone_v1(text)`.
- Produces: tables `customer_profile_extraction_runs_v1`, `customer_profile_suggestions_v1`; RPC `ops2_admin_ana_customer_profile_context_v1(p_conversation_id uuid) -> jsonb`; RPC `ops2_admin_ana_customer_profile_suggestions_v1(p_conversation_id uuid) -> jsonb`.

- [ ] **Step 1: Write the failing schema contract**

`test-ana-customer-profile-schema-v1.mjs` must assert:
- both tables exist;
- `customer_profile_suggestions_v1.field_name` is constrained to `name,cpf_cnpj,email,postal_code,street,number,complement,neighborhood,city,state,reference`;
- statuses include `pending,reviewed_accepted,reviewed_rejected,expired`;
- `evidence_message_ids` is persisted;
- uniqueness prevents duplicate active suggestion for the same `run_id + field_name + normalized_value`;
- `anon` has no write access;
- browser RPCs require authenticated admin and viewer cannot mutate.

- [ ] **Step 2: Run the contract and confirm RED**

Run: `node scripts/test-ana-customer-profile-schema-v1.mjs`
Expected: FAIL because migration/RPCs do not exist.

- [ ] **Step 3: Implement schema and read RPCs**

Implement the two tables plus:
- `ops2_admin_ana_customer_profile_context_v1(uuid)` returns conversation identity, canonical customer state, missing fields and the latest 30 canonical text messages ordered oldest→newest;
- if phone resolution is `ambiguous`, return `ok=false,error='ambiguous_phone'`;
- context must not include data from any other customer.

- [ ] **Step 4: Run the contract and database syntax checks**

Run: `node scripts/test-ana-customer-profile-schema-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005160000_ana_customer_profile_suggestions_v1.sql supabase/sql/20261005_ana_customer_profile_suggestions_v1.sql scripts/test-ana-customer-profile-schema-v1.mjs .github/workflows/attendance-papoai-send-ci.yml .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "feat: add ANA customer profile suggestion schema"
```

### Task 2: Política estruturada de extração da ANA

**Files:**
- Create: `supabase/functions/_shared/ana-customer-profile-policy-v1.mjs`
- Create: `scripts/test-whatsapp-ana-customer-profile-policy-v1.mjs`

**Interfaces:**
- Consumes: context JSON from Task 1.
- Produces: `ANA_CUSTOMER_PROFILE_SCHEMA`, `ANA_CUSTOMER_PROFILE_INSTRUCTIONS`, `buildAnaCustomerProfileInput(context)`, `normalizeAnaCustomerProfileResult(value)`.

- [ ] **Step 1: Write the failing policy contract**

Assert:
- schema forbids additional properties;
- schema contains candidates only for the approved fields and never contains phone/customer_id as model-controlled fields;
- every candidate requires `value`, `confidence`, `classification`, `recommendation`, `evidence_message_ids`;
- `classification ∈ {explicit,derived,ambiguous}`;
- `recommendation ∈ {auto_apply,confirm,ignore}`;
- normalized output converts any CPF/address `auto_apply` into `confirm`;
- confidence `<0.80` becomes `ignore`;
- address with third-party markers is never auto-applicable;
- prompt injection text from a message remains input data, not instruction.

- [ ] **Step 2: Run the contract and confirm RED**

Run: `node scripts/test-whatsapp-ana-customer-profile-policy-v1.mjs`
Expected: FAIL because policy module does not exist.

- [ ] **Step 3: Implement the policy module**

Use a separate JSON Schema and instruction set from `ana-policy-v1.mjs`. Limit input to 30 messages and bound total text size. Require evidence IDs that belong to the provided message set.

- [ ] **Step 4: Run policy tests and syntax check**

Run: `node scripts/test-whatsapp-ana-customer-profile-policy-v1.mjs && node --check supabase/functions/_shared/ana-customer-profile-policy-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ana-customer-profile-policy-v1.mjs scripts/test-whatsapp-ana-customer-profile-policy-v1.mjs
git commit -m "feat: add ANA customer profile extraction policy"
```

### Task 3: Edge Function de extração read-only

**Files:**
- Create: `supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts`
- Modify: `supabase/config.toml`
- Create: `scripts/test-whatsapp-ana-customer-profile-api-v1.mjs`

**Interfaces:**
- Consumes: Task 1 context RPC; Task 2 policy module; existing admin bearer-session pattern; existing OpenAI secret resolver pattern from `admin-whatsapp-ana-preview-v1`.
- Produces: POST action `extract` with `{conversation_id}`; POST action `list` with `{conversation_id}`; persisted run + suggestions; response `{ok,run_id,suggestions}`.

- [ ] **Step 1: Write the failing API contract**

Assert:
- function authenticates admin session server-side;
- action `extract` resolves context from conversation ID only;
- model input comes from Task 1 context;
- output passes Task 2 normalizer before persistence;
- evidence IDs are checked against the context messages;
- ambiguous phone returns conflict without model call;
- repeated identical extraction is idempotent for the same conversation snapshot;
- no code path updates `customers`, `customer_addresses` or `customer_emails`.

- [ ] **Step 2: Run the contract and confirm RED**

Run: `node scripts/test-whatsapp-ana-customer-profile-api-v1.mjs`
Expected: FAIL because Edge Function does not exist.

- [ ] **Step 3: Implement `admin-whatsapp-ana-customer-profile-v1`**

Follow the authentication/CORS/provider pattern of `admin-whatsapp-ana-preview-v1`, but use the separate customer-profile policy. Persist normalized candidates and run metadata; never write canonical customer data.

- [ ] **Step 4: Run contract and TypeScript syntax check**

Run: `node scripts/test-whatsapp-ana-customer-profile-api-v1.mjs && node --experimental-strip-types --check supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts supabase/config.toml scripts/test-whatsapp-ana-customer-profile-api-v1.mjs
git commit -m "feat: add ANA customer profile extraction API"
```

### Task 4: Bloco Cadastro na lateral direita do Atendimento

**Files:**
- Create: `vitrine/admin/atendimento/attendance-customer-profile.js`
- Modify: `vitrine/admin/atendimento/attendance-customer-api.js`
- Modify: `vitrine/admin/atendimento/attendance-customer-view.js`
- Modify: `vitrine/admin/atendimento/attendance-customer.css`
- Modify: `vitrine/admin/atendimento/attendance-customer.js`
- Create: `scripts/test-admin-attendance-customer-profile-ui-v1.mjs`

**Interfaces:**
- Consumes: `customerReconcile`, existing customer editor, Task 3 `extract/list` API.
- Produces: `renderCustomerProfileAssistant({card,conversationId,customer,onRefresh})`; visual state `Provisório/Comercial/Fiscal` when available; actions `ANA buscar dados na conversa`, `Revisar sugestões`, `Usar no formulário`, `Descartar`.

- [ ] **Step 1: Write the failing UI contract**

Assert:
- linked customer card contains a compact Cadastro progress block;
- `ANA buscar dados na conversa` calls only the profile API;
- CPF is masked in read-only suggestion display;
- suggestion displays field, confidence and evidence reference, never chain-of-thought;
- `Usar no formulário` prefills the existing editor but does not save automatically;
- low-confidence/ignored suggestions are not offered as usable values;
- polling/re-render does not duplicate controls.

- [ ] **Step 2: Run the UI contract and confirm RED**

Run: `node scripts/test-admin-attendance-customer-profile-ui-v1.mjs`
Expected: FAIL because profile UI does not exist.

- [ ] **Step 3: Implement the isolated profile module**

Keep `attendance-customer-view.js` as orchestrator; put extraction/review rendering in `attendance-customer-profile.js`. Reuse existing button/form styling and existing editor save path.

- [ ] **Step 4: Run UI contract and JS syntax checks**

Run: `node scripts/test-admin-attendance-customer-profile-ui-v1.mjs && node --check vitrine/admin/atendimento/attendance-customer-profile.js && node --check vitrine/admin/atendimento/attendance-customer-view.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vitrine/admin/atendimento/attendance-customer-profile.js vitrine/admin/atendimento/attendance-customer-api.js vitrine/admin/atendimento/attendance-customer-view.js vitrine/admin/atendimento/attendance-customer.css vitrine/admin/atendimento/attendance-customer.js scripts/test-admin-attendance-customer-profile-ui-v1.mjs
git commit -m "feat: review ANA customer suggestions in Attendance"
```

### Task 5: Revisão, métricas e promoção manual segura

**Files:**
- Modify: `supabase/migrations/20261005160000_ana_customer_profile_suggestions_v1.sql` only if still on the same unshipped branch; otherwise create additive migration `supabase/migrations/20261005163000_ana_customer_profile_review_v1.sql`
- Create/Modify mirror: `supabase/sql/20261005_ana_customer_profile_review_v1.sql`
- Modify: `supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts`
- Modify: `vitrine/admin/atendimento/attendance-customer-profile.js`
- Create: `scripts/test-ana-customer-profile-review-v1.mjs`

**Interfaces:**
- Consumes: suggestion IDs from Task 1.
- Produces: action `review` with `{suggestion_id,outcome}` where `outcome ∈ {accepted,rejected}`; RPC `ops2_admin_ana_customer_profile_metrics_v1() -> jsonb`.

- [ ] **Step 1: Write the failing review/metrics contract**

Assert:
- only admin writer roles can mark review outcome;
- `viewer` cannot mutate;
- accepted suggestion is still not written automatically to canonical customer data in Phase 1;
- metrics return counts by field and accepted/rejected ratio;
- invalid CPF candidate cannot be marked usable without deterministic validation;
- duplicate review is idempotent.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-ana-customer-profile-review-v1.mjs`
Expected: FAIL because review/metrics action is absent.

- [ ] **Step 3: Implement review state and metrics**

When the attendant chooses `Usar no formulário`, mark the suggestion accepted and prefill the existing editor. Canonical persistence still occurs only when the attendant explicitly saves the editor.

- [ ] **Step 4: Run all Phase 1 tests and both Central CIs locally/contracts**

Run:
`node scripts/test-ana-customer-profile-schema-v1.mjs && node scripts/test-whatsapp-ana-customer-profile-policy-v1.mjs && node scripts/test-whatsapp-ana-customer-profile-api-v1.mjs && node scripts/test-admin-attendance-customer-profile-ui-v1.mjs && node scripts/test-ana-customer-profile-review-v1.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit and open Phase 1 PR**

```bash
git add supabase/migrations supabase/sql supabase/functions/admin-whatsapp-ana-customer-profile-v1 vitrine/admin/atendimento scripts/test-ana-customer-profile-review-v1.mjs .github/workflows
git commit -m "feat: complete ANA customer suggestion review phase"
```

Phase 1 acceptance gate before Phase 2: deploy only read/suggest/review behavior, run controlled real-conversation validation, and confirm no automatic canonical write occurred.