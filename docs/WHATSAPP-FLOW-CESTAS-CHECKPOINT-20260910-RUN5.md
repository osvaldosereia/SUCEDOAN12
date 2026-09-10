# WhatsApp Flow Cestas Dona Antônia — checkpoint RUN5

Data: 2026-09-10

## Estado relido

- Candidato principal permanece `flow-cestas-comercial-v8-stable`, Meta Flow `2579927222524475`, `DRAFT` e isolado.
- Runtime atual: `handle_whatsapp_flow_commercial_exchange_v23`.
- Jornada comercial readiness: 20/20.
- Sessão owner-only existente: `caf9452b-8df9-43f1-9487-cee2e9aff02a`, status `offered`, sem INIT/Data Exchange.
- Make mantém somente três cenários ativos autorizados: inbound controlado, outbound event-driven e consulta CPF; todos sem execuções incompletas.

## Implementação desta rodada

Criado `get_whatsapp_flow_v31_full_release_readiness_v1(uuid)` como gate unificado, somente leitura e service-role.

Ele agrega, numa única resposta fail-closed:

- jornada comercial completa e catálogo limitado;
- terminal `nfm_reply` + localização;
- saúde da jornada;
- canary em 1%;
- Orchestrator OFF;
- Data Exchange global OFF;
- Flow send global OFF;
- escrita comercial OFF;
- Bling OFF;
- presença do runtime V23;
- presença do processador `nfm_reply`;
- allowlist owner-only;
- modo da conversa;
- janela de serviço;
- ausência/presença de handoff humano.

Primeira execução encontrou uma assinatura antiga incorreta no introspector de `process_whatsapp_flow_nfm_reply_v1`; foi corrigida imediatamente para `(uuid,uuid,jsonb)` e reaplicada em migration corretiva no Supabase.

Resultado real após correção:

- `healthy=true`;
- 13/15 checks positivos;
- `homologation_ready=false` exclusivamente porque `owner_conversation_ai=false` (`mode=human`) e `owner_handoff_clear=false` (handoff ativo);
- `owner_service_window_open=true`;
- `owner_target_authorized=true`;
- `next_expected=OPEN_FLOW`;
- nenhum novo outbound foi disparado.

## CI

Adicionado `scripts/test-whatsapp-flow-v31-full-release-readiness-contract.mjs`.

O workflow `Test WhatsApp Flow V31 Runtime` passou a executar esse contrato e observar a nova migration.

## Gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum cliente foi exposto, nenhum rollout foi aumentado, nenhuma sessão nova foi criada e nenhum atendimento humano foi encerrado.

## Próximo ponto

Continuar a homologação owner-only quando a conversa autorizada estiver naturalmente em modo IA e sem handoff ativo. Até lá, seguir ampliando regressões determinísticas do caminho:

`CESTAS -> PERSONALIZAR -> SECOES/TERMOS/BUSCA -> PRODUTOS -> UPSELL -> REVISAO -> CLIENTE -> FINALIZAR -> nfm_reply -> localização`.

## Ação manual

Nenhuma ação manual indispensável neste momento. A operação visual do Flow no aparelho autorizado continua sendo necessária somente quando o preflight owner-only estiver liberado naturalmente.
