# WhatsApp Flow Cestas — checkpoint RUN36 — 2026-09-12

## Objetivo da rodada
Endurecer o caminho de homologação física owner-only para impedir lançamentos concorrentes, ambíguos ou duplicados, sem abrir gates, sem enviar Flow e sem criar evidência artificial.

## Estado relido
- RUN35 / V52 confirmado no `main` e no Supabase.
- `get_whatsapp_flow_v52_homologation_control_plane_v1()` retornava `ok=true`.
- Evidência física continua incompleta com `physical_next_required=UPSELL`.
- Havia `0` conversas owner elegíveis e `0` sessões owner ativas.
- Runtime permanece `handler_version=v26` / `Edge 49`.
- Make continua somente com `consultar no cpf` ativo e `incompleteExecutions=0`.

## V53 aplicado
Migration Supabase: `whatsapp_flow_v53_owner_launch_serialization`.
Arquivo persistido: `supabase/migrations/20260912002000_whatsapp_flow_v53_owner_launch_serialization.sql`.

### Preflight V6
Criado `get_whatsapp_flow_owner_homologation_preflight_v6(uuid)`.
Além do preflight V5, ele exige:
1. exatamente uma conversa owner allowlisted elegível;
2. a conversa informada precisa ser exatamente essa conversa única;
3. zero sessão owner de homologação ativa;
4. evidência física terminal ainda incompleta.

### Lançador V9
Criado `queue_and_dispatch_whatsapp_flow_owner_homologation_v9(uuid,text,text)`.
O lançador obtém `pg_advisory_xact_lock` antes do preflight V6, serializando tentativas concorrentes de homologação. Só depois disso ele delega ao caminho V8 já validado.

O acesso direto do `service_role` ao V8 foi revogado. O V8 permanece disponível apenas como implementação interna para o V9 via SECURITY DEFINER. `anon` e `authenticated` não executam V9.

### Control plane V53
Criado `get_whatsapp_flow_v53_homologation_control_plane_v1()`.
Ele herda o estado V52 e expõe o novo estado operacional:
- `dispatch_version=v9-serialized-runtime-v26-edge49`
- `direct_v8_service_role_disabled=true`
- `safe_to_launch_owner_v9`
- `safe_to_launch_owner_v8=false`

## Resultado real após aplicação
- `ok=true`
- `runtime_readiness_ok=true`
- `physical_evidence_ok=false`
- `physical_next_required=UPSELL`
- `eligible_owner_conversations=0`
- `active_owner_homologation_sessions=0`
- `safe_to_launch_owner_v9=false`
- `next_action=wait_for_owner_service_window`
- `direct_v8_service_role_disabled=true`
- `service_role` executa V9 e não executa V8 diretamente.
- `anon` e `authenticated` não executam V9.

## Gates preservados
- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

Nenhum gate foi alterado.

## Make
Somente `consultar no cpf` permanece ativo; `incompleteExecutions=0`. Nenhum cenário foi modificado.

## Contrato estático
Persistido em `scripts/test-whatsapp-flow-v53-owner-launch-serialization-contract.mjs`.
O contrato exige serialização, unicidade da conversa, ausência de sessão ativa, bloqueio de V8 direto e ausência de mutação dos rollout gates.

## Estado da prova física
Permanece pendente:
`UPSELL -> REVISAO -> CLIENTE_EXISTENTE|CLIENTE_NOVO -> FINALIZAR -> nfm_reply -> location`.

## Próxima ação
Enquanto não houver exatamente uma conversa owner válida dentro da janela de serviço, V9 deve permanecer fail-closed. Quando isso ocorrer, o control plane V53 deverá sinalizar `safe_to_launch_owner_v9=true`; somente então a nova sessão owner-only pode ser iniciada.

## Ação manual indispensável
Para produzir evidência física real, o proprietário ainda precisa iniciar ou manter uma conversa válida no número autorizado de homologação dentro da janela de serviço. Até isso ocorrer, não existe ação automática segura que substitua a interação física sem falsificar a evidência.
