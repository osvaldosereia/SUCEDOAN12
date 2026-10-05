# ANA Cadastro Fase 3 — Autoaplicação de Baixo Risco Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir autoaplicação server-side somente de campos cadastrais de baixo risco, com confiança >= `0.98`, validadores determinísticos, kill switch e auditoria, mantendo CPF/CNPJ e endereço principal sempre fora da autoaplicação.

**Architecture:** Reutilizar as sugestões auditáveis da Fase 1 e o caminho canônico de promoção da Fase 2, adicionando uma política server-side que decide `auto_apply` por campo. O modelo nunca decide sozinho: a recomendação da IA é apenas entrada; uma função determinística aplica allowlist, confiança, conflito, validade e flag de runtime antes de chamar a persistência canônica.

**Tech Stack:** Supabase Postgres/PLpgSQL, Edge Functions/Deno/TypeScript já criadas nas Fases 1/2, JavaScript do Atendimento, Node 22 contract tests.

**Spec:** `docs/superpowers/specs/2026-10-05-ana-cadastro-cliente-bling-design.md`

## Global Constraints

- Depende da homologação das Fases 1 e 2.
- Kill switch global começa `false` (desligado para autoaplicação).
- Allowlist inicial: `name`, `email`, `complement`, `reference`.
- `cpf_cnpj`, `postal_code`, `street`, `number`, `neighborhood`, `city`, `state` nunca entram na allowlist desta versão.
- Confiança mínima para autoaplicar é `0.98`.
- Candidato precisa ser `classification='explicit'`, `recommendation='auto_apply'`, sem conflito com valor confirmado e com evidência pertencente à conversa.
- Validação determinística é obrigatória antes de persistir.
- Toda autoaplicação deve ser auditável e reversível manualmente pelo Admin.

## Review Focus

- Modelo marcar CPF/endereço como `auto_apply` deve continuar bloqueado — coberto no Task 1.
- Nome novo não pode sobrescrever nome confirmado diferente — coberto no Task 2.
- E-mail malformado com confiança alta não pode ser salvo — coberto no Task 2.
- Kill switch OFF deve produzir zero escrita automática — coberto no Task 1 e Task 3.
- Reexecução da mesma sugestão deve ser idempotente — coberto no Task 2.

---

### Task 1: Política server-side e kill switch

**Files:**
- Create: `supabase/migrations/20261005183000_ana_customer_auto_apply_policy_v1.sql`
- Create: `supabase/sql/20261005_ana_customer_auto_apply_policy_v1.sql`
- Create: `scripts/test-ana-customer-auto-apply-policy-v1.mjs`
- Modify: `.github/workflows/attendance-papoai-send-ci.yml`

**Interfaces:**
- Consumes: `customer_profile_suggestions_v1` e status/validações das Fases 1/2.
- Produces: tabela/config `ana_customer_profile_auto_apply_policy_v1`; função `ops2_ana_customer_auto_apply_decision_v1(p_suggestion_id uuid) -> jsonb`.

- [ ] **Step 1: Write the failing policy contract**

Assert:
- config default `enabled=false`;
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
git add supabase/migrations/20261005183000_ana_customer_auto_apply_policy_v1.sql supabase/sql/20261005_ana_customer_auto_apply_policy_v1.sql scripts/test-ana-customer-auto-apply-policy-v1.mjs .github/workflows/attendance-papoai-send-ci.yml
git commit -m "feat: add ANA customer auto-apply policy"
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

### Task 3: Execução controlada após extração e observabilidade

**Files:**
- Modify: `supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts`
- Modify: `vitrine/admin/atendimento/attendance-customer-profile.js`
- Create: `scripts/test-ana-customer-auto-apply-runtime-v1.mjs`

**Interfaces:**
- Consumes: persisted suggestions from Fase 1 and Task 2 apply RPC.
- Produces: optional post-extraction auto-apply pass; metrics `{eligible,applied,blocked,by_field}`; UI badge `Aplicado automaticamente`.

- [ ] **Step 1: Write failing runtime contract**

Assert:
- with policy OFF extraction performs zero auto-apply calls;
- with policy ON only eligible allowlisted candidates are attempted;
- one failed candidate does not block rendering/review of remaining suggestions;
- CPF/address candidates remain pending/confirm;
- metrics separate `applied`, `blocked_conflict`, `blocked_validation`, `blocked_policy`.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/test-ana-customer-auto-apply-runtime-v1.mjs`
Expected: FAIL because runtime integration is absent.

- [ ] **Step 3: Implement post-extraction auto-apply pass behind server flag**

Do not expose an enable toggle to ordinary browser users. UI only displays state and audit result.

- [ ] **Step 4: Run Phase 1–3 profile suites and both Central CIs**

Expected: all PASS.

- [ ] **Step 5: Commit and controlled rollout**

```bash
git add supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts vitrine/admin/atendimento/attendance-customer-profile.js scripts/test-ana-customer-auto-apply-runtime-v1.mjs
git commit -m "feat: run ANA low-risk auto-apply behind kill switch"
```

Rollout gate: leave `enabled=false` in production, measure suggestion accuracy by field, then enable first for `email`, next for `name`; `complement/reference` only after address-context tests show no third-party confusion.