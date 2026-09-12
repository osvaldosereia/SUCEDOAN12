# WhatsApp Flow Cestas — checkpoint RUN46 / V64

## Objetivo
Endurecer a homologação física owner-only para que a prova terminal `FINALIZAR_NO_ORDER → nfm_reply_no_order → localização` seja invalidada se qualquer pedido real, `nfm_reply` confirmado ou outbound vinculado a pedido surgir na mesma janela da sessão de homologação.

## Estado relido
- candidato comercial `flow-cestas-comercial-v8-stable`;
- runtime V26 / Edge49;
- V63 security surface readiness `ok=true`;
- V60 terminal commercial readiness `ok=true`;
- V57 control plane `ok=true`;
- evidência física pendente a partir de `UPSELL`;
- `eligible_owner_conversations=0`;
- `active_owner_homologation_sessions=0`;
- Make: `consultar no cpf` ativo e `incompleteExecutions=0`.

## RED
Antes da alteração foram consultadas as novas superfícies V64/V11 e ambas não existiam:
- `get_whatsapp_flow_v64_no_order_contamination_guard_v1()`;
- `queue_and_dispatch_whatsapp_flow_owner_homologation_v11(uuid,text,text)`.

## Implementação V64
### Evidência física sem contaminação comercial
Criado `get_whatsapp_flow_v64_no_order_contamination_guard_v1()` sobre a evidência V56. Além da sequência física existente, a função verifica na própria janela da sessão owner-only:
- zero registros em `orders` para a mesma conversa;
- zero eventos `flow_nfm_reply` com `has_confirmed_order=true` após a finalização;
- zero `outbound_jobs` da mesma conversa com `order_id` preenchido.

Se qualquer um aparecer, a evidência passa a `order_contamination_detected=true`, `ok=false` e `next_required=BLOCKED_ORDER_CONTAMINATION`.

A função é somente leitura, `SECURITY INVOKER`, com `PUBLIC`, `anon` e `authenticated` revogados e execução concedida a `service_role`.

### Preflight V8
Criado `get_whatsapp_flow_owner_homologation_preflight_v8(uuid)`:
- reaproveita integralmente o preflight V7;
- adiciona a autoridade V64;
- bloqueia o lançamento caso exista contaminação comercial real;
- permanece owner-only e fail-closed.

### Launcher V11
Criado `queue_and_dispatch_whatsapp_flow_owner_homologation_v11(uuid,text,text)`:
- advisory lock próprio V11;
- exige preflight V8 verde;
- retorna `owner_homologation_blocked_by_order_contamination` quando necessário;
- somente chama o V10 internamente depois do preflight;
- `service_role` perdeu execução direta no V10 e passa a usar exclusivamente o V11.

### Control plane V64
Criado `get_whatsapp_flow_v64_homologation_control_plane_v1()`:
- unifica V57 + evidência V64;
- reporta as três contagens de contaminação;
- mantém V8/V9/V10 indisponíveis para lançamento direto;
- só libera `safe_to_launch_owner_v11=true` quando houver exatamente uma conversa owner elegível, nenhuma sessão owner ativa, runtime pronto, evidência ainda incompleta e zero contaminação.

## GREEN / verificação viva
O V64 retornou:
- `order_contamination_detected=false`;
- `orders_created_in_homologation_window=0`;
- `confirmed_order_nfm_events_after_finalize=0`;
- `order_bound_outbound_jobs_in_homologation_window=0`;
- `no_real_order_created=true`;
- `no_confirmed_order_nfm_reply=true`;
- `no_order_bound_outbound_job=true`;
- `physical_next_required=UPSELL`.

Control plane V64:
- runtime V26 / Edge49;
- `eligible_owner_conversations=0`;
- `active_owner_homologation_sessions=0`;
- `safe_to_launch_owner_v11=false`;
- `direct_v10_service_role_disabled=true`;
- `next_action=wait_for_owner_service_window`.

Privilégios confirmados:
- V10: `service_role EXECUTE=false`;
- V11: `service_role EXECUTE=true`.

Preflight V8 com conversa inexistente retornou `ok=false` e `writes_performed=false`, confirmando o comportamento fail-closed.

## Gates preservados
- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

Nenhum Flow foi disparado, nenhum rollout foi ampliado e nenhuma escrita comercial foi habilitada.

## Make
Verificado diretamente:
- `consultar no cpf` ativo;
- `incompleteExecutions=0`;
- cenários temporários e outbound relacionados ao Flow continuam inativos.
Nenhum cenário foi alterado.

## Security Advisor
Executado após a migration. Não foi observado alerta novo relacionado ao V64. Permanecem alertas preexistentes fora deste bloco, incluindo funções administrativas `agent_workflow_*` e configurações gerais de Auth/RLS; não foram alterados para evitar ampliar o escopo desta rodada.

## GitHub
Persistidos:
- `supabase/migrations/20260912102035_whatsapp_flow_v64_no_order_contamination_guard.sql`;
- `scripts/test-whatsapp-flow-v64-no-order-contamination-guard-contract.mjs`;
- este checkpoint RUN46.

O contrato estático valida 13 invariantes da migration V64.

## Próximo passo
A prova física owner-only continua:

`UPSELL → REVISÃO → CLIENTE/ENDEREÇO → FINALIZAR_NO_ORDER → nfm_reply_no_order → localização`

Agora, além da ordem estrita, a prova só será aceita se permanecer demonstravelmente livre de pedido real. Enquanto não existir exatamente uma conversa owner elegível dentro da janela de atendimento, o V11 permanece bloqueado e nenhum gate deve ser aberto.
