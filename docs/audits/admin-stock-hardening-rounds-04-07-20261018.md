# Saneamento de estoque — Rodadas 04–07/15

## Rodada 04 — Confirmação e reserva

Auditado updateOrderCanonical: ao confirmar, reserve_vitrine_order_stock_v1 é chamado antes de atualizar orders.status; caso a atualização falhe, pode haver reserva sem confirmação. A reserva exige retorno ok=true. Não foi implementada transação conjunta porque requer alterar RPC e testar idempotência em ambiente isolado. Risco pendente, não corrigido.

## Rodada 05 — Cancelamento e liberação

O cancelamento executa release_vitrine_order_stock_v1 antes de atualizar orders.status. Se a atualização falhar, a reserva poderá ser liberada mantendo o pedido ativo. O fluxo de saída no Bling também tem operação externa antes da atualização canônica. Não foram alteradas regras de consumo ou entrega. Risco pendente, não corrigido.

## Rodada 06 — Balanço, gôndola e validade

Corrigida uma falha determinística: commitInventoryBalance anteriormente atualizava a gôndola antes de validar lot_id e a obrigatoriedade de seleção quando há múltiplos lotes. A pré-validação agora ocorre antes da gravação da localização. Criado teste de contrato para exigir a ordem correta.

Limites: operações subsequentes de validade, contagem, Bling e reativação continuam distribuídas e não atômicas. A pré-validação não garante exclusão mútua com alterações concorrentes nos lotes.

## Rodada 07 — Lotes, FEFO e XML

Revisada a migração activate_purchase_xml_inventory_lots_v1, que marca itens processados e verifica lotes, declarando local_product_stock_mutated=false. O caminho materializeReceiptLots delega à RPC. Criado teste para preservar a ausência de mutação direta de estoque nessa ativação, bem como a presença de sincronização oficial no balanço.

Limites: FEFO e reservas por lote exigem ensaios concorrentes; migrações versionadas não comprovam equivalência com as RPCs efetivamente implantadas.

## Evidências e situação

- Alteração funcional segura: pré-validação de lotes antes de alterar gôndola.
- Novos testes: scripts/test-admin-stock-hardening-contract.mjs e scripts/test-admin-stock-receipt-hardening-contract.mjs, integrados ao workflow.
- Riscos críticos de atomicidade de reserva, cancelamento e balanço ainda pendentes; não declarar rodadas 04–07 integralmente corrigidas.
- Sem deploy, merge, alteração de dados reais ou regras comerciais.
