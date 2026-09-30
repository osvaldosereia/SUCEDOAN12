# Simples Nacional Pre-Apuracao Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar no Vitrine/Admin um modulo Fiscal -> Simples Nacional que consolida a competencia mensal, coleta e reconcilia evidencias fiscais, segrega receitas somente com base segura, calcula uma previa auditavel do DAS, exporta a memoria de conferencia e permite homologacao contra o contador sem transmitir PGDAS-D nem efetuar pagamento.

**Architecture:** O modulo sera uma camada de fechamento sobre o Supabase canonico e o Bling. Regras e snapshots ficam versionados no banco; coleta, reconciliacao, classificacao e calculo ficam em modulos TypeScript pequenos/testaveis; o gateway administrativo existente expoe somente operacoes autenticadas; a UI entra no Admin atual sem criar painel ou ERP paralelo.

**Tech Stack:** PostgreSQL 17 / Supabase, Supabase Edge Functions em Deno + TypeScript, `@supabase/supabase-js`, Vitrine/Admin HTML/CSS/JS existente, Bling v3 via infraestrutura OAuth atual, scripts Node `.mjs` para smoke/contract tests.

**Spec:** `docs/superpowers/specs/2026-09-30-simples-nacional-pre-apuracao-design.md`

## Global Constraints

- Supabase canonico: `ssbesxgaijknwsjbsbcz`; nao criar projeto paralelo.
- Bling continua ERP operacional e principal evidencia externa das NF-e de saida.
- Pedidos locais servem para conciliacao; nunca substituem documento fiscal autorizado.
- Nenhuma classificacao incerta entra silenciosamente como segregacao fiscal.
- V1 nao transmite PGDAS-D, nao gera DAS por side effect externo e nao efetua pagamento.
- Competencia `locked` e imutavel; correcao posterior cria nova versao `superseded`/nova versao ativa.
- Regras tributarias e parametros de calculo sao versionados por vigencia.
- Nenhuma credencial fiscal/service-role vai para o frontend.
- Novas tabelas publicas usam RLS e seguem o padrao server-only do projeto; nenhuma policy permissiva e criada apenas para silenciar advisor.
- Nao criar novo cron/polling; coleta/recalculo sao sob demanda em V1.
- Nao refatorar em massa `vitrine/admin/index.html` ou o gateway monolitico nesta entrega.
- Timezone operacional/fiscal para fronteiras mensais: `America/Cuiaba`.

## File Structure

- Create `supabase/migrations/20260930133000_simples_nacional_pre_apuracao_v1.sql` — tabelas, constraints, indexes, RLS e gates.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/types.ts` — contratos do dominio.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/source.ts` — adaptador de evidencias fiscais/Bling.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/reconciliation.ts` — conciliacao de NF-e/pedidos/cancelamentos/devolucoes.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/classifier.ts` — classificacao normal/ST/monofasico/revisao.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/calculator.ts` — RBT12, faixa, aliquota efetiva e memoria.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/export.ts` — CSV + HTML imprimivel da memoria de conferencia, sem side effect externo.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/index.ts` — servico HTTP interno do dominio.
- Create `supabase/functions/admin-service-intelligence-v1/simples-v1/*.test.ts` — testes Deno.
- Modify `supabase/functions/admin-service-intelligence-v1/index.ts` — roteamento estreito das acoes `simples_*`.
- Modify `vitrine/admin/index.html` — menu, tela, cards, pendencias, memoria, exportacao e homologacao.
- Create `scripts/test-simples-period-contract.mjs` — contrato DDL/API.
- Create `scripts/test-simples-admin-integration.mjs` — smoke estrutural da UI/gateway.
- Create `docs/projects/dona-antonia-operations-2/SIMPLES-NACIONAL-HOMOLOGATION-RUNBOOK.md` — rotina mensal e criterio de cutover futuro.

## Review Focus

- NF-e autorizada na virada do mes deve cair na competencia correta em `America/Cuiaba`; Task 3.
- Pedido sem NF-e ou NF-e sem pedido deve bloquear `ready`, sem excluir a evidencia; Task 3.
- Perfil `candidate|unknown|conflict|pending|blocked` nao pode receber ST/monofasico automatico; Task 2.
- Periodo `locked` nao pode ser recalculado/sobrescrito; Tasks 1 e 4.
- Historico insuficiente para RBT12 nao pode produzir aliquota silenciosamente; Tasks 2 e 4.

---

### Task 1: Persistencia, versionamento e gates

**Files:**
- Create: `supabase/migrations/20260930133000_simples_nacional_pre_apuracao_v1.sql`
- Create: `scripts/test-simples-period-contract.mjs`

**Interfaces:**
- Tables: `simples_rule_sets`, `simples_tax_classification_rules`, `simples_periods`, `simples_revenue_lines`, `simples_reconciliation_issues`, `simples_validation_runs`, `simples_homologation_checks`.
- SQL function: `get_simples_period_gate_v1(p_period_id uuid) returns jsonb`.
- Period statuses: `draft|review_required|ready|locked|superseded`.
- Line statuses: `classified|manual_review|blocked`.
- Issue statuses: `open|resolved|ignored_with_reason`.

- [ ] **Step 1: Write failing contract test**

`test-simples-period-contract.mjs` must assert all seven tables, unique `(competence_month,version)`, valid status constraints, RLS enabled, key indexes, gate function and lock guard.

- [ ] **Step 2: Run and verify failure**

Run: `node scripts/test-simples-period-contract.mjs`
Expected: FAIL because migration is absent.

- [ ] **Step 3: Implement migration**

Use UUID PKs, timestamps, FKs to stable existing entities, JSONB evidence/metadata, indexes on competence/status/document/product. `get_simples_period_gate_v1` returns at least `{ready,blocking_issue_count,warning_count,reasons}`. Trigger/guard rejects update/delete that mutates a `locked` snapshot except explicit creation of a new version.

- [ ] **Step 4: Apply DDL and verify**

Apply with Supabase migration tooling to `ssbesxgaijknwsjbsbcz`; query tables/constraints/indexes/RLS and run security/performance advisors.
Expected: schema valid, RLS=true, no new critical advisor.

- [ ] **Step 5: Re-run contract test**

Expected: PASS.

- [ ] **Step 6: Commit**

`feat: add Simples Nacional period model and gates`

---

### Task 2: Motor puro de classificacao e calculo

**Files:**
- Create: `simples-v1/types.ts`
- Create: `simples-v1/classifier.ts`
- Create: `simples-v1/calculator.ts`
- Create: `simples-v1/classifier.test.ts`
- Create: `simples-v1/calculator.test.ts`

(Os caminhos acima sao relativos a `supabase/functions/admin-service-intelligence-v1/`.)

**Interfaces:**
- `classifyRevenueLine(input: RevenueClassificationInput): RevenueClassificationResult`
- `calculateRbt12(months: MonthlyRevenue[]): Rbt12Result`
- `calculateEffectiveRate(input: EffectiveRateInput): EffectiveRateResult`
- Tax buckets: `normal_resale|icms_st|monophase|cancellation|return|manual_review`.
- Special bucket automatico exige `ruleId`, `ruleVersion`, `evidence`, `confidence`.

- [ ] **Step 1: Write failing calculator tests**

Cover 12-month sum, missing history block, bracket boundary, effective-rate formula using supplied rule-set values, zero/negative recognized revenue and deterministic cent rounding.

- [ ] **Step 2: Run calculator test**

Run: `deno test supabase/functions/admin-service-intelligence-v1/simples-v1/calculator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement types + calculator**

No tax bracket hardcoded in frontend; calculator receives all rule parameters and returns full memory `{inputs,bracket,nominalRate,deduction,effectiveRate,segregatedBases,estimatedDas}`.

- [ ] **Step 4: Write failing classifier tests**

Assert validated normal -> `normal_resale`; proven ST -> `icms_st`; proven monophase -> `monophase`; unresolved states -> `manual_review`; rule outside vigencia -> `manual_review`; cancellation/return evidence overrides ordinary classification.

- [ ] **Step 5: Implement classifier and run all tests**

Run: `deno test supabase/functions/admin-service-intelligence-v1/simples-v1/{calculator,classifier}.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

`feat: add auditable Simples calculation engine`

---

### Task 3: Coleta fiscal e reconciliacao

**Files:**
- Create: `simples-v1/source.ts`
- Create: `simples-v1/source.test.ts`
- Create: `simples-v1/reconciliation.ts`
- Create: `simples-v1/reconciliation.test.ts`
- Modify: `simples-v1/types.ts`

**Interfaces:**
- `collectFiscalEvidence(input: FiscalEvidenceRequest, deps: FiscalSourceDeps): Promise<FiscalEvidenceResult>`
- `FiscalEvidenceResult.collectionStatus`: `complete|incomplete|failed|stale`.
- `reconcilePeriod(input: ReconciliationInput): ReconciliationResult`.
- Access key is primary document identity; stable Bling NF-e id is fallback.

- [ ] **Step 1: Write failing source tests**

Mock Bling/current fiscal tables; test authorized NF-e, cancelled NF-e, stale/incomplete response, dedupe by 44-digit access key and preservation of source identifiers.

- [ ] **Step 2: Implement source adapter**

Reuse existing Bling OAuth/rate-limit conventions and local `order_fiscal_controls`/`dispatch_fiscal_jobs` evidence. Do not create/update operational NF-e while collecting.

- [ ] **Step 3: Write failing reconciliation tests**

Cover matched invoice/order; invoice without order; order without invoice; duplicate access key; total mismatch; cancel mismatch; return mismatch; timezone boundary; missing profile; unresolved ST/monophase.

- [ ] **Step 4: Implement reconciliation**

Unmatched authorized NF-e remains a revenue candidate plus blocking issue. Never dedupe by customer/name/value.

- [ ] **Step 5: Run tests**

Run: `deno test supabase/functions/admin-service-intelligence-v1/simples-v1/{source,reconciliation}.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

`feat: collect and reconcile fiscal evidence for Simples`

---

### Task 4: Servico administrativo de pre-apuracao e exportacao

**Files:**
- Create: `simples-v1/export.ts`
- Create: `simples-v1/export.test.ts`
- Create: `simples-v1/index.ts`
- Create: `simples-v1/index.test.ts`
- Modify: `supabase/functions/admin-service-intelligence-v1/index.ts`

**Interfaces:**
- GET `simples_summary&competence=YYYY-MM` -> current version/totals/status/issues/memory.
- POST `simples_recalculate` `{competence_month}` -> draft/review snapshot.
- GET `simples_issues&period_id=<uuid>` -> issues.
- POST `simples_resolve_issue` -> audited resolution.
- POST `simples_lock` `{period_id}` -> only if gate ready.
- POST `simples_homologation_save` -> accountant comparison.
- GET `simples_export&period_id=<uuid>&format=csv|html` -> deterministic report body/download metadata.
- No PGDAS/DAS/payment action in V1.

- [ ] **Step 1: Write failing export tests**

Assert CSV and HTML contain competence, rule version, RBT12, segregated totals, estimated DAS, issue summary and calculation timestamp; locked export is reproducible from snapshot.

- [ ] **Step 2: Write failing service tests**

Assert invalid competence -> 400; locked recalc -> 409; incomplete collection -> review; blocking issue -> lock rejected; clean gate -> lock succeeds; insufficient RBT12 -> explicit block; export unknown period -> 404.

- [ ] **Step 3: Implement export + domain service**

Recalculation persists validation run/hash and never mutates operational orders/NF-e. Collection must be `complete` before `ready`.

- [ ] **Step 4: Route `simples_*` narrowly in gateway**

Preserve current admin auth/CORS. Keep implementation in `simples-v1`, not copied into monolith.

- [ ] **Step 5: Run tests**

Run: `deno test supabase/functions/admin-service-intelligence-v1/simples-v1/*.test.ts`
Expected: PASS.

- [ ] **Step 6: Deploy and read-only smoke**

Deploy updated `admin-service-intelligence-v1`; call `simples_summary` first with no lock/write; inspect Edge/Postgres logs.

- [ ] **Step 7: Commit**

`feat: expose Simples pre-calculation admin service`

---

### Task 5: Tela Fiscal -> Simples Nacional

**Files:**
- Modify: `vitrine/admin/index.html`
- Create: `scripts/test-simples-admin-integration.mjs`

**Interfaces:**
- UI consumes only Task 4 actions.
- View key: `simples_nacional`.
- No direct fiscal table writes from browser.

- [ ] **Step 1: Write failing integration smoke**

Assert menu/submenu, competence selector, status banner, cards (receita, NF-e, ST, monofasica, DAS estimado, bloqueios), issues table, memory panel, export buttons, homologation form; API calls to all supported `simples_*`; explicit absence of transmission/payment actions.

- [ ] **Step 2: Run and verify failure**

Run: `node scripts/test-simples-admin-integration.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement responsive screen**

Use current menu pattern. Status copy: `Ainda nao pode fechar`, `Pronto para conferir no PGDAS-D`, `Fechado para homologacao`.

- [ ] **Step 4: Implement pendencias + memoria + exportacao**

Every issue shows plain-language reason and evidence. Export buttons call `simples_export` for CSV and print-friendly HTML/PDF-via-browser.

- [ ] **Step 5: Implement accountant comparison**

Fields: contador DAS total, optional segregated comparison values, observation; show absolute and percentage difference without changing system result.

- [ ] **Step 6: Verify UI**

Run `node scripts/test-simples-admin-integration.mjs` -> PASS. Manual desktop/mobile smoke: menu reachable, no horizontal overflow, no unrelated regression.

- [ ] **Step 7: Commit**

`feat: add Simples Nacional closing screen to admin`

---

### Task 6: Homologacao real, seguranca e runbook

**Files:**
- Create: `docs/projects/dona-antonia-operations-2/SIMPLES-NACIONAL-HOMOLOGATION-RUNBOOK.md`
- Modify previous files only if homologation evidence requires a fix.

**Interfaces:**
- Produces monthly operator checklist and future cutover gate.
- Does not enable official filing/payment.

- [ ] **Step 1: Load only verified 2026 rule set**

Activate calculation rules only from verified official parameters applicable to the company's actual Simples activity. ST/monophase starts `manual_only` unless legal/product evidence is sufficient.

- [ ] **Step 2: Recalculate one competence in homologation mode**

Use fiscal evidence already available; record documents, unmatched records, unresolved profiles, segregations and estimated DAS without changing orders/NF-e.

- [ ] **Step 3: Compare with accountant output**

Persist accountant values using `simples_homologation_save`; investigate every difference. Never alter system calculation merely to force equality.

- [ ] **Step 4: Run security/runtime verification**

Run Supabase security/performance advisors; inspect Edge/Postgres logs; confirm no new cron; confirm no filing/payment endpoint; confirm lock protection.

- [ ] **Step 5: Run complete regression suite**

Run:
- `deno test supabase/functions/admin-service-intelligence-v1/simples-v1/*.test.ts`
- `node scripts/test-simples-period-contract.mjs`
- `node scripts/test-simples-admin-integration.mjs`
- existing relevant scripts under `scripts/`.
Expected: all PASS.

- [ ] **Step 6: Write runbook**

Document monthly workflow, statuses, resolving pendencies, accountant comparison, retained evidence, Bling/API failure recovery, exports, V1 prohibition on transmission/payment and future enablement criteria requiring explicit authorization after consecutive homologated periods.

- [ ] **Step 7: Commit**

`docs: add Simples Nacional homologation runbook`

---

## Acceptance Criteria

1. Admin opens a competence and shows fiscal evidence and reconciliation status.
2. Unmatched/uncertain documents and fiscal classifications visibly block readiness.
3. ST/monophase segregation occurs only with valid, effective, evidenced rule.
4. RBT12 and estimated DAS are reproducible from stored rule/version and snapshot.
5. Clean period can become `ready` then `locked`; locked data is immutable.
6. Accountant values can be stored and differences shown without rewriting system calculation.
7. CSV and print-friendly report reproduce the period memory and values for PGDAS-D conference.
8. No action transmits PGDAS-D, issues/pays DAS or mutates external fiscal documents.
9. Supabase advisors show no new critical finding introduced by the module.
10. Existing storefront, order, Bling, purchase XML and inventory flows remain unaffected.
11. Runbook documents the monthly human workflow and future filing-automation gate.
