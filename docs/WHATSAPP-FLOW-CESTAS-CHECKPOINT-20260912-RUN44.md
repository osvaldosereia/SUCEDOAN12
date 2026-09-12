# WhatsApp Flow Cestas — checkpoint RUN44 / V61

## Objetivo
Endurecer o caminho de alteração de endereço usado durante a jornada de cesta antes da prova física owner-only, sem abrir gates, sem disparar Flow e sem criar pedido.

## Estado relido
- candidato `flow-cestas-comercial-v8-stable`;
- runtime comercial V26 / Edge49;
- V60 terminal commercial readiness verde;
- evidência física ainda pendente a partir de `UPSELL`;
- `eligible_owner_conversations=0`;
- `active_owner_homologation_sessions=0`;
- `safe_to_launch_owner_v10=false`;
- Make: `consultar no cpf` continua ativo e `incompleteExecutions=0`.

## Achado
O Security Advisor anterior registrava `route_whatsapp_active_basket_address_guard_v52()` como função `SECURITY DEFINER` executável diretamente por `anon/authenticated`.
A função é um trigger interno de `ai_jobs`; acesso RPC direto por clientes não é necessário.

## Implementação V61
Aplicada migration que:
- revoga `EXECUTE` de `PUBLIC`;
- revoga `EXECUTE` de `anon`;
- revoga `EXECUTE` de `authenticated`;
- mantém `EXECUTE` apenas para `service_role` além do owner PostgreSQL;
- não altera o trigger `a2_whatsapp_active_basket_address_guard_v52`;
- não altera lógica de endereço, carrinho, pedido, IA ou Flow.

## Verificação viva
Confirmado no banco:
- `anon_exec=false`;
- `auth_exec=false`;
- `service_exec=true`;
- V57 control plane continua `ok=true`;
- V60 readiness continua `ok=true`;
- `physical_next_required=UPSELL`;
- `safe_to_launch_owner_v10=false`;
- runtime continua V26 / Edge49.

## Gates preservados
- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## Security Advisor
Após V61 o alerta específico da função `route_whatsapp_active_basket_address_guard_v52()` deixou de aparecer entre as funções `SECURITY DEFINER` expostas a `authenticated`.
Permanecem alertas antigos de outras áreas do sistema; não foram alterados nesta rodada para evitar ampliar escopo.

## GitHub
Persistidos:
- `supabase/migrations/20260912081500_whatsapp_flow_v61_address_guard_privilege_hardening.sql`;
- `scripts/test-whatsapp-flow-v61-address-guard-privileges-contract.mjs`;
- este checkpoint RUN44.

## Make
Verificado diretamente: cenário `consultar no cpf` permanece ativo, com `incompleteExecutions=0`. Os cenários temporários e outbound relacionados ao Flow permanecem inativos.

## Próximo passo
A prova física owner-only continua pendente:

`UPSELL → REVISÃO → CLIENTE/ENDEREÇO → FINALIZAR_NO_ORDER → nfm_reply_no_order → localização`

Enquanto não existir exatamente uma conversa owner elegível dentro da janela de atendimento, o V10 permanece bloqueado e nenhum gate deve ser aberto.
