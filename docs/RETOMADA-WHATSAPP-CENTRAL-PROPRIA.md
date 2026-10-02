# RETOMADA — Central WhatsApp Própria via Meta Cloud API

**Última atualização:** 2026-10-02  
**Branch:** `feat/whatsapp-meta-central-task0-task1`  
**Issue mestre:** #630  
**PR:** #632

## Estado executivo

- Task 0 — safeguard/baseline/secrets: **concluída**.
- Task 1 — outbox provider-neutral v3: **concluída e aplicada em produção com gates OFF**.
- Task 2 — adapter de envio Meta: **concluída em código/testes e incluída no gateway v18**.
- Task 3 — webhook Meta próprio: **implantado, secrets configurados, challenge validado HTTP 200 e HMAC funcionando; falta assinar/validar `messages` no 1018**.
- Task 4 — canonical outbound/status/dedupe: **concluída e aplicada em produção**.
- Task 5 — gateway/botão Admin: **backend `admin-whatsapp-ops-v1` v18 ACTIVE e fail-closed; UI provider-aware permanece no branch**.
- Task 6 — canário 1018: **não iniciado**.

## Mudança operacional importante — plano Supabase

Em 2026-10-02 o projeto foi atualizado para plano pago. A limitação `Max number of functions reached` deixou de bloquear a criação de novas Edge Functions.

Não foi necessário apagar nenhuma função antiga. `whatsapp-ingest-make-v1` e demais stubs 410 permanecem intactos por enquanto.

## Invariantes atuais

```text
0975: send_enabled=true, human_send_enabled=false, homologated_at=null, inbound_provider=papoai, outbound_provider=papoai
1018: send_enabled=true, human_send_enabled=false, homologated_at=null, inbound_provider=papoai, outbound_provider=papoai
```

Verificado nesta fase:
- `human_attendance` outbox: **0 linhas** antes da ativação de canário;
- botão Enviar continua bloqueado pelos gates;
- PapoAI continua provider runtime dos dois canais;
- nenhuma mensagem real foi enviada pela nova implementação nesta fase;
- checkout, estoque, Bling e criação de pedido não foram tocados.

## Ativos Meta não secretos

### 0975
- WABA ID: `1497253794754816`
- Phone Number ID: `945659128620084`

### 1018
- WABA ID: `840102181903253`
- Phone Number ID: `1218939807961094`

### App próprio
- `cell principal`
- App ID: `1547249776748513`

## Task 1 — outbox provider-neutral

Migration aplicada: `admin_attendance_provider_neutral_v3`.

Funções:
- `ops2_admin_attendance_enqueue_text_v3(uuid,text,text)`
- `ops2_admin_attendance_claim_outbox_v3(uuid)`

Smoke test com gates OFF:

```text
=> { ok:false, error:"human_send_not_homologated" }
rows_created = 0
```

## Task 2 — adapter Meta

Arquivo:
- `supabase/functions/_shared/whatsapp-meta-transport-v1.mjs`

Garantias:
- Graph `/{phone_number_id}/messages`;
- `wamid` obrigatório;
- `phone_number_id` somente dígitos;
- timeout cobre fetch + body;
- network/timeout/5xx ficam `uncertain` para impedir retry cego;
- token não é logado nem embutido.

## Task 3 — webhook Meta próprio

Edge Function implantada e validada:

```text
slug: whatsapp-meta-webhook-v1
status: ACTIVE
version: 6
verify_jwt: false
```

`verify_jwt=false` é intencional porque a Meta não envia JWT Supabase. A autenticação do POST é feita por HMAC `X-Hub-Signature-256` usando o App Secret da Meta; o GET de verificação usa verify token próprio.

Arquivos canônicos no GitHub:
- `supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs`
- `supabase/functions/whatsapp-meta-webhook-v1/index.ts`
- `supabase/functions/_shared/whatsapp-core-v1.mjs`
- `scripts/test-whatsapp-meta-webhook-v1.mjs`
- fixtures `meta-webhook-*`

Contrato:
- challenge GET;
- HMAC sobre bytes exatos;
- App Secret e verify token somente por env;
- limite de payload 2 MiB;
- canal resolvido exclusivamente por `phone_number_id`;
- `phone_number_id` conhecido é associado à conta canônica;
- inbound reutiliza `whatsapp_ingest_event_v1`;
- status bruto é capturado antes da reconciliação;
- status antecipado fica pendente e Task 4 reaplica quando outbound existe;
- nenhuma IA roda sincronicamente no webhook;
- fixtures cobrem inbound + sent + delivered + read + failed.

### Secrets e challenge

Configurados server-side no Supabase, sem valores no GitHub/chat:
- `META_WHATSAPP_APP_SECRET`
- `META_WHATSAPP_VERIFY_TOKEN`

Em 2026-10-02 a Meta realizou o challenge GET contra:

`https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-meta-webhook-v1`

Resultado confirmado nos logs:
- primeira tentativa com token divergente: HTTP 403;
- token corrigido no Supabase/Meta;
- tentativa seguinte: **HTTP 200**;
- em seguida a Meta começou a fazer POSTs assinados que passaram a validação HMAC e responderam majoritariamente HTTP 200.

### Hardening após validação

Um payload de teste autenticado da Meta usou um `phone_number_id` não mapeado e recebeu 422; a Meta repetiu esse evento depois, confirmando risco de retry desnecessário.

TDD aplicado:
1. RED: teste novo exigindo acknowledge 200 para evento assinado de conta não mapeada falhou contra o código 422;
2. GREEN: webhook alterado para retornar `{ok:true, ignored:true, reason:'meta_account_unresolved'}` com HTTP 200 para conta autenticada não mapeada;
3. nenhum evento é persistido para conta desconhecida;
4. versão endurecida implantada como **v6**.

Eventos sem `phone_number_id` válido mas contendo `messages/statuses` continuam tratados de forma estrita.

## Task 4 — outbound canônico/status/dedupe

Migration aplicada: `whatsapp_meta_canonical_outbound_v1`.

Função:
- `ops2_admin_attendance_accept_meta_outbound_v1(uuid,text,timestamptz)`

Índice:
- `whatsapp_messages_wamid_account_uidx` — UNIQUE por `(whatsapp_account_id, provider_message_id)` quando `provider_message_id LIKE 'wamid.%'`.

Comportamento:
1. recebe outbox Meta `claimed` + `wamid`;
2. grava outbound canônico `provider='meta'`, `status_current='accepted'`, `sender_kind='human'`;
3. o mesmo `wamid` não duplica entre Meta e PapoAI;
4. se PapoAI ecoar primeiro, o aceite Meta promove a mesma linha para provider Meta;
5. liga outbox à mensagem canônica;
6. registra/reconcilia status;
7. não apaga evidências.

Dry-run transacional real no Postgres passou com `ROLLBACK` e sem persistir dados de teste.

## Task 5 — gateway provider-neutral

`admin-whatsapp-ops-v1` está **version 18, ACTIVE**.

O gateway:
- usa outbox v3;
- escolhe provider server-side;
- mantém fallback PapoAI;
- chama adapter Meta somente quando runtime=`meta`;
- exige credenciais/configuração Meta server-side;
- sucesso Meta exige `wamid`;
- estado incerto não sofre retry cego;
- browser nunca recebe token Meta.

UI no branch:
- provider-aware;
- draft só limpa após sucesso;
- erros `meta_transport_not_configured` / `meta_send_uncertain` tratados;
- browser não chama Graph diretamente;
- botão só habilita com capability válida.

## Segurança pendente antes do canário

1. revogar tokens Meta de envio que apareceram em screenshots;
2. gerar credencial de produção nova para outbound;
3. configurar `META_WHATSAPP_ACCESS_TOKEN` e `META_WHATSAPP_GRAPH_VERSION` somente quando formos habilitar outbound;
4. assinar o campo `messages` do webhook no app Meta;
5. confirmar o app próprio inscrito na WABA 1018 mantendo PapoAI em sombra;
6. validar inbound/status/dedupe reais no 1018;
7. manter gates de envio humano OFF até homologação completa.

## Próxima ação exata

1. no App Dashboard Meta `cell principal`, em Webhooks/WhatsApp, assinar o campo **`messages`**;
2. manter os demais campos sem alteração nesta fase;
3. confirmar que `cell principal` continua inscrito na WABA `840102181903253` (1018);
4. fazer um inbound controlado 0975 -> 1018 para validar Meta + PapoAI em sombra sem duplicar no Admin;
5. validar status/dedupe no Supabase;
6. somente então preparar Task 6 — canário outbound 1018.

## Rollback operacional

```text
human_send_enabled=false
-> nenhum send humano novo
-> preservar outbox/mensagens/webhook events
-> fallback Copiar resposta + Abrir PapoAI
-> nunca retry cego de estado uncertain
```
