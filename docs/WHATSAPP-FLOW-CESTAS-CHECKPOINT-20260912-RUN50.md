# WhatsApp Flow Cestas — checkpoint RUN50 / V68

V68 fecha uma lacuna entre o readiness comercial já implementado e o lançador físico owner-only. Antes desta rodada, o launcher V11 usava o preflight V8/V64 e não exigia explicitamente as proteções posteriores V65 (regras de pagamento) e V67 (claim atômico do handoff terminal sem pedido).

## Implementado

- `get_whatsapp_flow_v68_launch_readiness_v1()` agrega e exige simultaneamente V60, V65 e V67.
- `get_whatsapp_flow_owner_homologation_preflight_v9(uuid)` só fica `ok=true` quando o preflight V8 e o readiness composto V68 estão verdes.
- `queue_and_dispatch_whatsapp_flow_owner_homologation_v12(uuid,text,text)` substitui o V11 como único launcher direto permitido ao `service_role`.
- `service_role` perdeu `EXECUTE` direto no V11 e recebeu apenas V12.
- `get_whatsapp_flow_v68_homologation_control_plane_v1()` passa a publicar `safe_to_launch_owner_v12` e mantém V8/V9/V10/V11 indisponíveis para lançamento direto.

## Verificação viva

Supabase retornou:

```text
launch.ok=true
terminal_commercial_ready=true
payment_rules_ready=true
atomic_terminal_handoff_ready=true
max_products_per_query=20
full_catalog_loaded=false
ai_authoritative_for_catalog=false
component_prices_visible=false
payment_on_delivery_only=true
physical_next_required=UPSELL
eligible_owner_conversations=0
safe_to_launch_owner_v12=false
direct_v11_service_role_disabled=true
V12 service_role execute=true
```

Contadores de segurança da rodada: `orders_10m=0`, `flow_nfm_events_10m=0`, `order_bound_jobs_10m=0`.

Gates preservados:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

No Make, `consultar no cpf` permanece ativo com `incompleteExecutions=0`; os cenários WhatsApp outbound/inbound usados na implementação do Flow permanecem inativos.

Security Advisor foi executado após o DDL. Nenhum alerta novo foi introduzido por V68; continuam alertas antigos de outras áreas, incluindo funções `agent_workflow_*` SECURITY DEFINER acessíveis a `authenticated` e diversas tabelas com RLS sem policy.

Persistidos:

- `supabase/migrations/20260912141800_whatsapp_flow_v68_composite_launch_readiness.sql`
- `scripts/test-whatsapp-flow-v68-composite-launch-readiness-contract.mjs`
- este checkpoint RUN50.

## Próximo bloqueio real

A prova física continua sendo:

`UPSELL → REVISAO → CLIENTE/ENDERECO → FINALIZAR_NO_ORDER → nfm_reply_no_order → localização`

Enquanto não existir exatamente uma conversa owner autorizada dentro da janela válida de atendimento, `safe_to_launch_owner_v12=false` e nenhum Flow é enviado a clientes.
