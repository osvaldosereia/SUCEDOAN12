# Rodada 12/20 — Recebimento e ajustes

Auditoria estática da branch de trabalho. Nenhum deploy ou movimento de estoque.

## Recebimento XML
receiptLotPlanStatus valida associação de itens a produto, quantidade convertida positiva e lote existente. saveReceiptLotPlan exige todos os itens e valida a validade informada. materializeReceiptLots chama activate_purchase_xml_inventory_lots_v1, registrando physical_stock_changed:false. Ativar lotes internos não equivale a alterar o estoque físico do Bling.

## Balanço
bal chama ops_record_inventory_count_v1 e ops_apply_stock_recount_result_v1. commitInventoryBalance valida EAN, quantidade, gôndola, validade e seleção de lote. A função grava localização e possivelmente validade antes da contagem e da sincronização externa.

## Ajuste direto
setProductStockOfficial exige autoridade Bling, prévia de saldo, enfileiramento, processamento e verificação posterior. A chave de idempotência inclui UUID novo por operação. Incidentes e classificação de divergências possuem RPCs próprias.

## Pendências
1. Alta: commitInventoryBalance não é transação única; falha intermediária pode deixar gravações parciais.
2. Alta: vinculação de produto e fila Bling também podem falhar entre etapas.
3. Alta: validar em banco isolado idempotência de activate_purchase_xml_inventory_lots_v1.
4. Média: verificar concorrência entre contagem, ajustes e movimentação de lotes.
5. Média: verificar consistência entre Bling, lot_tracking_complete e estoque avulso.
6. Média: testar EAN desconhecido, repetição, indisponibilidade Bling e recuperação.

## Regressões
scripts/test-admin-inventory-receipt-contract.mjs;
scripts/test-admin-inventory-balance-contract.mjs;
scripts/test-admin-stock-adjustment-contract.mjs.
Integrados ao workflow Admin. São testes estáticos, não integração em produção.
