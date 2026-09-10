# Dona Antônia Agent Core — Checkpoint Rodada 4/6

Data: 2026-09-10

## Estado

Rodada 4 em andamento, com a fundação de consolidação já protegida por gates fail-closed. O Agent Core continua em `observe`; nenhum router comercial foi desligado e nenhum gate de rollout foi ampliado.

## Implementado nesta rodada

- `agent_core_router_inventory`: inventário explícito dos triggers/routers de `ai_jobs` e `outbound_jobs`, classificados em `hard_safety`, `transport`, `deterministic_policy`, `compatibility` e `legacy`;
- pós-processamento shadow consolidado em `trg_agent_core_shadow_postprocess_v1`;
- duplicidade de `updated_at` removida;
- dispatcher e recovery canônicos alinhados ao `conversation-worker-v3`;
- `conversation-worker-v2` mantido apenas como compatibilidade histórica;
- busca comercial do Agent Core isolada em `search_whatsapp_sellable_products_agent_v1`, sem alterar a busca do worker V3;
- replay histórico seguro V3, restrito a famílias stateless e homologação;
- pacote histórico realmente neutro: sem estado atual, carrinho, cliente, resumo ou memória atual;
- gate semântico V5 com deduplicação por `message_id`, expectativa histórica recomputada e `legacy` tratado apenas como informação;
- gate por router: evidência suficiente não equivale a permissão de desligamento;
- Edge `dona-antonia-agent-core-v1` promovida para versão 6 após CI verde;
- Edge v6 usa `preview_whatsapp_agent_action_v2` com `message_id` atual antes de qualquer tool call;
- somente tools `read_only` são executadas no shadow; demais ações continuam simuladas, sem side effects;
- preconditions stateful: 19/19 tipos declarados cobertos e inputs UUID/número/boolean tratados fail-closed;
- 16 ações WhatsApp stateful registradas: 14 reversíveis e 2 de compromisso, todas ainda em `observe`;
- `get_agent_core_round4_stateful_transition_readiness_v1`: separa prontidão técnica de shadow da autorização para executar;
- `stateful_execution_permitted_now=false` e `manual_authorization_required=true` permanecem explícitos;
- captura estrutural pré-router criada em `agent_core_pre_router_snapshots`, somente para homologação, sem corpo da mensagem, transcrição, `customer_id` ou PII de payload;
- trigger `a0z_agent_core_pre_router_state_v1` roda depois do release gate e antes do primeiro router comercial, permitindo futura comparação stateful a partir do estado correto anterior à ação;
- snapshot é fail-open e não interfere no atendimento se a telemetria falhar;
- migrations V6–V13 e contratos correspondentes reproduzidos no GitHub/CI.

## Paridade observada atual

A janela de 168h possui 20 decisões semânticas únicas válidas para o gate, deduplicadas por mensagem:

- amostra planejada: 20;
- cobertura: 10 `basket` + 10 `product_search`;
- concordância com expectativa de política: 20/20 = 100%;
- coerência decisão/tool: 20/20 = 100%;
- confiança média: 0,9885;
- escalonamentos: 1;
- comparação de intenção com legado: 19/20 = 95%, mantida somente como métrica informacional;
- `candidate_retirement_ready=true` para a evidência agregada.

Depois do deploy da Edge v6, quatro replays stateless seguros foram repetidos: 2 buscas e 2 cestas. Os quatro mantiveram topic/intenção corretos. As tools realmente executadas foram somente `wa_search_products` e `wa_list_baskets`, ambas `read_only`; nenhuma ação stateful foi executada.

## Aposentadoria por router

O gate agregado não autoriza remoção em bloco.

- `a1_whatsapp_simple_product_query_v1`: possui evidência específica suficiente, mas `can_disable_now=false` porque o Agent Core continua em `observe`;
- saudação: bloqueada até haver eval próprio e contrato do vínculo de cliente;
- troca de cesta: bloqueada até eval stateful da sessão/substituição;
- personalização: bloqueada até eval stateful das transições de checkout/vitrine;
- multi-search CTA: bloqueada até substituto/eval de apresentação e outbound;
- routers de checkout/pagamento permanecem bloqueados até comparação com estado pré-router.

Nenhum router comercial foi removido nesta execução.

## Observabilidade stateful

Os eventos históricos mostraram que vários resultados stateful (`basket_customer_data_processed`, `confirm_order`, `basket_ready_for_human` e alterações de endereço) não tinham um snapshot confiável do estado imediatamente anterior à ação. Comparar o Agent Core usando o estado posterior seria inválido.

Por isso foi criado `agent_core_pre_router_snapshots`. Ele grava apenas estado estrutural: modo/stage, `awaiting`, presença de sessão/carrinho, validade estrutural, flags de cadastro/endereço, janela de serviço e handoff. Não grava texto do cliente nem dados cadastrais.

No momento da criação havia `snapshot_rows=0`, o que é esperado: a captura não faz backfill artificial e passa a registrar somente novos jobs de homologação. Isso evita fabricar evidência histórica falsa.

## Worker V2

O banco, dispatcher e recovery canônicos usam V3. A auditoria dos três cenários Make ativos confirmou que nenhum deles aponta para `conversation-worker-v2`:

- inbound usa somente as Edges de ingestão do Supabase;
- outbound recebe jobs do Supabase e transporta mensagens para Meta/OpenAI TTS;
- consulta de CPF usa Bling.

No GitHub ainda existem referências históricas em documentação, `supabase/config.toml`, migrations antigas e alguns testes. A Edge V2 continua preservada como compatibilidade histórica até a limpeza dessas referências; não existe motivo técnico para recolocá-la no caminho canônico.

## Make

Somente três cenários permanecem ativos no time de produção, todos sem execuções incompletas no momento da auditoria:

- `6779824` — Dona Antônia - WhatsApp Inbound Controlado v1;
- `7290488` — Dona Antônia - WhatsApp Outbound Event-Driven v3;
- `6379567` — consultar no cpf.

Make continua sendo transporte/integração temporária; a inteligência comercial permanece no Supabase/Agent Core.

## Segurança preservada

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`;
- Agent Core em `observe`;
- `legacy_router_policy=shadow`;
- stateful tools em `observe`;
- `stateful_execution_permitted_now=false`;
- `retirement_execution_permitted=false`;
- `global_retirement_ready=false`;
- aprendizagem automática/global continua sem autopublicação;
- nenhum pedido foi enviado ao Bling por este trabalho;
- nenhum Flow foi publicado ou exposto por este trabalho.

## Rollback

A Edge v6 pode ser revertida para a versão anterior do código do Agent Core sem alteração de schema; o preview V2 apenas adiciona validações e delega a policy-base V1. O snapshot pré-router é telemetria fail-open: em rollback, basta remover `a0z_agent_core_pre_router_state_v1`; nenhum dado transacional depende da tabela de snapshots. Dispatcher/recovery V2 continuam disponíveis como wrappers históricos para V3.

## Próximo ponto programável

1. coletar novos snapshots estruturais em homologação e criar eval stateful por ação/estado, sem replay de estado inventado;
2. decompor os routers bloqueados usando as tools/preconditions já registradas;
3. atualizar referências históricas/testes do `conversation-worker-v2` e preparar sua retirada definitiva sem apagar evidência documental;
4. manter cada retirada individual sob gate por router;
5. somente depois avançar para a Rodada 5 de evals em escala.
