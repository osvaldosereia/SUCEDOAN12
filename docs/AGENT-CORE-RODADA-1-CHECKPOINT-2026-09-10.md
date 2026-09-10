# Checkpoint — Dona Antônia Agent Core — Rodada 1/6

Data: 2026-09-10

## Objetivo

Iniciar a migração segura do atendimento WhatsApp acumulado para um único Agent Core, sem desligar o worker atual, sem aumentar rollout e sem gerar resposta duplicada ao cliente.

## Concluído

- Roadmap oficial de 6 rodadas criado em `docs/ROADMAP-AGENT-CORE-DONA-ANTONIA-6-RODADAS.md`.
- `agent_core_runtime_config` criado com `execution_mode=observe`, `legacy_router_policy=shadow`, GPT-5.6 Luna primário, Terra para escalonamento, máximo de 6 tool calls e 3 mensagens recentes no pacote.
- `agent_core_turns` criado para telemetria de decisão/custo/cache/latência sem armazenar prompt completo.
- `ai_action_registry` reaproveitado como registro oficial de ferramentas, evitando um segundo catálogo paralelo.
- 11 ferramentas WhatsApp governadas registradas: busca/consulta de produto, carrinho, cestas, políticas, recomendações, adicionar, quantidade, troca, confirmação de encomenda e handoff humano.
- Ferramentas permanecem em `observe`; leitura/escrita reversível são simuladas e compromisso exige confirmação.
- Conversa com handoff humano aberto bloqueia ferramentas que exigem handoff livre.
- `build_whatsapp_sales_context_v1` corrigido para usar `get_service_intelligence_compact_v3`; a recuperação limpa de conhecimento agora chega ao worker real.
- `build_whatsapp_agent_core_packet_v1` criado com mensagem atual, estado, carrinho, no máximo 3 mensagens, resumo, memória seletiva, inteligência relevante e toolset. Catálogo inteiro nunca entra no pacote.
- Observer shadow não chama OpenAI e não envia mensagem. Registra somente tópico, ferramentas e métricas de contexto.
- Hook shadow em `ai_jobs` é pós-conclusão e fail-open apenas para telemetria; falha do observer não quebra atendimento.
- 26 turnos históricos observados para baseline: contexto médio ~9,1 KB, com exemplos de cesta, produto, pagamento e checkout.
- Baseline oficial de legado: 11 triggers `BEFORE INSERT` em `ai_jobs`; serão consolidados somente após paridade.
- 33 handoffs `open` auditados e todos são `live_canary_human_control`; não foram fechados, pois fazem parte da proteção do canary.
- Make revalidado: somente Inbound Controlado v1, Outbound Event-Driven v3 e `consultar no cpf` ativos, todos sem execuções incompletas. O único OpenAI no outbound é TTS Marin B, não raciocínio comercial.
- CI `CI Dona Antonia Agent Core` criado. Run #6 / `34486115952` concluiu com `success` após correção de uma asserção case-sensitive.
- Advisors Supabase executados. Nenhuma nova exposição crítica; Agent Core segue server-only/RLS. Infos/warnings históricos continuam fora do escopo desta rodada.

## Segurança preservada

Não alterados:

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `bling_order_sync_enabled=false`;
- `whatsapp_sales_bling_submit_enabled=false`.

Agent Core não responde ao cliente em `observe` e não amplia rollout.

## Próximo ponto exato — Rodada 2/6

Implementar `dona-antonia-agent-core-v1` como orquestrador central em shadow:

1. Responses API com prompt kernel pequeno e estável;
2. function calling usando schemas do `ai_action_registry`;
3. executar somente ferramentas read-only no shadow; writes continuam simulados/bloqueados conforme policy;
4. `prompt_cache_key` + TTL de 30m e telemetria `cached_tokens/cache_write_tokens`;
5. Luna primeiro e Terra somente por política objetiva de escalonamento;
6. no máximo 6 tool calls por turno;
7. registrar intenção, ferramenta escolhida, policy, tokens, cache e latência em `agent_core_turns`;
8. não criar outbound no shadow;
9. comparar Agent Core com worker V3 antes de qualquer mudança de dispatcher.

## Critério para não avançar

Não substituir o worker V3, não aposentar routers e não ampliar canary até os testes comparativos demonstrarem paridade ou melhoria de qualidade, custo e segurança.