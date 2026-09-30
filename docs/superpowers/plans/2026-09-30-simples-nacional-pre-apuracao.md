# Simples Nacional Pre-Apuracao Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar no Vitrine/Admin um modulo Fiscal -> Simples Nacional que consolida a competencia mensal, reconcilia documentos fiscais com pedidos, segrega receitas com evidencia suficiente, calcula uma previa auditavel do DAS e permite homologacao contra o contador sem transmitir PGDAS-D nem efetuar pagamento.

**Architecture:** O modulo sera uma camada de fechamento sobre as fontes canonicas ja existentes no Supabase e sobre evidencias fiscais do Bling. Regras e memoria de calculo ficam versionadas no banco; classificacao e calculo ficam em codigo TypeScript testavel e sem side effects; o gateway administrativo existente expoe somente operacoes autenticadas de leitura/recalculo/fechamento; a UI entra no Admin atual sem criar um segundo painel.

**Tech Stack:** PostgreSQL 17 / Supabase, Supabase Edge Functions em Deno + TypeScript, `@supabase/supabase-js`, Vitrine/Admin HTML/CSS/JS existente, Bling v3 via infraestrutura OAuth atual, scripts Node `.mjs` para smoke/integration checks.

**Spec:** `docs/superpowers/specs/2026-09-30-simples-nacional-pre-apuracao-design.md`

## Global Constraints

- Supabase canonico: `ssbesxgaijknwsjbsbcz`; nao criar projeto paralelo.
- Bling continua ERP operacional e principal evidencia externa das NF-e de saida.
- Pedidos locais servem para conciliacao e nunca substituem documento fiscal autorizado.
- Nenhuma classificacao incerta entra silenciosamente como segregacao fiscal.
- Primeira fase nao transmite PGDAS-D, nao gera DAS por side effect externo e nao efetua pagamento.
- Competencia `locked` e imutavel; correcao posterior cria nova versao.
- Regras tributarias e parametros de calculo sao versionados por vigencia.
- Nenhuma chave secreta vai para o frontend; novas tabelas expostas usam RLS.
- Nao criar novo cron/polling para este modulo; recalculo e coleta sao sob demanda na primeira fase.
- Nao reprocessar historico operacional antigo como se fosse fluxo live; historico fiscal pode ser consultado apenas quando necessario para RBT12 e homologacao.
- Nao fazer refatoracao geral do `vitrine/admin/index.html` nem do gateway monolitico nesta entrega; novos dominios devem ser isolados em modulos pequenos e ligados ao runtime existente.

## File Structure

- Create `supabase/migrations/20260930133000_simples_nacional_pre_apuracao_v1.sql` — tabelas, constraints, RLS, indexes e funcoes SQL puramente de leitura/gates.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/types.ts` — contratos do dominio.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/calculator.ts` — RBT12, faixa, aliquota efetiva e memoria de calculo.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/classifier.ts` — classificacao de linhas por regra vigente/evidencia.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/reconciliation.ts` — deteccao de divergencias entre NF-e, pedidos, cancelamentos e perfis fiscais.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/index.ts` — servico HTTP interno do dominio Simples.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/*.test.ts` — testes Deno unitarios do dominio.
- Modify `supabase/functions/admin-service-intelligence-v1/index.ts` — rotear somente as novas acoes `simples_*` ao modulo isolado.
- Modify `vitrine/admin/index.html` — menu, pagina, cards, pendencias, memoria de calculo e homologacao.
- Create `scripts/test-simples-admin-integration.mjs` — smoke estrutural do frontend/gateway.
- Create `scripts/test-simples-period-contract.mjs` — checagens de contrato e invariantes da API/DDL versionado.
- Create `docs/projects/dona-antonia-operations-2/SIMPLES-NACIONAL-HOMOLOGATION-RUNBOOK.md` — procedimento humano de homologacao e criterio para futuro cutover.

## Review Focus

- NF-e autorizada no ultimo dia do mes com timezone Cuiaba deve pertencer a competencia correta; teste em Task 3.
- Pedido sem NF-e ou NF-e sem pedido deve bloquear `ready`, sem excluir receita/documento; teste em Task 3.
- Produto `candidate`, `unknown`, `conflict`, `pending` ou `blocked` nao pode receber segregacao ST/monofasica automatica; teste em Task 2.
- Competencia ja `locked` nao pode ser recalculada ou sobrescrita; teste em Task 1 e Task 4.
- Historico insuficiente para RBT12 nao pode produzir aliquota silenciosamente; deve abrir bloqueio explicito; teste em Task 2 e Task 4.

---

### Task 1: Persistencia, versionamento e gates da competencia

**Files:**
- Create: `supabase/migrations/20260930133000_simples_nacional_pre_apuracao_v1.sql`
- Create: `scripts/test-simples-period-contract.mjs`

**Interfaces:**
- Produces tables: `simples_rule_sets`, `simples_tax_classification_rules`, `simples_periods`, `simples_revenue_lines`, `simples_reconciliation_issues`, `simples_validation_runs`, `simples_homologation_checks`.
- Produces SQL function: `get_simples_period_gate_v1(p_period_id uuid) returns jsonb`.
- Produces statuses: period `draft|review_required|ready|locked|superseded`; line `classified|manual_review|blocked`; issue `open|resolved|ignored_with_reason`.

- [ ] **Step 1: Write the failing contract test**

Create `scripts/test-simples-period-contract.mjs` asserting the migration contains all seven tables, unique `(competence_month,version)`, valid period status constraint, RLS enablement on every new public table, the gate function name and a lock guard that rejects mutation of `locked` periods.

- [ ] **Step 2: Run the test and verify failure**

Run: `node scripts/test-simples-period-contract.mjs`
Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement the migration**

Define UUID PKs, timestamps, FKs to existing fiscal/product/order entities where stable, JSONB evidence/metadata fields, indexes for competence/status/document/product, RLS enabled, and server-only access model consistent with existing admin services. `get_simples_period_gate_v1` must return at least `ready`, `blocking_issue_count`, `warning_count`, `reasons`.

- [ ] **Step 4: Apply in a transaction-safe verification path and inspect advisors**

Use Supabase DDL migration tooling for project `ssbesxgaijknwsjbsbcz`; then query `pg_tables`, `pg_constraint`, `pg_indexes` and RLS flags. Run security and performance advisors after DDL.
Expected: all new tables exist, RLS=true, constraints/indexes present, no new critical security advisor.

- [ ] **Step 5: Re-run contract test**

Run: `node scripts/test-simples-period-contract.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: add Simples Nacional period model and gates`.

---

### Task 2: Motor puro de classificacao e calculo

**Files:**
- Create: `supabase/functions/admin-service-intelligence-v1/simples-v1/types.ts`
- Create: `supabase/functions/admin-service-intelligence-v1/simples-v1/calculator.ts`
- Create: `supabase/functions/admin-service-intelligence-v1/simples-v1/classifier.ts`
- Create: `supabase/functions/admin-service-intelligence-v1/simples-v1/calculator.test.ts`
- Create: `supabase/functions/admin-service-intelligence-v1/simples-v1/classifier.test.ts`

**Interfaces:**
- `calculateRbt12(months: MonthlyRevenue[]): Rbt12Result`
- `calculateEffectiveRate(input: EffectiveRateInput): EffectiveRateResult`
- `classifyRevenueLine(input: RevenueClassificationInput): RevenueClassificationResult`
- `RevenueClassificationResult.taxBucket` values initially: `normal_resale|icms_st|monophase|cancellation|return|manual_review`.
- Every automatic special bucket must include `ruleId`, `ruleVersion`, `evidence` and `confidence`.

- [ ] **Step 1: Write failing calculator tests**

Cover exact 12-month summation, missing-month/history block, bracket boundary, effective-rate formula parameters from the supplied rule set, zero/negative recognized revenue behavior and deterministic cent rounding.

- [ ] **Step 2: Run calculator tests to verify failure**

Run: `deno test supabase/functions/admin-service-intelligence-v1/simples-v1/calculator.test.ts`
Expected: FAIL because calculator module is absent.

- [ ] **Step 3: Implement `types.ts` and `calculator.ts`**

The calculator receives all bracket/rule values as input; it must not hardcode future tax tables in frontend code. Return a full memory object containing inputs, selected bracket, nominal rate, deduction, effective rate, segregated base and estimated DAS.

- [ ] **Step 4: Run calculator tests**

Expected: PASS.

- [ ] **Step 5: Write failing classifier tests**

Assert: validated normal item -> `normal_resale`; proven ST rule -> `icms_st`; proven monophase rule -> `monophase`; `candidate|unknown|conflict|pending|blocked` -> `manual_review`; rule outside effective dates -> `manual_review`; cancellation/return evidence overrides ordinary sale classification.

- [ ] **Step 6: Implement `classifier.ts`**

Classification must be deterministic and evidence-driven. Name/category similarity alone must never produce `icms_st` or `monophase`.

- [ ] **Step 7: Run all domain tests**

Run: `deno test supabase/functions/admin-service-intelligence-v1/simples-v1/*.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

Commit message: `feat: add auditable Simples calculation engine`.

---

### Task 3: Coleta fiscal e reconciliacao da competencia

**Files:**
- Create: `supabase/functions/admin-service-intelligence-v1/simples-v1/reconciliation.ts`
- Create: `supabase/functions/admin-service-intelligence-v1/simples-v1/reconciliation.test.ts`
- Modify: `supabase/functions/admin-service-intelligence-v1/simples-v1/types.ts`

**Interfaces:**
- `reconcilePeriod(input: ReconciliationInput): ReconciliationResult`
- `ReconciliationResult` produces normalized revenue candidates plus issues with types from the spec.
- Timezone boundary is always `America/Cuiaba` for competence selection.

- [ ] **Step 1: Write failing reconciliation tests**

Cover: authorized invoice matched to order; invoice without order; order without invoice; duplicate access key; total mismatch; cancellation mismatch; return mismatch; invoice at month boundary in Cuiaba; missing fiscal profile; unresolved ST/monophase evidence.

- [ ] **Step 2: Run test to verify failure**

Run: `deno test supabase/functions/admin-service-intelligence-v1/simples-v1/reconciliation.test.ts`
Expected: FAIL because reconciliation module is absent.

- [ ] **Step 3: Implement normalized reconciliation**

Use access key as primary fiscal document identity when present, fall back only to stable Bling invoice identifier; never deduplicate by customer/name/amount. Preserve unmatched authorized invoices as revenue candidates plus blocking issue instead of discarding them.

- [ ] **Step 4: Run reconciliation tests**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: reconcile fiscal documents for Simples periods`.

---

### Task 4: Servico administrativo de pre-apuracao

**Files:**
- Create: `supabase/functions/admin-service-intelligence-v1/simples-v1/index.ts`
- Create: `supabase/functions/admin-service-intelligence-v1/simples-v1/index.test.ts`
- Modify: `supabase/functions/admin-service-intelligence-v1/index.ts`

**Interfaces:**
- GET/action `simples_summary&competence=YYYY-MM` -> current version, totals, statuses, issue counts, memory summary.
- POST/action `simples_recalculate` body `{competence_month:"YYYY-MM"}` -> recalculated draft/review period snapshot.
- GET/action `simples_issues&period_id=<uuid>` -> issues.
- POST/action `simples_resolve_issue` -> explicit resolution metadata; no silent ignore.
- POST/action `simples_lock` body `{period_id:<uuid>}` -> locks only when `get_simples_period_gate_v1.ready=true`.
- POST/action `simples_homologation_save` -> records accountant comparison values and notes.
- No endpoint for PGDAS transmission, DAS issuance or payment in v1.

- [ ] **Step 1: Write failing service tests with mocked Supabase/Bling dependencies**

Assert invalid competence -> 400; unauthenticated/non-admin -> existing gateway rejection; locked period recalc -> 409; incomplete Bling collection -> `review_required`; blocking issue -> lock rejected; clean gate -> lock succeeds; insufficient RBT12 -> explicit block.

- [ ] **Step 2: Run tests to verify failure**

Run: `deno test supabase/functions/admin-service-intelligence-v1/simples-v1/index.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the domain service**

Reuse current Bling OAuth/client infrastructure and existing fiscal evidence first. Collection must mark itself `complete|incomplete|failed|stale`; only `complete` can progress toward `ready`. Persist every validation run and hash/summary of the inputs used.

- [ ] **Step 4: Add narrow routing in the existing gateway**

Modify `admin-service-intelligence-v1/index.ts` only enough to route `simples_*` actions to `simples-v1/index.ts`, preserving current auth/CORS conventions and avoiding duplication of the domain implementation in the monolith.

- [ ] **Step 5: Run all Simples service/domain tests**

Run: `deno test supabase/functions/admin-service-intelligence-v1/simples-v1/*.test.ts`
Expected: PASS.

- [ ] **Step 6: Deploy Edge Function and run read-only smoke**

Deploy updated `admin-service-intelligence-v1`; call `simples_summary` for a test/current competence with no lock/write side effect first. Verify 200, structured response, and no errors in Edge/Postgres logs.

- [ ] **Step 7: Commit**

Commit message: `feat: expose Simples pre-calculation admin service`.

---

### Task 5: Tela Fiscal -> Simples Nacional no Vitrine/Admin

**Files:**
- Modify: `vitrine/admin/index.html`
- Create: `scripts/test-simples-admin-integration.mjs`

**Interfaces:**
- UI consumes Task 4 actions only.
- New route/view key: `simples_nacional`.
- No browser access to service-role credentials or direct fiscal table writes.

- [ ] **Step 1: Write failing structural integration test**

Create `scripts/test-simples-admin-integration.mjs` asserting: menu item `Fiscal -> Simples Nacional`; view container; competence selector; status banner; cards for receita/NF-e/ST/monofasica/DAS estimado/bloqueios; issue table; memory panel; homologation form; calls to `simples_summary`, `simples_recalculate`, `simples_issues`, `simples_lock`, `simples_homologation_save`; absence of any `transmit_pgdas`, `pay_das` or equivalent action.

- [ ] **Step 2: Run test to verify failure**

Run: `node scripts/test-simples-admin-integration.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement navigation and responsive view**

Follow the Admin's current menu/submenu pattern. Default to current/previous competence selection, with explicit status copy: `Ainda nao pode fechar` / `Pronto para conferir no PGDAS-D` / `Fechado para homologacao`.

- [ ] **Step 4: Implement issue drill-down and memory display**

Every blocking row shows plain-language reason plus technical evidence. Do not expose an `ignorar` action without reason/audit. Memory shows RBT12, bracket/rule version, calculation components and version comparison.

- [ ] **Step 5: Implement accountant comparison**

Fields: accountant total DAS, optional segregated values JSON/form fields, observation; show absolute and percentage difference to system calculation.

- [ ] **Step 6: Run structural test and manual responsive smoke**

Run: `node scripts/test-simples-admin-integration.mjs`
Expected: PASS.
Manual: desktop + mobile, menu accessible, no horizontal overflow, no unrelated Admin regression.

- [ ] **Step 7: Commit**

Commit message: `feat: add Simples Nacional closing screen to admin`.

---

### Task 6: Homologacao real, seguranca e runbook

**Files:**
- Create: `docs/projects/dona-antonia-operations-2/SIMPLES-NACIONAL-HOMOLOGATION-RUNBOOK.md`
- Modify only if evidence requires fixes: files from Tasks 1-5.

**Interfaces:**
- Produces an operational checklist and explicit future cutover gate.
- Does not enable automated filing/payment.

- [ ] **Step 1: Seed/configure only a verified 2026 rule set**

Insert/activate tax calculation rules only from verified official parameters for the company's actual Simples activity/regime. Special classification rules (ST/monophase) start `manual_only` unless their legal evidence and product identity are sufficient for automatic application.

- [ ] **Step 2: Recalculate one historical/current competence in homologation mode**

Use fiscal documents already available, without changing operational orders/NF-e. Record counts of documents, unmatched records, unresolved fiscal profiles and calculated totals.

- [ ] **Step 3: Compare against accountant output for the same competence**

Persist the accountant values through `simples_homologation_save`; investigate every difference before accepting the month. A difference must never be hidden by manual adjustment to make totals match.

- [ ] **Step 4: Run database and runtime verification**

Run Supabase security/performance advisors; inspect Edge/Postgres logs after recalculation; verify no new cron; verify no API/action for transmission/payment; verify locked-period mutation protection.

- [ ] **Step 5: Run complete regression suite**

Run:
- `deno test supabase/functions/admin-service-intelligence-v1/simples-v1/*.test.ts`
- `node scripts/test-simples-period-contract.mjs`
- `node scripts/test-simples-admin-integration.mjs`
- existing relevant smoke scripts under `scripts/`.
Expected: all PASS.

- [ ] **Step 6: Write runbook**

Document: monthly workflow; meaning of each status; how to resolve pendencies; how to compare with accountant; what evidence must be retained; recovery from Bling/API failure; prohibition on transmission in v1; future enablement criteria requiring explicit user authorization after consecutive homologated periods.

- [ ] **Step 7: Commit**

Commit message: `docs: add Simples Nacional homologation runbook`.

---

## Acceptance Criteria

1. Admin opens a competence and shows the fiscal revenue evidence and reconciliation status.
2. Unmatched/uncertain documents and fiscal classifications block readiness visibly.
3. ST or monophase segregation happens only with a valid, effective, evidenced rule.
4. RBT12 and estimated DAS are reproducible from the stored rule/version and revenue snapshot.
5. A clean period can be marked `ready` and then `locked`; locked data is immutable.
6. Accountant values can be recorded and differences shown without rewriting the system calculation.
7. No action transmits PGDAS-D, issues/pays DAS, or creates a fiscal side effect outside the existing evidence collection.
8. RLS/security advisors show no new critical finding introduced by the module.
9. Existing storefront, order, Bling, purchase XML and inventory flows continue unaffected.
10. The runbook explains the exact monthly human workflow and the gate required before any future automation of official filing.
