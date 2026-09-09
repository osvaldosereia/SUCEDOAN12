# WhatsApp Flow Dona Antônia — Run 14 — V3 DRAFT oficial na Meta

Data: 2026-09-09

## Concluído

- `whatsapp/flows/flow-cestas-comercial-v26.json` validado oficialmente pela Meta Graph API v26.0.
- Resultado do upload/validação: `success=true` e `validation_errors=[]`.
- Criado Flow separado exclusivamente para homologação, sem publicar e sem torná-lo padrão:
  - nome: `Dona Antônia - Cestas Comercial V3 Homologação`
  - Meta Flow ID: `1374238777748633`
  - status: `DRAFT`
  - JSON version: `7.3`
  - Data API version: `3.0`
  - health `can_send_message=AVAILABLE`
  - aplicação: `cell principal`
- O JSON V26 foi enviado para esse DRAFT e permaneceu com `validation_errors=[]`.
- `experience_definitions.flow-cestas-comercial-v3` foi vinculado ao provider_id `1374238777748633`, mantendo `status=draft`, `default_for_new_sessions=false` e `candidate_not_live=true`.
- A Edge `whatsapp-flow-data-exchange-v1` já estava em versão 16 e preserva rota exclusiva `flow-cestas-comercial-v3 -> handle_whatsapp_flow_commercial_exchange_v12`.
- V2 publicado (`1539877778181619`) não foi substituído nem modificado nesta etapa de homologação.

## Gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum envio para clientes, nenhuma alteração de rollout e nenhum Bling real.

## Próximo bloco

1. smoke criptografado do Data Exchange V3/V12 usando sessão sintética;
2. validar visualmente cestas, personalização em lote e cards de 3 produtos com JPEG pré-comprimido;
3. validar `Ver mais`, `Outra categoria ou busca`, `Revisar pedido`, cliente existente/novo e `nfm_reply`;
4. manter o Flow V3 em DRAFT e fora do default até homologação completa e autorização explícita.
