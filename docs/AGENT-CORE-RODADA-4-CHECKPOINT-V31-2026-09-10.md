# Dona Antônia Agent Core — Rodada 4 — checkpoint V31

Data: 2026-09-10

Ponto de retomada oficial da Rodada 4/6 após homologação real, correções V28–V31 e recuperação do gate stateless.

## Estado das rodadas

- Rodada 1/6: concluída.
- Rodada 2/6: concluída.
- Rodada 3/6: concluída.
- Rodada 4/6: em andamento, estágio avançado.
- Rodada 5/6: não iniciar ainda.
- Rodada 6/6: não iniciar ainda.

## Gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
Agent Core execution_mode=observe
legacy_router_policy=shadow
stateful_execution_permitted_now=false
retirement_execution_permitted=false
global_retirement_ready=false
worker_v2_edge_removal_authorized=false
```

Handoff humano continua com precedência absoluta.

## V28 — alinhamento da alteração de endereço

A primeira amostra real `Quero mudar o endereço da entrega` revelou que o router legado reconhecia a intenção por regex ampla, enquanto a precondition do Agent Core aceitava apenas frases exatas curtas.

A V28 criou `is_whatsapp_address_change_request_v1`, alinhou a precondition de `wa_request_address_flow` à semântica já usada pelo router legado e normalizou os aliases:

- `change_basket_delivery_address` -> `change_basket_delivery_address_flow`
- `address_flow_reopened` -> `change_basket_delivery_address_flow`
- `address_flow_from_legacy_state` -> `change_basket_delivery_address_flow`

O mesmo inbound histórico que antes era bloqueado passou no preview pós-correção como `allowed=true`, `decision=simulated`, sem side effect.

## V29 — epoch de evidência por contrato

Foi adicionado `evidence_valid_since` em `agent_core_router_action_contracts`.

Os três contratos relacionados a mudança de endereço começam a medir alinhamento a partir da V28. O caso que revelou o bug permanece armazenado para auditoria, mas não é usado para penalizar indefinidamente a versão corrigida.

Nenhum histórico foi apagado ou reescrito.

## V30 — separação stateless x stateful

`get_agent_core_round4_parity_report_v6` separa rigorosamente:

- stateless: somente replay histórico seguro, homologation-only;
- stateful/live: medido por `get_agent_core_round4_action_tool_parity_v1` e `get_agent_core_round4_stateful_evidence_report_v1`.

Mensagens reais stateful não contaminam mais a taxa stateless.

O antigo `get_agent_core_round4_parity_report_v5` é bridge para V6.

## V31 — dispatcher de replay histórico seguro

Criado `dispatch_whatsapp_agent_core_historical_replay_v1`.

O dispatcher:

- exige `is_whatsapp_agent_core_shadow_eligible_v2(...,true)`;
- exige reason `authorized_homologation_historical_replay_v3`;
- exige contexto histórico seguro/stateless;
- exige Agent Core em `observe`;
- recusa mensagem já avaliada;
- busca a chave apenas dentro do Vault;
- envia `replay=true` para a Edge;
- não armazena corpo da mensagem nos logs do dispatcher;
- não permite side effects comerciais.

Foram executados dois replays inéditos seguros do family `basket_catalog`:

- `Cestas`
- `Quais cestas ?`

Ambos retornaram HTTP 200, `intent=basket`, `confidence=0.99`, `next_action=show_baskets`, `comparison=intent_match`.

## Gate stateless atual

Após V30 + os dois replays V31:

```text
planned_sample=20
replay_count=20
basket=10
product_search=10
policy_intent_matches=20/20
policy_intent_match_rate=1.0
decision_tool_coherent=20/20
decision_tool_coherence_rate=1.0
average_confidence=0.9885
candidate_retirement_ready=true
```

Isto é somente readiness de candidato. Não autoriza aposentadoria real.

## Evidência stateful atual

O relatório estrutural preserva a primeira amostra real de alteração de endereço como capacidade semântica:

```text
change_basket_delivery_address_flow=1/3
basket_customer_data_processed=0/3
basket_ready_for_human=0/3
confirm_order=0/3
stateful_evidence_ready=false
```

Para paridade por contrato pós-V28, as amostras de endereço começam em zero e precisam ser coletadas novamente depois do fix.

## Achado adicional: botão `da_basket_customer_change`

Durante a homologação apareceram interações `Alterar dados` com `interactive_id=da_basket_customer_change`.

Esse botão NÃO significa necessariamente alterar endereço. O `conversation-worker-v3` trata o evento como edição/coleta de dados do cliente e move o checkout para `basket_customer_data`.

O Agent Core shadow tentou `wa_request_address_flow` em pelo menos uma dessas interações. Não ampliar o detector de endereço para aceitar `da_basket_customer_change`.

Próximo bloco programável recomendado:

1. modelar explicitamente a capacidade `request checkout customer data` no Agent Core;
2. manter esse fast-path estruturado como deterministic_policy/compatibility enquanto Agent Core estiver observe;
3. restringir a superfície de tools para `da_basket_customer_change` para impedir `wa_request_address_flow`;
4. instrumentar esse fast-path sem PII para paridade futura;
5. só depois colher evidência desse caminho.

## Próxima homologação manual imediata

Na conversa owner-only controlada, enviar três inbounds separados pós-V28:

```text
Quero mudar o endereço de entrega
Preciso alterar o endereço
Quero corrigir o endereço
```

Depois medir cada mensagem por snapshot pré-router, legacy observation, Agent Core turn e tool calls. Não fabricar mensagens nem snapshots.

## Regra de retomada

Ao continuar:

1. auditar HEAD antes de writes porque Flow/Marketing podem avançar em paralelo;
2. conferir CI do Agent Core;
3. conferir as três novas mensagens pós-V28;
4. não usar `da_basket_customer_change` como alias de endereço;
5. preservar canary 1%, Flow/Bling/write execution OFF;
6. não iniciar Rodada 5 antes de fechar o bloco seguro da Rodada 4.
