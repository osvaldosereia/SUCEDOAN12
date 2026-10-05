# Pedidos V4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o fluxo canônico de Pedidos `RECEBIDO → CONFIRMADO → SEPARADO → NF-e AUTORIZADA → SAÍDA → ENTREGA + PAGAMENTO → ENTREGUE`, usando NF-e modelo 55 para as entregas e reaproveitando a integração Bling já existente.

**Architecture:** A UI continua no `vitrine/admin/index.html`; não será criado outro módulo de Pedidos. O PostgreSQL passa a considerar a separação concluída como ponto de prontidão fiscal, consolida o gate de saída e torna a entrega dependente de NF-e autorizada + pagamento real. `admin-products-live-v1` orquestra a operação humana, enquanto `admin-service-intelligence-v1` continua como ponte canônica para Pedido de Venda → NF-e → SEFAZ → DANFE. O runtime fiscal permanece desligado até o canário final.

**Tech Stack:** HTML/JavaScript do Admin, Supabase Edge Functions Deno/TypeScript, PostgreSQL/RPC, Bling API v3, GitHub Actions e contract tests Node.js.

**Spec:** `docs/superpowers/specs/2026-10-04-orders-fiscal-flow-v4-design.md`

## Global Constraints
- Usar NF-e modelo 55 como documento padrão do fluxo de entrega da Dona Antônia em Cuiabá e Várzea Grande.
- Não criar nova Edge Function de Bling; reutilizar `admin-service-intelligence-v1` e a ponte `hub(...)` já existente.
- Não criar script de sobreposição da página Pedidos; toda UX fica na implementação canônica `vitrine/admin/index.html`.
- `payment_method` do checkout é forma prevista; settlement da entrega é a forma realmente recebida.
- Nenhum retry pode duplicar abatimento, estoque, pagamento, NF-e ou evento fiscal.
- Não habilitar emissão fiscal automática. A primeira emissão live será humana e canário.
- Não ativar `fiscal_runtime_config.enabled`/geração/autorização global antes do canário aprovado.
- MDF-e fica fora deste plano; ele será tratado separadamente como operação de saída/carga.
- Toda mudança produtiva entra por branch/PR e deve passar pelos contratos V3 existentes além dos novos contratos V4.

## Review Focus
- Clique repetido em `EMITIR NF-e`: deve localizar/reconciliar a mesma nota e nunca criar uma segunda NF-e.
- Pedido com itens `FALTOU`: a NF-e deve usar o total final consolidado e nunca o valor original da cesta.
- Tentativa de entrega com NF-e pendente/rejeitada: deve falhar antes de criar settlement ou marcar `delivered`.
- Forma prevista diferente da forma recebida: settlement deve gravar a forma real sem reemitir/cancelar NF-e automaticamente.
- Pedidos legados em `out_for_delivery`/`delivered`: devem continuar abrindo e reconciliando fiscal sem obrigar reexecução das etapas novas.

---

### Task 1: Contrato V4 e CI

**Files:**
- Create: `scripts/test-admin-orders-fiscal-flow-v4.mjs`
- Modify: `.github/workflows/verify-admin-order-whatsapp-ui-integration.yml`
- Test: `scripts/test-admin-orders-clean-flow-v3.mjs`

**Interfaces:**
- Consumes: `vitrine/admin/index.html`, `supabase/functions/admin-products-live-v1/index.ts`, `supabase/functions/admin-service-intelligence-v1/index.ts`, migration V4.
- Produces: contrato estático executável que impede regressão para `Separado → Entregue → Fiscal`.

- [ ] **Step 1: Write the failing V4 contract**

Criar `scripts/test-admin-orders-fiscal-flow-v4.mjs` com asserts para:
- fiscal aparecer a partir de `ready/SEPARADO`, não apenas `delivered`;
- card possuir `NF-e PENDENTE`/`NF-e AUTORIZADA` e tags grandes distintas;
- `ENTREGUE` não ser a próxima ação quando fiscal não está autorizado;
- backend expor `order_fiscal_status`, `order_fiscal_issue_v4`, `order_dispatch_start_v4` e `delivery_fail_register`;
- migration V4 redefinir `refresh_order_fiscal_readiness_v1`, `preview_bling_invoice_eligibility_v1`, `ops2_fiscal_dispatch_preflight_v1` e `ops3_complete_delivery_v1`;
- migration V4 exigir autorização fiscal para saída/entrega e preservar payment gate;
- Bling bridge manter emissão idempotente a partir do pedido de venda.

- [ ] **Step 2: Run test to verify RED**

Run: `node scripts/test-admin-orders-fiscal-flow-v4.mjs`
Expected: FAIL porque o fluxo atual ainda libera entrega antes do fiscal.

- [ ] **Step 3: Wire V4 contract into official CI**

Adicionar o novo script, a migration `*orders_fiscal_flow_v4*.sql` e `admin-service-intelligence-v1/index.ts` aos `paths` do workflow; executar V3 + V4 no job `contract`.

- [ ] **Step 4: Keep V3 regression green**

Run: `node scripts/test-admin-orders-clean-flow-v3.mjs`
Expected: PASS antes das mudanças funcionais; durante a implementação, atualizar apenas asserts V3 que contradizem explicitamente a V4, preservando separação, vitrine e idempotência.

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
- Consumes: `order_separation_completions_v1`, `order_separation_items_v1`, `order_fiscal_controls`, `orders`, settlement tables.
- Produces: `refresh_order_fiscal_readiness_v1(uuid)`, `preview_bling_invoice_eligibility_v1(uuid)`, `ops2_fiscal_dispatch_preflight_v1(uuid)`, `ops4_start_dispatch_v1(uuid,text,text)`, versão V4 de `ops3_complete_delivery_v1(...)`.

- [ ] **Step 1: Extend RED assertions for SQL invariants**

Exigir no contrato que readiness não contenha dependência de `delivered` nem `payment_status='confirmed'` para emissão, e que a entrega exija `dispatch_fiscal_status='authorized'`.

- [ ] **Step 2: Implement V4 readiness**

`refresh_order_fiscal_readiness_v1(p_order_id uuid) -> jsonb` deve considerar fiscalmente candidato quando:
- status local é `ready` (ou estado posterior apenas para reconciliação);
- existe conclusão de separação com `stock_applied=true` e `completed_at` preenchido;
- não existem itens `pending`;
- total final é positivo e coincide com o pedido;
- cliente/endereço e vínculo Bling necessários estão disponíveis.

Pagamento e `delivered_at` permanecem no controle financeiro, não na prontidão de emissão.

- [ ] **Step 3: Align invoice eligibility/preflight**

Redefinir `preview_bling_invoice_eligibility_v1(uuid)` e `ops2_fiscal_dispatch_preflight_v1(uuid)` para reutilizar a readiness V4 e devolver blockers estruturados. `ready` pode emitir; `out_for_delivery`/`delivered` só reconciliam nota existente, evitando emissão tardia duplicada.

- [ ] **Step 4: Consolidate dispatch gate**

Manter um único caminho canônico baseado em `check_order_dispatch_fiscal_gate_v1(uuid)`. Remover o trigger duplicado somente depois que o teste comprovar equivalência; a transição nova para `out_for_delivery` deve ser bloqueada sem fiscal `authorized`.

- [ ] **Step 5: Add `ops4_start_dispatch_v1`**

Signature:
`ops4_start_dispatch_v1(p_order_id uuid, p_operator_label text default null, p_idempotency_key text default null) returns jsonb`.

Requisitos: order `ready`, separação concluída, fiscal autorizado; persistir `out_for_delivery`, horário/evento de saída e responder idempotentemente se a saída já foi registrada.

- [ ] **Step 6: Harden `ops3_complete_delivery_v1`**

Preservar assinatura existente. Para nova entrega, exigir `out_for_delivery`, separação concluída e fiscal autorizado antes de criar settlement. Pedido já `delivered` continua idempotente. Manter validação de valor = total final e método real recebido.

- [ ] **Step 7: Verify migration contract**

Run: `node scripts/test-admin-orders-fiscal-flow-v4.mjs`
Expected: SQL section PASS; UI/backend sections ainda podem permanecer RED.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261005010000_orders_fiscal_flow_v4.sql scripts/test-admin-orders-fiscal-flow-v4.mjs
git commit -m "feat: alinhar prontidão fiscal e gate de saída V4"
```

### Task 3: Orquestração fiscal canônica no backend do Admin

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Modify: `supabase/functions/admin-service-intelligence-v1/index.ts`
- Test: `scripts/test-admin-orders-fiscal-flow-v4.mjs`

**Interfaces:**
- Consumes: RPCs da Task 2; `hub(...)`; subações fiscais existentes do `admin-service-intelligence-v1`.
- Produces Admin actions:
  - GET `order_fiscal_status?id=<uuid>`
  - POST `order_fiscal_issue_v4` body `{id, confirmation}`
  - POST `order_dispatch_start_v4` body `{id, operator, idempotency_key}`
  - POST `order_delivery_complete_v3` preservado, agora sob gate V4.

- [ ] **Step 1: Write failing backend assertions**

Exigir `order_fiscal_issue_v4` no `LOCAL`/`WRITE_ACTIONS`, uso do preflight V4, chamada à ponte Bling existente e ausência de criação direta de uma segunda integração `/nfe` no Admin.

- [ ] **Step 2: Normalize fiscal status response**

`order_fiscal_status` deve devolver um objeto simples para UI:
`{stage, authorized, can_issue, can_dispatch, invoice_id, invoice_number, sefaz_status, danfe_available, blockers[]}`.

Mapear blockers técnicos para códigos estáveis; texto humano fica na UI.

- [ ] **Step 3: Implement human issue orchestration**

`order_fiscal_issue_v4`:
1. roda readiness/preflight local;
2. falha fechado se runtime não permite execução ou se houver hard blocker;
3. chama a operação fiscal humana já existente do `admin-service-intelligence-v1`;
4. reconcilia `order_fiscal_controls`;
5. retorna a mesma NF-e se o clique for repetido.

Não habilitar runtime dentro desta função.

- [ ] **Step 4: Adjust Bling preview to V4 order stage**

No `admin-service-intelligence-v1`, `blingHubVitrineDispatchFiscalPreview` deve aceitar pedido `ready` com separação concluída, usar total final e manter os blockers de Pedido de Venda/Verificado/dados fiscais. Não exigir pagamento/entrega para gerar/enviar NF-e.

- [ ] **Step 5: Expose dispatch start**

`order_dispatch_start_v4` chama `ops4_start_dispatch_v1`; nenhum write no Bling é necessário para iniciar a saída física além do que já estiver no fluxo canônico.

- [ ] **Step 6: Verify backend contract**

Run: `node scripts/test-admin-orders-fiscal-flow-v4.mjs`
Expected: backend section PASS.

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
- Consumes: `order_fiscal_status`, `order_fiscal_issue_v4`, `order_dispatch_start_v4`, `order_delivery_complete_v3`.
- Produces: card e pedido aberto com próxima ação inequívoca.

- [ ] **Step 1: Write RED assertions for visual states**

Exigir tags persistentes e maiores com classes distintas: `CONFIRMADO`, `SEPARADO`, `NF-e PENDENTE`, `NF-e AUTORIZADA`, `ENTREGUE`, `ENTREGA NÃO CONCLUÍDA`. Exigir que `ENTREGUE` não seja acionável antes da autorização/saída.

- [ ] **Step 2: Implement status tags**

Adicionar classes específicas, contraste alto e tamanho legível. A cor é semântica, mas o texto continua obrigatório para acessibilidade.

- [ ] **Step 3: Make post-separation action fiscal**

Depois de `ready`, mostrar `EMITIR NF-e` como próxima ação. O bloco Fiscal passa a aparecer a partir de Separado. `EMITIR NF-e` exibe `PROCESSANDO`, depois `AUTORIZADA` ou blocker traduzido.

- [ ] **Step 4: Add DANFE and dispatch action**

Após autorização: mostrar número da nota, `IMPRIMIR DANFE` e `SAIU PARA ENTREGA`. Só após registrar a saída o botão `ENTREGUE` fica disponível.

- [ ] **Step 5: Preserve auto-close behavior**

`CONCLUIR SEPARAÇÃO` fecha o bottom sheet somente em sucesso real; `CONFIRMAR ENTREGA` fecha o diálogo somente depois da resposta `ok:true`. Em erro, manter aberto com mensagem prática.

- [ ] **Step 6: Translate blockers for staff**

Exemplos: `customer_document_missing` → “CPF/CNPJ do cliente precisa ser corrigido”; `product_fiscal_missing` → “Produto precisa de ajuste fiscal”; `bling_order_not_verified` → “Pedido ainda não está pronto no Bling”. Não mostrar 409/RPC internamente.

- [ ] **Step 7: Verify UI + browser syntax**

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

### Task 5: Entrega frustrada e retorno sem cancelar NF-e automaticamente

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Modify only if needed: `supabase/migrations/20261005010000_orders_fiscal_flow_v4.sql`
- Modify: `vitrine/admin/index.html`
- Test: `scripts/test-admin-orders-fiscal-flow-v4.mjs`

**Interfaces:**
- Consumes: fluxo existente `delivery_fail_register`, `delivery_return_confirm`, `delivery_return_resolve`, estado `out_for_delivery` e fiscal autorizado.
- Produces: `ENTREGA NÃO CONCLUÍDA`/retorno sem settlement e sem cancelamento automático de NF-e.

- [ ] **Step 1: Pin failure behavior in tests**

Exigir que falha após `out_for_delivery` não grave `delivered`, não crie/complete settlement, preserve `bling_invoice_id`/fiscal autorizado e use o fluxo existente de retorno.

- [ ] **Step 2: Reuse existing failed-delivery operations**

Ajustar `registerFailedDelivery` para aceitar o estágio V4 e preservar nota. Não criar outra tabela/rota se `order_delivery_return_cases` e ações existentes já cobrem o caso.

- [ ] **Step 3: Add UI action**

Quando `out_for_delivery`, mostrar `ENTREGUE` e `NÃO ENTREGUE`. `NÃO ENTREGUE` abre motivo curto e registra retorno; nenhum pagamento é presumido.

- [ ] **Step 4: Keep fiscal event 110192 behind homologation flag**

Não enviar evento SEFAZ nesta task. Apenas persistir estado suficiente para integração futura/canário; nenhuma inferência automática de cancelamento/devolução fiscal.

- [ ] **Step 5: Verify**

Run: `node scripts/test-admin-orders-fiscal-flow-v4.mjs`
Expected: PASS para entrega frustrada e preservação fiscal.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-products-live-v1/index.ts vitrine/admin/index.html supabase/migrations/20261005010000_orders_fiscal_flow_v4.sql scripts/test-admin-orders-fiscal-flow-v4.mjs
git commit -m "feat: tratar insucesso de entrega no fluxo V4"
```

### Task 6: Preflight fiscal de produtos e emissão canário no Bling

**Files:**
- Modify: `supabase/functions/admin-service-intelligence-v1/index.ts`
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Test: `scripts/test-admin-orders-fiscal-flow-v4.mjs`
- Runtime data: `fiscal_runtime_config` — alterar somente no passo controlado, nunca em migration global.

**Interfaces:**
- Consumes: Pedido de Venda Bling já sincronizado, `product_fiscal_readiness_v1`, `order_fiscal_controls`, runtime Bling/fiscal.
- Produces: preflight legível e uma execução humana idempotente apta a canário.

- [ ] **Step 1: Classify hard blockers vs warnings**

Hard blockers devem ser somente dados que impedem a emissão real: ausência/inconsistência obrigatória de cliente/endereço, total, vínculo do pedido Bling, NCM/origem/regra fiscal necessária para o item ou rejeição explícita do Bling/SEFAZ. Pendência local que não impede a operação deve aparecer como warning, não bloquear cegamente todos os produtos.

- [ ] **Step 2: Verify final-total payload**

Teste deve exigir que pedido com `FALTOU` envie o total final e os itens efetivamente vendáveis; nunca recriar o valor oculto/abatido de forma incorreta.

- [ ] **Step 3: Verify idempotent invoice lookup**

Antes de POST de criação, localizar NF-e já vinculada ao Pedido de Venda/source order. Se existir, reconciliar e continuar autorização/DANFE conforme situação; não criar outra.

- [ ] **Step 4: Run full static regression**

Run:
```bash
node scripts/test-admin-orders-fiscal-flow-v4.mjs
node scripts/test-admin-orders-clean-flow-v3.mjs
node scripts/test-admin-order-whatsapp-ui-integration.mjs
node scripts/test-order-public-summary.mjs
node scripts/test-admin-order-public-vitrine.mjs
node scripts/test-order-public-vitrine-print.mjs
```
Expected: todos PASS.

- [ ] **Step 5: Deploy code with runtime still OFF**

Aplicar migration e publicar Edge Functions, mas confirmar por SQL que `fiscal_runtime_config` continua sem emissão global. Rodar `order_fiscal_status`/preflight em pedido controlado sem side effect externo.

- [ ] **Step 6: Controlled canary**

Somente após preflight sem hard blockers, selecionar explicitamente um pedido de teste controlado no runtime canário e habilitar apenas o mínimo necessário para **uma** emissão humana. Executar `EMITIR NF-e` uma vez; conferir no Bling e SEFAZ: mesma venda, uma única NF-e, número/chave, `authorized=true`, DANFE disponível.

- [ ] **Step 7: Retry canary once for idempotency**

Acionar novamente a mesma operação e confirmar que não surgiu segunda NF-e.

- [ ] **Step 8: Close canary**

Desarmar canário após o teste e manter emissão automática desabilitada. Registrar evidência do invoice id/número e resultado sem PII no PR/checkpoint.

- [ ] **Step 9: Commit any code-only corrections from canary**

```bash
git add supabase/functions/admin-service-intelligence-v1/index.ts supabase/functions/admin-products-live-v1/index.ts scripts/test-admin-orders-fiscal-flow-v4.mjs
git commit -m "fix: fechar homologação fiscal V4"
```

### Task 7: Rollout, saneamento do pedido controlado e PR final

**Files:**
- Modify only if required by findings: V4 files above.
- Do not hardcode production order IDs in migration or source.

**Interfaces:**
- Produces: V4 pronta para produção humana com observabilidade e rollback operacional.

- [ ] **Step 1: Repair only residual test state through canonical operations**

O pedido controlado usado durante o desenvolvimento que ficou `ready` com separation completion em `needs_attention` deve ser reconciliado por operação canônica ou correção de dados auditada; não inserir ID específico em migration.

- [ ] **Step 2: Verify DB invariants in production**

Consultas de leitura devem confirmar:
- um único gate fiscal efetivo de saída;
- `ops3_complete_delivery_v1` exige fiscal autorizado + saída + pagamento;
- readiness de pedido separado não exige `delivered`;
- runtime automático segue desligado;
- nenhuma NF-e duplicada no pedido canário.

- [ ] **Step 3: Verify actual Admin behavior**

Fluxo controlado completo:
`Confirmar → Separar → Fechar sheet → Emitir NF-e → Autorizar → DANFE → Sair para entrega → Confirmar forma recebida → Entregar`.
Também executar cenário `NÃO ENTREGUE` sem pagamento.

- [ ] **Step 4: Run all official checks**

Além do workflow de Pedidos, aguardar checks acionados por `vitrine/admin/index.html` e funções compartilhadas. Nenhum merge com CI pendente/vermelha.

- [ ] **Step 5: Review diff for dead/parallel code**

Buscar rotas/controles fiscais antigos que ficaram sem consumidor. Remover somente código comprovadamente morto; não apagar tabelas históricas ou Edge Functions externas sem auditoria de consumidores.

- [ ] **Step 6: Open PR and merge**

PR deve listar: nova máquina de estados, gates, ações Admin, resultado do canário, runtime final e limitações conhecidas. Fazer merge somente com branch atualizada e verificação final verde.
