# RETOMADA — Central WhatsApp Própria via Meta Cloud API

**Última atualização:** 2026-10-02  
**Branch:** `feat/whatsapp-meta-central-task0-task1`  
**Issue mestre:** #630  
**PR:** #632

## Estado executivo

- Task 0 — safeguard/baseline/secrets: **concluída**.
- Task 1 — outbox provider-neutral v3: **concluída e aplicada em produção com gates OFF**.
- Task 2 — adapter de envio Meta: **concluída em código/testes; não conectado ao gateway**.
- Task 3 — webhook Meta próprio: **código/testes concluídos; deploy bloqueado por quota de Edge Functions do Supabase**.
- Task 4 — canonical outbound/status/dedupe: **em validação no branch; migration ainda NÃO aplicada**.
- Task 5 — gateway/botão Admin: **não iniciada**.

## Invariantes atuais

```text
0975: human_send_enabled=false, homologated_at=null, outbound_provider=papoai
1018: human_send_enabled=false, homologated_at=null, outbound_provider=papoai
```

- Botão Enviar continua bloqueado.
- PapoAI permanece ativo/inalterado.
- Nenhuma subscription/callback Meta foi alterada nesta implementação.
- Nenhum token/App Secret/verify token foi versionado.
- Checkout, estoque, Bling e criação de pedido continuam fora desta migração.

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

## Task 1 — produção

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

Garantias testadas:
- Graph `/{phone_number_id}/messages`;
- `wamid` obrigatório;
- `phone_number_id` somente dígitos;
- timeout cobre fetch + body;
- network/timeout/5xx ficam `uncertain` para impedir retry cego;
- token não é logado nem embutido.

## Task 3 — webhook Meta próprio

Arquivos:
- `supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs`
- `supabase/functions/whatsapp-meta-webhook-v1/index.ts`
- `scripts/test-whatsapp-meta-webhook-v1.mjs`
- fixtures `meta-webhook-*`

Contrato:
- challenge GET;
- HMAC `X-Hub-Signature-256` sobre bytes exatos;
- App Secret e verify token somente por env;
- limite de payload 2 MiB;
- canal resolvido exclusivamente por `phone_number_id`;
- `phone_number_id` malformado/desconhecido falha fechado;
- inbound reutiliza `whatsapp_ingest_event_v1`;
- status bruto é capturado via `whatsapp_ingest_event_v1` antes da tentativa de `whatsapp_record_status_v1`;
- status que chega antes do outbound fica durável para replay posterior;
- nenhuma IA é executada dentro da request do webhook;
- fixtures cobrem inbound + sent + delivered + read + failed;
- CI inclui teste Node e syntax check do `index.ts`.

### Bloqueio de deploy

Tentativa de deploy de `whatsapp-meta-webhook-v1` no projeto `ssbesxgaijknwsjbsbcz` retornou:

```text
Max number of functions reached for project, please upgrade Plan or disable spend cap
```

Decisão: **não apagar Edge Functions automaticamente**. Resolver quota em etapa controlada, preferencialmente removendo funções realmente aposentadas após revisão/autorização, ou outra solução de capacidade. Até lá, nenhum callback Meta aponta para esta função.

## Task 4 — outbound canônico

Arquivos no branch:
- `supabase/sql/20261002_whatsapp_meta_canonical_outbound_v1.sql`
- `scripts/test-attendance-meta-dedupe-v1.mjs`

Função planejada:
- `ops2_admin_attendance_accept_meta_outbound_v1(uuid,text,timestamptz)`

Comportamento:
1. recebe outbox `claimed` + `wamid` aceito pela Meta;
2. grava imediatamente `whatsapp_messages_v1` como `provider='meta'`, `direction='outbound'`, `status_current='accepted'`, `sender_kind='human'`;
3. idempotência pela unique `(whatsapp_account_id, provider, provider_message_id)`;
4. liga `whatsapp_outbox_v1.message_id` e `provider_message_id`;
5. outbox vai a `sent` porque o enum atual não possui `accepted`; o estado fino fica em `whatsapp_messages_v1`/status events;
6. registra evento `accepted` via `whatsapp_record_status_v1`;
7. procura status Meta capturado anteriormente em `whatsapp_webhook_events_v1` e reaplica em ordem;
8. nunca apaga evidências.

### Estado de validação

Primeira execução do CI da Task 4 falhou por uma regex de teste que exigia `status_current` e `accepted` na mesma linha. O SQL continha o contrato correto. O teste foi corrigido para ser multiline-safe. **A migration Task 4 ainda não foi aplicada.**

## Segurança pendente antes de canário real

- revogar tokens que apareceram em capturas;
- gerar credencial de produção nova;
- armazenar access token, App Secret e verify token somente server-side;
- resolver quota de Edge Functions;
- configurar/validar webhook próprio;
- manter gates OFF até Task 6.

## Não reativar legado

- `whatsapp-meta-direct-v1`
- `admin-whatsapp-direct-v1`
- `whatsapp-ingest`
- `whatsapp-ingest-make-v1`
- `conversation-worker-v3`
- `dona-antonia-agent-core-v1`

## Próxima ação exata

1. aguardar/verificar CI do ajuste multiline da Task 4;
2. se GREEN, revisar/aplicar `20261002_whatsapp_meta_canonical_outbound_v1.sql`;
3. executar teste transacional no banco com ROLLBACK — sem chamada Meta e sem mensagem real;
4. resolver quota antes de ativar/deploy efetivo do webhook;
5. somente depois iniciar Task 5 (gateway/botão), ainda com gates OFF.

## Rollback operacional

```text
human_send_enabled=false
-> nenhum send humano novo
-> preservar outbox/mensagens/webhook events
-> fallback Copiar resposta + Abrir PapoAI
-> nunca retry cego de estado uncertain
```
