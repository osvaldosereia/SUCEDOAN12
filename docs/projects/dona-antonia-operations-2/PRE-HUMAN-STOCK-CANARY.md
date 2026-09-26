# Operations 2.0 — Canário de catálogo/estoque preparado

Data: 2026-09-26

## Estado
PASS para preparação técnica. Nenhuma escrita externa de estoque/preço foi executada.

Baseline run:
- 9db0ee8c-6954-4b21-8a54-4a273a9ce069
- 1.630 produtos ativos
- 539 stock_update
- 1.091 noop
- 0 blocked

Canário preparado:
- 38213b37-fa60-4627-89c7-14b144a843ee
- 5 itens
- todos com identidade Bling materializada e GTIN
- todos com delta absoluto de 1 unidade
- external_write_enabled=false

## Arquitetura escolhida
Não criar segunda integração Bling. Reusar admin-service-intelligence-v1 / Bling Hub canônico, que já possui:
- preview_stock_sync;
- enqueue_job(s) com operation=set_stock;
- process_stock_jobs;
- mirror de estoque;
- idempotência;
- canário físico/baixa de expedição.

As antigas bling-products-ingest, bling-products-import-once e inventory-fast-stock-v1 estão aposentadas (410 retired_outside_site_vitrine_admin) e permanecem fora do caminho novo.

## Novo framework
- ops2_catalog_sync_canaries
- ops2_catalog_sync_canary_items
- ops2_prepare_catalog_stock_canary_v1
- ops2_verify_catalog_stock_canary_v1
- ops2_catalog_sync_canary_summary_v1
- índices de FK adicionados após advisor.

## Gate antes do primeiro write
O primeiro write só deve ocorrer pelo Hub canônico, com:
1. canário explicitamente armado;
2. lote máximo pequeno;
3. idempotency key por run/product;
4. before do snapshot preservado;
5. mirror pós-write confirmando desired_stock;
6. parar imediatamente em qualquer divergência;
7. não alterar stock authority (continua legacy_shadow).

## Segurança
Novas tabelas com RLS e sem grants anon/authenticated. Views security_invoker e sem grants públicos. Advisor de performance não aponta mais FKs sem índice; unused_index permanece informativo até haver tráfego.

## Próximo passo
Adicionar ao Hub uma ação específica e estreita para este canário de baseline, em vez de expor enqueue genérico ao operador. A ação deve validar run/canary/flag e só então enfileirar set_stock; verificação posterior pelo mirror.


## 2026-09-26 — Gate restrito implantado
- migration `ops2_arm_catalog_stock_canary_v1` aplicada;
- canário 38213b37-fa60-4627-89c7-14b144a843ee armado com confirmação literal;
- 5/5 itens continuam prepared e nenhum possui |delta| > 1;
- `external_write_enabled=true` somente neste canário;
- `admin-service-intelligence-v1` v158 ACTIVE;
- nova subaction interna `ops2_catalog_stock_canary_execute`;
- a ação revalida status, tamanho <=5, delta <=1 e binding exato antes de enfileirar;
- idempotency key inclui canary + product + desired_stock;
- o worker existente lê o saldo Bling antes, escreve, relê e exige igualdade;
- `ops2_stock_authority` não foi alterado.

Nenhum job do canário foi disparado nesta etapa. O próximo passo é execução controlada do canário pelo endpoint interno e verificação do mirror; qualquer mismatch interrompe expansão.
