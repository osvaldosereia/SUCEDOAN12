# Rodada 11/20 — Lotes, validades e FEFO

Branch: refactor/admin-print-queue-panel-20261018. PR #1121.

## Regras verificadas no SQL versionado

- product_inventory_lots mantém código, validade, quantidade física, quantidade reservada, status e origem.
- ops2_fefo_preview_v1 seleciona lotes ativos, não vencidos, quantificados e com quantidade disponível positiva.
- A alocação usa ordem expiration_date, id e saldo cumulativo; o campo fully_allocatable compara a disponibilidade total com a quantidade solicitada.
- ops2_reconcile_lot_expiry_status_v1 classifica lotes vencidos, esgotados e reativados.
- A proteção de lot_tracking_complete exige lotes presentes, nenhum lote sem quantidade, saldo físico do Bling disponível e diferença máxima de 0,001 entre lotes rastreados e físico Bling.
- Para rastreamento completo, a validade efetiva deriva dos lotes; para produtos legados, a regra preserva products.validity_date.

## Riscos e lacunas

1. A função FEFO é uma prévia read-only. Ela não reserva lotes nem demonstra alocação transacional em uma separação concorrente.
2. A RPC SQL de prévia não valida p_quantity diretamente, mas o endpoint fefoPreview exige quantidade numérica finita e estritamente positiva e retorna invalid_fefo_request caso contrário. Chamadas diretas à RPC por outros serviços exigem a mesma validação no chamador.
3. A reconciliação de lote é necessária para habilitar rastreamento completo; não presumir que todos os produtos estejam reconciliados.
4. O cálculo depende de status e quantity_reserved corretos; validar com testes de concorrência e cenários de lotes parciais.
5. SQL de migrações posteriores pode substituir funções; o teste estático sobre arquivos versionados não prova a versão implantada.

## Trabalho

Teste scripts/test-admin-lots-fefo-contract.mjs adicionado ao workflow. Sem alterações de lotes, validades ou regras de FEFO em produção.
