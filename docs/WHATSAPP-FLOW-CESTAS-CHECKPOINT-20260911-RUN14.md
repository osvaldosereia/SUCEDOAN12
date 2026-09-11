# WhatsApp Flow Dona Antônia — Checkpoint RUN14

Data: 2026-09-11

## Objetivo desta rodada

Continuar a homologação controlada do Flow comercial único de cestas básicas, sem ampliar rollout e sem habilitar nenhum gate global. Prioridade desta rodada: melhorar a observabilidade da sessão real já aberta e separar corretamente falhas históricas pré-V32 da saúde do runtime atual pós-V32.

## Estado real da homologação

- Sessão owner-only: `836b1b60-8030-424a-aab3-c6f8f6a0969b`
- Candidato: `flow-cestas-comercial-v8-stable`
- Tela atual real: `PERSONALIZAR`
- A sessão já executou `INIT` e escolha de cesta.
- Continua existindo 1 erro histórico `flow_transition_invalid` de replay em `CESTAS`, ocorrido antes do cutover V32.
- Não houve nova interação no aparelho depois do cutover V32 nesta rodada.

## Implementado

### 1. Auditoria live V32 cutover-aware

Migration:

`supabase/migrations/20260911012500_whatsapp_flow_v32_live_session_audit_v2.sql`

Função:

`public.get_whatsapp_flow_v32_live_session_audit_v2(uuid)`

A auditoria:

- preserva o histórico anterior, sem apagar ou maquiar erros;
- separa `historical_error_count` de `post_v32_error_count`;
- separa `post_v32_replay_count`;
- inspeciona os guards criados após o cutover V32;
- contabiliza respostas pós-V32 com e sem `response_payload/response_cached_at`;
- informa `replay_cache_observed` e `replay_cache_coverage_complete`;
- não retorna PII;
- não executa escrita comercial;
- é executável somente por `service_role`.

O cutover considerado é `2026-09-10 23:24:20.361+00`, correspondente ao deploy da Edge V32.

### 2. Correção do mapa de próxima etapa

A auditoria V31 antiga não reconhecia a tela real `PERSONALIZAR` sem sufixo e retornava `AUDIT_SCREEN`.

A V32 agora reconhece:

- `PERSONALIZAR`/`PERSONALIZAR_*` → `CUSTOMIZE_OR_CONTINUE`
- `AJUSTAR_ITEM` → `APPLY_ITEM_QUANTITY`
- `SECOES` → `SECTION_TERM_DIRECT_SEARCH_OR_FINISH`
- `TERMOS` → `SELECT_TERM`
- `PRODUTOS` → `SELECT_PRODUCT`
- `PRODUTO` → `ADD_PRODUCT`
- `UPSELL` → `OPTIONAL_UPSELL_OR_CONTINUE`
- `REVISAO` → `REVIEW_AND_CHECKOUT`
- telas de cliente → `CONFIRM_CUSTOMER_ADDRESS`
- `FINALIZAR` → `COMPLETE_FLOW`
- sessão concluída → `NFM_REPLY_OR_LOCATION`

### 3. Resultado real atual

Consulta da sessão owner-only retornou:

- `ok=true`
- `current_runtime_ok=true`
- `current_screen=PERSONALIZAR`
- `next_expected=CUSTOMIZE_OR_CONTINUE`
- `historical_error_count=1`
- `post_v32_error_count=0`
- `post_v32_replay_count=0`
- `post_v32_guard_count=0`
- `post_v32_cached_response_count=0`
- `post_v32_uncached_response_count=0`
- `historical_errors_preserved=true`
- `writes_executed=false`
- `pii_returned=false`

`post_v32_guard_count=0` é esperado porque ainda não ocorreu uma nova transição no aparelho após o deploy V32. Portanto, ainda NÃO existe evidência real de `replay_cache_observed`; somente o smoke transacional sintético seguro da RUN13 comprova o mecanismo de cache em isolamento.

### 4. Contrato e CI

Novo teste:

`scripts/test-whatsapp-flow-v32-live-session-audit-contract.mjs`

Workflow atualizado:

`.github/workflows/test-whatsapp-flow-v31-live-audit.yml`

Run GitHub Actions:

- `Test WhatsApp Flow Live Audit`
- run `34550325152`
- resultado: `success`

O contrato impede regressões de permissões, escrita indevida, PII, perda do cutover-aware, perda do suporte à tela `PERSONALIZAR` e remoção das métricas de cache/replay V32.

## Make

Permanecem ativos somente os três cenários autorizados, todos com `incompleteExecutions=0`:

1. Dona Antonia — WhatsApp Inbound — V1 (controlado)
2. Dona Antonia — WhatsApp Outbound — Event-Driven V1
3. Dona Antonia Clientes — Consulta CPF (Supabase RPC)

Nenhum cenário foi alterado nesta rodada.

## Gates preservados

Confirmados diretamente em `public.automation_config`:

- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

Nenhum cliente foi exposto. Nenhum rollout foi ampliado. Nenhum novo Flow foi enviado.

## Próximo passo

A próxima evidência real depende de uma nova interação owner-only no aparelho, continuando a partir de `PERSONALIZAR`. A primeira transição pós-V32 deverá criar um novo `whatsapp_flow_request_guard` com resposta cacheada. Depois disso, auditar:

1. `post_v32_guard_count > 0`;
2. `post_v32_cached_response_count > 0`;
3. `post_v32_uncached_response_count = 0`;
4. ausência de novo `post_v32_error_count`;
5. em retry real, resposta idêntica sem repetir mutação de estado.

Depois seguir a jornada: personalização → seções/termos/busca → extras → upsell → revisão → cadastro/endereço → pagamento → finalizar → `nfm_reply` → localização.

## Ação manual indispensável

Continuar no WhatsApp do número de homologação autorizado a partir da tela `PERSONALIZAR`. Nenhuma chave, alteração de Make, Supabase, Bling ou rollout é necessária.
