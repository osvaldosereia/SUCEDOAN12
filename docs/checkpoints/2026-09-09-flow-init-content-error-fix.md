# WhatsApp Flow — correção do erro de conteúdo no INIT

Data: 2026-09-09
Branch: `flow-v29-fast-owner-test`

## Sintoma

O link do WhatsApp abria a moldura do Flow, mas o conteúdo dinâmico não carregava.

## Causa raiz confirmada

A Edge `whatsapp-flow-data-exchange-v1` verificava `whatsapp_flow_data_exchange_enabled=false` antes de resolver o `flow_token`. Com isso, qualquer `INIT` recebia `503 flow_endpoint_disabled`, inclusive uma sessão explícita de homologação do proprietário. Os `ping` continuavam aceitos, o que mascarava parcialmente o problema.

Também foi identificada uma regressão independente na hidratação das listas V28/V30: `NavigationList.start.src` estava sendo removido e substituído por `start.image`, contrariando o normalizador e o contrato usado pelo JSON 7.3 do projeto.

## Correção

1. O `flow_token` agora é resolvido antes do gate de Data Exchange.
2. O gate global permanece desligado. Há bypass somente para sessão válida, explícita de homologação do proprietário, em definição dormente `v4`–`v6`, com `candidate_not_live=true` e `customer_exposure!=true`.
3. Quando a sessão possui `test_recipient`, o bypass também exige correspondência com o destinatário da conversa.
4. `flow-cestas-comercial-v6` agora é roteado explicitamente para `handle_whatsapp_flow_commercial_exchange_v17`.
5. A hidratação das listas V28/V30 voltou a preencher `NavigationList.start.src` e não `start.image`.
6. A sessão de teste V5 mais recente foi reaberta temporariamente para homologação do proprietário, sem ativar envio ou exposição geral.

## Evidência

- Smoke determinístico direto de `handle_whatsapp_flow_commercial_exchange_v16(..., 'INIT', ...)`: `ok=true`, `screen=CESTAS`, 9 cestas reais retornadas.
- Após o deploy da correção, um novo evento real `INIT` foi registrado como `accepted` às 2026-09-10 00:57:19 UTC, enquanto antes só havia `ping` após 22:59 UTC.

## Gates que devem permanecer preservados

- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

Nenhum rollout ou publicação para clientes foi autorizado por esta correção.
