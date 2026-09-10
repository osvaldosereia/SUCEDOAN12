# Roadmap — Dona Antônia Agent Core — 6 rodadas

Data: 2026-09-10

## Decisão arquitetural

O atendimento WhatsApp passa a evoluir para um único **Dona Antônia Agent Core**, mantendo Supabase/PostgreSQL como verdade transacional, OpenAI Responses API para interpretação/planejamento, Meta/Make apenas como transporte e regras determinísticas para preço, estoque, cesta, pagamento, confirmação, entrega e demais compromissos.

Não criar uma malha de vários agentes neste momento. O padrão será um agente central com ferramentas governadas, memória seletiva, recuperação sob demanda, handoff humano e avaliações permanentes.

## Invariantes de segurança

Enquanto este roadmap não terminar e não houver autorização explícita do proprietário:

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `bling_order_sync_enabled=false`;
- não aumentar exposição do WhatsApp;
- handoff humano tem precedência absoluta;
- IA nunca é autoridade para catálogo, preço, estoque, margem, pagamento, fiscal, rota ou confirmação operacional;
- ações obrigacionais/irreversíveis exigem confirmação e validação determinística;
- nenhuma conversa de cliente vira regra global automaticamente.

## Rodada 1 — Fundação do Agent Core e contratos de ferramentas

Objetivo: criar uma única fundação de orquestração sem alterar a experiência do cliente.

Entregas:

- configuração única `agent_core_runtime_config`, iniciando em `observe`;
- trilha `agent_core_turns` para decisão, custo, cache, latência e ferramenta sem armazenar prompt completo;
- reaproveitar `ai_action_registry` como catálogo oficial de ferramentas;
- criar ferramentas WhatsApp específicas para catálogo, carrinho, cestas, políticas, recomendações, alterações reversíveis, confirmação e handoff;
- `build_whatsapp_agent_core_packet_v1` com mensagem atual, estado, carrinho, memória seletiva, inteligência relevante e no máximo poucas mensagens recentes;
- corrigir o contexto do worker atual para usar recuperação de inteligência V3;
- manter ferramentas em `observe` e routers legados em `shadow`;
- CI/contrato e checkpoint.

Critério de saída: ferramentas governadas, pacote compacto reproduzível e nenhuma alteração nos gates de rollout.

## Rodada 2 — Orquestrador único + Responses API + tool calling

Objetivo: implementar o novo cérebro sem desligar o worker atual.

Entregas:

- Edge Function `dona-antonia-agent-core-v1`;
- um prompt kernel pequeno e estável: identidade, prioridades, limites e regras universais;
- ferramentas expostas por function calling com schema vindo do registry;
- `prompt_cache_key` estável e `prompt_cache_options.ttl=30m` para GPT-5.6;
- registrar `cached_tokens` e `cache_write_tokens`;
- GPT-5.6 Luna como primeira tentativa e Terra apenas por política de escalonamento;
- limite de tool calls por turno;
- execução real somente em homologação/allowlist; demais turnos em shadow/observe;
- comparação Agent Core x worker V3 sem duplicar resposta ao cliente.

Critério de saída: Agent Core interpreta e escolhe ferramentas corretamente em shadow, com custo medido.

## Rodada 3 — Memória seletiva e aprendizagem assíncrona

Objetivo: aprender com conversas sem reenviar histórico inteiro e sem contaminar regras globais.

Entregas:

- resumo incremental por conversa;
- memória útil por cliente com evidência, confiança, validade e exclusão de atributos sensíveis;
- preferências declaradas com precedência sobre inferências;
- fila durável para resumo/aprendizagem fora do caminho síncrono;
- candidatos de conhecimento global, nunca autopublicados;
- deduplicação e agrupamento de candidatos semelhantes;
- recuperação híbrida estruturada/textual, com vetor apenas onde trouxer benefício real;
- Admin para revisar/aprovar/rejeitar aprendizados.

Critério de saída: contexto por turno permanece pequeno enquanto a qualidade melhora ao longo do tempo.

## Rodada 4 — Consolidação dos routers e limpeza de legado

Objetivo: retirar o “espaguete” de triggers sem perder guardrails.

Entregas:

- inventário final de todos os triggers/fast-paths de `ai_jobs`;
- classificar cada um como hard safety, transporte, política determinística, compatibilidade ou legado;
- mover interpretação/comercial para o Agent Core;
- manter fora do modelo somente gates de segurança, idempotência, handoff e validações determinísticas;
- substituir ordem implícita por uma porta de entrada explícita;
- aposentar worker V2 e funções comprovadamente sem dependência;
- remover duplicidades de regras e triggers apenas após prova de paridade;
- rollback documentado.

Critério de saída: um único caminho de decisão legível e auditável.

## Rodada 5 — Evals, replay e qualidade de atendimento

Objetivo: provar qualidade antes de ampliar exposição.

Entregas:

- ampliar regressões para dezenas/centenas de variações;
- cesta, produto avulso, quantidade, ambiguidades, pagamento, endereço, entrega, objeção, pós-venda, humano, áudio, imagem e Flow;
- replay anonimizado de conversas anteriores;
- métricas de intenção, ferramenta, falha, handoff, loop, latência, input/output, cache e custo;
- testes adversariais: prompt injection, informação falsa, tentativa de burlar estoque/preço/confirmar pedido;
- comparação Agent Core x baseline atual;
- critérios objetivos de aprovação.

Critério de saída: regressões críticas 100% e ganho/empate de qualidade com redução de contexto/custo.

## Rodada 6 — Homologação real e prontidão para público

Objetivo: homologar ponta a ponta e deixar a ativação geral preparada, sem ultrapassar autorização vigente.

Entregas:

- homologação no número autorizado;
- texto, áudio, imagem, cesta, produto, carrinho, cadastro, endereço, pagamento, Flow, `nfm_reply`, localização e handoff;
- observar erros, latência e custo real;
- kill switch e rollback testados;
- checklist operacional do Admin/equipe;
- retirar routers legados somente após homologação;
- preparar mudança de `observe/homologation` para `canary/live`.

Critério de saída: atendimento tecnicamente pronto. **Não aumentar canary acima de 1% nem expor Flow/clientes sem autorização explícita do proprietário.**

## Estado desta execução

Rodada 1 iniciada. Fundação do Agent Core aplicada no Supabase em modo `observe`. Próximo passo programável: persistir migration/CI e, na Rodada 2, implementar o orquestrador com tool calling e prompt cache mantendo o worker V3 como baseline.