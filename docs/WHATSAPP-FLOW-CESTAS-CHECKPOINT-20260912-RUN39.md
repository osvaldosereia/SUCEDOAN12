# WhatsApp Flow Cestas — checkpoint RUN39 / V56

## Objetivo desta rodada
Endurecer a prova física terminal owner-only para que a homologação só possa ficar verde quando o trecho final for comprovado pelo caminho V55 sem pedido real, evitando falso positivo por `nfm_reply` comercial antigo ou ambíguo.

## Estado relido antes da alteração
- `get_whatsapp_flow_v55_owner_terminal_no_order_readiness_v1()` = `ok=true`.
- runtime comercial = V26 / Edge 49.
- evidência física ainda pendente a partir de `UPSELL`.
- `eligible_owner_conversations=0`.
- `active_owner_homologation_sessions=0`.
- `safe_to_launch_owner_v9=false`.
- gates globais preservados: canary 1%; Orchestrator OFF; Data Exchange OFF; Flow Send OFF; commercial write OFF; Bling OFF.
- Make: somente `consultar no cpf` ativo; `incompleteExecutions=0`.

## RED observado
O monitor V54 ordenava `UPSELL -> REVISAO -> CLIENTE -> FINALIZAR -> nfm_reply -> localização`, porém não exigia no próprio contrato físico os marcadores `homologation_no_order=true` e `has_confirmed_order=false` do novo caminho terminal V55.

Consulta pré-migration confirmou:
- `requires_no_order_marker=false`;
- `checks_confirmed_order_marker=false`.

## Implementação V56
Aplicada no Supabase a migration `20260912032233_whatsapp_flow_v56_no_order_physical_evidence`.

### Evidência terminal V56
Nova função somente leitura:
`get_whatsapp_flow_v56_no_order_physical_terminal_evidence_v1()`.

Além da ordem física já exigida pelo V54, ela agora exige:
- sessão owner-only de homologação;
- `homologation_terminal_preview=true`;
- `homologation_terminal_no_order=true`;
- ausência de `flow_order_id` na sessão;
- `flow_nfm_reply` posterior ao `FINALIZAR` com `event_data.homologation_no_order=true`;
- `event_data.has_confirmed_order=false`;
- localização inbound estritamente posterior a esse `nfm_reply` específico de homologação sem pedido.

Sequência exigida pelo V56:
`UPSELL -> REVISAO -> CLIENTE_EXISTENTE|CLIENTE_NOVO -> FINALIZAR_NO_ORDER -> nfm_reply_no_order -> location`.

### Control plane V56
Nova função:
`get_whatsapp_flow_v56_homologation_control_plane_v1()`.

Ela substitui o critério físico pelo V56, mantém V8 bloqueado e só pode liberar o V9 quando:
- runtime readiness estiver verde;
- a evidência V56 ainda estiver incompleta;
- existir exatamente 1 conversa owner elegível;
- não houver sessão owner de homologação ativa;
- o lançador V9 serializado existir.

## Verificação GREEN
Após a migration:
- `requires_no_order_marker=true`;
- `checks_confirmed_order_marker=true`;
- `evidence_version=v56-no-order-terminal`;
- `physical_requires_no_order_proof=true`;
- `physical_next_required=UPSELL`;
- `safe_to_launch_owner_v9=false` porque ainda não existe conversa owner elegível na janela;
- `next_action=wait_for_owner_service_window`.

A evidência antiga não foi promovida artificialmente: a sessão anterior continua `abandoned`, tela `PRODUTO`, state version 6, com os mesmos 7 exchanges observados.

## Efeitos colaterais
Na verificação posterior à migration:
- 0 pedidos criados nos 10 minutos observados;
- 0 mensagens criadas;
- 0 outbound jobs criados;
- 0 novas sessões owner de homologação.

ACL das duas funções V56:
- EXECUTE somente para `postgres` e `service_role`;
- sem EXECUTE para `public`, `anon` ou `authenticated`.

## Gates preservados
- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## Make
Somente `consultar no cpf` permanece ativo e `incompleteExecutions=0`. Nenhum cenário Make foi modificado.

## Segurança
O Security Advisor foi executado após V56. Não apareceu finding referente às novas funções V56. Permanecem findings preexistentes fora deste bloco, incluindo tabelas com RLS sem políticas, funções SECURITY DEFINER antigas expostas e proteção de senha vazada desabilitada.

## Persistência no repositório
- migration: `supabase/migrations/20260912032000_whatsapp_flow_v56_no_order_physical_evidence.sql`;
- contrato estático: `scripts/test-whatsapp-flow-v56-no-order-physical-evidence-contract.mjs`;
- checkpoint: este arquivo.

O contrato estático proíbe criação/alteração de pedidos, mensagens e outbound jobs, abertura dos gates globais e exige os marcadores explícitos de homologação sem pedido.

## Próximo passo
A prova física continua pendente a partir de `UPSELL`. Para iniciar uma nova sessão owner-only pelo V9, precisa existir exatamente uma conversa do número autorizado dentro da janela de serviço. Até isso ocorrer, `safe_to_launch_owner_v9=false` deve permanecer fail-closed.
