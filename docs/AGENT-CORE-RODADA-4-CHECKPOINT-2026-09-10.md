# Dona Antônia Agent Core — Checkpoint Rodada 4/6

Data: 2026-09-10

## Estado

Rodada 4 em andamento. A infraestrutura de decisão foi simplificada sem retirar routers comerciais que ainda protegem o atendimento. O critério para aposentadoria agora é objetivo e fail-closed.

## Implementado nesta rodada

- `agent_core_router_inventory`: inventário explícito de triggers/routers de `ai_jobs` e `outbound_jobs` com classificação em `hard_safety`, `transport`, `deterministic_policy`, `compatibility` e `legacy`;
- 20 rotas iniciais classificadas; após canonicalização do dispatcher, o histórico de inventário possui também a rota V2 marcada como `retired` e a V3 como canônica;
- dois triggers AFTER do Agent Core (`observe` + `shadow dispatch`) consolidados em `trg_agent_core_shadow_postprocess_v1`;
- ordem consolidada `observe -> dispatch` para preservar metadados do turno e manter falha non-blocking;
- trigger duplicado `trg_conversations_updated_at` removido; `set_conversations_updated_at` permanece;
- dispatcher canônico `dispatch_conversation_worker_job_v3` e trigger `ai_job_event_dispatch_v3` criados;
- `dispatch_conversation_worker_job_v2` mantido somente como wrapper de compatibilidade para V3;
- funções-trigger antigas sem dependências removidas;
- recovery canônico `recover_conversation_worker_dispatch_v3` criado;
- cron `dona-antonia-conversation-worker-recovery-v2` substituído por `dona-antonia-conversation-worker-recovery-v3`, mantendo frequência de 1 minuto;
- recovery V2 mantido apenas como wrapper de compatibilidade;
- `get_agent_core_round4_readiness_v1` criado;
- `get_agent_core_round4_parity_report_v1` e `get_agent_core_round4_mismatch_sample_v1` criados para bloquear aposentadoria sem evidência suficiente;
- contrato `scripts/test-agent-core-round4-contract-v1.mjs` criado e CI dedicado ampliado para Rodadas 3/4 e Deno check das Edge Functions relevantes.

## Paridade observada

Na janela de 168h havia 4 decisões Agent Core com modelo. Resultado no momento deste checkpoint:

- amostra planejada: 4;
- concordância de intenção: 3/4 = 75%;
- concordância de ferramenta comparável: 3/4 = 75%;
- escalonamentos: 1;
- confiança média: 0,9875;
- mínimo exigido para retirada: 20 amostras e 95% de concordância;
- `retirement_ready=false`, motivo `insufficient_shadow_sample`.

Foram observados dois sinais que justificam manter os routers de interpretação: um turno baseline `baskets` foi classificado como `product_search`; outro baseline `search` escolheu `wa_list_baskets`.

## Routers que não devem ser removidos ainda

Os routers comerciais legados/mistos continuam ativos enquanto a paridade não estiver comprovada. Entre eles há lógica de busca simples, saudação, checkout/pagamento de cesta, fallback de cesta, troca/personalização e multi-search CTA. Alguns misturam interpretação textual com validação/side effects determinísticos e precisam ser decompostos antes de qualquer retirada.

Guardrails que permanecem fora do modelo por desenho: release gate, handoff humano, rate limit de outbound, transporte, idempotência, endereço/checkout determinístico e demais compromissos transacionais.

## Worker V2

O banco e o cron canônicos já apontam para V3. A Edge Function `conversation-worker-v2` ainda existe como compatibilidade histórica. Não foi removida/desativada porque ainda existem referências em documentação, configuração e testes antigos; não há função PostgreSQL atual chamando diretamente `/conversation-worker-v2`. A retirada definitiva deve ocorrer somente após busca de dependências externas/Make e atualização de regressões.

## Make

Auditoria desta execução: somente três cenários ativos no time de produção, todos sem execuções incompletas:

- `6779824` — Dona Antônia - WhatsApp Inbound Controlado v1;
- `7290488` — Dona Antônia - WhatsApp Outbound Event-Driven v3;
- `6379567` — consultar no cpf.

Nenhum cenário novo foi criado ou ativado nesta rodada.

## Segurança preservada

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`;
- Agent Core continua em `observe`;
- aprendizagem automática continua OFF;
- nenhum Flow foi publicado/exposto e nenhum pedido foi enviado ao Bling.

## Rollback

A consolidação é reversível por migration corretiva: recriar os triggers shadow separados apontando para `agent_core_shadow_observe_ai_job_v1`/`agent_core_shadow_dispatch_trigger_v1` a partir das migrations históricas; restaurar `ai_job_event_dispatch_v2` usando o wrapper V2; e reagendar `dona-antonia-conversation-worker-recovery-v2`. Como os wrappers V2 continuam presentes para dispatcher/recovery, o rollback de transporte não exige regressão para a Edge V2.

## Próximo ponto programável

1. completar busca de dependências externas da Edge `conversation-worker-v2` e atualizar testes/configuração histórica sem apagar evidência;
2. ampliar a amostra shadow e corrigir as divergências de intenção/ferramenta;
3. decompor routers `legacy` bloqueados em interpretação Agent Core + ferramentas/validações determinísticas;
4. retirar cada router somente quando o gate de paridade permitir.
