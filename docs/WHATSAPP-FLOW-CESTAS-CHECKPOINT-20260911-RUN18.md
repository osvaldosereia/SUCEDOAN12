# WhatsApp Flow Dona Antônia — Checkpoint RUN18

Data: 2026-09-11

## Objetivo

Promover de forma controlada o runtime estável do Flow comercial de V24 para V25, mantendo homologação owner-only e todos os gates globais fechados.

## Concluído

- `whatsapp-flow-data-exchange-v1` promovida no Supabase para versão **48**;
- o slug `flow-cestas-comercial-v8-stable` agora chama `handle_whatsapp_flow_commercial_exchange_v25`;
- V25 preserva integralmente V24 e substitui somente a lista de `UPSELL` por recomendações session-aware V35;
- replay cache/idempotência e validação obrigatória de `screen` permanecem intactos;
- isolamento owner-only permanece intacto;
- código correspondente persistido no GitHub em `supabase/functions/whatsapp-flow-data-exchange-v1/index.ts`.

## Validação Supabase

Readiness V35 da sessão real retornou `ok=true` com:

- `recommendation_count=6`;
- `invalid_product_count=0`;
- `selected_product_overlap_count=0`;
- `duplicate_count=0`;
- `session_context_aware=true`;
- `ai_authoritative_for_products=false`;
- `optional_upsell=true`;
- `writes_executed=false`;
- `pii_returned=false`.

Gates confirmados pela mesma auditoria:

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## Contrato GitHub

Criado `scripts/test-whatsapp-flow-v36-stable-runtime-promotion-contract.mjs` para garantir que:

- o stable usa V25;
- não regride para V24 no branch do stable;
- owner-only/fail-closed continuam presentes;
- V25 e o recomendador session-aware V35 permanecem vinculados.

Workflow `Test WhatsApp Flow Live Audit` atualizado para incluir o Edge e o contrato V36.

## Make

Auditoria atual encontrou exatamente os três cenários autorizados ativos, todos com `incompleteExecutions=0`:

1. `consultar no cpf`;
2. `Dona Antônia - WhatsApp Inbound Controlado v1`;
3. `Dona Antônia - WhatsApp Outbound Event-Driven v3`.

Nenhum cenário Make foi alterado.

## Próximo bloco seguro

1. aguardar/validar CI do contrato V36;
2. continuar a homologação física da sessão owner-only a partir de `PERSONALIZAR`;
3. observar a primeira passagem real por `UPSELL` com V25;
4. seguir para revisão, cadastro/endereço, pagamento, finalização, `nfm_reply` e solicitação de localização no WhatsApp;
5. manter todos os gates e rollout inalterados até homologação completa.
