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


## Primeiro canário real — PASS
Autorizado e executado em 2026-09-26.

Resultado:
- 5/5 jobs `set_stock` = synced;
- todos os writes retornaram HTTP 201;
- worker fez read-before + write + read-after e marcou `verified=true`;
- saldos: 4→3, 3→2, 2→1, 5→4, 7→6, exatamente iguais ao baseline Supabase;
- segunda leitura independente confirmou 5/5 `current_stock == target_stock`;
- 0 divergências, 0 review_required, 0 failed;
- canário final = verified;
- external_write_enabled voltou a false;
- allowlist temporária desabilitada;
- Hub voltou a hub_enabled=false;
- modo permanece homologation e write_canary_limit=1;
- stock authority não foi alterada.

Observação: leituras independentes disparadas inicialmente em paralelo encontraram `oauth_busy` em 4/5 por lock intencional do OAuth. Repetidas sequencialmente, 4/4 passaram; somadas à primeira leitura, 5/5 confirmadas. Isso não representou falha de estoque.

Gate para expansão: tecnicamente aprovado para preparar próximo lote controlado; não habilitar batch global nem mudar stock authority.


## Expansão progressiva — canário 2 PASS
Canário ade84ad2-436d-4e91-8c14-3c3b5d3178b4:
- 5 novos produtos, todos delta absoluto 1;
- 5/5 jobs synced;
- 5/5 read-after-write verified=true;
- alterações observadas: 3→4, 2→1, 6→7, 3→4, 3→2;
- 0 falhas e 0 divergências;
- itens confirmados no plano para não serem reselecionados;
- Hub desligado novamente após o lote;
- homologation/write_canary_limit=1 preservados.

Acumulado: 10 produtos reais sincronizados com sucesso em dois canários.


## Expansão progressiva — canário 3 PASS
Canário 2bc77355-0531-477a-82f1-d298aa56225f:
- 5 novos produtos delta absoluto 1;
- 5/5 jobs synced e verified=true;
- alterações: 3→2, 19→18, 5→4, 4→5, 2→3;
- 0 falhas/divergências;
- Hub/allowlist desligados ao final.

Acumulado:
- 15 produtos reais confirmados;
- 524 stock_update ainda planejados;
- 156 deles ainda são delta 1.


## Rodada ampla delta 1 — 20 produtos — PASS
Executada em 2026-09-26.

Canários:
- ea8fc8d1-a5fc-4560-8713-277ab998b272
- 119359dd-ec79-4a42-b388-3ad3ec7b2817
- 6ec47be7-3331-45bc-bd45-09b1e55f4371
- 134ebaf9-fbb4-4e3a-9076-aee3f31aeee3

Resultado:
- 20/20 produtos synced;
- 20/20 com read-after-write verified=true;
- 0 review_required;
- 0 failed;
- 0 pending ao fechamento;
- Hub desligado entre os blocos e ao final;
- homologation preservado;
- write_canary_limit=1 preservado;
- nenhum delta > 1 entrou nesta rodada.

Acumulado:
- 35 produtos reais confirmados no Bling;
- 504 stock_update ainda planejados;
- 136 deles ainda são delta absoluto 1.

## Hardening após rodada ampla
Foi auditado se o estoque atual do Supabase havia mudado em relação ao target do snapshot entre preparação e execução.
Resultado: 35/35 confirmados sem drift.

Novo gate obrigatório:
- banco: ops2_arm_catalog_stock_canary_v1 bloqueia com live_supabase_stock_drift se products.stock divergir do desired_stock;
- Hub: ops2_catalog_stock_canary_execute relê products.stock imediatamente antes de enfileirar e bloqueia o write em qualquer drift;
- admin-service-intelligence-v1 atualizado para v159 ACTIVE;
- nenhum write global habilitado.

Advisors após hardening:
- security: somente INFO rls_enabled_no_policy no padrão interno fechado já conhecido;
- performance: somente unused_index INFO; nenhum novo FK sem índice.

Estado ao fechar:
- hub_enabled=false;
- mode=homologation;
- write_canary_limit=1;
- stock authority global não alterada.
