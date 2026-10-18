# Rodada 13/20 — Bling

Auditoria do código versionado da integração Bling, sem operações externas.

## Proteções identificadas
- hub consulta get_bling_hub_key_v2, usa timeout e identifica erro de reautorização OAuth.
- ops2LiveRuntime consulta chaves de habilitação, data de corte e estado da integração.
- syncConfirmedOrderToBling verifica o corte, tenta sincronizar o pedido e, em falha, marca review_bling, enfileira sync_order_status e tenta abrir atenção operacional.
- blingOauthBegin exige owner, nonce aleatório, hash e prazo de dez minutos.
- setProductStockOfficial exige autoridade Bling, usa prévia, fila de ajuste e verificação posterior.

## Riscos pendentes
1. Chamadas remotas e atualizações locais não são uma transação única.
2. A fila de recuperação e a atenção operacional precisam ser testadas sob falha, duplicação e indisponibilidade.
3. A semântica de idempotência de jobs precisa ser confirmada no serviço Bling e banco.
4. Não foi inspecionada integralmente a implementação do hub externo.
5. Não foram executados OAuth, sincronizações ou movimentos de estoque reais.

## Entrega
Teste estático scripts/test-admin-bling-integration-contract.mjs criado. Tentativa de inclusão no CI foi bloqueada pela ferramenta. Não considerar CI concluído.
