# WhatsApp Flow Cestas — checkpoint RUN49 / V67

V67 fecha uma condição de corrida no handoff terminal owner-only sem pedido real. O consumo do `nfm_reply_no_order` agora é reivindicado atomicamente com `UPDATE ... WHERE consumed IS NOT TRUE RETURNING id`; apenas a transação que realmente obtém o claim pode retornar `location_required=true`.

Verificação viva no Supabase: `ok=true`, `atomic_single_use_claim=true`, `anon_exec=false`, `authenticated_exec=false`, `service_role_exec=true`, `physical_next_required=UPSELL`, `eligible_owner_conversations=0`, `safe_to_launch_owner_v11=false`.

Gates preservados: `whatsapp_live_canary_percent=1`; `experience_orchestrator_enabled=false`; `whatsapp_flow_data_exchange_enabled=false`; `whatsapp_flow_send_enabled=false`; `whatsapp_flow_commercial_write_enabled=false`; `bling_order_sync_enabled=false`.

A validação não criou pedido e não produziu novo evento `flow_nfm_reply`. O cenário Make `consultar no cpf` segue ativo com `incompleteExecutions=0`. Os cenários `Dona Antônia - WhatsApp Outbound Event-Driven v3` e `LEGACY - NÃO USAR - WhatsApp Outbound HTTP v1` permanecem inativos.

Persistidos: migration `20260912131700_whatsapp_flow_v67_atomic_terminal_handoff_claim.sql` e contrato `scripts/test-whatsapp-flow-v67-terminal-handoff-atomic-claim-contract.mjs`.

Próxima prova física permanece: `UPSELL → REVISÃO → CLIENTE/ENDEREÇO → FINALIZAR_NO_ORDER → nfm_reply_no_order → localização`. Enquanto não houver uma conversa owner elegível dentro da janela válida, V11 permanece bloqueado e nenhum cliente é exposto ao Flow.
