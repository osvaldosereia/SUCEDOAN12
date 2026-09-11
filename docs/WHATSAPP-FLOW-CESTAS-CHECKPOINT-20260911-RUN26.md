# WhatsApp Flow Cestas — checkpoint RUN26 / V44

Data: 11/09/2026.

## Concluído

- baseline relido a partir do RUN25 e auditado novamente no Supabase e Make;
- confirmado `get_whatsapp_flow_v43_dynamic_search_readiness_v1().ok=true` antes da mudança;
- criado e aplicado `get_whatsapp_flow_ai_intent_entry_v1(text, integer)`;
- a IA fornece somente o texto de intenção; produto, preço, disponibilidade e formato da opção vêm do backend determinístico;
- a ponte reutiliza `get_whatsapp_flow_intent_products_v1` e mantém limite padrão 12 / hard cap 20;
- intenção curada direciona pela taxonomia e intenção livre usa busca direta no catálogo vendável;
- retorno preparado para `PRODUTOS_A`, com preço apenas para produtos extras e sem preço individual dos componentes da cesta;
- `experience_definitions.slug=flow-cestas-comercial-v8-stable` recebeu wiring explícito para `get_whatsapp_flow_ai_intent_entry_v1`, sem ativar rollout;
- criado e aplicado `get_whatsapp_flow_v44_ai_intent_bridge_readiness_v1()`;
- readiness real V44 retornou `ok=true`;
- exemplos reais: `sabonete` -> `curated_term`, 10 produtos; `leite` -> `direct_search`, 12 produtos;
- migration persistida em `supabase/migrations/20260911142500_whatsapp_flow_v44_ai_intent_bridge_v1.sql`;
- contrato persistido em `scripts/test-whatsapp-flow-v44-ai-intent-bridge-contract.mjs`.

## Segurança e gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum pedido foi criado, nenhum catálogo completo foi carregado e nenhuma exposição a clientes foi aumentada.

## Make

Auditoria atual encontrou somente `consultar no cpf` ativo, com `incompleteExecutions=0`. Nenhum cenário foi alterado.

## Reprodutibilidade do JSON V31

O builder autoritativo continua em `scripts/build-flow-v31-stable-text-products.py`, usando `whatsapp/flows/flow-cestas-comercial-v6.json` como fonte e gerando `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json`.

O artefato gerado ainda não está no `main`. Não foi criado manualmente nem substituído por outro JSON: a restauração deve ser feita pelo próprio builder e validada pelo contrato V31 antes de futura republicação, para evitar divergência silenciosa em relação ao Flow já aceito na Meta.

## Evidência física ainda pendente

Sessão owner-only de referência:

```text
da005838-32c1-48da-a20f-a7d7ccc58bc2
```

A evidência física permanece até `PRODUTOS_A`. Falta atravessar:

```text
UPSELL -> REVISAO -> CLIENTE_EXISTENTE|CLIENTE_NOVO -> FINALIZAR -> nfm_reply -> localização
```

Não forçar essa evidência por escrita sintética nem ativar gates para obtê-la.

## Próximo bloco seguro

1. ligar a ponte V44 ao ponto de entrada/prefill owner-only do outbound sem habilitar `whatsapp_flow_send_enabled` globalmente;
2. restaurar o artefato V31 exclusivamente via builder autoritativo e validar equivalência/contrato antes de qualquer republicação;
3. continuar a homologação física do trecho terminal quando houver sessão real no número autorizado;
4. preservar canary 1%, Orchestrator/Data Exchange/Flow Send/escrita comercial/Bling OFF até autorização explícita.
