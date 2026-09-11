# WhatsApp Flow Cestas — checkpoint RUN32 — 2026-09-11

## Objetivo da rodada
Transformar a prova física terminal owner-only em um gate observável e automático, sem abrir rollout, sem criar pedido e sem escrever estado comercial.

## Estado relido antes da alteração
- RUN31 confirmado no `main`.
- `get_whatsapp_flow_v48_physical_homologation_preflight_v1()` retornou `ok=true`, 7/7 checks verdes.
- Runtime permanece `handle_whatsapp_flow_commercial_exchange_v26` / Edge 49.
- Evidência física anterior ainda termina em `PRODUTOS_A`.
- Make continua com apenas `consultar no cpf` ativo e `incompleteExecutions=0`.

## V49 aplicado
Migration: `20260911203000_whatsapp_flow_v49_physical_terminal_evidence_v1.sql`.

Nova função read-only:
`get_whatsapp_flow_v49_physical_terminal_evidence_v1()`.

O monitor seleciona somente sessão do candidato `flow-cestas-comercial-v8-stable` marcada simultaneamente como `requested_by_owner=true` e `homologation_test=true`, priorizando a sessão com maior progresso. Ele exige evidência física aceita, na mesma sessão, para:
1. `UPSELL`;
2. `REVISAO`;
3. `CLIENTE_EXISTENTE|CLIENTE_NOVO`;
4. `FINALIZAR`/conclusão;
5. evento `flow_nfm_reply` em `experience_events`;
6. mensagem inbound `location` posterior ao `nfm_reply` na mesma conversa.

O retorno inclui `observed_screens`, `next_required`, timestamps de `nfm_reply` e localização e reaproveita os gates do preflight V48.

## Resultado real após aplicação
- `preflight_ok=true`.
- `ok=false`, corretamente, porque a evidência física terminal ainda não aconteceu.
- Sessão owner-only de maior progresso: `da005838-32c1-48da-a20f-a7d7ccc58bc2`.
- Evidência observada: `CESTAS -> PERSONALIZAR_A -> SECOES_A -> TERMOS_A -> PRODUTOS_A`.
- `next_required=UPSELL`.
- Nenhum `nfm_reply` nem localização terminal foi artificialmente criado.

## Segurança preservada
- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

A função V49 teve execução revogada de `public`, `anon` e `authenticated` e concedida somente a `service_role`. Ela é exclusivamente de leitura.

## Testes e persistência
- Função V49 aplicada no Supabase e executada com sucesso.
- Resultado real confirmou que o gate não produz falso positivo.
- Contrato estático adicionado em `scripts/test-whatsapp-flow-v49-physical-evidence-contract.mjs`.
- Migration e checkpoint persistidos no `main`.

## O que falta
A prova física owner-only continua sendo o único bloqueio funcional relevante para encerrar a homologação terminal:
`UPSELL -> REVISAO -> CLIENTE_EXISTENTE|CLIENTE_NOVO -> FINALIZAR -> nfm_reply -> location`.

Assim que essa jornada for atravessada no número autorizado, o V49 passará a reconhecer automaticamente cada marco e só retornará `ok=true` depois da localização inbound posterior ao `nfm_reply`.

## Ação manual do proprietário
Nenhuma ação manual foi necessária nesta rodada. A próxima ação humana indispensável continua sendo atravessar fisicamente o Flow no número autorizado de homologação quando a prova final for iniciada.
