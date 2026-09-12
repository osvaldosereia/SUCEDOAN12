# WhatsApp Flow Cestas — checkpoint RUN45 / V62-V63

## Objetivo
Adicionar uma auditoria viva e fail-closed da superfície de funções privilegiadas ligadas ao WhatsApp Flow, sem abrir gates, disparar Flow, criar pedido ou alterar Make.

## Estado relido
- candidato `flow-cestas-comercial-v8-stable`;
- runtime comercial V26 / Edge49;
- V57 control plane `ok=true`;
- V60 terminal commercial readiness `ok=true`;
- evidência física ainda pendente a partir de `UPSELL`;
- `eligible_owner_conversations=0`;
- `active_owner_homologation_sessions=0`;
- `safe_to_launch_owner_v10=false`;
- Make: `consultar no cpf` ativo e `incompleteExecutions=0`.

## Implementação V62
Criado `get_whatsapp_flow_v62_security_surface_readiness_v1()` para consolidar:
- exposição direta de funções `SECURITY DEFINER` ligadas ao caminho WhatsApp/Flow;
- V57 control plane;
- V60 terminal readiness;
- gates;
- elegibilidade owner-only;
- confirmação de que o monitor não executa escrita.

A própria função é `SECURITY INVOKER`, com execução revogada de `PUBLIC`, `anon` e `authenticated`, e concedida apenas a `service_role` além do owner PostgreSQL.

## Correção V63
O primeiro escopo V62 utilizava o padrão genérico `%flow%`, que capturou três funções administrativas `agent_workflow_*` não pertencentes ao WhatsApp Flow. Isso produziu falso positivo, não uma exposição nova do Flow.

V63 corrigiu o escopo para a superfície relevante:
- nomes contendo `whatsapp`;
- `basket`;
- `nfm`;
- `outbound`.

O filtro genérico `%flow%` foi removido para não misturar workflow administrativo com WhatsApp Flow.

## Verificação viva final
`get_whatsapp_flow_v62_security_surface_readiness_v1()` retornou:
- `ok=true`;
- `readiness_version=v63-security-surface-scope-v1`;
- `security_definer_client_exposure_count=0`;
- `security_definer_client_exposures=[]`;
- `control_plane_ok=true`;
- `terminal_readiness_ok=true`;
- `physical_next_required=UPSELL`;
- `safe_to_launch_owner_v10=false`;
- `eligible_owner_conversations=0`;
- `active_owner_homologation_sessions=0`;
- `writes_performed=false`.

## Gates preservados
- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## Make
Verificado diretamente:
- `consultar no cpf` ativo;
- `incompleteExecutions=0`;
- cenário antigo `Pedidos Site + Complementar Bling Firebase - CPF e Estoque Idempotente` inativo.
Nenhum cenário foi modificado.

## GitHub
Persistidos:
- `supabase/migrations/20260912091800_whatsapp_flow_v62_security_surface_readiness.sql`;
- `supabase/migrations/20260912091900_whatsapp_flow_v63_security_surface_scope_fix.sql`;
- `scripts/test-whatsapp-flow-v63-security-surface-contract.mjs`;
- este checkpoint RUN45.

## Próximo passo
A prova física owner-only continua pendente:

`UPSELL → REVISÃO → CLIENTE/ENDEREÇO → FINALIZAR_NO_ORDER → nfm_reply_no_order → localização`

Enquanto não existir exatamente uma conversa owner elegível dentro da janela de atendimento, o V10 permanece bloqueado e nenhum gate deve ser aberto.
