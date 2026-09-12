# WhatsApp Flow Cestas — checkpoint RUN42 / V59

## Objetivo
Auditar a qualidade real das buscas segmentadas do Flow contra estoque/preço/ativação atuais, sem carregar o catálogo inteiro e sem abrir gates.

## Estado inicial confirmado
- candidato `flow-cestas-comercial-v8-stable`;
- runtime comercial V26 / Edge49;
- evidência física ainda pendente a partir de `UPSELL`;
- control plane V57 `ok=true`;
- `eligible_owner_conversations=0`;
- `active_owner_homologation_sessions=0`;
- gates preservados: canary 1%, Orchestrator OFF, Data Exchange OFF, Flow Send OFF, commercial write OFF, Bling OFF;
- Make: somente `consultar no cpf` ativo, `incompleteExecutions=0`.

## Auditoria das buscas
Foram avaliados todos os 32 termos curados em `whatsapp_flow_search_terms` usando o backend real e limite de 20 produtos.

Resultado atual:
- 32 termos curados habilitados;
- 23 possuem produto vendável no estoque atual;
- 9 estão temporariamente sem produto vendável;
- as funções `get_whatsapp_flow_sections_v1()` e `get_whatsapp_flow_search_terms_v1(section)` já filtram dinamicamente termos sem resultado;
- portanto, nenhum termo morto é apresentado ao cliente;
- 5 seções macro permanecem expostas com estoque real;
- o catálogo integral nunca é retornado.

## Implementação V59
Criada `get_whatsapp_flow_v59_dynamic_search_quality_v1()`.

A função valida continuamente:
- quantidade total de termos curados;
- termos sem inventário atual;
- termos efetivamente expostos ao Flow;
- ausência de termos mortos expostos;
- seções macro realmente disponíveis;
- limite máximo de 20 produtos por consulta;
- `full_catalog_loaded=false`;
- IA sem autoridade comercial;
- todos os gates globais ainda fechados.

Permissões:
- `PUBLIC`, `anon` e `authenticated`: sem EXECUTE;
- `service_role`: EXECUTE.

## Verificação viva
Retorno V59:
- `ok=true`;
- `curated_terms_total=32`;
- `curated_terms_currently_without_inventory=9`;
- `curated_terms_exposed_to_flow=23`;
- `dead_terms_exposed_to_flow=0`;
- `sections_exposed_to_flow=5`;
- `dead_terms_are_hidden=true`;
- `max_products_per_query=20`;
- `full_catalog_loaded=false`;
- `ai_authoritative_for_catalog=false`;
- `writes_performed=false`.

## Gates
Continuam exatamente:
- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## Make
Somente `consultar no cpf` permanece ativo e sem execuções incompletas. Nenhum cenário foi alterado.

## Próximo passo
A prova física owner-only continua pendente a partir de `UPSELL`. Enquanto `eligible_owner_conversations=0`, o V10 deve permanecer bloqueado. Até existir uma conversa owner elegível, continuar evoluindo somente blocos isolados e seguros.
