# Bling Commercial Customer Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar prontidão comercial de prontidão fiscal e permitir sincronizar no Bling o mesmo cliente canônico em gatilhos comerciais, inclusive sem CPF quando a conta real estiver homologada para isso.

**Architecture:** Introduzir readiness v2 sem quebrar `ops2_customer_registration_state_v1`; adicionar política explícita de capacidade da conta Bling; criar enfileiramento v2 por gatilho comercial; substituir o guard de criação por uma regra que respeite a capacidade homologada e preserve idempotência por `customer_id`/`bling_contact_id`. O worker canônico de clientes continua sendo o já existente em `supabase/functions/admin-service-intelligence-v1/index.ts` (`blingHubCustomerSnapshot`, `blingHubCustomerPayload`, `blingHubProcessCustomerJobs`); não será criada integração paralela. A regra fiscal continua separada.

**Tech Stack:** Supabase Postgres/PLpgSQL, Bling Hub v2 existente, `admin-service-intelligence-v1`, JavaScript do Admin apenas para status/ação explícita, Node 22 contract tests.

**Spec:** `docs/superpowers/specs/2026-10-05-ana-cadastro-cliente-bling-design.md`

## Global Constraints

- Supabase/Admin permanece a fonte canônica; Bling é projeção comercial/fiscal.
- Não sincronizar todo lead de WhatsApp.
- Gatilhos permitidos para criação comercial: pedido criado/confirmado, necessidade de venda/orçamento, ou ação explícita `Sincronizar com Bling`.
- `commercial_ready` exige nome + telefone canônico + identidade sem ambiguidade; CPF/endereço não são requisitos comerciais.
- `fiscal_ready` permanece separado e continua exigindo os dados necessários à operação fiscal.
- Criação de contato sem CPF fica bloqueada por padrão até homologação explícita da conta Dona Antônia.
- Atualizações posteriores devem enriquecer o mesmo `bling_contact_id`; nunca criar duplicata por falta anterior de CPF.
- Não mudar emissão de NF-e nem regras fiscais neste plano.

## Review Focus

- Cliente sem CPF e sem gatilho comercial nunca deve gerar job Bling — coberto no Task 2.
- Política de conta não homologada deve bloquear criação sem CPF com motivo visível, não falhar silenciosamente — coberto no Task 2 e Task 3.
- Cliente já ligado ao Bling deve continuar atualizável mesmo que esteja fiscalmente incompleto — coberto no Task 3 e Task 5.
- Repetir o mesmo gatilho comercial não pode criar dois jobs/contatos — coberto no Task 2 e Task 4.
- Tornar `commercial_ready=true` não pode liberar NF-e quando `fiscal_ready=false` — coberto no Task 1 e Task 5.

---

### Task 1: Readiness v2 sem quebrar o contrato atual

**Files:**
- Create: `supabase/migrations/20261005190000_customer_readiness_v2.sql`
- Create: `supabase/sql/20261005_customer_readiness_v2.sql`
- Create: `scripts/test-customer-readiness-v2.mjs`
- Modify: `.github/workflows/attendance-papoai-send-ci.yml`

**Interfaces:**
- Consumes: `customers`, `customer_addresses`, phone resolver/normalizer, current registration state v1.
- Produces: `ops2_customer_readiness_v2(p_customer_id uuid) -> jsonb`; view `ops2_admin_customer_readiness_v2`.

- [ ] **Step 1: Write the failing readiness contract**

Assert exact states:
- name + canonical phone + unique identity → `identity_ready=true,commercial_ready=true` even without CPF/address;
- valid CPF + confirmed usable address → `fiscal_ready=true`;
- ambiguous phone → `commercial_ready=false`;
- `bling_linked=true` is independent of `fiscal_ready`;
- current `ops2_customer_registration_state_v1` remains present and semantically unchanged during migration.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-customer-readiness-v2.mjs`
Expected: FAIL because readiness v2 does not exist.

- [ ] **Step 3: Implement readiness v2 and admin view**

Do not replace v1 callsites yet. Return separate arrays `commercial_missing_fields` and `fiscal_missing_fields`.

- [ ] **Step 4: Run readiness contract**

Run: `node scripts/test-customer-readiness-v2.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005190000_customer_readiness_v2.sql supabase/sql/20261005_customer_readiness_v2.sql scripts/test-customer-readiness-v2.mjs .github/workflows/attendance-papoai-send-ci.yml
git commit -m "feat: separate commercial and fiscal customer readiness"
```

### Task 2: Política de capacidade da conta e enfileiramento comercial v2

**Files:**
- Create: `supabase/migrations/20261005193000_bling_customer_commercial_policy_v1.sql`
- Create: `supabase/sql/20261005_bling_customer_commercial_policy_v1.sql`
- Create: `scripts/test-bling-customer-commercial-policy-v1.mjs`

**Interfaces:**
- Consumes: Task 1 readiness v2; existing `enqueue_bling_hub_job_v2`.
- Produces: table/config `bling_customer_contact_policy_v1` with one active policy row; `ops2_maybe_enqueue_customer_bling_v2(p_customer_id uuid,p_trigger text,p_allow_create boolean default true) -> jsonb`.

- [ ] **Step 1: Write the failing policy contract**

Policy fields must include:
- `documentless_create_homologated boolean default false`;
- `addressless_create_homologated boolean default false`;
- `enabled boolean default false`;
- audit timestamps/actor metadata.

Enqueue tests:
- no approved commercial trigger → no job;
- `commercial_ready=false` → no job;
- policy disabled → return blocked reason;
- customer already linked → update job may proceed regardless of create-policy flags;
- duplicate pending/processing/retry job for same canonical customer returns existing job.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-bling-customer-commercial-policy-v1.mjs`
Expected: FAIL because policy/enqueue v2 do not exist.

- [ ] **Step 3: Implement policy + enqueue v2**

Allowed trigger enum: `order_created,order_confirmed,admin_manual,quote_required,sale_required`. Job payload records trigger, readiness snapshot and policy snapshot. Creation without document/address is allowed only when corresponding homologation flags are true.

- [ ] **Step 4: Run policy contract**

Run: `node scripts/test-bling-customer-commercial-policy-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005193000_bling_customer_commercial_policy_v1.sql supabase/sql/20261005_bling_customer_commercial_policy_v1.sql scripts/test-bling-customer-commercial-policy-v1.mjs
git commit -m "feat: add Bling commercial customer sync policy"
```

### Task 3: Substituir o creation guard sem liberar criação indevida

**Files:**
- Create: `supabase/migrations/20261005200000_bling_customer_creation_guard_v2.sql`
- Create: `supabase/sql/20261005_bling_customer_creation_guard_v2.sql`
- Create: `scripts/test-bling-customer-creation-guard-v2.mjs`
- Reference/replace behavior from: `supabase/migrations/20260929223000_bling_customer_creation_guard_v1.sql`

**Interfaces:**
- Consumes: job payload from Task 2; `bling_customer_contact_policy_v1`; canonical customer row.
- Produces: `bling_hub_customer_creation_guard_v2()` trigger function; payload `creation_guard` with deterministic `blocked` + `reasons`.

- [ ] **Step 1: Write the failing guard contract**

Test:
- linked contact bypasses creation guard but keeps update path;
- new contact with name+phone and policy homologated may keep `allow_create=true` without CPF/address;
- same customer with policy not homologated gets `allow_create=false` and reasons `documentless_create_not_homologated` / `addressless_create_not_homologated`;
- missing name or invalid phone always blocks;
- fiscal readiness is not substituted or faked by this guard.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-bling-customer-creation-guard-v2.mjs`
Expected: FAIL because guard v2 is absent.

- [ ] **Step 3: Implement v2 and replace trigger atomically**

Drop/recreate the trigger in one migration. Keep v1 function for audit/history but stop attaching it after v2 migration.

- [ ] **Step 4: Run guard + existing Bling Hub contracts**

Expected: PASS; no unrelated stock/order jobs affected.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005200000_bling_customer_creation_guard_v2.sql supabase/sql/20261005_bling_customer_creation_guard_v2.sql scripts/test-bling-customer-creation-guard-v2.mjs
git commit -m "feat: allow policy-gated minimal Bling contacts"
```

### Task 4: Gatilhos comerciais e ação explícita no Atendimento

**Files:**
- Create: `supabase/migrations/20261005203000_bling_customer_commercial_triggers_v1.sql`
- Create: `supabase/sql/20261005_bling_customer_commercial_triggers_v1.sql`
- Modify: `vitrine/admin/atendimento/attendance-customer-api.js`
- Modify: `vitrine/admin/atendimento/attendance-customer-profile.js`
- Create: `scripts/test-bling-customer-commercial-triggers-v1.mjs`
- Create: `scripts/test-admin-attendance-customer-bling-sync-v1.mjs`

**Interfaces:**
- Consumes: Task 2 enqueue v2; canonical order state and Admin session.
- Produces: admin RPC `ops2_admin_attendance_customer_bling_sync_v1(p_conversation_id uuid) -> jsonb`; approved order hook(s) call enqueue v2 only at proven order commercial transition.

- [ ] **Step 1: Write failing trigger/UI contracts**

Assert:
- mere conversation/customer creation does not enqueue;
- approved `order_created`/`order_confirmed` path enqueues once;
- Admin button appears only for linked customer and reports `Não sincronizado`, `Sincronizado`, or blocked reason;
- viewer cannot trigger manual sync;
- browser sends conversation ID, not arbitrary customer ID/phone.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-bling-customer-commercial-triggers-v1.mjs && node scripts/test-admin-attendance-customer-bling-sync-v1.mjs`
Expected: FAIL because trigger/RPC/UI are absent.

- [ ] **Step 3: Implement only proven commercial transitions**

Do not attach broad `customers AFTER UPDATE` auto-sync. Enqueue at specific order/admin actions to avoid filling Bling with leads.

- [ ] **Step 4: Run trigger/UI/customer-link suites**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005203000_bling_customer_commercial_triggers_v1.sql supabase/sql/20261005_bling_customer_commercial_triggers_v1.sql vitrine/admin/atendimento/attendance-customer-api.js vitrine/admin/atendimento/attendance-customer-profile.js scripts/test-bling-customer-commercial-triggers-v1.mjs scripts/test-admin-attendance-customer-bling-sync-v1.mjs
git commit -m "feat: sync commercial customers to Bling on demand"
```

### Task 5: Preservar bloqueios fiscais e enriquecer o mesmo contato

**Files:**
- Modify: `supabase/functions/admin-service-intelligence-v1/index.ts`
- Create: `scripts/test-bling-customer-enrichment-v1.mjs`
- Modify: `.github/workflows/attendance-papoai-send-ci.yml` or the existing Bling-specific CI if present on the execution branch.

**Interfaces:**
- Consumes: `bling_contact_id`, readiness v2, job payload from Tasks 2–4.
- Produces: adjusted behavior in existing `blingHubCustomerSnapshot`, `blingHubCustomerPayload`, `blingHubFindContactByDocument`, `blingHubProcessCustomerJobs`, and `blingHubEnsureCustomerNow`; update of the same Bling contact when new CPF/address arrives; no second contact when `bling_contact_id` exists.

- [ ] **Step 1: Write failing enrichment/fiscal contract**

Assert against `admin-service-intelligence-v1/index.ts` behavior:
- customer initially synced without CPF receives CPF/address later and `blingHubProcessCustomerJobs` updates the same `bling_contact_id`;
- CREATE path does not require `blingHubFindContactByDocument` when there is no document and policy explicitly authorizes minimal creation;
- after minimal creation, verification cannot require equality of `numeroDocumento` when no document was sent; verification must use returned provider ID + read-after-write;
- missing/late document never causes create-second-contact;
- `commercial_ready=true,fiscal_ready=false` remains blocked in fiscal operation tests;
- retry of update is idempotent.

- [ ] **Step 2: Run and confirm RED against current worker behavior**

Run: `node scripts/test-bling-customer-enrichment-v1.mjs`
Expected: FAIL because current worker contains `valid_document_required`, document lookup/verification assumptions and create authorization tied to valid CPF/CNPJ.

- [ ] **Step 3: Modify the existing worker minimally**

In `admin-service-intelligence-v1/index.ts`:
- `blingHubCustomerPayload` omits absent optional document/address fields rather than sending placeholders;
- `blingHubProcessCustomerJobs` uses the job's vetted `creation_guard`/policy snapshot to authorize minimal CREATE;
- if document exists, retain exact-document reconciliation before create;
- if document does not exist but minimal create is homologated, do not search by document; create once and bind the returned provider ID;
- verification after documentless create uses `/contatos/{id}` read-after-write and stable provider ID, not `numeroDocumento` equality;
- UPDATE always targets the existing `bling_contact_id` and enriches confirmed fields.

- [ ] **Step 4: Run Bling, order, customer and fiscal regression suites**

Run new enrichment test plus existing Bling Hub/customer/order/fiscal contracts.
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-service-intelligence-v1/index.ts scripts/test-bling-customer-enrichment-v1.mjs .github/workflows
git commit -m "feat: enrich existing Bling customer without duplication"
```

### Task 6: Homologação e cutover seguro

**Files:**
- Create: `docs/projects/dona-antonia-operations-2/BLING-MINIMAL-CUSTOMER-HOMOLOGATION-2026-10-05.md`
- No production policy mutation until explicit approval at deployment time.

**Interfaces:**
- Consumes: policy from Task 2 and observable Bling API/account behavior through the existing `admin-service-intelligence-v1`/Bling Hub credentials.
- Produces: recorded evidence of whether document/address are mandatory for the Dona Antônia account; only then policy flags may be enabled.

- [ ] **Step 1: Verify code ships with policy disabled**

Query/test must show `enabled=false`, `documentless_create_homologated=false`, `addressless_create_homologated=false` by default.

- [ ] **Step 2: Perform controlled account homologation**

Use the existing Bling integration path, not a new credential or provider. Prefer a non-destructive settings/API capability check; if the API cannot reveal requirements, any disposable-contact test requires separate explicit operational approval before creation/deletion.

- [ ] **Step 3: Record evidence and required payload fields**

Document account behavior, date, endpoint/operation, and whether CPF/address can be omitted.

- [ ] **Step 4: Enable only proven flags and run a controlled commercial customer**

Expected: one canonical customer → one Bling contact → stored `bling_contact_id`; later enrichment updates that same contact.

- [ ] **Step 5: Run post-cutover smoke checks**

Verify no surge of `sync_customer` jobs from ordinary WhatsApp leads; verify fiscal checks remain unchanged.

Final acceptance gate: a customer may exist in Bling without CPF only after this homologation says the real account accepts it, and that fact must not imply fiscal readiness.