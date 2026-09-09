# WhatsApp Flow — Health Webhook V1

Data: 2026-09-09

## Objetivo

Receber de forma dedicada e segura os eventos de monitoramento de disponibilidade dos WhatsApp Flows, sem misturar esses callbacks com o atendimento de clientes e sem ativar o Data Exchange comercial.

## Endpoint

Edge Function: `whatsapp-flow-health-webhook-v1`

Callback planejado:

`https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-flow-health-webhook-v1`

`verify_jwt=false` é intencional porque a Meta não envia JWT do Supabase. A autenticação é própria do webhook:

- GET de verificação: compara `hub.verify_token` com token opaco guardado no Supabase Vault;
- POST de eventos: exige `X-Hub-Signature-256` e valida HMAC SHA-256 com o App Secret;
- sem App Secret configurado, POST falha fechado com `webhook_signature_unconfigured`;
- somente mudanças do campo `flows` são persistidas.

## Persistência

Tabela `whatsapp_flow_health_events`:

- append-only;
- RLS habilitada;
- sem acesso para `anon`/`authenticated`;
- deduplicação por `event_fingerprint`;
- registra apenas contexto normalizado do monitoramento (`event`, `flow_id`, `availability`, `threshold`, `alert_state`, tempo/entrada), sem autoridade comercial.

## Segredos

Criado automaticamente no Vault:

- `dona_antonia_whatsapp_flow_health_verify_token_v1`

Não é criado placeholder para o App Secret. Quando o proprietário disponibilizar o segredo de forma segura, usar exatamente:

- `dona_antonia_meta_app_secret_v1`

Nunca registrar o valor em GitHub, documentação, logs ou chat.

## Estado Meta observado

O app `cell principal` (`1547249776748513`) já foi associado ao Flow e inscrito na WABA `840102181903253` sem remover o app do Make.

O Flow v4 está em `DRAFT`, JSON 7.3, com `validation_errors=[]`. O healthcheck do endpoint já passou; `health_status` está `LIMITED` apenas porque o callback do webhook do app ainda não foi configurado no objeto `whatsapp_business_account`/campo `flows`.

A chamada de gerenciamento `/{APP_ID}/subscriptions` respondeu `(#190) Application Secret required for this endpoint`. Portanto a etapa final depende do App Secret do `cell principal`.

## Gates

Este webhook não altera os gates comerciais. Devem permanecer:

- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

Nenhum evento de health pode ativar Flow, enviar mensagem, alterar pedido, preço, estoque, pagamento ou fiscal.
