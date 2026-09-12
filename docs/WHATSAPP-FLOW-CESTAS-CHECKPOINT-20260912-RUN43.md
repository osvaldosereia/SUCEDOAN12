# WhatsApp Flow Cestas — checkpoint RUN43 / V60

## Objetivo
Consolidar a prontidão comercial do trecho terminal antes da prova física owner-only, cobrindo busca segmentada, UPSELL/CROSS-SELL session-aware, contrato do runtime, cadastro/endereço, pagamento na entrega e gates, sem criar pedido e sem abrir rollout.

## Estado relido
- candidato `flow-cestas-comercial-v8-stable`;
- runtime comercial V26 / Edge49;
- V59 de buscas dinâmicas já verde;
- evidência física ainda pendente a partir de `UPSELL`;
- `eligible_owner_conversations=0`;
- `active_owner_homologation_sessions=0`;
- Make: somente `consultar no cpf` ativo, `incompleteExecutions=0`;
- workflow legado de auditoria do Flow está arquivado/manual e não foi reativado.

## Implementação V60
Criada `get_whatsapp_flow_v60_terminal_commercial_readiness_v1()`.

A função valida, sem escrita:
- V59 de buscas dinâmicas verde;
- cadeia V26 → V25 → V24 preservada;
- V25 usando `get_whatsapp_flow_session_recommendations_v1()` no UPSELL;
- caminho terminal owner-only sem pedido real presente no V26;
- definição `flow-cestas-comercial-v8-stable` em `ready`, com provider id, não-live e sem exposição a clientes;
- `upsell_after_extras=true`;
- `upsell_optional=true`;
- `visual_upsell=true`;
- `customer_prefill=true`;
- `payment_on_delivery_only=true`;
- `component_prices_visible=false`;
- `full_catalog_load_forbidden=true`;
- `max_products_per_query=20`;
- recomendação session-aware testada contra sessão real anterior com cesta;
- produtos inválidos, repetidos ou já selecionados não entram no UPSELL;
- IA sem autoridade sobre catálogo;
- todos os gates globais fechados.

## Verificação viva V60
Resultado:
- `ok=true`;
- `search_quality_ok=true`;
- `runtime_chain_ok=true`;
- `definition_contract_ok=true`;
- `upsell_quality_ok=true`;
- `upsell_recommendation_count=6`;
- `upsell_invalid_product_count=0`;
- `upsell_selected_overlap_count=0`;
- `upsell_duplicate_count=0`;
- `customer_prefill_enabled=true`;
- `payment_on_delivery_only=true`;
- `component_prices_visible=false`;
- `max_products_per_query=20`;
- `full_catalog_loaded=false`;
- `writes_performed=false`.

## Control plane após V60
Permaneceu:
- `runtime_readiness_ok=true`;
- `physical_evidence_ok=false`;
- `physical_next_required=UPSELL`;
- `eligible_owner_conversations=0`;
- `active_owner_homologation_sessions=0`;
- `safe_to_launch_owner_v10=false`;
- `next_action=wait_for_owner_service_window`.

## Gates preservados
- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## Segurança
A função V60 revoga `EXECUTE` de `PUBLIC`, `anon` e `authenticated`, permitindo somente `service_role`.
O Security Advisor foi executado após a migration. Nenhum alerta novo aponta para V60. Permanecem alertas antigos e fora deste bloco, incluindo uma função legada `route_whatsapp_active_basket_address_guard_v52()` executável por `anon/authenticated` e avisos históricos de RLS sem policy em tabelas internas.

## GitHub
Persistidos:
- `supabase/migrations/20260912072400_whatsapp_flow_v60_terminal_commercial_readiness_v1.sql`;
- `scripts/test-whatsapp-flow-v60-terminal-commercial-readiness-contract.mjs`;
- este checkpoint RUN43.

O contrato estático foi versionado, mas o workflow legado que o executaria automaticamente está arquivado/manual e não foi reativado nesta rodada para evitar conflito com o estado atual do projeto.

## Make
Somente `consultar no cpf` está ativo e com `incompleteExecutions=0`. Nenhum cenário foi alterado.

## Próximo passo
A implementação estrutural do trecho terminal está pronta para a próxima prova física. Continua faltando a sequência real owner-only:

`UPSELL → REVISÃO → CLIENTE/ENDEREÇO → FINALIZAR_NO_ORDER → nfm_reply_no_order → localização`

Enquanto não existir exatamente uma conversa owner elegível dentro da janela de atendimento, o V10 deve permanecer bloqueado e nenhum gate deve ser aberto.
