# WhatsApp Flow Dona Antônia — Checkpoint RUN20

Data: 2026-09-11

## Objetivo

Eliminar divergência entre a definição persistida do Flow stable e o runtime realmente implantado, mantendo homologação owner-only, catálogo segmentado e todos os gates fechados.

## Achado

A auditoria encontrou o Edge `whatsapp-flow-data-exchange-v1` ACTIVE na versão 48 e despachando `flow-cestas-comercial-v8-stable` para `handle_whatsapp_flow_commercial_exchange_v25`, mas a linha de `experience_definitions` ainda registrava versões antigas em `config/metadata` (`handler_version` v23/v24, `commercial_handler` V24 e `edge_version` 45).

Isso não quebrava o tráfego atual, mas criava risco operacional para readiness, admin, auditorias e futuras promoções automáticas baseadas na definição persistida.

## Implementado — V38

Migration `20260911082000_whatsapp_flow_v38_runtime_definition_alignment_v1.sql` aplicada no Supabase e persistida no GitHub.

A definição `flow-cestas-comercial-v8-stable` passou a registrar explicitamente:

- `handler_version=v25`;
- `commercial_handler=handle_whatsapp_flow_commercial_exchange_v25`;
- `runtime_edge_version=48`;
- `metadata.edge_version=48`;
- `upsell_recommendation_version=v35-session-aware-v1`;
- `implementation_stage=v38_v25_runtime_definition_aligned`.

Nenhum gate de rollout/exposição foi alterado.

## Readiness V38

Criado `get_whatsapp_flow_v38_runtime_alignment_readiness_v1(uuid)`.

O readiness confirma:

- definição stable em `ready`;
- provider `meta_whatsapp_flow`;
- runtime V25 e Edge 48 alinhados entre banco e código;
- V25 encadeando V24 e recomendador session-aware;
- limite de catálogo `<=20`;
- `never_load_full_catalog=true`;
- `full_catalog_load_forbidden=true`;
- auditoria da sessão owner-only atual saudável;
- gates críticos preservados.

Resultado na sessão aberta atual:

- `ok=true`;
- tela atual `CESTAS`;
- `next_expected=SELECT_BASKET`;
- 1 exchange (`INIT`) aceito;
- 0 erros;
- 0 replays;
- 0 extras pendentes;
- sem PII;
- sem escrita comercial.

Permissões da RPC:

- anon: false;
- authenticated: false;
- service_role: true.

## Gates preservados

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## Edge

`whatsapp-flow-data-exchange-v1` permanece ACTIVE na versão 48, `verify_jwt=false` conforme contrato Meta/Data Exchange já protegido pelo protocolo criptográfico e allowlist owner-only.

## GitHub/CI

Persistidos:

- `supabase/migrations/20260911082000_whatsapp_flow_v38_runtime_definition_alignment_v1.sql`;
- `scripts/test-whatsapp-flow-v38-runtime-alignment-contract.mjs`;
- workflow `Test WhatsApp Flow Live Audit` atualizado com V38.

Run `34578957280` disparado para o commit `4585917ea10cc8e50c0da4d2c8f69f55bd483d5f`; estava `in_progress` na última leitura deste checkpoint.

## Make

Continuam exatamente três cenários autorizados ativos, todos com `incompleteExecutions=0`:

1. Dona Antônia - WhatsApp Outbound Event-Driven v3;
2. Dona Antônia - WhatsApp Inbound Controlado v1;
3. consultar no cpf.

Nenhum cenário foi alterado.

## Estado atual / próximo bloco

A sessão owner-only aberta continua em `CESTAS` após `INIT`. O próximo trecho de homologação física ainda é selecionar a cesta e avançar até produto/quantidade → adicionais → UPSELL V25 → revisão → cliente/endereço → finalizar → `nfm_reply` → localização.

Enquanto não houver nova interação real, continuar endurecendo readiness/contratos e preservar integralmente os gates.
