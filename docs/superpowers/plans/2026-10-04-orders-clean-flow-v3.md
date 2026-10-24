# Pedidos V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma única gestão de pedidos com fluxo Confirmado → Separado → Entregue → Fiscal, sem sobreposição da UI antiga.

**Architecture:** A implementação canônica permanece no Admin existente e nos serviços/RPCs já usados pelo pedido. A camada `orders-unified-queue-v1.js` é removida. A separação usa o modelo V2 existente, mas conclui em marco `Separado` sem avançar automaticamente para entrega; a vitrine pública passa a carregar estados da separação. Entrega e pagamento são confirmados juntos e fiscal só aparece após `delivered`.

**Tech Stack:** HTML/JavaScript do Admin, Supabase Edge Functions (Deno/TypeScript), PostgreSQL/RPC, GitHub Actions/Node contract tests.

**Spec:** `docs/superpowers/specs/2026-10-04-orders-clean-flow-v3-design.md`

## Global Constraints
- Não criar outro script de sobreposição de Pedidos.
- Remover o script legado `orders-unified-queue-v1.js` e seus testes específicos quando substituídos.
- Preservar dados e histórico de pedidos existentes.
- `FALTOU` deve alterar o total uma única vez e continuar visível na vitrine pública.
- NF-e não bloqueia entrega e só é operada depois de `delivered`.
- Toda alteração produtiva entra por branch/PR e passa pela CI.

## Review Focus
- Pedido antigo em `out_for_delivery` deve aparecer como Separado, não quebrar.
- Repetir “Concluir separação” não pode abater o valor duas vezes.
- Pedido com todos os itens `FALTOU` não pode gerar total negativo.
- Entrega não pode concluir sem pagamento confirmado no mesmo fluxo.
- Snapshot público deve manter item faltante visível e marcar o estado corretamente.

---

### Task 1: Contratos V3 e remoção da sobreposição

**Files:**
- Create: `scripts/test-admin-orders-clean-flow-v3.mjs`
- Modify: `.github/workflows/verify-admin-order-whatsapp-ui-integration.yml`
- Delete: `vitrine/admin/orders-unified-queue-v1.js`
- Delete/replace: `scripts/test-admin-orders-unified-queue-v1.mjs`

**Interfaces:**
- Consumes: `vitrine/admin/index.html`
- Produces: contrato da UI canônica V3.

- [ ] Escrever teste que falha exigindo ausência do loader `orders-unified-queue-v1.js`, ausência dos filtros de cinco estágios/confirmar em massa e presença dos controles V3.
- [ ] Rodar o teste e confirmar RED.
- [ ] Remover a sobreposição e atualizar a CI para o contrato V3.
- [ ] Rodar teste/CI e confirmar GREEN.

### Task 2: Lista canônica de Pedidos

**Files:**
- Modify: `vitrine/admin/index.html`
- Test: `scripts/test-admin-orders-clean-flow-v3.mjs`

**Interfaces:**
- Produces: `renderOrders`, `paintOrderRows`, `orderRow` com ordenação `created_at DESC` e cards V3.

- [ ] Testar que a lista sempre usa todos os pedidos e ordenação decrescente por `created_at`.
- [ ] Testar que o card contém etiquetas de marco e apenas as ações `ABRIR VITRINE SEPARAÇÃO` e `ABRIR PEDIDO`.
- [ ] Implementar cards V3 e remover filtros/ação em massa/“próxima ação”.
- [ ] Verificar sintaxe e contrato.

### Task 3: Bottom sheet de separação

**Files:**
- Modify: `vitrine/admin/index.html`
- Remove when unused: `vitrine/admin/separacao/index.html`, `vitrine/admin/separacao/separation.js`
- Test: `scripts/test-admin-orders-clean-flow-v3.mjs`

**Interfaces:**
- Consumes: `order_separation_get`, `order_separation_item_set`, `order_separation_complete`.
- Produces: bottom sheet com `SEPARADO`, `FALTOU`, `CONCLUIR SEPARAÇÃO`.

- [ ] Testar que o fluxo não usa `window.open('/vitrine/admin/separacao/...')`.
- [ ] Implementar bottom sheet fixo com animação de baixo para cima e X no topo.
- [ ] Bloquear conclusão enquanto houver pendentes.
- [ ] Remover a página separada se nenhum consumidor restar.

### Task 4: Conclusão da separação sem saída para entrega

**Files:**
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Add migration only if needed: `supabase/migrations/*orders_clean_flow_v3*.sql`
- Test: `scripts/test-admin-orders-clean-flow-v3.mjs` e teste backend existente/novo.

**Interfaces:**
- Consumes: `ops2_prepare_order_separation_completion_v2`, `ops2_apply_order_separation_stock_v2`, `ops2_mark_order_separation_completion_v2`.
- Produces: conclusão persistida e pedido em marco separado sem `out_for_delivery` automático.

- [ ] Testar que `orderSeparationComplete` não faz transição `ready -> out_for_delivery`.
- [ ] Preservar idempotência do abatimento e aplicação de estoque.
- [ ] Marcar conclusão da separação e atualizar snapshot público.
- [ ] Garantir compatibilidade de pedidos legados.

### Task 5: Vitrine pública com faltas e totais

**Files:**
- Migration: atualizar `ops2_refresh_order_public_snapshot_v1`.
- Modify only if needed: `supabase/functions/order-public-view-v1/index.ts`, `p/index.html`, `pedido/index.html`.
- Test: `scripts/test-order-public-summary.mjs`, `scripts/test-order-public-vitrine-print.mjs`, novo contrato V3.

**Interfaces:**
- Produces: snapshot público com `original_total`, `missing_subtotal`, `final_total` e `items[].separation_state`.

- [ ] Escrever teste que exige item `FALTOU` visível.
- [ ] Alterar RPC de snapshot para juntar `order_separation_items_v1`/completion.
- [ ] Renderizar “FALTOU” e resumo original/abatimento/final na vitrine.
- [ ] Verificar impressão e pedidos sem faltas.

### Task 6: Pedido aberto enxuto

**Files:**
- Modify: `vitrine/admin/index.html`
- Test: `scripts/test-admin-orders-clean-flow-v3.mjs`

**Interfaces:**
- Produces: ficha operacional com Cliente/Entrega, Itens, Atendimento, Operação e Fiscal pós-entrega.

- [ ] Testar ausência de diagnóstico ERP/Bling e gate fiscal de expedição no fluxo normal.
- [ ] Testar `VITRINE CLIENTE` apenas no pedido aberto.
- [ ] Travar edição de produtos após confirmado; manter dados de entrega editáveis até entregue.
- [ ] Mostrar fiscal somente após `delivered`.

### Task 7: Entrega + pagamento em uma ação

**Files:**
- Modify: `vitrine/admin/index.html`
- Modify: `supabase/functions/admin-products-live-v1/index.ts` se necessário para atomicidade.
- Test: contrato V3 e testes de pagamento/entrega existentes.

**Interfaces:**
- Consumes: `order_payment_capture`/controles fiscais e `order_update`.
- Produces: diálogo de entrega com forma prevista, forma recebida e valor final; `delivered` apenas após confirmação de recebimento.

- [ ] Testar que botão ENTREGUE só habilita depois de separação concluída.
- [ ] Implementar diálogo compacto de entrega/pagamento.
- [ ] Registrar pagamento e entrega sem janela intermediária de NF-e.
- [ ] Atualizar card e pedido aberto após sucesso.

### Task 8: Limpeza final, regressão e PR

**Files:**
- Remove código/funções/testes sem consumidores descobertos durante a migração.
- Update: workflows afetados.

**Interfaces:**
- Produces: branch sem módulos de Pedidos concorrentes.

- [ ] Buscar referências aos filtros/ações/páginas removidas e apagar consumidores mortos.
- [ ] Rodar `node --check` nos JS alterados e todos os testes de Pedidos, checkout, vitrine pública, WhatsApp e cestas afetados.
- [ ] Rodar `git diff --check` em CI.
- [ ] Abrir PR, aguardar checks oficiais e revisar diff completo.
- [ ] Merge somente com branch atualizada e CI verde.