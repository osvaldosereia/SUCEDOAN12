# Rodada 10/20 — Reservas, baixa e proteção contra duplicidade

Branch: refactor/admin-print-queue-panel-20261018. PR #1121.

## Caminhos examinados

- Confirmação: updateOrderCanonical chama reserve_vitrine_order_stock_v1 antes de atualizar orders.status.
- Separação: consume_vitrine_order_stock_v1 controla reserva consumida e evita baixa local se a autoridade for Bling.
- Cancelamento: release_vitrine_order_stock_v1 libera reservas; no modelo legado pode recompor products.stock, enquanto sob autoridade Bling não altera estoque físico local.
- A versão de reserva no arquivo 20260928_ops2_r1_reservation_horizon.sql define horizonte de 48 horas e bloqueia produtos por FOR UPDATE.
- A reserva usa ON CONFLICT(order_id,product_id) DO UPDATE, que protege a unicidade do registro mas não constitui, isoladamente, idempotência de todo o ciclo.
- O consumo retorna already_consumed para reservas totalmente consumidas e bloqueia reservas liberadas.

## Riscos relevantes

1. **Atomicidade da confirmação**: a reserva é feita via RPC e o status é atualizado em chamada posterior; falha intermediária pode deixar reserva ativa sem pedido confirmado.
2. **Atomicidade do cancelamento**: a liberação ocorre antes da atualização de status; falha posterior pode deixar pedido operacional com reserva liberada.
3. **Concorrência**: bloqueios por produto reduzem corrida de estoque; não substituem teste concorrente com pedidos, alteração de cesta e mudança de autoridade.
4. **Horizonte**: a reserva tem 48 horas no SQL examinado. Validar a versão efetivamente implantada e comportamento de expiração em pedidos atrasados.
5. **Bling**: a ausência de baixa local é deliberada sob autoridade Bling; requer reconciliação de baixa física externa e eventos.

## Trabalho

Teste scripts/test-admin-stock-reservation-consumption-contract.mjs adicionado ao workflow. Não foi criada migração para corrigir atomicidade, pois exige desenho transacional e testes isolados. Nenhuma operação de estoque em produção foi executada.
