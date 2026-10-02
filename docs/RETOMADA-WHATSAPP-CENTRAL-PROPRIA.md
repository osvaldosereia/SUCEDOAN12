# RETOMADA — Central WhatsApp Própria via Meta Cloud API

**Última atualização:** 2026-10-02  
**Status:** Tasks 0, 1 e 2 concluídos em código/testes; migration v3 aplicada no Supabase produtivo com gates OFF; adapter Meta ainda NÃO conectado ao gateway.  
**Branch atual:** `feat/whatsapp-meta-central-task0-task1`

## 1. Leia antes de continuar

1. `docs/superpowers/specs/2026-10-02-whatsapp-central-propria-meta-design.md`
2. `docs/superpowers/plans/2026-10-02-whatsapp-central-propria-meta.md`
3. `docs/runbooks/whatsapp-meta-central-runbook.md`
4. `docs/checklists/whatsapp-meta-preflight.md`
5. este arquivo

Não continuar apenas pela memória da conversa.

## 2. Objetivo

Permitir atendimento dos canais 0975/1018 diretamente no Admin Dona Antônia pela Meta Cloud API, com Supabase como verdade canônica, migração gradual, rollback por canal e retirada do PapoAI somente no final.

## 3. Identificadores confirmados — não secretos

### Business

- Business Portfolio: `Super Cestas Cuiabá`
- Business ID: `1055822571753443`

### 0975

- Número: `+5565998150975`
- WABA ID: `1497253794754816`
- Phone Number ID: `945659128620084`
- PapoAI agentbot: `2796`

### 1018

- Número: `+5565984491018`
- WABA ID: `840102181903253`
- Phone Number ID: `1218939807961094`
- PapoAI agentbot: `2501`

### App próprio

- Nome: `cell principal`
- App ID: `1547249776748513`
- Permissões confirmadas: `whatsapp_business_management`, `whatsapp_business_messaging`

**Nunca adicionar access token, App Secret ou verify token a este arquivo, issue, PR ou frontend.**

## 4. Prova Meta direta já realizada

Teste controlado anterior:

```text
1018 (Meta Cloud API própria) -> 0975
Mensagem: TESTE META DIRETO 1018
```

Resultado:

- Meta aceitou e retornou `wamid`: SIM
- chegou no 0975: SIM
- PapoAI receptor 0975 exibiu inbound: SIM
- Admin/Supabase receptor exibiu inbound: SIM
- PapoAI emissor 1018 exibiu outbound próprio: NÃO
- Supabase emissor criou outbound automaticamente: NÃO

Decisão: envio próprio deverá ser persistido pelo nosso backend assim que a Meta devolver `wamid`; não depender de `message.sent` do PapoAI.

## 5. Runtime produtivo — permanece fail-closed

Última verificação após aplicar a migration v3:

| Canal | human_send_enabled | homologated_at | outbound_provider |
| --- | --- | --- | --- |
| 0975 | false | null | papoai |
| 1018 | false | null | papoai |

Teste de segurança em produção executado usando conversa recente do 1018:

```text
ops2_admin_attendance_enqueue_text_v3(...)
=> { ok:false, error:"human_send_not_homologated" }
```

Depois do teste:

```text
rows_created na whatsapp_outbox_v1 para a idempotency key do teste = 0
```

Portanto a migration entrou sem liberar envio nem criar outbox.

## 6. Task 0 — Safeguard/baseline/secrets

**Status:** concluída.

Arquivos:

- `scripts/test-whatsapp-meta-no-secrets-v1.mjs`
- `docs/runbooks/whatsapp-meta-central-runbook.md`
- `docs/checklists/whatsapp-meta-preflight.md`

Validação executada:

1. token sintético inserido em workspace local -> teste FALHOU como esperado;
2. token sintético removido -> teste PASSOU.

Pendência operacional antes de canário real:

- revogar tokens temporários que apareceram em capturas;
- gerar token de usuário de sistema de produção;
- armazenar token/App Secret/verify token somente server-side.

## 7. Task 1 — Outbox provider-neutral v3

**Status:** código concluído e migration aplicada no Supabase produtivo.

Arquivos:

- `scripts/test-attendance-provider-neutral-v3.mjs`
- `supabase/sql/20261002_admin_attendance_provider_neutral_v3.sql`

TDD observado:

- RED: `migration provider-neutral v3 deve existir`;
- GREEN: `OK · outbox v3 é provider-neutral, fail-closed, idempotente e preserva janela/gates.`

Migration aplicada:

- nome Supabase: `admin_attendance_provider_neutral_v3`
- funções presentes:
  - `ops2_admin_attendance_enqueue_text_v3(uuid,text,text)`
  - `ops2_admin_attendance_claim_outbox_v3(uuid)`

Contrato:

- provider resolvido pelo `whatsapp_channel_runtime_v1.outbound_provider`;
- somente `papoai` ou `meta` são dispatcháveis;
- janela de 24h preservada;
- `human_send_enabled=true` e `homologated_at is not null` continuam obrigatórios;
- rate limit de 20/60s preservado;
- destino resolvido server-side pela conversa;
- idempotência usa namespace `attendance-v3:`;
- claim valida provider da outbox contra runtime;
- claim devolve provider, `phone_number_id` e `waba_id` server-side;
- nenhuma URL secreta PapoAI no v3;
- nenhuma criação otimista de `whatsapp_messages_v1`.

Rollback operacional continua sendo gate OFF; v2 permanece intacto.

## 8. Task 2 — Adapter oficial Meta

**Status:** código/testes concluídos; adapter NÃO está conectado ao `admin-whatsapp-ops-v1` e não foi usado para enviar mensagem real nesta Task.

Arquivos:

- `supabase/functions/_shared/whatsapp-meta-transport-v1.mjs`
- `scripts/test-attendance-meta-send-v1.mjs`
- `scripts/test-attendance-meta-phone-id-v1.mjs`
- `scripts/test-attendance-meta-body-timeout-v1.mjs`
- `scripts/fixtures/meta-send-text-success.redacted.json`
- `scripts/fixtures/meta-send-error.redacted.json`

Contrato implementado:

- `sendTextViaMeta(...)` recebe token server-side, Phone Number ID, destino, texto e Graph version;
- endpoint montado como `https://graph.facebook.com/{version}/{phone_number_id}/messages`;
- `messaging_product='whatsapp'`;
- `recipient_type='individual'`;
- texto livre enviado como `type='text'`;
- `preview_url=false`;
- sucesso só existe se a Meta retornar `messages[0].id` (`wamid`);
- retorno normalizado contém `provider='meta'`, `providerMessageId` e HTTP status;
- timeout usa `AbortController` e permanece ativo até terminar leitura do corpo;
- `phone_number_id` aceita somente dígitos puros;
- telefone de destino é normalizado para dígitos;
- token não é logado nem incluído em mensagens de erro;
- nenhum token literal foi versionado.

Erros normalizados:

- `meta_invalid_request` — falha antes da rede;
- `meta_http_error`;
- `meta_network_error` — `uncertain=true`;
- `meta_timeout` — `uncertain=true`;
- `meta_invalid_response` — `uncertain=true` se não houver `wamid` confiável.

Regra de retry:

- 408/429: marcados retryable;
- 5xx: `uncertain=true` e sem retry automático cego;
- network/timeout: `uncertain=true` e sem retry automático cego.

TDD observado:

1. adapter inexistente -> RED;
2. adapter inicial -> testes principais GREEN;
3. novo teste mostrou que `phone_number_id` malformado era normalizado silenciosamente -> RED;
4. correção para dígitos puros -> GREEN;
5. novo teste mostrou timeout encerrando antes da leitura do corpo -> RED;
6. timeout estendido até o JSON terminar -> GREEN.

Última execução local:

```text
OK · adapter Meta monta Graph request, exige wamid e classifica erros/uncertainty sem vazar token.
OK · Phone Number ID aceita somente dígitos puros e falha fechado antes da rede.
OK · timeout cobre fetch e leitura do corpo da resposta Meta.
```

## 9. O que ainda NÃO foi feito

- adapter Meta não está importado pelo gateway;
- `admin-whatsapp-ops-v1` ainda usa contrato antigo para envio;
- botão Enviar continua bloqueado;
- nenhum secret Meta de produção foi configurado pelo código desta Task;
- nenhum webhook Meta próprio foi criado ainda;
- nenhum outbound Meta foi persistido automaticamente no histórico próprio ainda;
- 0975 ainda não tem app próprio inscrito;
- PapoAI não foi removido nem alterado.

## 10. Isolamento do checkout

Nenhum destes componentes foi alterado:

- `shopping-checkout-v2`
- `shopping-chat-checkout-v2`
- `storefront-v2`
- frontend público do checkout
- criação/registro de pedido
- estoque
- Bling

## 11. Legado que não deve ser reativado

- `whatsapp-meta-direct-v1`
- `admin-whatsapp-direct-v1`
- `whatsapp-ingest`
- `whatsapp-ingest-make-v1`
- `conversation-worker-v3`
- `dona-antonia-agent-core-v1`

## 12. Próxima ação exata

Executar **Task 3 — webhook Meta próprio**:

1. escrever testes RED para challenge GET e assinatura POST;
2. criar `supabase/functions/whatsapp-meta-webhook-v1/index.ts`;
3. reusar `canonicalMessagesFromMeta(...)` e `statusEventsFromMeta(...)` de `_shared/whatsapp-core-v1.mjs`;
4. resolver canal por `phone_number_id`;
5. persistir inbound/status idempotentemente;
6. não executar ANA dentro da request do webhook;
7. deploy do endpoint sem mexer no 0975 ainda;
8. gates de envio continuam OFF.

Depois da Task 3 vem Task 4 — outbound canônico/status/dedupe; só depois Task 5 conecta o gateway/botão ao provider adapter.

## 13. Rollback resumido

Enquanto PapoAI estiver em sombra:

```text
human_send_enabled=false
-> parar novos claims
-> preservar outbox/mensagens/logs
-> fallback Copiar resposta + Abrir PapoAI
-> nunca retry cego de envio uncertain
```

Rollback da Central nunca deve exigir rollback do checkout.
