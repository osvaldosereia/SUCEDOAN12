# WhatsApp Flow Cestas — checkpoint RUN48 / V66

V66 endurece o retorno terminal de homologação sem pedido real. O handoff para localização agora é de uso único, com marcadores de consumo na sessão. Replays posteriores não rearmam `location_required`.

Verificação viva: `ok=true`, `single_use_no_order_handoff=true`, `replay_marker_returned=true`, `anon_exec=false`, `authenticated_exec=false`, `service_role_exec=true`, `physical_next_required=UPSELL`, `eligible_owner_conversations=0`, `safe_to_launch_owner_v11=false`.

Gates preservados: canary 1%; orchestrator OFF; Data Exchange OFF; Flow Send OFF; commercial write OFF; Bling OFF.

Janela final verificada sem efeitos comerciais: 0 pedidos novos, 0 eventos `flow_nfm_reply`, 0 outbound jobs.

Make: `consultar no cpf` continua ativo e com `incompleteExecutions=0`; nenhum cenário foi alterado.

Persistidos: migration `20260912123000_whatsapp_flow_v66_terminal_handoff_single_use.sql` e contrato `test-whatsapp-flow-v66-terminal-handoff-single-use-contract.mjs`.

Próxima prova física permanece: `UPSELL → REVISÃO → CLIENTE/ENDEREÇO → FINALIZAR_NO_ORDER → nfm_reply_no_order → localização`. Enquanto não houver uma conversa owner elegível dentro da janela válida, V11 permanece bloqueado.