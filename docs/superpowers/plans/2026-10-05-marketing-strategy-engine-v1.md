# Marketing Strategy Engine v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar `Marketing → Estratégia` como camada assistida de decisão comercial para Cestas/Kits, com score explicável, aprovações humanas separadas, reuso do motor atual de campanhas/templates, rastreamento e aprendizado sem ativar disparos automaticamente.

**Architecture:** Reutilizar `basket_commercial_catalog_v1`, `marketing_campaigns_v1`, snapshots, worker, runtime, `whatsapp_templates_v1` e relatórios. Adicionar persistência própria para estratégia, um motor determinístico testável separado da IA, uma Edge Function Admin de orquestração, uma nova aba de UI e uma camada mínima de atribuição. A estratégia pode materializar campanha no motor existente, mas nunca cria transporte paralelo e nunca chama Graph no navegador.

**Tech Stack:** PostgreSQL/Supabase migrations e RPCs, Supabase Edge Functions/Deno, helpers `.mjs` puros testáveis em Node, JavaScript/CSS do Vitrine/Admin, Meta Cloud API apenas via helpers server-side existentes, GitHub Actions/Node contract tests.

**Spec:** `docs/superpowers/specs/2026-10-05-marketing-cestas-kits-strategy-engine-design.md`

**Approved baseline:** especificação aprovada pelo usuário em 2026-10-05. A execução deve começar em worktree/branch nova criada do `main` mais recente; durante este planejamento o `main` estava em `dce76791d8c628d58c24539b4ad8702ca7527eb1`.

## Global Constraints

- Marketing é centrado em **Cestas e Kits**; item avulso não é a unidade principal de decisão da v1.
- Pedido mínimo de **R$ 75** é regra dura; cada oferta/card precisa ser válida individualmente.
- Elegibilidade comercial vem de `basket_commercial_catalog_v1`: `model_active=true`, `category_active=true`, `public_available>0`, `availability_reason='available'`, `sale_price>=75`.
- Fonte pública de preço/lote/nome/imagem: `sale_price`, `public_lot_id`, `public_name`, `image_url`.
- Entrega grátis só pode aparecer quando a regra comercial e a área atendida confirmarem elegibilidade; a estratégia nunca inventa frete/área.
- Público inicial padrão: **todos os clientes elegíveis**, após consentimento, supressão, telefone válido, deduplicação e teto semanal.
- No máximo **1 campanha programada de Marketing por cliente por semana** na política inicial.
- `NAO_CONTATAR` e todos os gates atuais continuam server-side.
- A v1 não cria “combo de combos” para atingir o mínimo.
- Portão A: nenhuma submissão Meta antes da aprovação interna explícita.
- Portão B: aprovação/rejeição Meta não autoriza disparo.
- Portão C: nenhuma campanha é agendada/iniciada antes de aprovação de envio explícita.
- Mudança material de oferta, preço, estoque, lote/composição, copy ou template invalida a aprovação correspondente.
- Nenhuma tarefa altera `campaigns_enabled`, `ana_enabled` ou runtime `off`→`live` como efeito colateral.
- Navegador Admin nunca chama Meta Graph diretamente.
- Token/service role não aparece em browser, logs de UI ou commits.
- Templates operacionais/protegidos nunca entram em limpeza automática.
- Exclusão Meta sempre exige confirmação humana e nunca apaga histórico local.
- Fuso operacional: `America/Cuiaba`.
- Configuração de pesos e sazonalidade deve ser versionada e editável no Admin, sem alterar dados canônicos de produto/cliente/pedido.
- Reutilizar `marketing_campaigns_v1`, snapshots, dispatches, worker e relatórios; não criar segundo motor de disparo.
- Reutilizar `whatsapp_templates_v1`, `admin-whatsapp-templates-v1`, `admin-whatsapp-template-carousel-v1` e helpers `_shared` existentes; não duplicar transporte Meta.
- TDD obrigatório: RED → implementação mínima → GREEN → regressões → commit pequeno.

## Review Focus

- Oferta aprovada perde estoque, muda preço/lote ou cai abaixo de R$ 75 antes do envio: preflight deve bloquear sem substituir silenciosamente.
- Mesmo cliente entra por múltiplos segmentos/campanhas na mesma semana: snapshot/preflight deve deduplicar e respeitar o teto semanal.
- Template compatível já existe: sistema deve preferir reuso; template protegido nunca pode ser candidato à exclusão.
- Token público de atribuição é adulterado, expirado ou repetido: endpoint deve rejeitar falsificação e manter idempotência sem permitir atribuição arbitrária a outro cliente.
- Base pequena ou resultado parcial: UI deve usar `Sinal inicial`/`Tendência`, nunca apresentar hipótese como aprendizado confirmado.

---

### Task 1: Fundação de dados, estados, pesos e sazonalidade

**Files:**
- Create: `supabase/migrations/20261005150000_marketing_strategy_foundation_v1.sql`
- Create: `scripts/test-marketing-strategy-foundation-v1.mjs`
- Modify: `.github/workflows/marketing-professional-ui-ci.yml`

**Interfaces:**
- Consumes: contas WhatsApp, templates, campanhas, clientes, pedidos e catálogo canônico.
- Produces tables: `marketing_strategy_runs_v1`, `marketing_strategy_offers_v1`, `marketing_strategy_events_v1`, `marketing_strategy_weight_sets_v1`, `marketing_seasonality_rules_v1`, `marketing_template_lifecycle_v1`, `marketing_attribution_events_v1`.
- Produces nullable `marketing_campaigns_v1.strategy_id`.
- Produces RPCs:
  - `marketing_strategy_transition_v1(p_strategy_id uuid, p_expected_revision integer, p_to_status text, p_actor_user_id uuid, p_reason text default null) returns jsonb`;
  - `marketing_strategy_detail_v1(p_strategy_id uuid) returns jsonb`;
  - `marketing_strategy_append_event_v1(p_strategy_id uuid, p_event_type text, p_actor_user_id uuid, p_metadata jsonb default '{}'::jsonb) returns jsonb`.

- [ ] **Step 1: Write failing schema/state contract**

Assertar as sete tabelas, `strategy_id`, RLS/revogação pública, índices e ledger append-only. Estados mínimos: `draft`, `awaiting_internal_approval`, `approved_internal`, `awaiting_meta`, `meta_approved`, `meta_rejected`, `ready_to_send`, `send_approved`, `scheduled`, `running`, `completed`, `discarded`, `blocked`.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-marketing-strategy-foundation-v1.mjs`
Expected: FAIL por migration ausente.

- [ ] **Step 3: Implement migration mínima**

Guardar no run: período, conta, objetivo, audience snapshot, formato, copy, schedule suggestion, score/breakdown, weight version/snapshot, evidence, revision, aprovações, template/campaign links e timestamps. Offers guardam `commercial_id`, `public_lot_id`, posição, preço/estoque snapshots, score e reasons. Weight sets guardam pesos versionados; seasonality guarda regra, janela, prioridade, efeito no score e `operational_closed` quando necessário.

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
- Consumes rows do `basket_commercial_catalog_v1`, histórico agregado, sazonalidade, regras de entrega/área e weight set.
- Produces:
  - `isEligibleOffer(row, minimum=75) -> {eligible:boolean,reasons:string[]}`;
  - `scoreOffer(input, weights) -> {total:number,breakdown:object,reasons:string[]}`;
  - `rankOffers(inputs, weights, options) -> scored[]`;
  - `chooseFormat(scored, context) -> {format:'single'|'carousel',offer_ids:string[]}`;
  - `canAdvertiseFreeDelivery(context) -> {ok:boolean,reason:string}`.

- [ ] **Step 1: Write failing engine tests**

Cobrir disponibilidade, estoque zero, `availability_reason!='available'`, preço 74,99/75,00, card inválido em carrossel, score 0–100, bônus de exploração limitado, desempate estável, ausência de histórico e entrega grátis fora da regra/área.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-marketing-strategy-engine-v1.mjs`
Expected: FAIL por helper ausente.

- [ ] **Step 3: Implement pure helper**

Pesos padrão `v1`: disponibilidade/estoque 25, sazonalidade 20, adequação ao público 20, desempenho 20, exploração 10, qualidade operacional 5. O helper não consulta banco, não chama IA e não altera dados.

- [ ] **Step 4: Add Review Focus test**

Oferta antes elegível passa a R$ 74,99 => `eligible=false`, reason `below_minimum_order`.

- [ ] **Step 5: Run GREEN**

Run: `node scripts/test-marketing-strategy-engine-v1.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: adicionar score deterministico de estrategia`

---

### Task 3: API Admin para gerar, revisar e configurar estratégias sem efeitos externos

**Files:**
- Create: `supabase/functions/admin-marketing-strategy-v1/index.ts`
- Create: `scripts/test-admin-marketing-strategy-v1.mjs`
- Modify: `supabase/config.toml` only if required by repository convention.
- Modify: `.github/workflows/marketing-professional-ui-ci.yml`

**Interfaces:**
- Consumes Tasks 1–2, catálogo, campanhas/dispatches, orders/customers, weight sets e seasonality.
- GET actions: `overview`, `detail`, `calendar`, `opportunities`, `learnings`, `settings`.
- POST actions: `generate`, `regenerate`, `edit_draft`, `request_internal_approval`, `approve_internal`, `discard`, `save_weights`, `save_seasonality`.
- `generate` e `approve_internal` são **locais only** nesta task.

- [ ] **Step 1: Write failing Edge contract**

Assertar Admin auth, origins, allowlist, ausência de telefone de destino/Graph/token, query canônica com `public_available>0` e `sale_price>=75`, snapshots e ledger.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-admin-marketing-strategy-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement generate flow**

Público default = todos os clientes elegíveis; filtros finos só entram quando existirem dados suficientes. Rodar score determinístico, escolher single/carousel, salvar evidence/snapshots e justificar com fatos. Se IA indisponível, usar copy fallback determinística e `copy_source='fallback'`.

- [ ] **Step 4: Implement settings/local approval**

`approve_internal` só registra operador/data/evento. `save_weights` cria nova versão; não edita versão histórica. `save_seasonality` versiona regra/calendário. Nenhuma dessas ações toca Meta/worker.

- [ ] **Step 5: Run GREEN + backend regressions**

Run:
- `node scripts/test-admin-marketing-strategy-v1.mjs`
- `node scripts/test-admin-marketing-campaigns-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-drafts-v1.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: criar API Admin de estrategia`

---

### Task 4: Aba `Estratégia`, calendário e configurações no Vitrine/Admin

**Files:**
- Create: `vitrine/admin/marketing/strategy-center.js`
- Create: `vitrine/admin/marketing/strategy-center.css`
- Modify: `vitrine/admin/marketing/marketing-polish.js`
- Modify: `vitrine/admin/marketing/marketing-polish.css`
- Modify: `vitrine/admin/index.html`
- Create: `scripts/test-whatsapp-marketing-strategy-ui-v1.mjs`
- Modify: `.github/workflows/marketing-professional-ui-ci.yml`

**Interfaces:**
- Consumes Task 3.
- Produces navegação `Visão geral | Estratégia | Templates | Campanhas | Públicos`, `openStrategyView()` e UI de recomendação/oportunidades/calendário/aprendizados/configurações.

- [ ] **Step 1: Write failing UI contract**

Assertar `Estratégia de Marketing`, `Gerar estratégia agora`, `Calendário`, `Configurações`, `Recomendação da semana`, `Por que esta estratégia?`, oportunidades, calendário, learnings e edição de pesos/sazonalidade com versão visível.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-strategy-ui-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement UI mínima e estados**

Estados: vazio, carregando, aguardando aprovação, aprovado internamente, Meta em análise/aprovado/rejeitado, pronta para envio, bloqueada, concluída. Sem UUID/jargão técnico. Mobile >=44px.

- [ ] **Step 4: Add evidence wording tests**

Sem base mínima => `Sinal inicial`/`Tendência`; nunca `Aprendizado confirmado` sem evidência suficiente.

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
- Modify: existing template/carousel server helpers only if orchestration needs exported/shared contracts.
- Create: `scripts/test-marketing-strategy-template-gate-v1.mjs`

**Interfaces:**
- Consumes `whatsapp_templates_v1` e shared Meta helpers existentes.
- Produces `findReusableTemplate(strategy, templates) -> reusable|null` e action `submit_template`.

- [ ] **Step 1: Write RED reuse-first tests**

Template MARKETING aprovado compatível => reusar, sem criação. Template ausente => `template_required`. Protected nunca é alterado/aposentado.

- [ ] **Step 2: Write RED Portão A tests**

`submit_template` rejeita `draft`/`awaiting_internal_approval`; apenas `approved_internal` pode chamar helper Meta. Browser source sem Graph/token.

- [ ] **Step 3: Run RED**

Run: `node scripts/test-marketing-strategy-template-gate-v1.mjs`
Expected: FAIL.

- [ ] **Step 4: Implement orchestration mínima**

Template simples usa shared transport de templates; carrossel usa helper existente. Salvar template/status Meta/evento. Rejeição Meta volta para revisão; nunca reenviar automaticamente.

- [ ] **Step 5: Run GREEN + regressions Meta**

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
- Consumes `marketing_create_campaign_v1`, snapshot, transition e schedule/start atuais.
- Produces RPC `marketing_strategy_materialize_campaign_v1(p_strategy_id uuid, p_actor_user_id uuid) returns jsonb`.
- Actions: `materialize_campaign`, `approve_send`, `schedule_send`, `send_now`.

- [ ] **Step 1: Write RED bridge contract**

Uma campanha por estratégia; link bidirecional; audience snapshot vira filtros; deep link deriva das ofertas; template aprovado obrigatório; nenhum telefone individual no payload Admin.

- [ ] **Step 2: Write RED Portão C contract**

Materialização cria somente draft/snapshot. `schedule_send`/`send_now` falham antes de `approve_send`. Aprovação Meta sozinha não basta.

- [ ] **Step 3: Run RED**

Run: `node scripts/test-marketing-strategy-campaign-bridge-v1.mjs`
Expected: FAIL.

- [ ] **Step 4: Implement bridge**

Reusar RPCs existentes e registrar eventos. Nunca escrever direto em outbox fora do worker.

- [ ] **Step 5: Add weekly-frequency test**

Cliente já programado/enviado por Marketing na semana local => excluído com `weekly_frequency_cap`, sem duplicação.

- [ ] **Step 6: Run GREEN + campaign regressions**

Run:
- `node scripts/test-marketing-strategy-campaign-bridge-v1.mjs`
- `node scripts/test-admin-marketing-campaign-scheduling-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-execution-ui-v1.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat: materializar estrategia em campanha existente`

---

### Task 7: Preflight obrigatório antes do disparo

**Files:**
- Create: `supabase/functions/_shared/marketing-strategy-preflight-v1.mjs`
- Modify: `supabase/functions/admin-marketing-strategy-v1/index.ts`
- Create: `scripts/test-marketing-strategy-preflight-v1.mjs`

**Interfaces:**
- Consumes catálogo atual, template, canal/runtime, consentimento/supressão, regra de entrega/área, seasonality/operational_closed e campaign snapshot.
- Produces `runStrategyPreflight(context) -> {ok:boolean,blocking_reasons:string[],changes:object}`.

- [ ] **Step 1: Write RED matrix**

Cobrir estoque, preço, R$75, lote, template APPROVED, canal, `campaigns_enabled=false`, opt-out, domingo/feriado, área/frete grátis, mudança de copy/template e runtime off.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-marketing-strategy-preflight-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement fail-closed**

Mudança material => `ok=false`, estratégia bloqueada/revisão e evento. Helper lê runtime; jamais habilita.

- [ ] **Step 4: Add production-safety assertions**

Contrato falha se implementação contiver escrita que ligue `campaigns_enabled`, `ana_enabled` ou runtime `live`.

- [ ] **Step 5: Run GREEN**

Run: `node scripts/test-marketing-strategy-preflight-v1.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: bloquear envio com preflight comercial`

---

### Task 8: Links opacos e telemetria site → carrinho → checkout

**Files:**
- Create: `supabase/functions/_shared/marketing-attribution-token-v1.mjs`
- Create: `supabase/functions/marketing-attribution-v1/index.ts`
- Create: `vitrine/marketing-attribution.js`
- Modify: `index.html`
- Modify: `vitrine/index.html`
- Modify: `supabase/functions/storefront-v2/index.ts`
- Create: `scripts/test-marketing-attribution-v1.mjs`

**Interfaces:**
- Produces signed opaque token, sem telefone/CPF/email na URL.
- Public events: `landing_open`, `basket_add`, `checkout_start` quando disponíveis.
- `storefront-v2` aceita opcional `marketing_token` e persiste referência validada sem confiar em IDs arbitrários enviados pelo browser.

- [ ] **Step 1: Write RED security tests**

Valid token, assinatura adulterada, expirado, payload alterado, evento duplicado, tracking indisponível sem bloquear compra.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-marketing-attribution-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement token + ingestion Edge**

Validar assinatura/expiry, resolver IDs server-side, insert idempotente em `marketing_attribution_events_v1`.

- [ ] **Step 4: Implement storefront propagation**

Capturar `mkt`, manter em sessão, anexar ao checkout e emitir eventos sem bloquear catálogo/compra.

- [ ] **Step 5: Run GREEN + checkout regressions**

Run `node scripts/test-marketing-attribution-v1.mjs` e os contracts existentes que referenciam `storefront-v2`/`create_vitrine_cart_order_v1`.

- [ ] **Step 6: Commit**

Commit: `feat: rastrear jornada de marketing no storefront`

---

### Task 9: Atribuição de pedido, receita e resposta no WhatsApp

**Files:**
- Create: `supabase/migrations/20261005160000_marketing_strategy_attribution_v1.sql`
- Modify: `supabase/functions/admin-marketing-campaign-report-v1/index.ts`
- Modify: `vitrine/admin/marketing/campaign-report.js`
- Modify: `vitrine/admin/marketing/campaign-report.css`
- Create: `scripts/test-marketing-strategy-attribution-report-v1.mjs`

**Interfaces:**
- Produces `marketing_campaign_attribution_summary_v1` com receita `direct`/`assisted` separadas.
- Direct attribution vence quando pedido carrega token/reference válida.
- Assisted default 7 dias, sem campanha posterior mais explicativa.
- Basket/Kit prefere `basket_id`, `basket_lot_id` e equivalentes canônicos.
- WhatsApp interaction conta inbound do cliente após campanha dentro da janela configurada, deduplicado por conversa/recipient/campaign.

- [ ] **Step 1: Write RED attribution cases**

Pedido direto, duplicado, cancelado, overlap direct/assisted, campanha posterior, basket metadata, pedido sem basket e resposta WhatsApp após campanha.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-marketing-strategy-attribution-report-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement idempotent attribution SQL**

Nunca duplicar pedido/receita/interação; cancelamento neutraliza receita sem apagar histórico.

- [ ] **Step 4: Enrich existing report**

Adicionar cliques/landing/carrinho/checkout/respostas/pedidos/conversão/receita direta/assistida/ticket/receita por 1.000 entregues mantendo `sent/delivered/read/failed` atuais.

- [ ] **Step 5: Run GREEN + report regression**

Run:
- `node scripts/test-marketing-strategy-attribution-report-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-report-v1.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: atribuir pedidos receita e respostas as campanhas`

---

### Task 10: Aprendizados e experimentos explicáveis

**Files:**
- Create: `supabase/functions/_shared/marketing-strategy-learning-v1.mjs`
- Modify: `supabase/functions/admin-marketing-strategy-v1/index.ts`
- Modify: `vitrine/admin/marketing/strategy-center.js`
- Create: `scripts/test-marketing-strategy-learning-v1.mjs`

**Interfaces:**
- Consumes métricas agregadas, seasonality, weight version e runs anteriores.
- Produces `classifyEvidence(sample) -> 'insufficient'|'signal'|'trend'|'supported'` e `buildLearningSummary(rows) -> insight[]`.
- Experimento guarda hipótese e primary metric **antes** de `send_approved`.

- [ ] **Step 1: Write RED evidence tests**

Sem dados => `insufficient`; base pequena => `signal`; base maior/consistente => `trend`/`supported`; nunca inventar números.

- [ ] **Step 2: Write RED experiment tests**

Após `send_approved`, hipótese e `primary_metric` são imutáveis; resultado pode ser `inconclusive`.

- [ ] **Step 3: Run RED**

Run: `node scripts/test-marketing-strategy-learning-v1.mjs`
Expected: FAIL.

- [ ] **Step 4: Implement learning helper**

IA recebe evidence JSON e referencia métricas usadas; fallback determinístico sempre disponível.

- [ ] **Step 5: Run GREEN**

Run: `node scripts/test-marketing-strategy-learning-v1.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: adicionar aprendizado explicavel ao marketing`

---

### Task 11: Ciclo de vida de templates e regressão final

**Files:**
- Modify: `supabase/functions/admin-marketing-strategy-v1/index.ts`
- Modify: `supabase/functions/admin-whatsapp-templates-v1/index.ts`
- Modify: `vitrine/admin/marketing/strategy-center.js`
- Modify: `vitrine/admin/marketing/template-center.js`
- Create: `scripts/test-marketing-template-lifecycle-v1.mjs`
- Create: `scripts/test-marketing-strategy-regression-v1.mjs`
- Modify: Marketing/WhatsApp CI workflows existentes.

**Interfaces:**
- Lifecycle actions: `retire_template`, `mark_cleanup_candidate`, `confirm_meta_delete`.
- Candidate rule v1: MARKETING, `protected=false`, sem campanha ativa/agendada/futura, sem estratégia aprovada dependente, last use >=60d, sem pendência operacional.
- Delete Meta requer ação Admin explícita e delega ao transporte existente; histórico local permanece.

- [ ] **Step 1: Write RED lifecycle contract**

Cobrir protected, dependência de campanha/estratégia, <60d, >=60d, confirmação de exclusão e preservação histórica.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-marketing-template-lifecycle-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement lifecycle + UI**

Estados amigáveis: `Em uso`, `Aposentado`, `Candidato à exclusão`, `Excluído da Meta`. Confirmar explicitamente antes da ação destrutiva.

- [ ] **Step 4: Write consolidated regression contract**

Assertar: sem Graph no browser, runtime não é habilitado, R$75, área/frete, Portões A/B/C, worker atual, templates/campanhas/públicos/Atendimento/Cestas preservados.

- [ ] **Step 5: Run full GREEN suite**

Executar todos os 11 contracts novos + Marketing Professional UI CI + Audience Progressive CI + Campaign Execution UI CI + WhatsApp Meta Central CI.

- [ ] **Step 6: Production-safe deployment checkpoint**

Deploy de migrations/Edges somente após review. Verificar no Supabase canônico que novas estruturas existem e que runtimes 0975/1018 permanecem inalterados. Não criar template real Meta nem enviar mensagem real durante verificação, salvo autorização separada e explícita.

- [ ] **Step 7: Commit**

Commit: `feat: concluir motor assistido de estrategia de marketing`

---

## Execution Order and PR Boundaries

Implementar em **11 PRs pequenos**, na ordem das Tasks. Tasks 1–4 entregam estratégia local sem tocar Meta. Task 5 adiciona Portão Meta. Tasks 6–7 conectam execução existente sem ligá-la. Tasks 8–10 adicionam telemetria/aprendizado. Task 11 fecha lifecycle e regressões.

Não juntar Tasks 1–7 em um único PR: o maior risco é acoplar recomendação, Meta e envio antes de cada gate estar provado isoladamente.

## Rollout Gates

1. **Gate Local:** após Tasks 1–4, gerar/revisar recomendações sem tocar Meta/campanha live.
2. **Gate Meta:** após Task 5, submissão Meta só por ação explícita do operador.
3. **Gate Campaign:** após Tasks 6–7, materialização/preflight funcionam; `campaigns_enabled` continua como encontrado.
4. **Gate Measurement:** após Tasks 8–10, tracking e aprendizado entram sem bloquear checkout.
5. **Gate Lifecycle:** após Task 11, limpeza continua humana e auditada.

## Final Verification Before Merge/Production

- Branch de execução nasce do `main` mais recente.
- Todos os contracts novos e quatro suítes de regressão passam.
- Diff sem mudança acidental de PapoAI, ANA, runtime ou `campaigns_enabled`.
- Nenhum Graph/token em `vitrine/**`.
- `basket_commercial_catalog_v1` permanece fonte canônica de elegibilidade.
- Nenhum deploy cria template Meta, agenda campanha ou envia mensagem sozinho.
- Links de atribuição não expõem telefone/CPF/email.
- Pedido/receita/interação são idempotentes e direct/assisted separados.
- Entrega grátis só é comunicada quando área/regra comercial permitem.
- Exclusão Meta preserva histórico local.
