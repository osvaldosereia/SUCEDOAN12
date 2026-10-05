# Marketing Strategy Engine v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar `Marketing → Estratégia` como camada assistida de decisão comercial para Cestas/Kits, com score explicável, aprovações humanas separadas, reuso de campanhas/templates atuais, rastreamento e aprendizado sem ativar disparos automaticamente.

**Architecture:** Reutilizar catálogo canônico de Cestas/Kits, campanhas, snapshots, worker, runtime, templates Meta e relatórios já existentes. Adicionar uma camada de estratégia com estado próprio e ledger append-only, um motor determinístico testável separado da interpretação da IA, uma Edge Function Admin para orquestração e uma UI nova no Marketing. A estratégia pode materializar uma campanha existente, mas nunca cria transporte paralelo nem chama Graph no navegador.

**Tech Stack:** PostgreSQL/Supabase migrations e RPCs, Supabase Edge Functions/Deno, helpers `.mjs` puros testáveis em Node, JavaScript/CSS do Vitrine/Admin, Meta Cloud API via helpers server-side existentes, GitHub Actions/Node contract tests.

**Spec:** `docs/superpowers/specs/2026-10-05-marketing-cestas-kits-strategy-engine-design.md`

**Approved baseline:** especificação aprovada pelo usuário em 2026-10-05. A execução deve começar em worktree/branch nova criada a partir do `main` mais recente; no momento deste plano, `main` estava em `dce76791d8c628d58c24539b4ad8702ca7527eb1`.

## Global Constraints

- Marketing é centrado em **Cestas e Kits**; item avulso não é a unidade principal de decisão da v1.
- Pedido mínimo de **R$ 75** é regra dura; cada oferta/card deve ser válida individualmente.
- Catálogo canônico: `basket_commercial_catalog_v1`; somente oferta com `model_active=true`, `category_active=true`, `public_available>0`, `availability_reason='available'` e `sale_price>=75` é elegível.
- Fonte de preço público: `sale_price`; fonte do lote público: `public_lot_id`; imagem/nome: `image_url`/`public_name`.
- No máximo **1 campanha programada de Marketing por cliente por semana** na política inicial.
- `NAO_CONTATAR`, consentimento, telefone válido, deduplicação e gates atuais continuam server-side.
- A v1 não cria “combo de combos” para atingir R$ 75.
- Portão A: nenhuma submissão Meta antes da aprovação interna explícita.
- Portão B: aprovação/rejeição Meta não autoriza disparo.
- Portão C: nenhuma campanha é agendada/iniciada antes de aprovação de envio explícita.
- Mudança material de oferta, preço, estoque, composição, copy ou template invalida a aprovação correspondente.
- Nenhuma tarefa pode alterar `campaigns_enabled`, `ana_enabled` ou runtime `off`→`live` como efeito colateral.
- Navegador Admin nunca chama Meta Graph diretamente.
- Token/service role não pode aparecer em browser, logs de UI ou commits.
- Templates operacionais/protegidos nunca entram em limpeza automática.
- Exclusão Meta sempre exige confirmação humana e nunca apaga o histórico local.
- Fuso operacional: `America/Cuiaba`.
- Reutilizar `marketing_campaigns_v1`, snapshots, dispatches, worker e relatórios; não criar segundo motor de disparo.
- Reutilizar `whatsapp_templates_v1`, `admin-whatsapp-templates-v1`, `admin-whatsapp-template-carousel-v1` e helpers `_shared` existentes; não duplicar transporte Meta.
- TDD obrigatório: RED → implementação mínima → GREEN → regressões → commit pequeno.

## Review Focus

- Oferta aprovada perde estoque, muda preço ou cai abaixo de R$ 75 antes do envio: preflight deve bloquear sem substituir silenciosamente.
- Mesmo cliente entra por múltiplos segmentos/campanhas na mesma semana: snapshot/preflight deve deduplicar e respeitar o teto semanal.
- Template compatível existe, mas um novo é proposto: o sistema deve preferir reuso; template protegido nunca pode ser candidato à exclusão.
- Token público de atribuição é adulterado, expirado ou repetido: o endpoint deve rejeitar falsificação e manter idempotência sem permitir atribuição arbitrária a outro cliente.
- Base pequena ou resultado parcial: UI deve usar `Sinal inicial`/`Tendência` e não apresentar hipótese como aprendizado confirmado.

---

### Task 1: Fundação de dados, estados e auditoria da Estratégia

**Files:**
- Create: `supabase/migrations/20261005150000_marketing_strategy_foundation_v1.sql`
- Create: `scripts/test-marketing-strategy-foundation-v1.mjs`
- Modify: `.github/workflows/marketing-professional-ui-ci.yml`

**Interfaces:**
- Consumes: `whatsapp_accounts`, `whatsapp_templates_v1`, `marketing_campaigns_v1`, `customers`, `orders` e catálogo canônico de Cestas/Kits.
- Produces tables: `marketing_strategy_runs_v1`, `marketing_strategy_offers_v1`, `marketing_strategy_events_v1`, `marketing_strategy_weight_sets_v1`, `marketing_seasonality_rules_v1`, `marketing_template_lifecycle_v1`, `marketing_attribution_events_v1`.
- Produces nullable link: `marketing_campaigns_v1.strategy_id uuid references marketing_strategy_runs_v1(id)`.
- Produces RPCs:
  - `marketing_strategy_transition_v1(p_strategy_id uuid, p_expected_revision integer, p_to_status text, p_actor_user_id uuid, p_reason text default null) returns jsonb`;
  - `marketing_strategy_detail_v1(p_strategy_id uuid) returns jsonb`;
  - `marketing_strategy_append_event_v1(p_strategy_id uuid, p_event_type text, p_actor_user_id uuid, p_metadata jsonb default '{}'::jsonb) returns jsonb`.

- [ ] **Step 1: Write failing schema/state contract**

Assertar criação das sete tabelas, `strategy_id` em campanhas, RLS/revogação de acesso público, índices por período/status/campaign/template e ledger append-only. Assertar estados mínimos: `draft`, `awaiting_internal_approval`, `approved_internal`, `awaiting_meta`, `meta_approved`, `meta_rejected`, `ready_to_send`, `send_approved`, `scheduled`, `running`, `completed`, `discarded`, `blocked`.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-marketing-strategy-foundation-v1.mjs`
Expected: FAIL por migration ausente.

- [ ] **Step 3: Implement migration mínima**

Guardar no run: período, conta, objetivo, audience snapshot, format, copy snapshot, schedule suggestion, score, score breakdown, weight version/snapshot, evidence, revision, approval timestamps/users, template/campaign links e timestamps. `marketing_strategy_offers_v1` guarda `commercial_id`, `public_lot_id`, posição, preço/estoque snapshots, score e reasons. Eventos são append-only; nenhuma RPC de transição executa Meta ou worker.

- [ ] **Step 4: Run GREEN**

Run: `node scripts/test-marketing-strategy-foundation-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `db: criar fundacao do motor de estrategia`

---

### Task 2: Motor determinístico de elegibilidade e score explicável

**Files:**
- Create: `supabase/functions/_shared/marketing-strategy-engine-v1.mjs`
- Create: `scripts/test-marketing-strategy-engine-v1.mjs`

**Interfaces:**
- Consumes rows do `basket_commercial_catalog_v1`, histórico agregado, sazonalidade e weight set.
- Produces:
  - `isEligibleOffer(row, minimum=75) -> {eligible:boolean,reasons:string[]}`;
  - `scoreOffer(input, weights) -> {total:number,breakdown:object,reasons:string[]}`;
  - `rankOffers(inputs, weights, options) -> scored[]`;
  - `chooseFormat(scored, context) -> {format:'single'|'carousel',offer_ids:string[]}`.

- [ ] **Step 1: Write failing engine tests**

Cobrir: ativo/disponível; `public_available=0`; `availability_reason!='available'`; preço 74,99; preço 75,00; card inválido dentro de carrossel; score 0–100; bônus de exploração limitado; desempate estável; ausência de histórico sem inventar desempenho.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-marketing-strategy-engine-v1.mjs`
Expected: FAIL por helper ausente.

- [ ] **Step 3: Implement pure helper**

Pesos padrão version `v1`: disponibilidade/estoque 25, sazonalidade 20, adequação ao público 20, desempenho histórico 20, exploração 10, qualidade operacional 5. O helper não consulta banco, não chama IA e não altera dados.

- [ ] **Step 4: Add Review Focus test**

Simular oferta que era elegível e passa a preço 74,99; `isEligibleOffer` deve falhar com razão `below_minimum_order`.

- [ ] **Step 5: Run GREEN**

Run: `node scripts/test-marketing-strategy-engine-v1.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: adicionar score deterministico de estrategia`

---

### Task 3: API Admin para gerar, ler e revisar estratégias sem efeitos externos

**Files:**
- Create: `supabase/functions/admin-marketing-strategy-v1/index.ts`
- Create: `scripts/test-admin-marketing-strategy-v1.mjs`
- Modify: `supabase/config.toml` only if required by the repository deployment convention.
- Modify: `.github/workflows/marketing-professional-ui-ci.yml`

**Interfaces:**
- Consumes: Task 1 RPCs/tables, Task 2 helper, `basket_commercial_catalog_v1`, `marketing_campaigns_v1`, `marketing_campaign_dispatches_v1`, orders/customers and seasonality.
- Produces GET actions: `overview`, `detail`, `calendar`, `opportunities`, `learnings`.
- Produces POST actions: `generate`, `regenerate`, `edit_draft`, `request_internal_approval`, `approve_internal`, `discard`.
- `generate` and `approve_internal` are **local only** in this task: no Meta, no campaign schedule/start.

- [ ] **Step 1: Write failing Edge contract**

Assertar Admin auth, allowed origins, payload allowlist, no destination phone, no Graph URL/token literal, query do catálogo com `public_available>0`, filtro `sale_price>=75`, persistência de snapshots e ledger.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-admin-marketing-strategy-v1.mjs`
Expected: FAIL por Edge ausente.

- [ ] **Step 3: Implement read/generate flow**

`generate` carrega dados canônicos, roda score determinístico, escolhe single/carousel, salva run/offers/evidence e retorna justificativas factuais. Se IA não estiver configurada/disponível, gerar copy provisória determinística e marcar `copy_source='fallback'`; não falhar o score por ausência de IA.

- [ ] **Step 4: Implement internal approval state only**

`approve_internal` registra `actor_user_id`, timestamp e evento. Nesta tarefa não cria template, não chama Meta, não cria snapshot de campanha e não agenda envio.

- [ ] **Step 5: Run GREEN + existing backend regressions**

Run:
- `node scripts/test-admin-marketing-strategy-v1.mjs`
- `node scripts/test-admin-marketing-campaigns-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-drafts-v1.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: criar API Admin de estrategia`

---

### Task 4: Aba `Estratégia` e experiência assistida no Vitrine/Admin

**Files:**
- Create: `vitrine/admin/marketing/strategy-center.js`
- Create: `vitrine/admin/marketing/strategy-center.css`
- Modify: `vitrine/admin/marketing/marketing-polish.js`
- Modify: `vitrine/admin/marketing/marketing-polish.css`
- Modify: `vitrine/admin/index.html`
- Create: `scripts/test-whatsapp-marketing-strategy-ui-v1.mjs`
- Modify: `.github/workflows/marketing-professional-ui-ci.yml`

**Interfaces:**
- Consumes `admin-marketing-strategy-v1` actions from Task 3.
- Produces navegação `Visão geral | Estratégia | Templates | Campanhas | Públicos`, `openStrategyView()` e UI de recomendação/oportunidades/calendário/aprendizados.

- [ ] **Step 1: Write failing UI contract**

Assertar nova aba, título `Estratégia de Marketing`, ações `Gerar estratégia agora`, `Calendário`, `Configurações`, card `Recomendação da semana`, `Por que esta estratégia?`, oportunidades, calendário e aprendizados com evidência.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-strategy-ui-v1.mjs`
Expected: FAIL porque a aba não existe.

- [ ] **Step 3: Implement UI mínima e estados**

Estados visuais: sem estratégia, carregando, aguardando aprovação, aprovado internamente, Meta em análise/aprovado/rejeitado, pronta para envio, bloqueada, concluída. Esconder UUIDs/termos técnicos. Mobile mantém alvos >=44px.

- [ ] **Step 4: Add evidence wording tests**

`learnings` sem base mínima deve renderizar `Sinal inicial` ou `Tendência`; nunca `Aprendizado confirmado` sem `sample.delivered` e `sample.orders` suficientes.

- [ ] **Step 5: Run GREEN + UI regressions**

Run:
- `node scripts/test-whatsapp-marketing-strategy-ui-v1.mjs`
- `node scripts/test-whatsapp-marketing-papoai-shell-v1.mjs`
- `node scripts/test-whatsapp-marketing-papoai-responsive-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-simple-list-v1.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `ui: adicionar area Estrategia ao Marketing`

---

### Task 5: Reuso de template e Portão A → Meta sem transporte paralelo

**Files:**
- Create: `supabase/functions/_shared/marketing-template-strategy-v1.mjs`
- Modify: `supabase/functions/admin-marketing-strategy-v1/index.ts`
- Modify: `supabase/functions/admin-whatsapp-templates-v1/index.ts` only if a shared adapter is required; do not duplicate Graph code.
- Modify: `supabase/functions/admin-whatsapp-template-carousel-v1/index.ts` only if orchestration needs an exported/shared contract.
- Create: `scripts/test-marketing-strategy-template-gate-v1.mjs`

**Interfaces:**
- Consumes `whatsapp_templates_v1` and shared Meta helpers already used by template Admin/Carousel.
- Produces `findReusableTemplate(strategy, templates) -> reusable|null` and strategy action `submit_template`.
- `submit_template` is valid only when strategy status is `approved_internal` and a new template is actually required.

- [ ] **Step 1: Write RED for reuse-first**

Cobrir template MARKETING aprovado compatível => reusar e não chamar criação; template ausente => `template_required`; template protegido pode ser reutilizado somente se categoria/propósito compatíveis, mas nunca alterado/aposentado por estratégia.

- [ ] **Step 2: Write RED for Portão A**

Assertar que `submit_template` rejeita `draft`/`awaiting_internal_approval`; somente `approved_internal` pode executar helper Meta. Nenhum browser source contém `graph.facebook.com` ou token.

- [ ] **Step 3: Run RED**

Run: `node scripts/test-marketing-strategy-template-gate-v1.mjs`
Expected: FAIL.

- [ ] **Step 4: Implement minimal orchestration**

Para template simples usar o mesmo shared transport de `admin-whatsapp-templates-v1`; para carrossel usar o helper existente de carousel. Salvar `template_id`, nome, categoria, idioma, status Meta e evento. Rejeição Meta mantém estratégia revisável e nunca reenvia automaticamente.

- [ ] **Step 5: Run GREEN + Meta template regressions**

Run:
- `node scripts/test-marketing-strategy-template-gate-v1.mjs`
- `node scripts/test-whatsapp-meta-template-admin-v1.mjs`
- `node scripts/test-admin-whatsapp-template-carousel-v1.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: integrar aprovacao de template a estrategia`

---

### Task 6: Materializar estratégia em campanha existente e implementar Portão C

**Files:**
- Create: `supabase/migrations/20261005153000_marketing_strategy_campaign_bridge_v1.sql`
- Modify: `supabase/functions/admin-marketing-strategy-v1/index.ts`
- Modify: `vitrine/admin/marketing/strategy-center.js`
- Create: `scripts/test-marketing-strategy-campaign-bridge-v1.mjs`

**Interfaces:**
- Consumes `marketing_create_campaign_v1`, `marketing_create_campaign_snapshot_v1`, `marketing_transition_campaign_v1`, `marketing_schedule_campaign_v1` e worker atual.
- Produces RPC `marketing_strategy_materialize_campaign_v1(p_strategy_id uuid, p_actor_user_id uuid) returns jsonb`.
- Produces actions `materialize_campaign`, `approve_send`, `schedule_send`, `send_now`.

- [ ] **Step 1: Write RED bridge contract**

Assertar uma campanha por estratégia, link bidirecional, `filters` derivados do audience snapshot, `deep_link` derivado da oferta, template aprovado obrigatório e nenhum telefone individual no payload Admin.

- [ ] **Step 2: Write RED Portão C contract**

`materialize_campaign` cria somente rascunho/snapshot. `schedule_send`/`send_now` devem falhar antes de `approve_send`. Aprovação Meta sozinha não basta.

- [ ] **Step 3: Run RED**

Run: `node scripts/test-marketing-strategy-campaign-bridge-v1.mjs`
Expected: FAIL.

- [ ] **Step 4: Implement bridge**

Reusar RPCs existentes. Registrar em `marketing_strategy_events_v1` materialização, aprovação de envio e agendamento/início. Nunca escrever diretamente no outbox por fora do worker.

- [ ] **Step 5: Add weekly-frequency test**

No snapshot/preflight, cliente com campanha MARKETING já programada/enviada na mesma semana em `America/Cuiaba` é excluído/contabilizado como `weekly_frequency_cap` sem duplicar destinatário.

- [ ] **Step 6: Run GREEN + campaign regressions**

Run:
- `node scripts/test-marketing-strategy-campaign-bridge-v1.mjs`
- `node scripts/test-admin-marketing-campaign-scheduling-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-execution-ui-v1.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat: materializar estrategia em campanha existente`

---

### Task 7: Preflight obrigatório imediatamente antes do envio

**Files:**
- Create: `supabase/functions/_shared/marketing-strategy-preflight-v1.mjs`
- Modify: `supabase/functions/admin-marketing-strategy-v1/index.ts`
- Create: `scripts/test-marketing-strategy-preflight-v1.mjs`

**Interfaces:**
- Consumes current rows from `basket_commercial_catalog_v1`, `whatsapp_templates_v1`, channel/runtime, consent/suppression and campaign snapshot.
- Produces `runStrategyPreflight(context) -> {ok:boolean,blocking_reasons:string[],changes:object}`.

- [ ] **Step 1: Write RED preflight matrix**

Cobrir: estoque zerou; preço mudou; preço caiu abaixo R$75; lote público mudou; template deixou de APPROVED; canal inativo; `campaigns_enabled=false`; consentimento revogado; domingo/feriado fechado; mudança de copy/template após aprovação; runtime off.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-marketing-strategy-preflight-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement fail-closed preflight**

Mudança material retorna `ok=false`, move estratégia para `blocked` ou revisão e registra evento. O helper **somente lê** runtime; não habilita campanhas nem ANA.

- [ ] **Step 4: Add explicit production-safety assertions**

Buscar no diff/arquivo por qualquer `campaigns_enabled=true`, `ana_enabled=true` ou update de runtime para `live`; contrato deve falhar se existir na implementação da estratégia.

- [ ] **Step 5: Run GREEN**

Run: `node scripts/test-marketing-strategy-preflight-v1.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: bloquear envio com preflight comercial`

---

### Task 8: Links opacos e telemetria da jornada site → carrinho → checkout

**Files:**
- Create: `supabase/functions/_shared/marketing-attribution-token-v1.mjs`
- Create: `supabase/functions/marketing-attribution-v1/index.ts`
- Create: `vitrine/marketing-attribution.js`
- Modify: `index.html`
- Modify: `vitrine/index.html`
- Modify: `supabase/functions/storefront-v2/index.ts`
- Create: `scripts/test-marketing-attribution-v1.mjs`

**Interfaces:**
- Produces signed opaque token containing only opaque IDs/expiry, authenticated with server secret; no raw customer phone/CPF in URL.
- Public page accepts `mkt=<token>`, stores token temporariamente na sessão e envia events `landing_open`, `basket_add`, `checkout_start` quando disponíveis.
- `storefront-v2` accepts optional `marketing_token` and persists validated attribution reference in order/checkout metadata without trusting client-supplied campaign/customer IDs.

- [ ] **Step 1: Write RED token/security tests**

Cobrir valid token, tampered signature, expired token, altered customer/campaign payload, duplicate event idempotency, token sem customer permitido para campanha ampla quando configurado.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-marketing-attribution-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement token helper + ingestion Edge**

`marketing-attribution-v1` valida assinatura/expiry, resolve IDs server-side e insere apenas em `marketing_attribution_events_v1`; não expõe service role.

- [ ] **Step 4: Implement storefront propagation**

Capturar `mkt` na entrada, manter em `sessionStorage`, anexar ao checkout e emitir eventos sem bloquear compra se tracking falhar.

- [ ] **Step 5: Add no-PII/public regression tests**

URL/token não pode conter telefone, CPF, email ou UUID legível em query separada. Tracking inválido nunca impede carregamento do catálogo/checkout.

- [ ] **Step 6: Run GREEN + checkout regressions**

Run:
- `node scripts/test-marketing-attribution-v1.mjs`
- existing storefront/checkout contract tests selected by `git grep -l 'storefront-v2\|create_vitrine_cart_order_v1' scripts/*.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat: rastrear jornada de marketing no storefront`

---

### Task 9: Atribuição de pedido/receita e relatório comercial por Cesta/Kit

**Files:**
- Create: `supabase/migrations/20261005160000_marketing_strategy_attribution_v1.sql`
- Modify: `supabase/functions/admin-marketing-campaign-report-v1/index.ts`
- Modify: `vitrine/admin/marketing/campaign-report.js`
- Modify: `vitrine/admin/marketing/campaign-report.css`
- Create: `scripts/test-marketing-strategy-attribution-report-v1.mjs`

**Interfaces:**
- Produces RPC/view `marketing_campaign_attribution_summary_v1` com receita `direct` e `assisted` separadas.
- Direct attribution wins when order carries valid marketing token/reference.
- Assisted attribution window default: 7 days, only when no more specific later campaign attribution exists.
- Basket/Kit identification prefers order item metadata `basket_id`, `basket_lot_id` and canonical equivalents.

- [ ] **Step 1: Write RED attribution cases**

Cobrir pedido direto único, evento duplicado, pedido cancelado, direct + assisted overlap, campanha posterior mais específica, cesta identificada por item metadata, pedido sem cesta.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-marketing-strategy-attribution-report-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement idempotent attribution SQL**

Nunca duplicar pedido/receita; manter `direct_revenue` e `assisted_revenue` em campos separados; cancelamento remove/neutraliza receita conforme status canônico sem apagar evento histórico.

- [ ] **Step 4: Enrich existing campaign report**

Adicionar cliques/landing/carrinho/checkout/pedidos/conversão/receita direta/assistida/ticket/receita por 1.000 entregues sem quebrar os atuais `sent/delivered/read/failed`.

- [ ] **Step 5: Run GREEN + report regression**

Run:
- `node scripts/test-marketing-strategy-attribution-report-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-report-v1.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: atribuir pedidos e receita as campanhas`

---

### Task 10: Aprendizados, sazonalidade e experimentos explicáveis

**Files:**
- Create: `supabase/functions/_shared/marketing-strategy-learning-v1.mjs`
- Modify: `supabase/functions/admin-marketing-strategy-v1/index.ts`
- Modify: `vitrine/admin/marketing/strategy-center.js`
- Create: `scripts/test-marketing-strategy-learning-v1.mjs`

**Interfaces:**
- Consumes aggregated campaign/attribution metrics, seasonality rules and prior runs.
- Produces `classifyEvidence(sample) -> 'insufficient'|'signal'|'trend'|'supported'` and `buildLearningSummary(rows) -> insight[]`.
- Experiment record must store hypothesis and primary metric **before** campaign send approval.

- [ ] **Step 1: Write RED evidence tests**

Base sem campanhas/entregas/pedidos => `insufficient`; base pequena => `signal`; comparação maior e consistente => `trend`/`supported`. Nunca gerar números ausentes.

- [ ] **Step 2: Write RED experiment tests**

Após `send_approved`, hipótese e `primary_metric` ficam imutáveis para aquele experimento; resultado pode ser `inconclusive`.

- [ ] **Step 3: Run RED**

Run: `node scripts/test-marketing-strategy-learning-v1.mjs`
Expected: FAIL.

- [ ] **Step 4: Implement learning helper and API summaries**

IA pode transformar fatos em texto, mas recebe evidence JSON e deve retornar referências às métricas usadas. Fallback determinístico sempre disponível.

- [ ] **Step 5: Run GREEN**

Run: `node scripts/test-marketing-strategy-learning-v1.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: adicionar aprendizado explicavel ao marketing`

---

### Task 11: Ciclo de vida de templates, limpeza segura e regressão final

**Files:**
- Modify: `supabase/functions/admin-marketing-strategy-v1/index.ts`
- Modify: `supabase/functions/admin-whatsapp-templates-v1/index.ts`
- Modify: `vitrine/admin/marketing/strategy-center.js`
- Modify: `vitrine/admin/marketing/template-center.js`
- Create: `scripts/test-marketing-template-lifecycle-v1.mjs`
- Create: `scripts/test-marketing-strategy-regression-v1.mjs`
- Modify: `.github/workflows/marketing-professional-ui-ci.yml`
- Modify: `.github/workflows/marketing-campaign-execution-ui-ci.yml`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Produces lifecycle actions `retire_template`, `mark_cleanup_candidate`, `confirm_meta_delete`.
- Candidate rule v1: MARKETING, `protected=false`, sem campanha ativa/agendada/futura, sem estratégia aprovada dependente, `last_used_at <= now()-60 days`, sem pendência operacional.
- `confirm_meta_delete` requires explicit Admin action and delegates to existing Meta template delete transport; local history remains.

- [ ] **Step 1: Write RED lifecycle contract**

Cobrir protected=true; dependência de campanha; dependência de estratégia; último uso <60d; último uso >=60d; exclusão Meta confirmada; cache/histórico preservados após exclusão.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-marketing-template-lifecycle-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement lifecycle + UI de revisão**

Mostrar `Em uso`, `Aposentado`, `Candidato à exclusão`, `Excluído da Meta`. Ação destrutiva usa confirmação explícita e exibe dependências antes de habilitar.

- [ ] **Step 4: Write consolidated regression contract**

Assertar:
- Estratégia não contém direct Graph/browser secrets;
- runtime não é habilitado;
- R$75 aplicado;
- Portões A/B/C presentes;
- campaign worker continua sendo o transporte;
- Templates/Campanhas/Públicos/Atendimento/Cestas continuam referenciando contratos canônicos existentes.

- [ ] **Step 5: Run full GREEN suite**

Run pelo menos:
- `node scripts/test-marketing-strategy-foundation-v1.mjs`
- `node scripts/test-marketing-strategy-engine-v1.mjs`
- `node scripts/test-admin-marketing-strategy-v1.mjs`
- `node scripts/test-whatsapp-marketing-strategy-ui-v1.mjs`
- `node scripts/test-marketing-strategy-template-gate-v1.mjs`
- `node scripts/test-marketing-strategy-campaign-bridge-v1.mjs`
- `node scripts/test-marketing-strategy-preflight-v1.mjs`
- `node scripts/test-marketing-attribution-v1.mjs`
- `node scripts/test-marketing-strategy-attribution-report-v1.mjs`
- `node scripts/test-marketing-strategy-learning-v1.mjs`
- `node scripts/test-marketing-template-lifecycle-v1.mjs`
- `node scripts/test-marketing-strategy-regression-v1.mjs`
- existing Marketing Professional UI CI tests
- existing Marketing Audience Progressive CI tests
- existing Marketing Campaign Execution UI CI tests
- existing WhatsApp Meta Central CI tests

Expected: all PASS.

- [ ] **Step 6: Production-safe deployment checkpoint**

Deploy migrations/Edges only after branch review. Verify in canonical Supabase that new tables/functions are present and that both WhatsApp runtimes remain unchanged. Do **not** create a real Meta template or send a real Marketing message as part of deployment verification unless separately and explicitly authorized.

- [ ] **Step 7: Commit**

Commit: `feat: concluir motor assistido de estrategia de marketing`

---

## Execution Order and PR Boundaries

Implementar em **11 PRs pequenos** na ordem das Tasks. Tasks 1–4 formam a primeira entrega utilizável em modo somente estratégia/local. Task 5 adiciona o Portão Meta. Tasks 6–7 conectam execução existente sem ativá-la. Tasks 8–10 adicionam telemetria/aprendizado. Task 11 fecha lifecycle e regressões.

Não juntar Tasks 1–7 em um único PR: o maior risco do projeto é acoplar recomendação, Meta e envio antes de cada gate estar provado isoladamente.

## Rollout Gates

1. **Gate Local:** após Tasks 1–4, Estratégia gera/revisa recomendações sem tocar Meta/campanha live.
2. **Gate Meta:** após Task 5, submissão Meta fica disponível somente por clique explícito do operador.
3. **Gate Campaign:** após Tasks 6–7, materialização/preflight funcionam; `campaigns_enabled` continua como encontrado.
4. **Gate Measurement:** após Tasks 8–10, tracking e aprendizado entram sem bloquear checkout.
5. **Gate Lifecycle:** após Task 11, limpeza continua humana e auditada.

## Final Verification Before Merge/Production

- Confirmar branch criada do `main` mais recente antes da execução.
- Executar todos os contratos novos e as quatro suítes de regressão de Marketing/WhatsApp.
- Revisar diff procurando alteração acidental de canal, PapoAI, ANA, runtime e `campaigns_enabled`.
- Confirmar que não existe Graph URL/token em `vitrine/**`.
- Confirmar que `basket_commercial_catalog_v1` continua sendo a única fonte de elegibilidade comercial de Cestas/Kits.
- Confirmar que nenhum deploy cria template Meta, agenda campanha ou envia mensagem por si só.
- Confirmar que links de atribuição não expõem telefone/CPF/email.
- Confirmar que pedido/receita são idempotentes e direct/assisted permanecem separados.
- Confirmar que exclusão Meta preserva histórico local.
