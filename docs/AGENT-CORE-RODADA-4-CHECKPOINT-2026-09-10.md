# Dona Antônia Agent Core — Checkpoint Rodada 4/6

Data: 2026-09-10

## Estado

Rodada 4 em andamento, com a fundação de consolidação protegida por gates fail-closed. O Agent Core continua em `observe`; nenhum router comercial foi desligado e nenhum gate de rollout foi ampliado.

## Implementado nesta rodada

- `agent_core_router_inventory`: inventário explícito dos triggers/routers de `ai_jobs` e `outbound_jobs`, classificados em `hard_safety`, `transport`, `deterministic_policy`, `compatibility` e `legacy`;
- pós-processamento shadow consolidado em `trg_agent_core_shadow_postprocess_v1`;
- duplicidade de `updated_at` removida;
- dispatcher e recovery canônicos alinhados ao `conversation-worker-v3`;
- `conversation-worker-v2` mantido apenas como compatibilidade histórica/rollback;
- busca comercial do Agent Core isolada em `search_whatsapp_sellable_products_agent_v1`, sem alterar a busca do worker V3;
- replay histórico seguro V3, restrito a famílias stateless e homologação;
- pacote histórico realmente neutro: sem estado atual, carrinho, cliente, resumo ou memória atual;
- gate semântico V5 com deduplicação por `message_id`, expectativa histórica recomputada e `legacy` tratado apenas como informação;
- gate por router: evidência suficiente não equivale a permissão de desligamento;
- Edge `dona-antonia-agent-core-v1` promovida até a versão 7 após CI verde;
- a Edge usa `preview_whatsapp_agent_action_v2` com `message_id` atual antes de qualquer tool call;
- somente tools `read_only` são executadas no shadow; ações de escrita continuam simuladas, sem side effects;
- preconditions stateful: 19/19 tipos declarados cobertos e inputs UUID/número/boolean tratados fail-closed;
- V19 elevou o catálogo para 19 ações WhatsApp stateful: 17 reversíveis e 2 de compromisso, todas ainda em `observe`;
- `get_agent_core_round4_stateful_transition_readiness_v1`: separa prontidão técnica de shadow da autorização para executar;
- `stateful_execution_permitted_now=false` e `manual_authorization_required=true` permanecem explícitos;
- captura estrutural pré-router criada em `agent_core_pre_router_snapshots`, somente para homologação, sem corpo da mensagem, transcrição, `customer_id` ou PII de payload;
- trigger `a0z_agent_core_pre_router_state_v1` roda depois do release gate e antes do primeiro router comercial, permitindo futura comparação stateful a partir do estado correto anterior à ação;
- snapshot é fail-open e não interfere no atendimento se a telemetria falhar;
- `get_agent_core_round4_stateful_evidence_report_v1`: relatório V14 que cruza somente novos snapshots pré-router com a ação efetivamente tomada pelo legado;
- a V14 proíbe backfill histórico stateful, não carrega PII de payload e exige pelo menos 3 amostras por núcleo crítico antes de marcar `evidence_ready=true`;
- núcleos críticos iniciais: `basket_customer_data_processed`, `confirm_order`, `basket_ready_for_human` e `change_basket_delivery_address`;
- `get_agent_core_round4_consolidated_readiness_v10` inclui explicitamente `stateful_evidence_ready`, mantendo execução e aposentadoria forçadas a `false`;
- V15/V16 adicionaram `get_agent_core_round4_worker_v2_retirement_readiness_v1`, auditando runtime de banco sem confundir a própria string de diagnóstico com uma chamada real ao endpoint V2;
- V16 confirma V3 como caminho canônico de banco: trigger V3 presente, trigger V2 ausente, cron V3 presente, cron V2 ausente, wrappers V2 encaminhando para V3 e zero funções atuais atribuindo URL ao endpoint V2;
- `get_agent_core_round4_consolidated_readiness_v12` inclui o readiness do worker V2, mas mantém `worker_v2_edge_removal_authorized=false`, `retirement_execution_permitted=false` e `global_retirement_ready=false`;
- V17 corrigiu no router legado ainda ativo a promessa rígida de entrega: até 11h passa a ser `previsão de entrega no mesmo dia`; após 11h, `previsão de entrega no próximo dia útil`; em ambos, o horário depende da rota e do bairro;
- V17 possui guard de drift: a migration aborta se as frases antigas esperadas não estiverem exatamente na função que será alterada;
- V18 criou `get_agent_core_round4_blocked_router_contract_readiness_v1`, decompondo os 8 routers bloqueados em substitutos, tools requeridas, ações legadas equivalentes e mínimo de 3 amostras por router;
- V18 criou `get_agent_core_round4_consolidated_readiness_v13`, incorporando o novo gate e mantendo execução, aposentadoria e retirada global forçadas a `false`;
- imediatamente após V18, 5/8 contratos estavam completos e três superfícies faltavam: vínculo de identidade, abertura da personalização da cesta e vitrine extra de busca;
- V19 criou `wa_link_customer_identity`, `wa_open_basket_storefront` e `wa_create_search_showcase`, todas `reversible_write`, `execution_mode=observe` e `confidence_autorun_allowed=false`;
- `wa_link_customer_identity` encapsula o vínculo determinístico por telefone e devolve ao modelo apenas `known_customer` e `display_name_available`, sem nome, telefone ou endereço;
- `wa_open_basket_storefront` valida conversa/mensagem/sessão, mantém o token da cesta dentro do backend e devolve ao modelo apenas resultado compacto;
- `wa_create_search_showcase` cria no máximo uma vitrine adicional por chamada e mantém URL/sessão no backend;
- depois da V19, os 8/8 routers bloqueados possuem contrato de substituição completo; nenhum possui ainda evidência stateful suficiente para desligamento;
- a Edge v7 expõe essas três novas tools somente nos tópicos adequados (`greeting`, personalização de cesta e `product_search`), mas o executor continua efetuando apenas `read_only`; as três novas writes são simuladas em shadow;
- o kernel da Edge v7 limita a no máximo uma vitrine extra de busca por turno quando isso realmente reduzir passos;
- `scripts/test-agent-core-round4-router-contracts-v19.mjs` protege V17–V19, privacidade, observe-only, exposição das tools no shadow e ausência de execução direta de suas implementações;
- o workflow do Agent Core passou a observar também migrations de correção da promessa de entrega, além das migrations `dona_antonia_agent_core`;
- `scripts/test-agent-core-round4-worker-v2-retirement-v1.mjs` impede migrations posteriores ao cutover ou Edges atuais de reintroduzirem chamada ao endpoint V2;
- `scripts/whatsapp-operational-release-v1.test.mjs` valida o `conversation-worker-v3` como implementação canônica, mantendo migrations V2 apenas como evidência histórica;
- `.github/workflows/test-conversation-worker-v1.yml` inclui `conversation-worker-v3` no gatilho e no `deno check`, mantendo V2 apenas para compatibilidade/rollback;
- migrations V6–V19 e contratos correspondentes reproduzidos no GitHub/CI.

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

Depois do deploy da Edge v6, quatro replays stateless seguros foram repetidos: 2 buscas e 2 cestas. Os quatro mantiveram topic/intenção corretos. As tools realmente executadas foram somente `wa_search_products` e `wa_list_baskets`, ambas `read_only`; nenhuma ação stateful foi executada. A Edge v7 não altera essa política de execução: novas tools stateful podem ser planejadas/observadas, mas permanecem simuladas.

## Aposentadoria por router

O gate agregado não autoriza remoção em bloco. A V18/V19 tornou o bloqueio mensurável por router.

- 8 routers legacy continuam classificados como bloqueados;
- 8/8 possuem agora contrato de substituição completo;
- 0/8 possuem evidência de homologação suficiente no último fechamento;
- mínimo atual: 3 amostras pré-router reais por contrato;
- `a1_whatsapp_simple_product_query_v1` continua sendo o único candidato stateless com evidência específica suficiente, mas `can_disable_now=false` enquanto o Agent Core estiver em `observe`;
- saudação agora possui substituto `wa_link_customer_identity`, mas continua bloqueada até evidência própria;
- troca de cesta possui `wa_create_basket_replacement`, mas continua bloqueada até evidência stateful da sessão/substituição;
- personalização possui `wa_start_basket_checkout` + `wa_open_basket_storefront`, mas continua bloqueada até evidência stateful;
- multi-search CTA possui `wa_create_search_showcase`, mas continua bloqueado até evidência de apresentação/outbound;
- routers de checkout/pagamento permanecem bloqueados até comparação com estado pré-router.

Nenhum router comercial foi removido nesta execução.

## Observabilidade stateful

Os eventos históricos mostraram que resultados stateful como `basket_customer_data_processed`, `confirm_order`, `basket_ready_for_human` e alterações de endereço não tinham um snapshot confiável do estado imediatamente anterior à ação. Comparar o Agent Core usando o estado posterior seria inválido.

Por isso foi criado `agent_core_pre_router_snapshots`. Ele grava apenas estado estrutural: modo/stage, `awaiting`, presença de sessão/carrinho, validade estrutural, flags de cadastro/endereço, janela de serviço e handoff. Não grava texto do cliente nem dados cadastrais.

A captura não faz backfill artificial e registra somente novos jobs de homologação. A V14 transforma esses novos snapshots em relatório de cobertura por ação/estado. A V18 adiciona uma visão por router, também sem backfill. Enquanto os mínimos não forem alcançados, `stateful_evidence_ready=false` e `blocked_router_evidence_ready=false`. Mesmo depois de atingir cobertura, nenhum desses relatórios autoriza automaticamente execução ou aposentadoria.

No último fechamento antes do deploy v7, `snapshot_rows=0`, todos os contratos estavam completos e o motivo do gate por router era `awaiting_router_specific_homologation_evidence`.

## Worker V2/V3

O runtime de banco está canônico em V3. O readiness V16 confirmou:

- `database_runtime_ready=true`;
- `canonical_dispatch_trigger_present=true`;
- `legacy_dispatch_trigger_absent=true`;
- `canonical_recovery_cron_present=true`;
- `legacy_recovery_cron_absent=true`;
- `dispatch_v2_wrapper_forwards_to_v3=true`;
- `recovery_v2_wrapper_forwards_to_v3=true`;
- `current_db_functions_calling_v2_endpoint=0`;
- `endpoint_detector=url_assignment_only`;
- `edge_v2_removal_authorized=false`;
- `automatic_removal_allowed=false`.

A auditoria dos três cenários Make ativos também confirmou que nenhum aponta para `conversation-worker-v2`: inbound usa Edges de ingestão do Supabase; outbound transporta mensagens para Meta/OpenAI TTS; e consulta de CPF usa Bling.

A Edge V2 continua preservada como compatibilidade histórica/rollback. Referências antigas em migrations e documentos não são tratadas como dependência ativa. O CI impede que uma migration posterior ao cutover ou uma Edge atual volte a chamar o endpoint V2.

## CI validado

- `CI Dona Antonia Agent Core` run 84: `success`, incluindo todos os contratos anteriores, novo teste V17–V19 e `deno check` da Edge do Agent Core antes do deploy v7;
- `Test Dona Antonia conversation worker` run 994: `success`, já validando V3 como worker canônico e executando `deno check` em V2 + V3;
- o primeiro run do novo teste V19 detectou uma asserção excessivamente ampla sobre `person_name`; ela foi corrigida para distinguir leitura interna de retorno de PII antes do run 84 verde.

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
- novas tools V19 em `reversible_write`, sem autorun;
- `stateful_execution_permitted_now=false`;
- `retirement_execution_permitted=false`;
- `global_retirement_ready=false`;
- `worker_v2_edge_removal_authorized=false`;
- `stateful_evidence_ready=false` enquanto não houver cobertura mínima de novos snapshots;
- aprendizagem automática/global continua sem autopublicação;
- nenhum pedido foi enviado ao Bling por este trabalho;
- nenhum Flow foi publicado ou exposto por este trabalho.

## Rollback

A Edge v7 pode ser revertida para a v6 sem alteração de schema. As três novas tools V19 continuam `observe` no registro e, na Edge v7, não possuem executor stateful: se selecionadas, são apenas simuladas. O preview V2 permanece antes de qualquer tool call. O snapshot pré-router é telemetria fail-open: em rollback, basta remover `a0z_agent_core_pre_router_state_v1`; nenhum dado transacional depende da tabela. Os relatórios V14/V18 são somente leitura. Dispatcher/recovery V2 continuam disponíveis como wrappers históricos para V3, e a própria Edge V2 permanece implantada para rollback enquanto sua remoção não for explicitamente autorizada.

## Próximo ponto programável

1. coletar novos snapshots estruturais reais em homologação e medir V14 + V18 sem inventar estado histórico;
2. comparar, por router, decisão do Agent Core, preconditions e ação efetivamente tomada pelo legado;
3. manter os 8 routers bloqueados até cada contrato atingir evidência própria suficiente;
4. manter a Edge V2 somente como rollback; runtime ativo deve continuar V3;
5. somente depois de cobertura stateful real avançar para retirada individual e Rodada 5 de evals em escala.