# CM-1 Homologação — Meta Webhook V2

Atualizado em 18/09/2026.

## Objetivo

Separar corretamente três evidências que não podem ser tratadas como equivalentes:

1. WABA inscrita em aplicativo;
2. webhook de health dos WhatsApp Flows funcionando;
3. callback do Meta Direct para mensagens/statuses homologado.

Nenhuma configuração externa da Meta foi alterada nesta rodada.

## Evidência real já existente no Supabase

Tabela `whatsapp_flow_health_events`:

- eventos assinados observados em 14 dias: **669**;
- flows distintos observados: **9**;
- último evento assinado observado: **18/09/2026 15:22:41 UTC**;
- `signature_verified=true`;
- WABA observada nos payloads: `840102181903253`.

Conclusão:

> O caminho Meta → Supabase para **health dos Flows** está comprovadamente funcionando com assinatura válida.

Isso **não** significa que o callback usado pelo Meta Direct para mensagens esteja homologado.

## Estado persistido no Meta Control Plane

Foi criado um health snapshot com:

- `provider_state=read_only`;
- `graph_api_version=v26.0`;
- `webhook_state=flow_health_verified_direct_pending`;
- `flow_state=available`;
- `flow_health_webhook_verified=true`;
- `meta_direct_callback_verified=false`.

O preflight continua, corretamente, com:

- `webhook_ready=false`.

## Diagnóstico Meta nativo

`admin-whatsapp-direct-v1` está na versão **7**.

A action `meta_diagnostics_readonly` agora:

- usa o token Meta presente no Supabase;
- usa somente GET na Graph API;
- lê `/me/permissions`;
- lê `/{WABA}/subscribed_apps`;
- lê o Phone Number ID e quality rating;
- coleta `override_callback_uri` quando a Meta o retornar;
- compara o override com o callback esperado:
  `https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-meta-direct-v1`;
- preserva a evidência real de Flow health;
- só define callback Meta Direct como verificado se houver evidência exata;
- nunca muda `meta_direct_ready`;
- nunca envia mensagem;
- nunca altera configuração da Meta.

## Preparação do endpoint Meta Direct

`whatsapp-meta-direct-v1` está na versão **3**.

Ele foi preparado para atuar como futuro ingress unificado:

- GET de verificação continua fail-closed;
- App Secret pode vir do environment ou do Vault;
- Verify Token pode vir do environment ou do Vault;
- POST exige assinatura HMAC válida;
- todo callback válido pode gerar evidência em `meta_webhook_events`;
- eventos `flows` também são preservados em `whatsapp_flow_health_events`;
- com `whatsapp_direct_config.enabled=false` ou `release_mode=off`:
  - registra evidência;
  - não cria atendimento automático;
  - não chama `sendMeta`;
  - não envia resposta;
  - retorna `outbound_performed=false`;
  - mantém `external_side_effect=false`.

Isso permite que uma futura troca do callback da Meta para o endpoint Direct não elimine o monitoramento dos Flows.

## Gates preservados

- Meta Direct enabled: false;
- Meta Direct release_mode: off;
- canonical outbound: false;
- direct-ready flag: false;
- external activation authorized: false.

## Próxima prova humana segura

Na Central de Relacionamento:

1. entrar com PIN;
2. abrir **Meta Foundation**;
3. clicar **Verificar Meta agora**.

A ação é somente leitura na Meta. Ela provará as permissões do token realmente guardado no Supabase e registrará a configuração de callback que a Graph API conseguir observar.

Se o callback Direct continuar sem evidência, o blocker `webhook_not_verified` deve permanecer.
