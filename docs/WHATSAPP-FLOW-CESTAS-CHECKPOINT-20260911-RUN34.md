# WhatsApp Flow Cestas — checkpoint RUN34 — 2026-09-11

## Objetivo da rodada
Eliminar o desalinhamento entre o lançador owner-only da homologação física e o runtime comercial atual, sem abrir gates, criar sessão, emitir token ou enviar mensagem.

## Estado relido antes da alteração
- RUN33 / V50 confirmado no `main` e no Supabase.
- `get_whatsapp_flow_v49_physical_terminal_evidence_v1()` segue com `preflight_ok=true`, `ok=false` e `next_required=UPSELL`.
- Evidência física permanece em `CESTAS -> PERSONALIZAR_A -> SECOES_A -> TERMOS_A -> PRODUTOS_A`.
- Runtime do candidato está em `handler_version=v26` / `Edge 49`.
- Foi identificado que `queue_and_dispatch_whatsapp_flow_owner_homologation_v7()` ainda dependia de `get_whatsapp_flow_v31_homologation_preflight_v4()`, fixado em runtime V24 / Edge45.
- Make continua somente com `consultar no cpf` ativo e `incompleteExecutions=0`.

## V51 aplicado
Migration Supabase: `20260911221750_whatsapp_flow_v51_owner_launch_runtime_v26`.

### Novo preflight owner-only
`get_whatsapp_flow_owner_homologation_preflight_v5(p_conversation_id uuid)`.

Valida antes de qualquer lançamento real:
1. todos os gates globais continuam fechados;
2. candidato estável permanece isolado e em DRAFT;
3. catálogo completo continua proibido;
4. máximo por consulta continua <= 20;
5. IA continua não autoritativa para catálogo;
6. preços individuais dos componentes da cesta continuam ocultos;
7. runtime comercial existe e está alinhado em V26;
8. Edge runtime está alinhado em 49;
9. conversa owner existe, está em modo AI e dentro da janela de serviço;
10. destinatário está na allowlist `controlled_live_homologation`;
11. não há handoff humano aberto/claimed.

A função é `service_role` only e read-only.

### Novo lançador owner-only
`queue_and_dispatch_whatsapp_flow_owner_homologation_v8(...)`.

Ele substitui o preflight legado V24 do wrapper V7 por `preflight_v5`, mantém a fundação V2 já existente para emissão owner-only + `interactive.type=flow` + dispatch guardado, e adiciona guarda pós-dispatch da sessão. Nenhum envio foi executado nesta rodada.

### Readiness V51
`get_whatsapp_flow_v51_owner_launch_runtime_readiness_v1()`.

Resultado real após a migration:
- `ok=true`
- 6/6 checks verdes
- dispatch version: `v8-runtime-v26-edge49`
- preflight version: `v5-runtime-v26-edge49`
- runtime handler: `v26`
- edge version: `49`
- `writes_performed=false`
- `physical_send_performed=false`

## TDD
RED confirmado antes da implementação: chamada de `get_whatsapp_flow_v51_owner_launch_runtime_readiness_v1()` falhou porque a função ainda não existia.

GREEN confirmado após a migration: `ok=true`, 6/6 checks.

Contrato estático persistido em:
`scripts/test-whatsapp-flow-v51-owner-launch-runtime-contract.mjs`.

## Segurança
Pós-migration, o Supabase Security Advisor não apontou alerta novo relacionado às três funções V51. Permanecem avisos históricos de outras áreas do projeto, incluindo tabelas RLS sem policies e alguns SECURITY DEFINER antigos fora deste escopo; não foram alterados nesta rodada.

Gates confirmados novamente:
- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

## Estado da prova física
V49 continua deliberadamente vermelho porque não existe evidência física artificial:
`UPSELL -> REVISAO -> CLIENTE_EXISTENTE|CLIENTE_NOVO -> FINALIZAR -> nfm_reply -> location`.

No momento desta rodada existem `0` conversas owner allowlisted que simultaneamente estejam dentro da janela de serviço e sem handoff humano. Isso não altera o Flow; apenas impede iniciar corretamente uma nova sessão física neste instante.

## Make
Somente `consultar no cpf` permanece ativo; `incompleteExecutions=0`. Nenhum cenário foi modificado.

## O que falta
A implementação técnica do lançador owner-only agora está alinhada ao runtime atual. Falta a prova física real terminal em uma nova conversa owner allowlisted e dentro da janela de serviço.

## Ação manual indispensável
Nenhuma ação manual necessária nesta rodada. Para a prova física, será indispensável que o número autorizado tenha uma conversa válida dentro da janela de serviço; então o lançamento deve usar exclusivamente o novo wrapper V8.
