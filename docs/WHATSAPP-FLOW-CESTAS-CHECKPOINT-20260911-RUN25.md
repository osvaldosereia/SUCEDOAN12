# WhatsApp Flow Cestas — checkpoint RUN25 / V43

Data: 11/09/2026.

## Concluído

- criado e aplicado no Supabase `get_whatsapp_flow_intent_products_v1(text, integer)`;
- o resolver usa primeiro a taxonomia real de `whatsapp_flow_search_terms` e, quando a intenção não pertence a um termo curado, cai para busca direta determinística no backend;
- toda busca reaproveita `get_whatsapp_flow_product_results_v1`, com limite padrão 12 e hard cap 20;
- nunca carrega o catálogo inteiro;
- nenhuma IA pode inventar produto/preço/estoque: a resposta vem exclusivamente do Supabase;
- criado e aplicado `get_whatsapp_flow_v43_dynamic_search_readiness_v1()`;
- readiness real V43 retornou `ok=true`;
- exemplos reais validados: `sabonete` -> termo curado / 10 produtos; `detergente` -> termo curado / 2; `arroz` -> termo curado / 6; `leite` -> busca direta / 12;
- criado `scripts/test-whatsapp-flow-v43-dynamic-search-contract.mjs`;
- migration persistida em `supabase/migrations/20260911131900_whatsapp_flow_v43_dynamic_intent_search_v1.sql`.

## Terminal / evidência física

V42 continua `ok=true`, mas a sessão owner-only ainda não atravessou fisicamente o restante do Flow.

Sessão de referência:

```text
da005838-32c1-48da-a20f-a7d7ccc58bc2
```

Ainda falta evidência física de:

```text
UPSELL -> REVISAO -> CLIENTE_EXISTENTE|CLIENTE_NOVO -> FINALIZAR -> nfm_reply -> localização
```

`next_required_evidence=upsell`.

## Gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum pedido criado, nenhuma escrita comercial e nenhum cliente exposto.

## Make

Auditoria atual encontrou somente `consultar no cpf` ativo, com `incompleteExecutions=0`. Nenhum cenário Make foi alterado.

## Observação de reprodutibilidade

A definição estável ainda referencia em metadata `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json`. O build script correspondente existe, porém o artefato gerado não está atualmente presente no `main`. Não foi trocado por um arquivo diferente nesta rodada para evitar divergência silenciosa do Flow já validado na Meta. Esse ponto deve ser reconciliado de forma controlada antes de uma futura publicação/republicação do JSON.

## Próximo bloco seguro

1. integrar o resolver V43 como entrada determinística de intenção da IA para busca direta, sem mudar os gates;
2. reconciliar/restaurar o artefato V31 exato que corresponde ao Flow já validado;
3. continuar homologação owner-only de `UPSELL` em diante quando houver uma sessão física disponível;
4. manter rollout, Data Exchange, Flow Send, Orchestrator, escrita comercial e Bling desligados até autorização explícita.
