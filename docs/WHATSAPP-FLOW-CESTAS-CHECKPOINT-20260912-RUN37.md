# WhatsApp Flow Cestas — checkpoint RUN37 — 2026-09-12

## Objetivo da rodada
Endurecer a homologação física terminal para exigir a sequência real e ordenada `UPSELL -> REVISAO -> CLIENTE -> FINALIZAR -> nfm_reply -> location`, sem abrir gates, sem enviar Flow e sem fabricar evidência.

## Estado relido
- RUN36 / V53 confirmado no `main` e no Supabase.
- Runtime permanece `handler_version=v26` / `Edge 49`.
- `get_whatsapp_flow_v53_homologation_control_plane_v1()` retornou `ok=true`.
- Evidência física existente permanece em `CESTAS -> PERSONALIZAR_A -> SECOES_A -> TERMOS_A -> PRODUTOS_A`.
- `physical_next_required=UPSELL`.
- Havia `0` conversas owner elegíveis e `0` sessões owner ativas.
- Make continua somente com `consultar no cpf` ativo e `incompleteExecutions=0`.

## Problema encontrado
O monitor V49 comprovava presença das etapas terminais na mesma sessão, mas não exigia explicitamente a ordem temporal completa entre `UPSELL`, `REVISAO`, cliente, finalização e `nfm_reply`. Isso poderia permitir um falso verde se eventos existissem fora de ordem.

## V54 aplicado
Migration Supabase: `whatsapp_flow_v54_ordered_physical_terminal_evidence`.
Arquivo: `supabase/migrations/20260912012100_whatsapp_flow_v54_ordered_physical_terminal_evidence.sql`.

### Evidência ordenada
Criada `get_whatsapp_flow_v54_ordered_physical_terminal_evidence_v1()`.
Ela exige, na mesma sessão owner-only:
1. `UPSELL` aceito;
2. `REVISAO` em timestamp >= UPSELL;
3. `CLIENTE_EXISTENTE|CLIENTE_NOVO|CLIENTE` >= revisão;
4. `FINALIZAR|SUCCESS|COMPLETE` >= cliente;
5. `flow_nfm_reply` de interface `whatsapp_flow` >= finalização;
6. mensagem inbound `location` estritamente posterior ao `nfm_reply`.

O retorno inclui `ordered_timestamps`, `sequence_strict=true`, `writes_performed=false` e `next_required` calculado pela primeira etapa ausente/fora de ordem.

### Control plane V54
Criada `get_whatsapp_flow_v54_homologation_control_plane_v1()`.
Ela herda V53, substitui o critério físico pelo monitor ordenado V54 e mantém o lançador permitido exclusivamente no V9 serializado.

## Resultado real
- `control.ok=true`
- `runtime_readiness_ok=true`
- `physical_evidence_ok=false`
- `physical_next_required=UPSELL`
- `physical_sequence_strict=true`
- `eligible_owner_conversations=0`
- `active_owner_homologation_sessions=0`
- `safe_to_launch_owner_v9=false`
- `next_action=wait_for_owner_service_window`
- sessão histórica permanece `abandoned`, `current_screen=PRODUTO`, `exchange_count=7`, `state_version=6`.

## Gates preservados
- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

Nenhum gate foi alterado. Nenhuma sessão, token, mensagem, outbound ou pedido foi criado nesta rodada.

## Make
Somente `consultar no cpf` permanece ativo; `incompleteExecutions=0`. Nenhum cenário foi modificado.

## Contrato
Adicionado `scripts/test-whatsapp-flow-v54-ordered-physical-evidence-contract.mjs`, proibindo mutações de rollout/pedido/outbound/mensagem e exigindo os marcadores de ordenação temporal.

## Segurança
Security Advisor executado após a migration. Não apareceu alerta novo referente às funções V54; permanecem avisos preexistentes de outras áreas do banco.

## Próxima ação
Enquanto não existir exatamente uma conversa owner válida dentro da janela de serviço, o V9 permanece fail-closed. Quando a conversa autorizada estiver elegível, iniciar nova sessão owner-only e atravessar fisicamente o trecho terminal. O V54 só ficará verde se a sequência real estiver integralmente ordenada.

## Ação manual indispensável
O proprietário precisa iniciar ou manter uma conversa válida no número autorizado de homologação dentro da janela de serviço para possibilitar a prova física. Não há substituto automático seguro para essa interação sem falsificar a evidência.
