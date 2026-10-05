# Pedidos V4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o fluxo canônico de Pedidos `RECEBIDO → CONFIRMADO → SEPARADO → NF-e AUTORIZADA → SAÍDA → ENTREGA + PAGAMENTO → ENTREGUE`, usando NF-e modelo 55 nas entregas e reaproveitando a integração Bling já existente.

**Architecture:** A UI permanece em `vitrine/admin/index.html`, sem módulo paralelo de Pedidos. O PostgreSQL passa a considerar a separação concluída como ponto de prontidão fiscal, consolida o gate de saída e exige NF-e autorizada antes da saída e da entrega. `admin-products-live-v1` orquestra a operação humana e `admin-service-intelligence-v1` continua como ponte canônica Pedido de Venda → NF-e → SEFAZ → DANFE. O runtime fiscal continua desligado até o canário final.

**Tech Stack:** HTML/JavaScript, Supabase Edge Functions Deno/TypeScript, PostgreSQL/RPC, Bling API v3, GitHub Actions e contract tests Node.js.

**Spec:** `docs/superpowers/specs/2026-10-04-orders-fiscal-flow-v4-design.md`

## Global Constraints
- Usar NF-e modelo 55 como documento padrão do fluxo de entrega em Cuiabá e Várzea Grande.
- Não criar nova Edge Function de Bling; reutilizar `admin-service-intelligence-v1` e `hub(...)`.
- Não criar script de sobreposição da página Pedidos; toda UX fica no Admin canônico.
- `payment_method` do checkout é forma prevista; settlement da entrega é a forma realmente recebida.
- Nenhum retry pode duplicar abatimento, estoque, pagamento, NF-e ou evento fiscal.
- Não habilitar emissão fiscal automática; a primeira emissão live será humana e canário.
- Não ativar geração/autorização global em `fiscal_runtime_config` antes do canário aprovado.
- MDF-e fica fora deste plano e será tratado separadamente como operação de saída/carga.
- Toda alteração produtiva entra por branch/PR e passa pelos contratos V3 e V4.

## Review Focus
- Clique repetido em `EMITIR NF-e`: deve localizar/reconciliar a mesma nota e nunca criar uma segunda NF-e. Testado na Task 6.
- Pedido com itens `FALTOU`: deve emitir pelo total final e nunca pelo valor original. Testado nas Tasks 1 e 6.
- Tentativa de entrega com NF-e pendente/rejeitada: deve falhar antes de criar settlement ou marcar `delivered`. Testado na Task 2.
- Forma prevista diferente da recebida: settlement deve gravar a forma real sem reemitir/cancelar NF-e automaticamente. Testado nas Tasks 2 e 4.
- Pedidos legados `out_for_delivery`/`delivered`: devem abrir e reconciliar fiscal sem obrigar reexecução das etapas novas. Testado nas Tasks 1 e 7.

---

### Task 1: Contrato V4 e CI

**Files:**
- Create: `scripts/test-admin-orders-fiscal-flow-v4.mjs`
- Modify: `.github/workflows/verify-admin-order-whatsapp-ui-integration.yml`
- Test: `scripts/test-admin-orders-clean-flow-v3.mjs`

**Interfaces:**
- Consumes: Admin, `admin-products-live-v1`, `admin-service-intelligence-v1` e migration V4.
- Produces: contrato executável que impede regressão para `Separado → Entregue → Fiscal`.

- [ ] **Step 1: Write the failing V4 contract**

Criar asserts exigindo:
- fiscal visível a partir de `ready/SEPARADO`, não só `delivered`;
- tags `NF-e PENDENTE`/`NF-e AUTORIZADA` grandes e distintas;
- `ENTREGUE` indisponível sem autorização/saída;
- backend com `order_fiscal_status`, `order_fiscal_issue_v4`, `order_dispatch_start_v4` e `delivery_fail_register`;
- migration redefinindo `refresh_order_fiscal_readiness_v1`, `preview_bling_invoice_eligibility_v1`, `ops2_fiscal_dispatch_preflight_v1` e `ops3_complete_delivery_v1`;
- autorização fiscal exigida para saída/entrega e payment gate preservado;
- emissão idempotente a partir do Pedido de Venda;
- compatibilidade explícita para `out_for_delivery` e `delivered` legados.

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-admin-orders-fiscal-flow-v4.mjs`
Expected: FAIL porque o fluxo atual ainda libera entrega antes do fiscal.

- [ ] **Step 3: Wire the contract into CI**

Adicionar o script, `*orders_fiscal_flow_v4*.sql` e `admin-service-intelligence-v1/index.ts` aos `paths`; executar V3 + V4 no job `contract`.

- [ ] **Step 4: Preserve V3 regression**

Run: `node scripts/test-admin-orders-clean-flow-v3.mjs`
Expected: PASS; atualizar somente asserts V3 que contradizem a ordem fiscal V4.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-admin-orders-fiscal-flow-v4.mjs .github/workflows/verify-admin-order-whatsapp-ui-integration.yml
git commit -m "test: definir contrato fiscal Pedidos V4"
```

### Task 2: Prontidão fiscal pós-separação e gate único de saída

**Files:**
- Create: `supabase/migrations/20261005010000_orders_fiscal_flow_v4.sql`
- Reference: `supabase/migrations/20261004193000_orders_clean_flow_v3.sql`
- Reference: `supabase/sql/20260928_ops2_delivery_payment_fiscal_sync_v1.sql`
- Test: `scripts/test-admin-orders-fiscal-flow-v4.mjs`

**Interfaces:**
- Consumes: `order_separation_completions_v1`, `order_separation_items_v1`, `order_fiscal_controls`, `orders`, settlements.
- Produces: `refresh_order_fiscal_readiness_v1(uuid)`, `preview_bling_invoice_eligibility_v1(uuid)`, `ops2_fiscal_dispatch_preflight_v1(uuid)`, `ops4_start_dispatch_v1(uuid,text,text)` e `ops3_complete_delivery_v1(...)` V4.

- [ ] **Step 1: Extend RED assertions for SQL invariants**

Exigir que readiness de emissão não dependa de `delivered` nem `payment_status='confirmed'` e que entrega exija `dispatch_fiscal_status='authorized'`.

- [ ] **Step 2: Implement V4 readiness**

`refresh_order_fiscal_readiness_v1(p_order_id uuid) -> jsonb` deve considerar candidato quando: status `ready` (estados posteriores só para reconciliação), completion com `stock_applied=true` e `completed_at`, zero `pending`, total final positivo/coerente e dependências obrigatórias de cliente/endereço/Bling presentes.

- [ ] **Step 3: Align invoice eligibility/preflight**

`preview_bling_invoice_eligibility_v1(uuid)` e `ops2_fiscal_dispatch_preflight_v1(uuid)` reutilizam readiness e retornam blockers estruturados. `ready` pode emitir; `out_for_delivery`/`delivered` apenas reconciliam nota existente.

- [ ] **Step 4: Consolidate dispatch gate**

Usar `check_order_dispatch_fiscal_gate_v1(uuid)` como caminho canônico. Remover trigger duplicado somente após contrato provar equivalência. Nova transição para `out_for_delivery` deve falhar sem fiscal autorizado.

- [ ] **Step 5: Add `ops4_start_dispatch_v1`**

Signature: `ops4_start_dispatch_v1(p_order_id uuid, p_operator_label text default null, p_idempotency_key text default null) returns jsonb`.

Requer `ready`, separação concluída e fiscal autorizado; persiste `out_for_delivery` e evento/horário de saída; retry retorna o estado já registrado.

- [ ] **Step 6: Harden `ops3_complete_delivery_v1`**

Preservar assinatura. Para nova entrega, exigir `out_for_delivery`, separação concluída e fiscal autorizado **antes** de criar settlement. Pedido já `delivered` continua idempotente. Valor recebido deve igualar total final e método deve ser o efetivamente recebido.

- [ ] **Step 7: Add legacy compatibility assertions**

`out_for_delivery` antigo com NF-e existente deve ser reconciliável; `delivered` antigo deve continuar legível/idempotente, sem criar nova NF-e ou novo settlement.

- [ ] **Step 8: Verify migration contract**

Run: `node scripts/test-admin-orders-fiscal-flow-v4.mjs`
Expected: seção SQL PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261005010000_orders_fiscal_flow_v4.sql scripts/test-admin-orders-fiscal-flow-v4.mjs
git commit -m "feat: alinhar prontidão fiscal e gate de saída V4"
```

### Task 3: Orquestração fiscal canônica no backend

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Modify: `supabase/functions/admin-service-intelligence-v1/index.ts`
- Test: `scripts/test-admin-orders-fiscal-flow-v4.mjs`

**Interfaces:**
- Consumes: RPCs da Task 2, `hub(...)` e subações fiscais já existentes.
- Produces:
  - GET `order_fiscal_status?id=<uuid>`
  - POST `order_fiscal_issue_v4` `{id, confirmation}`
  - POST `order_dispatch_start_v4` `{id, operator, idempotency_key}`
  - POST `order_delivery_complete_v3` preservado sob gate V4.

- [ ] **Step 1: Write failing backend assertions**

Exigir `order_fiscal_issue_v4` em `LOCAL`/`WRITE_ACTIONS`, uso de preflight, chamada à ponte Bling existente e ausência de segunda integração `/nfe` no Admin.

- [ ] **Step 2: Normalize fiscal status**

`order_fiscal_status` retorna `{stage, authorized, can_issue, can_dispatch, invoice_id, invoice_number, sefaz_status, danfe_available, blockers[]}`.

- [ ] **Step 3: Implement human issue orchestration**

`order_fiscal_issue_v4`: readiness/preflight → fail closed em blocker/runtime → operação fiscal humana já existente → reconciliação de `order_fiscal_controls` → mesma NF-e em retry. A função não altera runtime.

- [ ] **Step 4: Adjust Bling preview to V4**

`blingHubVitrineDispatchFiscalPreview` aceita `ready` com separação concluída, usa total final e mantém blockers de Pedido de Venda/Verificado/dados fiscais; não exige pagamento/entrega.

- [ ] **Step 5: Expose dispatch start**

`order_dispatch_start_v4` chama `ops4_start_dispatch_v1`.

- [ ] **Step 6: Verify**

Run: `node scripts/test-admin-orders-fiscal-flow-v4.mjs`
Expected: seção backend PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/admin-products-live-v1/index.ts supabase/functions/admin-service-intelligence-v1/index.ts scripts/test-admin-orders-fiscal-flow-v4.mjs
git commit -m "feat: orquestrar NF-e V4 pelo Bling existente"
```

### Task 4: UX operacional da página Pedidos

**Files:**
- Modify: `vitrine/admin/index.html`
- Test: `scripts/test-admin-orders-fiscal-flow-v4.mjs`
- Regression: `scripts/test-admin-orders-clean-flow-v3.mjs`

**Interfaces:**
- Consumes: status/emissão fiscal, saída, entrega V3.
- Produces: card/pedido aberto com próxima ação inequívoca.

- [ ] **Step 1: Write RED visual assertions**

Exigir tags persistentes e grandes: `CONFIRMADO`, `SEPARADO`, `NF-e PENDENTE`, `NF-e AUTORIZADA`, `ENTREGUE`, `ENTREGA NÃO CONCLUÍDA`; `ENTREGUE` não acionável antes da autorização/saída.

- [ ] **Step 2: Implement semantic tag styles**

`CONFIRMADO` azul, `SEPARADO` laranja, `NF-e PENDENTE` âmbar, `NF-e AUTORIZADA` roxo/azulado, `ENTREGUE` verde, ocorrência/cancelamento vermelho. Texto continua obrigatório além da cor.

- [ ] **Step 3: Make fiscal the post-separation action**

Depois de `ready`, mostrar `EMITIR NF-e`; bloco Fiscal aparece a partir de Separado e mostra `PROCESSANDO`, `AUTORIZADA` ou blocker traduzido.

- [ ] **Step 4: Add DANFE and dispatch**

Após autorização: número da nota, `IMPRIMIR DANFE` e `SAIU PARA ENTREGA`. `ENTREGUE` só depois da saída.

- [ ] **Step 5: Preserve auto-close**

`CONCLUIR SEPARAÇÃO` fecha sheet apenas em `ok:true`; `CONFIRMAR ENTREGA` fecha diálogo apenas em `ok:true`; erro mantém aberto com mensagem prática.

- [ ] **Step 6: Translate blockers**

Ex.: `customer_document_missing` → “CPF/CNPJ do cliente precisa ser corrigido”; `product_fiscal_missing` → “Produto precisa de ajuste fiscal”; `bling_order_not_verified` → “Pedido ainda não está pronto no Bling”. Não mostrar 409/RPC.

- [ ] **Step 7: Verify**

Run:
```bash
node scripts/test-admin-orders-fiscal-flow-v4.mjs
node scripts/test-admin-orders-clean-flow-v3.mjs
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add vitrine/admin/index.html scripts/test-admin-orders-fiscal-flow-v4.mjs scripts/test-admin-orders-clean-flow-v3.mjs
git commit -m "feat: simplificar operação fiscal na tela de pedidos"
```

### Task 5: Cancelamento fiscal seguro, entrega frustrada e retorno

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Modify only if needed: `supabase/migrations/20261005010000_orders_fiscal_flow_v4.sql`
- Modify: `vitrine/admin/index.html`
- Test: `scripts/test-admin-orders-fiscal-flow-v4.mjs`

**Interfaces:**
- Consumes: `delivery_fail_register`, `delivery_return_confirm`, `delivery_return_resolve`, `out_for_delivery`, fiscal autorizado e cancelamento operacional existente.
- Produces: cancelamento/reagendamento protegido e `ENTREGA NÃO CONCLUÍDA` sem settlement nem cancelamento automático da NF-e.

- [ ] **Step 1: Pin pre-dispatch cancellation behavior**

Quando NF-e já estiver autorizada e pedido ainda `ready`, cancelar/reprogramar **não** pode simplesmente cancelar o pedido e deixar a nota órfã. A ação deve bloquear o cancelamento operacional direto e abrir revisão/ação fiscal explícita; nunca cancelar NF-e automaticamente.

- [ ] **Step 2: Pin post-dispatch failure behavior**

Após `out_for_delivery`, falha não grava `delivered`, não cria/completa settlement, preserva `bling_invoice_id`/autorização e usa retorno existente.

- [ ] **Step 3: Reuse existing return operations**

Ajustar `registerFailedDelivery` ao estágio V4. Não criar tabela/rota nova se `order_delivery_return_cases` e ações existentes cobrem o caso.

- [ ] **Step 4: Add UI actions**

Em `out_for_delivery`, mostrar `ENTREGUE` e `NÃO ENTREGUE`. Motivos mínimos: cliente ausente, recusou, endereço incorreto/inacessível, problema operacional/veículo, outro com observação.

- [ ] **Step 5: Keep event 110192 behind homologation**

Nesta task não enviar evento SEFAZ. Persistir estado suficiente para futura integração; nenhuma inferência automática de cancelamento/devolução fiscal.

- [ ] **Step 6: Verify**

Run: `node scripts/test-admin-orders-fiscal-flow-v4.mjs`
Expected: PASS para cancelamento protegido, entrega frustrada e preservação fiscal.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/admin-products-live-v1/index.ts vitrine/admin/index.html supabase/migrations/20261005010000_orders_fiscal_flow_v4.sql scripts/test-admin-orders-fiscal-flow-v4.mjs
git commit -m "feat: proteger cancelamento e insucesso no fluxo V4"
```

### Task 6: Preflight fiscal e emissão canário no Bling

**Files:**
- Modify: `supabase/functions/admin-service-intelligence-v1/index.ts`
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Test: `scripts/test-admin-orders-fiscal-flow-v4.mjs`
- Runtime data: `fiscal_runtime_config` — alterar só no canário, nunca em migration global.

**Interfaces:**
- Consumes: Pedido de Venda Bling, `product_fiscal_readiness_v1`, `order_fiscal_controls`, runtime Bling/fiscal.
- Produces: preflight legível e emissão humana idempotente apta a canário.

- [ ] **Step 1: Classify blockers vs warnings**

Hard blocker somente quando impede emissão real: cliente/endereço obrigatório, total, vínculo do Pedido de Venda, NCM/origem/regra fiscal necessária ou rejeição Bling/SEFAZ. Pendência local meramente administrativa vira warning.

- [ ] **Step 2: Verify final-total payload**

Pedido com `FALTOU` deve usar total final e itens efetivamente vendidos; não recriar valor abatido nem faturar item faltante.

- [ ] **Step 3: Verify idempotent invoice lookup**

Antes de criar, localizar NF-e já vinculada ao Pedido de Venda/source order. Existindo, reconciliar/autorizá-la/obter DANFE conforme situação; nunca criar outra.

- [ ] **Step 4: Run full static regression**

```bash
node scripts/test-admin-orders-fiscal-flow-v4.mjs
node scripts/test-admin-orders-clean-flow-v3.mjs
node scripts/test-admin-order-whatsapp-ui-integration.mjs
node scripts/test-order-public-summary.mjs
node scripts/test-admin-order-public-vitrine.mjs
node scripts/test-order-public-vitrine-print.mjs
```
Expected: todos PASS.

- [ ] **Step 5: Deploy with fiscal runtime still OFF**

Aplicar migration e publicar Edge Functions; confirmar por SQL que emissão global continua desligada. Rodar `order_fiscal_status`/preflight em pedido controlado sem side effect externo.

- [ ] **Step 6: Controlled canary**

Selecionar explicitamente um pedido de teste sem hard blockers e habilitar apenas o mínimo necessário para **uma** emissão humana. Executar `EMITIR NF-e`; conferir Pedido de Venda, uma única NF-e, número/chave, `authorized=true` e DANFE.

- [ ] **Step 7: Retry canary for idempotency**

Repetir a mesma operação e comprovar ausência de segunda NF-e.

- [ ] **Step 8: Close canary**

Desarmar canário e manter emissão automática desabilitada. Registrar evidência sem PII.

- [ ] **Step 9: Commit code-only fixes from canary**

```bash
git add supabase/functions/admin-service-intelligence-v1/index.ts supabase/functions/admin-products-live-v1/index.ts scripts/test-admin-orders-fiscal-flow-v4.mjs
git commit -m "fix: fechar homologação fiscal V4"
```

### Task 7: Rollout, saneamento controlado e PR final

**Files:**
- Modify only if findings require: V4 files above.
- Never hardcode production order IDs in migration/source.

**Interfaces:**
- Produces: V4 pronta para produção humana com observabilidade.

- [ ] **Step 1: Repair residual controlled-test state canonically**

Pedido de teste que ficou `ready` com separation completion em `needs_attention` deve ser reconciliado por operação canônica/correção auditada, nunca por ID em migration.

- [ ] **Step 2: Verify production DB invariants**

Confirmar: um gate fiscal efetivo de saída; entrega exige fiscal+saída+pagamento; readiness de separado não exige `delivered`; runtime automático off; nenhuma NF-e duplicada.

- [ ] **Step 3: Verify legacy orders**

Abrir amostras não-PII de `out_for_delivery` e `delivered` antigos e confirmar que UI/status fiscal carregam sem exigir nova emissão, nova saída ou novo pagamento.

- [ ] **Step 4: Verify complete controlled flow**

`Confirmar → Separar → fechar sheet → Emitir NF-e → Autorizar → DANFE → Sair → confirmar forma recebida → Entregar` e, em segundo cenário, `NÃO ENTREGUE` sem pagamento.

- [ ] **Step 5: Run all official checks**

Aguardar workflows acionados pelo Admin e funções compartilhadas; nenhum merge com CI pendente/vermelha.

- [ ] **Step 6: Review dead/parallel code**

Remover somente rotas/controles fiscais comprovadamente sem consumidor. Não apagar tabelas históricas ou Edge Functions externas sem auditoria.

- [ ] **Step 7: Open PR and merge**

PR lista máquina de estados, gates, ações Admin, resultado do canário, runtime final e limitações. Merge somente com branch atualizada e verificação verde.
