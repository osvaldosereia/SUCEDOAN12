# Checkpoint — Dona Antônia Agent Core — Rodada 2/6

Data: 2026-09-10

## Status

**RODADA 2 CONCLUÍDA.**

O novo cérebro está implantado em shadow/observe e não substitui o `conversation-worker-v3`, não cria outbound e não executa efeitos comerciais.

## Implementado

- Edge Function `dona-antonia-agent-core-v1`, atualmente implantada como v2.
- OpenAI Responses API com `store:false`.
- GPT-5.6 Luna como planejador principal.
- GPT-5.6 Terra somente como crítica/escalonamento, sem acesso a tools; ela reutiliza decisão e evidências obtidas pela Luna.
- Prompt kernel pequeno e estável com verdade transacional no Supabase, handoff absoluto, preço comercial de cesta e proibição de invenção de catálogo/preço/estoque/regra.
- 11 tools governadas derivadas de `ai_action_registry`, com schemas strict.
- Apenas tools `read_only` são realmente executadas em shadow. Escritas permanecem simuladas/bloqueadas conforme policy.
- Limite próprio de 6 custom tool calls por turno.
- Reuso de chamadas idênticas dentro do mesmo turno.
- `prompt_cache_key` estável + `prompt_cache_options.ttl=30m`.
- Telemetria de input/output/cache/latência/modelo/tool/policy em `agent_core_turns` e `agent_core_tool_calls`, sem armazenar prompt completo.
- Chave interna exclusiva `agent_core_webhook_v1` no Vault + hash em `system_secrets`.
- Elegibilidade shadow bloqueia handoff humano e limita execução automática a cohort apropriado; replay explícito permanece disponível para avaliação técnica.
- Limite de 30 planejamentos shadow/hora.
- Multi-intenção implementada: mensagens como “cesta básica + arroz” mantêm `basket` como intenção principal e `product_search` como secundária.
- `get_agent_core_round2_readiness_v1()` e `get_agent_core_round2_report_v1()` criados.

## Testes reais em shadow/replay

### Multi-intenção normal Luna

Mensagem de replay: pedido de cesta básica junto com arroz.

Resultado final após correção:

- intenção principal: `basket`;
- secundária: `product_search`;
- `next_action=show_baskets`;
- `should_use_flow=true`;
- confiança 0,99;
- 1 tool call;
- modelo: GPT-5.6 Luna;
- sem escalonamento.

### Escalonamento Luna → Terra

Foi forçado temporariamente threshold alto apenas para testar o caminho de escalonamento. Um primeiro teste revelou que a Terra poderia competir pelo orçamento restante de tools; o guardrail bloqueou corretamente. A arquitetura foi corrigida: Terra agora é crítica sem tools.

Smoke após correção:

- Luna realizou 1 tool read-only;
- Terra reutilizou a evidência sem consultar nova tool;
- resultado: `basket` + secundária `product_search`;
- `show_baskets`, Flow=true;
- confiança 0,99;
- nenhum estouro do orçamento.

A configuração temporária foi restaurada para `agent_version=v1`, threshold `0.680`, `execution_mode=observe`.

### Cache

Um replay consecutivo registrou 6.772 tokens de cache em 7.673 tokens de entrada, aproximadamente 88% de reaproveitamento naquele turno.

Relatório agregado inicial de 24h, ainda com amostra pequena proposital da Rodada 2:

- planejados: 4;
- falhas: 0;
- escalados: 1;
- tool calls: 5;
- executed calls: 5;
- unsafe write executions: **0**;
- confiança média: 0,9875;
- latência média: 8.484 ms;
- input tokens: 24.018;
- cached input tokens: 12.928;
- cache read ratio: 0,5383;
- output tokens: 1.226.

A amostra não é usada como critério final de qualidade; isso pertence à Rodada 5.

## CI

`CI Dona Antonia Agent Core` foi ampliado para cobrir também:

- migrations da Rodada 2;
- Edge `dona-antonia-agent-core-v1`;
- Responses API e `store:false`;
- prompt cache;
- strict function tools;
- limite custom de tool calls;
- Terra sem tools;
- somente read-only executável em shadow;
- writes simulados;
- ausência de caminho outbound/comercial na Edge shadow;
- multi-intenção;
- handoff;
- invariantes de rollout.

GitHub Actions Run #8 (`34490926763`) concluiu com `success`.

## Make

Revalidado nesta rodada. Permanecem ativos somente:

1. `7290488` — Dona Antônia - WhatsApp Outbound Event-Driven v3;
2. `6779824` — Dona Antônia - WhatsApp Inbound Controlado v1;
3. `6379567` — consultar no cpf.

Todos com `incompleteExecutions=0` na última consulta.

## Segurança / gates ao encerrar

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `bling_order_sync_enabled=false`;
- `whatsapp_sales_bling_submit_enabled=false`;
- Agent Core `execution_mode=observe`;
- `legacy_router_policy=shadow`;
- `learning_write_enabled=false`.

Nenhum cliente recebeu resposta do Agent Core nesta rodada.

## Advisors

Security Advisor: sem nova exposição específica do Agent Core. As tabelas do Agent Core seguem RLS/server-only; os avisos `rls_enabled_no_policy` fazem parte do padrão server-only já existente. Há aviso global/preexistente de proteção contra senhas vazadas desabilitada, fora do escopo do atendimento WhatsApp.

Performance Advisor: não apontou FK nova do Agent Core sem índice. Os índices recém-criados aparecem como ainda não utilizados, esperado nesta fase de shadow. Avisos históricos de FKs/índices duplicados de outras áreas ficaram fora do escopo.

## Próximo ponto exato — Rodada 3/6

Implementar memória seletiva e aprendizagem assíncrona:

- resumo incremental por conversa;
- memória útil de cliente com evidência/confiança/validade e exclusão de atributos sensíveis;
- preferências declaradas com precedência;
- fila durável para resumo e aprendizagem fora do atendimento síncrono;
- candidatos de conhecimento global sem autopublicação;
- deduplicação/agrupamento de aprendizados;
- recuperação híbrida estruturada/textual, usando vetor somente se trouxer ganho real;
- Admin para revisar/aprovar/rejeitar candidatos;
- manter Agent Core em observe e aprendizado global automático OFF até homologação.

Não alterar canary, Flow, Experience Orchestrator ou Bling durante a Rodada 3 sem autorização explícita.