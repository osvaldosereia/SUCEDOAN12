# WhatsApp Flow Cestas — checkpoint RUN47 / V65

## Objetivo
Alinhar a etapa terminal de pagamento do Flow às regras comerciais atuais sem abrir rollout e sem alterar a sequência física de homologação.

## Estado relido
- RUN46 / V64 presente no `main`.
- runtime comercial `handle_whatsapp_flow_commercial_exchange_v26` / Edge49.
- V64 control plane `ok=true`.
- V60 terminal commercial readiness `ok=true`.
- V62/V63 security surface readiness `ok=true`.
- evidência física pendente a partir de `UPSELL`.
- `eligible_owner_conversations=0`.
- `active_owner_homologation_sessions=0`.

## Correção V65
Foi identificado que `handle_whatsapp_flow_commercial_exchange_v23`, ainda usado na cadeia V26, expunha a opção `Cartão crédito/débito`. A regra comercial atual do Flow foi alinhada para exatamente quatro meios na entrega:
- PIX;
- dinheiro;
- cartão de crédito;
- cartão alimentação/refeição.

A palavra/opção débito foi removida do Flow. Nenhuma escrita comercial, pedido, outbound ou alteração de carrinho foi executada.

Também foi criada `get_whatsapp_flow_v65_payment_rules_readiness_v1()` como auditoria read-only/SECURITY INVOKER. Ela verifica:
- as quatro formas de pagamento corretas;
- ausência de débito no runtime do Flow;
- cliente conhecido e completo continua sem redigitação;
- cadastro conhecido incompleto continua com prefill e solicitação apenas dos dados faltantes;
- V64 control plane e V60 terminal readiness continuam verdes;
- todos os gates permanecem fechados.

## Verificação viva
V65 retornou:
- `ok=true`;
- `debit_exposed_in_flow=false`;
- `known_complete_no_reentry=true`;
- `known_incomplete_prefill=true`;
- `physical_next_required=UPSELL`;
- `eligible_owner_conversations=0`;
- `safe_to_launch_owner_v11=false`;
- `writes_performed=false`.

Gates preservados:
- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## Make
`consultar no cpf` continua ativo e `incompleteExecutions=0`. Nenhum cenário foi alterado.

## Security Advisor
Executado após V65. Permanecem avisos preexistentes fora deste bloco (RLS sem policies em tabelas internas, 3 funções `agent_workflow_*` SECURITY DEFINER executáveis por authenticated e leaked-password protection desabilitado). Nenhum alerta novo foi introduzido pela V65.

## Próximo passo
A prova física owner-only continua exatamente:

`UPSELL → REVISÃO → CLIENTE/ENDEREÇO → FINALIZAR_NO_ORDER → nfm_reply_no_order → localização`

Enquanto não existir exatamente uma conversa owner elegível dentro da janela válida de atendimento, V11 permanece bloqueado e nenhum gate deve ser aberto.