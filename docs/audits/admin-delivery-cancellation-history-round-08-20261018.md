# Rodada 08/20 — Entrega, cancelamento e histórico

Branch: refactor/admin-print-queue-panel-20261018. PR #1121.

## Escopo auditado

1. Saída para entrega: startOrderDispatchV4 e orderDispatchStartV4 exigem pedido pronto e NF-e autorizada; a função canônica usa ops4_start_dispatch_v1 e chave de idempotência por pedido.
2. Conclusão da entrega: captureDeliveryPaymentAndFinish diferencia pagamento único e dividido; completeDeliveryV3 usa ops3_complete_delivery_v1, enquanto finalizeCapturedDeliveryV4 verifica estado, pagamento capturado, valor esperado e atualização condicional de status.
3. Falha na entrega: returnOrderToExpedition envia motivo codificado; registerFailedDelivery chama ops_register_failed_delivery_v1; o retorno físico é tratado separadamente por ops_confirm_delivery_return_v1.
4. Revisão de retorno: resolveDeliveryReturnReview exige supervisor ou proprietário; cancelamento de mercadoria intacta pode exigir reversão física no Bling antes da resolução.
5. Cancelamento: cancelCurrentOrder solicita motivo e confirmação; updateOrderCanonical chama release_vitrine_order_stock_v1 e cancela impressões pendentes.
6. Histórico: retryHistorySync permite retentativa manual via history_sync_retry e recarrega o pedido.
7. Antibypass: rejectCriticalStatusBypass exige os comandos canônicos de saída e conclusão, impedindo transição genérica por order_update.

## Proteções existentes

- Bloqueio por autorização fiscal antes da saída.
- Bloqueio de conclusão quando há retorno aberto.
- Verificação de pagamento capturado e valor integral.
- Atualização condicional por status out_for_delivery na finalização.
- Chaves de idempotência em saída, captura e entrega única.
- Registro de ocorrências de falha e revisão supervisora.

## Riscos residuais

- No pagamento dividido, a captura e a finalização são duas chamadas; falha entre elas deixa pagamento registrado sem entrega finalizada. O fluxo de retomada precisa ser exercitado com testes de falha.
- Na saída com estoque físico Bling, a integração de estoque pode ocorrer antes da RPC de saída; investigar compensação de falha e idempotência na rodada 13.
- No retorno intacto, a reversão física pode ocorrer antes da resolução na RPC; falha posterior requer reconciliação para evitar reversão repetida.
- A confirmação de cancelamento na interface não é uma garantia de atomicidade entre liberação de reserva, atualização do pedido e cancelamento de impressão.
- A sincronização de histórico e Bling pode falhar depois de uma entrega persistida; a atenção operacional e a retentativa devem ser testadas.
- Nenhuma RPC foi exercitada contra banco isolado nesta rodada; as garantias acima são inferidas do código e dependem dos contratos das funções do banco.

## Mudanças

- Criado scripts/test-admin-delivery-cancellation-history-contract.mjs com verificações dos comandos e guardas do Admin e backend.
- Integrado ao workflow Admin print queue panel.
- Sem alterações funcionais, sem deploy, sem merge e sem manipulação de dados reais.

## Encaminhamento

Riscos transacionais de estoque: rodadas 09–10; Bling e reversões: rodada 13; consolidação e validação final: rodadas 19–20. Nenhuma rodada adicional é criada.
