# WhatsApp Flow Dona Antônia — Checkpoint RUN19

Data: 2026-09-11

## Objetivo

Transformar em contrato verificável a evidência real de homologação da jornada segmentada após a promoção do stable para V25, sem alterar rollout, gates ou escrita comercial.

## Evidência real encontrada

Uma sessão owner-only de homologação percorreu com sucesso:

`INIT → CESTAS → PERSONALIZAR_A → SECOES_A → SECOES_A → TERMOS_A → PRODUTOS_A`

Foram observados 7 exchanges, todos `accepted`, sem `error_code` e sem replay rejeitado. A sessão foi depois marcada `abandoned` por `new_order_reset`, o que explica não ser mais a sessão aberta atual.

Todos os 7 request guards da sessão possuem `response_payload` e `response_cached_at`, comprovando cache real pós-V32 em tráfego de homologação.

A resposta segmentada observada carregou no máximo 5 produtos; o catálogo completo não foi carregado.

## Implementado

Criado `get_whatsapp_flow_v37_live_segmented_path_readiness_v1(uuid)` para auditar:

- ordem real `CESTAS → PERSONALIZAR_A → SECOES_A → TERMOS_A → PRODUTOS_A`;
- ausência de exchanges rejeitados/erros;
- cache de todos os guards;
- máximo de 20 produtos por resposta;
- detalhe de produto com `product_id`, nome e preço;
- `full_catalog_loaded=false`;
- todos os gates de rollout/comercial fechados.

Resultado real da sessão auditada:

- `ok=true`;
- `accepted_exchange_count=7`;
- `error_exchange_count=0`;
- `request_guard_count=7`;
- `cached_guard_count=7`;
- `all_guards_cached=true`;
- `segmented_path_observed=true`;
- `max_products_in_any_response=5`;
- `catalog_page_limit_respected=true`;
- `product_detail_valid=true`;
- `writes_executed=false`;
- `pii_returned=false`.

Permissões confirmadas: `anon=false`, `authenticated=false`, `service_role=true`.

## Gates preservados

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## GitHub/CI

Persistidos:

- `supabase/migrations/20260911072400_whatsapp_flow_v37_live_segmented_path_readiness_v1.sql`;
- `scripts/test-whatsapp-flow-v37-live-segmented-path-contract.mjs`;
- workflow `Test WhatsApp Flow Live Audit` atualizado com V37.

Run `34574228896` disparado; ainda estava `in_progress` na última leitura deste checkpoint.

## Make

Auditoria confirmou exatamente os três cenários autorizados ativos, todos com `incompleteExecutions=0`:

1. `Dona Antônia - WhatsApp Outbound Event-Driven v3`;
2. `Dona Antônia - WhatsApp Inbound Controlado v1`;
3. `consultar no cpf`.

Nenhum cenário foi alterado.

## Segurança

O advisor do Supabase foi executado após o DDL. A nova função V37 não apareceu nas advertências de execução pública. Permanecem avisos preexistentes do projeto, inclusive funções SECURITY DEFINER fora deste bloco; nenhuma delas foi alterada nesta rodada.

## Estado atual / próximo bloco

Existe uma nova sessão aberta do stable apenas em `CESTAS` após `INIT`. O próximo avanço real depende de novas interações no aparelho de homologação para atravessar `PRODUTO → ADICIONAIS/UPSELL → revisão → cadastro/endereço → pagamento → FINALIZAR → nfm_reply → localização`.

Até isso ocorrer, manter todos os gates e o rollout inalterados.
