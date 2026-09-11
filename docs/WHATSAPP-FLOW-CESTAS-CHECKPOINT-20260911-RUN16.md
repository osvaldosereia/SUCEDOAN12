# WhatsApp Flow Dona Antônia — Checkpoint RUN16

Data: 2026-09-11

## Objetivo

Continuar a implementação do único Flow comercial dinâmico sem ampliar rollout e fechar o caminho de busca direta quando a IA já compreendeu com clareza a intenção do cliente, mantendo o catálogo e todas as verdades comerciais no backend determinístico.

## Estado real antes da alteração

Sessão owner-only: `836b1b60-8030-424a-aab3-c6f8f6a0969b`.

Readiness V33 confirmado:

- `ok=true`;
- `current_screen=PERSONALIZAR`;
- `next_expected=CUSTOMIZE_OR_CONTINUE`;
- `runtime_ok=true`;
- `post_v32_error_count=0`;
- `post_v32_guard_count=0`;
- `segmented_catalog_ready=true`;
- `full_catalog_loaded=false`;
- `visual_homologation_complete=false`.

Gates preservados:

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## V34 — busca direta por intenção clara

Foi criada a função somente leitura:

`public.get_whatsapp_flow_direct_search_v1(query, page, page_size)`

Objetivo: permitir que a camada conversacional/IA, quando já souber o que o cliente procura, envie somente o termo de busca ao backend em vez de obrigar o cliente a navegar seção → termo.

Regras:

- a IA não fornece produto, preço, estoque ou imagem;
- a IA fornece apenas a intenção textual de busca;
- produtos continuam vindo exclusivamente de `get_whatsapp_flow_product_results_page_v2` / catálogo determinístico;
- consulta normalizada e limitada a 80 caracteres;
- consulta vazia/curta é rejeitada;
- página padrão com 12 produtos;
- limite duro de 20 produtos por página;
- nunca carrega catálogo completo;
- nenhuma escrita comercial;
- nenhuma PII retornada;
- execução exclusiva via `service_role`.

## Readiness V34

Criada:

`public.get_whatsapp_flow_v34_direct_search_readiness_v1()`

A auditoria executa buscas reais e somente leitura para:

- `leite`;
- `arroz`;
- `detergente`;
- `sabonete`;
- `shampoo`.

Resultado em produção controlada:

- `ok=true`;
- 5/5 buscas com resultados reais;
- máximo retornado por teste: 12;
- `hard_page_cap=20`;
- zero conjunto inválido de produto;
- zero página acima do limite;
- consulta curta rejeitada;
- `full_catalog_loaded=false`;
- `ai_authoritative_for_catalog=false`;
- `writes_executed=false`;
- `pii_returned=false`.

Readiness owner consolidado:

`public.get_whatsapp_flow_v34_owner_homologation_readiness_v5(session_id)`

Resultado após implantação:

- `ok=true`;
- `readiness_version=v34-owner-v5`;
- `direct_intent_search_ready=true`;
- `direct_search_sample_query_count=5`;
- `direct_search_viable_query_count=5`;
- `direct_search_max_products_returned=12`;
- `direct_search_hard_page_cap=20`;
- `segmented_catalog_ready=true`;
- `runtime_ok=true`;
- `current_screen=PERSONALIZAR`;
- gates de rollout preservados.

## Persistência/CI

Migration:

`supabase/migrations/20260911041700_whatsapp_flow_v34_direct_intent_search_v1.sql`

Contrato:

`scripts/test-whatsapp-flow-v34-direct-intent-search-contract.mjs`

Workflow atualizado:

`.github/workflows/test-whatsapp-flow-v31-live-audit.yml`

O contrato impede regressões como:

- retirar o limite de 20;
- transformar a IA em autoridade de catálogo;
- carregar catálogo completo;
- liberar RPC para anon/authenticated;
- remover rejeição de busca curta;
- remover flags de ausência de escrita/PII.

## Make

Auditoria encontrou exatamente os três cenários autorizados ativos:

1. `Dona Antônia - WhatsApp Outbound Event-Driven v3`;
2. `Dona Antônia - WhatsApp Inbound Controlado v1`;
3. `consultar no cpf`.

Todos com `incompleteExecutions=0`.

Nenhum cenário foi alterado.

## Próximo passo

A parte automática segura avançou. A sessão real continua parada em `PERSONALIZAR`; por isso ainda não existe novo guard/cache pós-V32 real. Quando houver a próxima interação no aparelho autorizado, auditar imediatamente o primeiro guard pós-V32 e continuar a jornada visual completa.

Depois disso, a sequência permanece: personalização → seção/termo ou busca direta → produtos extras → upsell/cross-sell → revisão → cadastro/endereço → pagamento → finalizar → `nfm_reply` → pedir localização no WhatsApp.
