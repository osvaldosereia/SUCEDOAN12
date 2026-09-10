# WhatsApp Flow Dona Antônia — execução 2026-09-10 11:20 UTC

## Estado confirmado

- Candidato: `flow-cestas-comercial-v8-stable`
- Meta Flow: `2579927222524475`
- Meta status: `DRAFT`
- Handler: `handle_whatsapp_flow_commercial_exchange_v22`
- Flow JSON: `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json`
- Sessão owner-only atual: `offered`, válida, ainda sem INIT/Data Exchange real.
- Preflight V31: `ok=true`, 28/28 invariantes aprovadas.
- Make: somente inbound controlado, outbound event-driven e consulta CPF ativos; todos com zero execuções incompletas.

## Implementado nesta execução

1. Criado `public.get_whatsapp_flow_v31_journey_audit_v1(uuid)` como auditor determinístico da homologação real.
2. O auditor consolida sessão, preflight, timeline Data Exchange, erros, replays, telas percorridas, pedido associado, jobs outbound e marcos da jornada.
3. Marcos observados: INIT, CESTAS, personalização/ajuste, extras (seções/termos/produtos), UPSELL, REVISÃO, CLIENTE/ENDEREÇO, FINALIZAR, pedido criado, retorno `nfm_reply` e solicitação de localização.
4. O auditor produz `next_expected`, permitindo que a próxima execução identifique imediatamente o próximo ponto real: `OPEN_FLOW`, `CESTAS`, `PERSONALIZACAO`, `EXTRAS_SECOES_TERMOS`, `UPSELL`, `REVISAO`, `CLIENTE_ENDERECO`, `FINALIZAR`, `NFM_REPLY`, `PEDIR_LOCALIZACAO` ou `JORNADA_COMPLETA`.
5. A primeira versão revelou marcos nulos antes do INIT; corrigido na V2 para retornar booleanos determinísticos `false`.
6. A detecção de `nfm_reply` foi restringida a mensagens `inbound`, evitando falso positivo causado pela própria mensagem Flow outbound.
7. O auditor não expõe snapshot de cliente nem endereço; o resumo de pedido contém apenas identificadores/estado/total e campos operacionais necessários.
8. Permissões: `anon=false`, `authenticated=false`, `service_role=true`.
9. Migration persistida em `supabase/migrations/20260910112100_whatsapp_flow_v31_journey_audit_v2.sql`.

## Resultado atual do auditor

- `healthy=true`
- `exchange.count=0`
- `exchange.errors=0`
- `exchange.replays=0`
- mensagem Flow outbound anterior: `sent`, HTTP 200
- nenhum pedido criado nessa sessão
- nenhum `nfm_reply`
- nenhuma solicitação de localização ainda
- `next_expected=OPEN_FLOW`

## Gates preservados

O preflight confirmou novamente:

- `whatsapp_live_canary_percent = 1`
- `experience_orchestrator_enabled = false`
- `whatsapp_flow_data_exchange_enabled = false`
- `whatsapp_flow_send_enabled = false`
- `whatsapp_flow_commercial_write_enabled = false`
- `bling_order_sync_enabled = false`
- candidata isolada: `candidate_not_live=true`, sem exposição/default e produção desligada.

## Próximo passo

A próxima execução deve chamar primeiro `get_whatsapp_flow_v31_journey_audit_v1` na sessão V31 mais recente. Se `next_expected` deixar de ser `OPEN_FLOW`, auditar imediatamente o primeiro Data Exchange real e avançar/corrigir a jornada correspondente sem publicar nem ampliar rollout. Enquanto `next_expected=OPEN_FLOW`, não duplicar mensagens DRAFT desnecessariamente se a sessão atual continuar válida.
