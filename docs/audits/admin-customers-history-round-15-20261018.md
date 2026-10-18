# Rodada 15/20 — Clientes, histórico e rastreabilidade

Branch de trabalho do PR #1121. Nenhuma alteração de dados de clientes reais.

## Caminhos auditados

- Admin consulta vitrine_customer_history paginando 20 pedidos por vez e utiliza next_offset.
- Detalhe de compra exige customer_id e order_id via vitrine_customer_order_detail.
- Histórico de pedido permite history_sync_retry e recarrega dados operacionais.
- Cadastro de cliente no Bling usa ensureOrderCustomer e ensure_customer_now quando o vínculo externo está ausente.
- Cadastro, registro e sincronização do cliente têm definições SQL próprias; o SQL versionado não substitui inspeção da RPC implantada.

## Correção segura aplicada

loadCustomerHistory agora atribui uma sequência a cada solicitação e ignora respostas/erros de solicitações antigas ou pertencentes a outro perfil. Isso evita que uma resposta tardia de um cliente sobrescreva o histórico exibido de outro cliente. Nenhum contrato do servidor ou regra comercial foi alterado.

## Riscos pendentes

- Falha de sincronização com Bling pode manter vínculo externo pendente; reprocessamento exige validação funcional.
- Histórico paginado não garante, por si só, snapshot estável durante novas compras.
- A consulta de detalhe precisa ser validada com testes de isolamento entre clientes na RPC.
- Testar navegação rápida entre perfis, requisições fora de ordem, repetição de paginação e histórico de pedidos migrados.

## Proteção

scripts/test-admin-customer-history-traceability-contract.mjs criado e incluído no workflow de regressão.
