# WhatsApp Flow Cestas — checkpoint RUN40 / V57

## Objetivo desta rodada
Unificar a autoridade de lançamento da homologação owner-only com a evidência física terminal V56 sem pedido real.

## Estado relido antes da alteração
- RUN39 / V56 presente no `main`.
- runtime comercial V26 / Edge 49.
- evidência física V56 ainda pendente a partir de `UPSELL`.
- `eligible_owner_conversations=0`.
- `active_owner_homologation_sessions=0`.
- gates globais preservados: canary 1%; Orchestrator OFF; Data Exchange OFF; Flow Send OFF; commercial write OFF; Bling OFF.
- Make: somente `consultar no cpf` ativo; `incompleteExecutions=0`.

## RED observado
O control plane V56 já usava `get_whatsapp_flow_v56_no_order_physical_terminal_evidence_v1()`, porém o lançador owner-only V9 ainda dependia do preflight V6, cujo critério de evidência vinha do V49. Assim, control plane e launcher não tinham a mesma autoridade para decidir se uma nova homologação podia iniciar.

## Implementação V57
### Preflight V7
Criado `get_whatsapp_flow_owner_homologation_preflight_v7(uuid)`.
Ele mantém as travas owner-only, unicidade da conversa elegível, ausência de sessão ativa e preflight V5, mas passa a consultar diretamente a evidência V56.

### Lançador V10
Criado `queue_and_dispatch_whatsapp_flow_owner_homologation_v10(uuid,text,text)`.
- serializa tentativas com advisory lock;
- exige preflight V7;
- delega ao caminho V8 somente depois do novo preflight;
- declara `physical_evidence_authority=v56-no-order-terminal`.

Execução direta por `service_role` foi revogada de V8 e V9. Somente V10 permanece executável pelo `service_role`.

### Control plane V57
Criado `get_whatsapp_flow_v57_homologation_control_plane_v1()`.
Ele expõe somente `safe_to_launch_owner_v10`, mantém V8/V9 falsos e exige que o V9 legado esteja sem permissão direta antes de considerar o lançamento seguro.

## Verificação GREEN
- `control_plane_version=v57-unified-v56-launch-authority`;
- `launcher_preflight_version=v7-v56-no-order-evidence`;
- `physical_evidence_authority=v56-no-order-terminal`;
- `safe_to_launch_owner_v8=false`;
- `safe_to_launch_owner_v9=false`;
- `safe_to_launch_owner_v10=false` porque ainda não há conversa owner elegível;
- `next_action=wait_for_owner_service_window`;
- V8 `service_role EXECUTE=false`;
- V9 `service_role EXECUTE=false`;
- V10 `service_role EXECUTE=true`.

O preflight V7 executado contra a conversa antiga/expirada retornou `ok=false`, sem escrita, com `physical_next_required=UPSELL` e `physical_evidence_version=v56-no-order-terminal`.

## Gates preservados
- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## Make
Somente `consultar no cpf` permanece ativo e `incompleteExecutions=0`. Nenhum cenário Make foi modificado.

## Persistência
- migration: `supabase/migrations/20260912041800_whatsapp_flow_v57_unified_launch_authority.sql`;
- contrato: `scripts/test-whatsapp-flow-v57-unified-launch-authority-contract.mjs`;
- checkpoint: este arquivo.

## Próximo passo
A prova física segue pendente a partir de `UPSELL`. Quando existir exatamente uma conversa do número autorizado dentro da janela de serviço, o único caminho owner-only permitido deverá ser o V10. Nenhum gate global deve ser aberto antes da homologação completa.
