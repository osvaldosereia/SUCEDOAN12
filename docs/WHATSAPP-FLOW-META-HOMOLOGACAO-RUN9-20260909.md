# WhatsApp Flow Dona Antônia — Homologação Meta Run 9

Data: 2026-09-09

## Estado validado na Meta

Flow ID: `1538860004926321`

App: `cell principal` (`1547249776748513`)

WABA: `840102181903253`

Phone Number ID real: `1218939807961094`

Estado do Flow: `DRAFT`.

O artefato `whatsapp/flows/flow-cestas-comercial-v4.json`, com JSON version `7.3` e data API `3.0`, foi submetido diretamente à API de assets da Meta. Após remover a rota reversa `AJUSTAR_ITEM -> PERSONALIZAR` do `routing_model`, a Meta respondeu `success=true` e `validation_errors=[]`.

A regra confirmada pela validação real é que o `routing_model` deve declarar somente rotas forward. A tela `AJUSTAR_ITEM` permanece no Flow, mas sua rota reversa não é declarada no grafo.

## Criptografia e endpoint

O par RSA do Data Exchange está configurado. A chave privada permanece no Vault do Supabase e a pública foi instalada no WhatsApp Business. A Meta retornou `business_public_key_signature_status=VALID`.

O endpoint oficial é a Edge Function `whatsapp-flow-data-exchange-v1`. O healthcheck criptografado `ping` pode ser atendido com o Flow dormente, mas toda ação diferente de `ping` continua fail-closed quando `whatsapp_flow_data_exchange_enabled=false`.

Após essa correção, o erro de disponibilidade/integridade do endpoint desapareceu do `health_status` da Meta.

## Webhooks

A WABA passou a ter os dois apps inscritos, sem remover o Make:

- `cell principal` (`1547249776748513`)
- `Make for Business Messaging` (`780691577862636`)

O Flow permanece com `health_status.can_send_message=LIMITED` porque o próprio app `cell principal` ainda não possui callback de webhook configurado para o objeto `whatsapp_business_account`/campo de Flows. A API `/{APP_ID}/subscriptions` respondeu `(#190) Application Secret required for this endpoint` quando chamada com a credencial atual.

O App Secret do `cell principal` não está armazenado no Vault do Supabase. Portanto a configuração do webhook do app depende de disponibilizar o App Secret de forma segura ou realizar essa configuração diretamente no painel Meta.

## Proteções preservadas

Não publicar o Flow e não ativar transporte/comércio durante homologação. Permanecem obrigatoriamente:

- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

Nenhuma alteração desta rodada autoriza aumento de rollout, publicação para clientes, escrita comercial real ou Bling.

## Concorrência de artefatos

O arquivo experimental `flow-cestas-comercial-v5.json` foi criado em paralelo para desenrolar ciclos de extras. No estado observado ele usa IDs com sufixos numéricos (`SECOES_1`, `PRODUTO_2` etc.), que a Meta rejeitou com `PATTERN_MISMATCH`, pois IDs de tela aceitam apenas letras e `_`. Ele não deve substituir o v4 homologado até ser corrigido e validado separadamente.
