# ANA Cadastro Fase 3 — Autoaplicação de Baixo Risco Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a ANA própria passe de revisão assistida para automação controlada: analisar novas mensagens automaticamente, criar cadastro provisório somente quando identidade for segura e autoaplicar apenas campos de baixo risco com confiança >= `0.98`, mantendo CPF/CNPJ e endereço principal sempre fora da autoaplicação.

**Architecture:** Reutilizar as sugestões auditáveis da Fase 1 e o caminho canônico de promoção da Fase 2, adicionando uma política server-side que decide `auto_apply` por campo. O `whatsapp-ana-worker-v1` passa a poder enfileirar/rodar extração cadastral após novas mensagens por uma flag independente da ANA de resposta. O modelo nunca decide sozinho: a recomendação da IA é apenas entrada; funções determinísticas aplicam allowlist, confiança, conflito, identidade e kill switches antes de qualquer persistência.

**Tech Stack:** Supabase Postgres/PLpgSQL, `whatsapp-ana-worker-v1`, Edge Function de perfil criada na Fase 1, JavaScript do Atendimento, Node 22 contract tests.

**Spec:** `docs/superpowers/specs/2026-10-05-ana-cadastro-cliente-bling-design.md`

## Global Constraints

- Depende da homologação das Fases 1 e 2.
- Kill switches de `automatic_extraction` e `auto_apply` começam `false`.
- Allowlist inicial de autoaplicação: `name`, `email`, `complement`, `reference`.
- `cpf_cnpj`, `postal_code`, `street`, `number`, `neighborhood`, `city`, `state` nunca entram na allowlist desta versão.
- Confiança mínima para autoaplicar é `0.98`.
- Candidato precisa ser `classification='explicit'`, `recommendation='auto_apply'`, sem conflito com valor confirmado e com evidência pertencente à conversa.
- Validação determinística é obrigatória antes de persistir.
- Cadastro provisório automático exige telefone canônico sem ambiguidade + nome explícito com confiança >= `0.98`.
- Toda automação deve ser auditável e reversível manualmente pelo Admin.
- Automação cadastral é independente do gate de envio da ANA: pode analisar cadastro sem enviar mensagem ao cliente; nunca deve tomar controle de atendimento humano.

## Review Focus

- Modelo marcar CPF/endereço como `auto_apply` deve continuar bloqueado — coberto no Task 1.
- Nome novo não pode sobrescrever nome confirmado diferente — coberto no Task 2.
- E-mail malformado com confiança alta não pode ser salvo — coberto no Task 2.
- Kill switches OFF devem produzir zero extração/gravação automática — coberto no Task 1 e Task 3.
- Telefone ambíguo ou sem nome explícito não pode criar cliente provisório — coberto no Task 4.

---

### Task 1: Política server-side e kill switches

**Files:**
- Create: `supabase/migrations/20261005183000_ana_customer_auto_apply_policy_v1.sql`
- Create: `supabase/sql/20261005_ana_customer_auto_apply_policy_v1.sql`
- Create: `scripts/test-ana-customer-auto-apply-policy-v1.mjs`
- Modify: `.github/workflows/attendance-papoai-send-ci.yml`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: `customer_profile_suggestions_v1` e status/validações das Fases 1/2.
- Produces: tabela/config `ana_customer_profile_auto_apply_policy_v1` com `automatic_extraction_enabled=false`, `auto_apply_enabled=false`, `minimum_confidence=0.98`, allowlist; função `ops2_ana_customer_auto_apply_decision_v1(p_suggestion_id uuid) -> jsonb`.

- [ ] **Step 1: Write the failing policy contract**

Assert:
- ambos kill switches começam `false`;
- threshold exact `0.98`;
- allowlist exact `name,email,complement,reference`;
- CPF/address never auto-apply even if model says yes;
- candidate must be explicit and evidence-valid;
- conflict with existing confirmed value returns blocked reason;
- viewer/anon cannot enable policy.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-ana-customer-auto-apply-policy-v1.mjs`
Expected: FAIL because policy does not exist.

- [ ] **Step 3: Implement config + deterministic decision function**

Return `{eligible,reason,field_name,normalized_value}` without writing customer data.

- [ ] **Step 4: Run contract**

Run: `node scripts/test-ana-customer-auto-apply-policy-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005183000_ana_customer_auto_apply_policy_v1.sql supabase/sql/20261005_ana_customer_auto_apply_policy_v1.sql scripts/test-ana-customer-auto-apply-policy-v1.mjs .github/workflows/attendance-papoai-send-ci.yml .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "feat: add ANA customer automation policy"
```

### Task 2: Aplicação idempotente pelo caminho canônico

**Files:**
- Create: `supabase/migrations/20261005184500_ana_customer_auto_apply_v1.sql`
- Create: `supabase/sql/20261005_ana_customer_auto_apply_v1.sql`
- Create: `scripts/test-ana-customer-auto-apply-v1.mjs`

**Interfaces:**
- Consumes: `ops2_ana_customer_auto_apply_decision_v1(uuid)`; canonical customer save primitives from Fase 2.
- Produces: `ops2_ana_customer_auto_apply_v1(p_suggestion_id uuid) -> jsonb`.

- [ ] **Step 1: Write failing application contract**

Test:
- migration extends suggestion statuses to include `auto_applied` while preserving Phase 1/2 statuses;
- valid explicit name/email suggestion with policy ON writes once;
- malformed email blocks;
- existing different confirmed name blocks;
- complement/reference update requires same currently confirmed address context;
- duplicate invocation returns previous success without a second write;
- audit source is `ana_auto` and does not expose full sensitive values in general logs.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-ana-customer-auto-apply-v1.mjs`
Expected: FAIL because apply RPC is absent.

- [ ] **Step 3: Implement apply RPC**

Recheck decision inside the same transaction immediately before persistence. Mark suggestion `auto_applied` only after successful canonical save.

- [ ] **Step 4: Run application + customer identity regressions**

Run: `node scripts/test-ana-customer-auto-apply-v1.mjs && node scripts/test-customer-identity-admin-v2.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005184500_ana_customer_auto_apply_v1.sql supabase/sql/20261005_ana_customer_auto_apply_v1.sql scripts/test-ana-customer-auto-apply-v1.mjs
git commit -m "feat: auto-apply low-risk ANA customer fields"
```

### Task 3: Extração automática após novas mensagens

**Files:**
- Modify: `supabase/functions/whatsapp-ana-worker-v1/index.ts`
- Modify: `supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts`
- Create: `supabase/migrations/20261005185500_ana_customer_profile_auto_queue_v1.sql`
- Create: `supabase/sql/20261005_ana_customer_profile_auto_queue_v1.sql`
- Create: `scripts/test-ana-customer-profile-auto-queue-v1.mjs`
- Create: `scripts/test-ana-customer-auto-apply-runtime-v1.mjs`

**Interfaces:**
- Consumes: canonical inbound `whatsapp_messages_v1.id`, policy from Task 1, Fase 1 extraction service and Task 2 apply RPC.
- Produces: `ops2_ana_customer_profile_maybe_enqueue_v1(p_conversation_id uuid,p_inbound_message_id uuid) -> jsonb`; profile jobs keyed idempotently by conversation + latest inbound snapshot; worker path that calls profile extraction without sending any response.

- [ ] **Step 1: Write failing auto-queue/runtime contracts**

Assert:
- `automatic_extraction_enabled=false` → no profile job;
- when ON, only new inbound text relevant to a conversation schedules at most one current profile job;
- worker can process profile job even if human has taken over the conversation because this is read-only/customer-data analysis, but it never calls outbound send;
- duplicate webhook/worker invocation is idempotent;
- with `auto_apply_enabled=false`, extraction persists suggestions but performs zero canonical writes;
- with auto-apply ON, only eligible allowlisted candidates are attempted;
- one failed candidate does not block other suggestions;
- CPF/address candidates remain pending/confirm;
- metrics separate `extracted,eligible,applied,blocked_conflict,blocked_validation,blocked_policy`.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-ana-customer-profile-auto-queue-v1.mjs && node scripts/test-ana-customer-auto-apply-runtime-v1.mjs`
Expected: FAIL because automatic profile queue/worker integration is absent.

- [ ] **Step 3: Implement isolated profile-job processing in `whatsapp-ana-worker-v1`**

Keep the existing response dry-run job path unchanged. Add a separate claimed job type/RPC for customer profile extraction. Profile path must never invoke send, templates or conversation AI-mode mutation.

- [ ] **Step 4: Run ANA worker, profile and Meta regression suites**

Run new tests plus existing ANA dry-run/worker and Meta webhook contracts.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-ana-worker-v1/index.ts supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts supabase/migrations/20261005185500_ana_customer_profile_auto_queue_v1.sql supabase/sql/20261005_ana_customer_profile_auto_queue_v1.sql scripts/test-ana-customer-profile-auto-queue-v1.mjs scripts/test-ana-customer-auto-apply-runtime-v1.mjs
git commit -m "feat: automate ANA customer profile extraction behind kill switch"
```

### Task 4: Bootstrap automático de cliente provisório seguro

**Files:**
- Create: `supabase/migrations/20261005191000_ana_customer_provisional_bootstrap_v1.sql`
- Create: `supabase/sql/20261005_ana_customer_provisional_bootstrap_v1.sql`
- Create: `scripts/test-ana-customer-provisional-bootstrap-v1.mjs`
- Modify: `supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts`
- Modify: `vitrine/admin/atendimento/attendance-customer-profile.js`

**Interfaces:**
- Consumes: unlinked conversation, canonical phone resolver, explicit `name` suggestion with confidence >= `0.98`, policy Task 1.
- Produces: `ops2_ana_customer_provisional_bootstrap_v1(p_conversation_id uuid,p_name_suggestion_id uuid) -> jsonb`; canonical provisional customer linked to `conversations.customer_id` with audit source `ana_auto_provisional`.

- [ ] **Step 1: Write failing bootstrap contract**

Assert:
- phone is always read from conversation and canonicalized server-side;
- existing unique phone match links existing customer instead of creating;
- ambiguous phone returns `ambiguous_phone` and creates nothing;
- zero match + explicit name confidence >= `0.98` + policy ON creates exactly one provisional customer;
- derived/ambiguous name or confidence `<0.98` creates nothing;
- duplicate invocation is idempotent;
- bootstrap uses canonical identity function (`ensure_storefront_customer_v2` or a semantically equivalent single-source helper), not direct browser table insert;
- new profile state is visible in Attendance.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-ana-customer-provisional-bootstrap-v1.mjs`
Expected: FAIL because bootstrap RPC does not exist.

- [ ] **Step 3: Implement transactional bootstrap**

Acquire the same phone-level identity lock used by canonical customer creation, re-resolve immediately before create/link, persist audit, and attach conversation only after customer identity succeeds.

- [ ] **Step 4: Run bootstrap + phone identity + Attendance customer contracts**

Run: `node scripts/test-ana-customer-provisional-bootstrap-v1.mjs && node scripts/test-customer-identity-admin-v2.mjs && node scripts/test-admin-attendance-customer-link-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Commit and controlled rollout**

```bash
git add supabase/migrations/20261005191000_ana_customer_provisional_bootstrap_v1.sql supabase/sql/20261005_ana_customer_provisional_bootstrap_v1.sql scripts/test-ana-customer-provisional-bootstrap-v1.mjs supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts vitrine/admin/atendimento/attendance-customer-profile.js
git commit -m "feat: bootstrap provisional customers from high-confidence ANA identity"
```

Rollout gate: production começa com ambos switches OFF. Primeiro habilitar `automatic_extraction` sem auto-write e observar métricas. Depois habilitar `auto_apply` apenas para `email`; depois `name`. Por último, e somente se a precisão for comprovada, habilitar bootstrap provisório automático por nome. CPF/endereço principal permanecem sempre em confirmação.