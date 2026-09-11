# WhatsApp Flow Cestas — checkpoint RUN35 — 2026-09-11

## Objetivo da rodada
Consolidar em um único control plane read-only o estado técnico da homologação, a evidência física terminal e a existência de uma conversa owner allowlisted apta para lançamento, sem enviar Flow, criar sessão, emitir token, escrever pedido ou abrir gates.

## Estado relido
- RUN34 / V51 confirmado no `main` e no Supabase.
- `get_whatsapp_flow_v51_owner_launch_runtime_readiness_v1()` retornou `ok=true`.
- `get_whatsapp_flow_v49_physical_terminal_evidence_v1()` continua `preflight_ok=true`, `ok=false`, `next_required=UPSELL`.
- Evidência física continua em `CESTAS -> PERSONALIZAR_A -> SECOES_A -> TERMOS_A -> PRODUTOS_A`.
- Runtime permanece `handler_version=v26` / `Edge 49`.
- No momento da rodada havia `0` conversas owner allowlisted dentro da janela de serviço, em modo AI e sem handoff humano.
- Make continua somente com `consultar no cpf` ativo e `incompleteExecutions=0`.

## V52 aplicado
Migration Supabase: `whatsapp_flow_v52_homologation_control_plane`.
Arquivo persistido: `supabase/migrations/20260911231800_whatsapp_flow_v52_homologation_control_plane.sql`.

### Novo control plane
`get_whatsapp_flow_v52_homologation_control_plane_v1()`.

A função é `STABLE`, read-only e `service_role` only. Ela consolida:
1. readiness V51 do runtime/lançador owner-only;
2. evidência física V49;
3. quantidade de conversas owner elegíveis na janela de serviço;
4. existência de sessão owner de homologação ainda ativa;
5. decisão determinística `safe_to_launch_owner_v8`;
6. próxima ação operacional sem expor telefone ou dados pessoais.

### Resultado real
- `ok=true`
- `runtime_readiness_ok=true`
- `physical_evidence_ok=false`
- `physical_next_required=UPSELL`
- `eligible_owner_conversations=0`
- `active_owner_homologation_sessions=0`
- `safe_to_launch_owner_v8=false`
- `next_action=wait_for_owner_service_window`
- `dispatch_version=v8-runtime-v26-edge49`
- `runtime_handler=v26`
- `edge_version=49`
- `writes_performed=false`
- `physical_send_performed=false`

Permissões verificadas no banco: apenas `postgres` e `service_role` possuem `EXECUTE`; `public`, `anon` e `authenticated` não possuem execução.

## Gates confirmados depois da alteração
- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

## Make
Somente `consultar no cpf` permanece ativo; `incompleteExecutions=0`. Nenhum cenário foi modificado.

## Segurança
O Security Advisor foi executado após o DDL. Não apareceu alerta específico para a nova função V52. Permanecem alertas históricos fora deste escopo, incluindo RLS sem policies em tabelas internas, funções SECURITY DEFINER antigas acessíveis a papéis mais amplos e leaked-password protection desabilitado. Nada disso foi alterado nesta rodada para não ampliar o escopo do Flow.

## Contrato estático
Persistido em `scripts/test-whatsapp-flow-v52-homologation-control-plane-contract.mjs`. O contrato impede que o control plane chame o dispatcher V8 ou grave em pedidos, outbound, mensagens ou sessões.

## Estado da prova física
A implementação técnica continua pronta, mas a prova real terminal ainda não existe. Sequência pendente:
`UPSELL -> REVISAO -> CLIENTE_EXISTENTE|CLIENTE_NOVO -> FINALIZAR -> nfm_reply -> location`.

## Próxima ação
Enquanto `eligible_owner_conversations=0`, nenhuma mensagem deve ser enviada e nenhum gate deve ser aberto. Quando exatamente uma conversa owner autorizada estiver válida, o V52 passará a sinalizar `safe_to_launch_owner_v8=true`; o lançamento real continuará restrito ao wrapper V8 e ao número homologado.

## Ação manual indispensável
Para avançar para a prova física, o proprietário precisa apenas iniciar ou manter uma conversa válida no número autorizado de homologação dentro da janela de serviço. Até isso ocorrer, não existe ação automática segura que produza a evidência física sem falsificá-la.
