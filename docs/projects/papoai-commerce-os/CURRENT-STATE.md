# PapoAI Commerce OS — Current State

Atualizado: 2026-09-21

## Estado atual

- fase: `r0a_deployed_dormant_waiting_papoai_physical_test`
- projeto Supabase: `ssbesxgaijknwsjbsbcz`
- branch GitHub: `papoai-commerce-os-r0a-spec-20260921`
- Edge Function usada: `papo-external-agent-v1`
- versão Supabase implantada: **v2**
- lab: **desabilitado**
- efeitos externos comerciais: **false**
- OpenAI: **off na R0-A**
- pedidos: **off**
- Bling: **off**
- marketing/campanhas/templates: **off**
- Meta Direct: **não alterado**
- PapoAI outbound canônico: **disabled**

## Evidência já obtida

1. O painel do PapoAI mostra explicitamente **Agente Externo** com endpoint HTTPS próprio.
2. Migration `papoai_agent_external_lab_core_v1` aplicada com sucesso.
3. As quatro tabelas da R0-A estão com RLS habilitado e acesso concedido somente a `service_role`.
4. `papo-external-agent-v1` foi redeployada como v2 usando o contrato R0-A.
5. POST sem a chave do laboratório retornou **401 unauthorized**.
6. POST autenticado com o lab desligado retornou **200** com:
   - `message: null`
   - `silent: true`
   - `handoff: true`
   - `reason: "lab_disabled"`
7. Após esses testes:
   - `channel_provider_agent_lab_sessions = 0`
   - `channel_provider_agent_lab_calls = 0`
   - nenhuma capacidade foi promovida por inferência.
8. Estados principais permanecem:
   - `agent_external.request = observed_ui`
   - `agent_external.text_reply = unknown`
   - `agent_external.session = unknown`
   - `agent_external.handoff = unknown`
   - `agent_external.silent = unknown`

## Ruling de implementação

O projeto Supabase atingiu o limite de Edge Functions. A tentativa de criar `papoai-agent-external-lab-v1` foi recusada pelo Supabase por limite do plano.

Já existia `papo-external-agent-v1` v1. Antes da alteração foi verificado no banco que ela tinha **zero sessões registradas** em `catalog_sessions` com `entry_source='papoai_external_agent'`.

Decisão:
- preservar a função antiga no histórico do GitHub;
- reutilizar o mesmo slug;
- implantar a R0-A como v2;
- não criar função adicional nem gerar custo de upgrade.

O código exato da função antiga foi capturado no commit:
`95ddf7822e7958e8eca2d91bded7434c0d03802a`.

A conversão para o laboratório foi feita no commit:
`18081c401eb7af17bde039e26a2fa867af28040f`.

## Gates de produção observados antes do deploy

Permaneciam todos desligados:
- `automation_enabled=false`
- `ai_enabled=false`
- `outbound_enabled=false`
- `whatsapp_inbound_enabled=false`
- `whatsapp_auto_reply_enabled=false`
- `whatsapp_release_mode='off'`
- `whatsapp_live_canary_percent=0`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `bling_order_sync_enabled=false`
- `whatsapp_sales_order_submit_enabled=false`
- `whatsapp_sales_bling_submit_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`

## Próximo gate

Falta apenas a **prova física pelo PapoAI**.

Não ativar o laboratório até haver um Agente Externo isolado de homologação apontando para:

`https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/papo-external-agent-v1`

Depois da configuração física:
1. habilitar o lab por poucos minutos;
2. testar texto normal;
3. testar segunda mensagem na mesma sessão;
4. testar `TESTE_HANDOFF_DONA_ANTONIA`;
5. testar pausa/silêncio;
6. desabilitar novamente;
7. promover somente as capacidades realmente observadas.

A R0-B (Commerce Brain) só é liberada depois de `request + text_reply + session` estarem comprovadas no laboratório.
