# RETOMADA — Central WhatsApp Própria via Meta Cloud API

**Última atualização:** 2026-10-02  
**Branch:** `feat/whatsapp-meta-central-task0-task1`  
**Issue mestre:** #630  
**PR:** #632

## Estado executivo

- Task 0 — safeguard/baseline/secrets: **concluída**.
- Task 1 — outbox provider-neutral v3: **concluída e aplicada em produção com gates OFF**.
- Task 2 — adapter de envio Meta: **concluída em código/testes e incluída no gateway v18**.
- Task 3 — webhook Meta próprio: **código/testes concluídos; deploy bloqueado por quota de Edge Functions do Supabase**.
- Task 4 — canonical outbound/status/dedupe: **concluída, aplicada e validada transacionalmente com rollback**.
- Task 5 — gateway/botão Admin: **backend gateway v18 implantado fail-closed; UI provider-aware está no branch e ainda não foi promovida para o site público/admin em produção**.
- Task 6 — canário 1018: **não iniciado**.

## Invariantes confirmados após deploy v18

```text
0975: send_enabled=true, human_send_enabled=false, homologated_at=null, inbound_provider=papoai, outbound_provider=papoai
1018: send_enabled=true, human_send_enabled=false, homologated_at=null, inbound_provider=papoai, outbound_provider=papoai
```

Verificação após deploy:
- `human_attendance` outbox: **0 linhas**;
- `provider='meta' AND direction='outbound'`: **0 mensagens**;
- botão Enviar continua bloqueado pelos gates atuais;
- PapoAI continua sendo o provider runtime dos dois canais;
- nenhuma mensagem real foi enviada pela nova implementação;
- nenhuma subscription/callback Meta foi alterada;
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
- status bruto é capturado duravelmente antes da reconciliação;
- status antecipado pode ser reaplicado após o outbound canônico existir;
- nenhuma IA roda sincronicamente no webhook;
- fixtures cobrem inbound + sent + delivered + read + failed.

### Bloqueio de deploy da Task 3

Tentativa de criar `whatsapp-meta-webhook-v1` retornou:

```text
Max number of functions reached for project, please upgrade Plan or disable spend cap
```

Nenhum callback Meta foi apontado para código incompleto. Não apagar Edge Function sem revisão/autorização; antes, inventariar candidatas aposentadas e confirmar ausência de tráfego/consumidores.

## Task 4 — outbound canônico

Migration aplicada: `whatsapp_meta_canonical_outbound_v1`.

Função:
- `ops2_admin_attendance_accept_meta_outbound_v1(uuid,text,timestamptz)`

Comportamento:
1. recebe outbox Meta `claimed` + `wamid`;
2. grava imediatamente `whatsapp_messages_v1` como outbound/meta/accepted/human;
3. dedupe pela unique `(whatsapp_account_id,provider,provider_message_id)`;
4. liga `outbox.message_id` + `provider_message_id`;
5. registra `accepted` em status events;
6. reaplica status Meta capturado antes do outbound existir;
7. não apaga evidências.

### Teste transacional real no banco

Dentro de subtransação:
- criou outbox Meta falsa claimed;
- criou status `delivered` antecipado para wamid falso;
- chamou acceptance;
- confirmou `accepted -> delivered`;
- confirmou `sender_kind='human'` e texto canônico;
- confirmou outbox ligada à mensagem;
- confirmou exatamente uma mensagem para o mesmo wamid;
- repetição do acceptance retornou idempotente;
- forçou rollback;
- verificou zero dados de teste persistidos.

Nenhuma API externa foi chamada.

## Guard de estado Meta incerto

Migration aplicada: `admin_attendance_meta_uncertain_guard_v1`.

O enqueue v3 agora:
- serializa por conversa com advisory lock;
- bloqueia novo envio se existir outbox Meta `claimed` com `last_error='meta_send_uncertain:*'`;
- retorna `meta_send_uncertain` sem criar outra outbox.

Teste transacional com rollback confirmou o bloqueio e restaurou o runtime original dos canais.

## Task 5 — gateway provider-neutral

Edge Function existente `admin-whatsapp-ops-v1` foi atualizada para **version 18**, `ACTIVE`, `verify_jwt=false` com autenticação Admin própria preservada.

O gateway v18:
- usa `enqueue_text_v3` + `claim_outbox_v3`;
- escolhe transport pelo provider da outbox;
- mantém fallback PapoAI via URL do Vault;
- chama adapter Meta somente quando provider=`meta`;
- exige server-side `META_WHATSAPP_ACCESS_TOKEN` + `META_WHATSAPP_GRAPH_VERSION` + Phone Number ID válido;
- sucesso Meta exige `wamid` e chama `ops2_admin_attendance_accept_meta_outbound_v1`;
- resultado Meta incerto mantém outbox `claimed` e marca `meta_send_uncertain:*`;
- erro determinístico pode marcar failed;
- browser nunca recebe token Meta;
- `meta_send_uncertain` é conflito operacional e não deve ser reenviado cegamente.

### UI no branch

`vitrine/admin/atendimento/attendance-send.js` está provider-aware:
- Meta/PapoAI exibidos conforme capability;
- draft só limpa após sucesso;
- mensagens claras para `meta_transport_not_configured` e `meta_send_uncertain`;
- browser não chama Graph diretamente.

A UI ainda não foi promovida para produção porque este branch/PR ainda não foi integrado ao `main`.

## CI/TDD

Antes do deploy do gateway, os dois pipelines ficaram verdes juntos:
- `WhatsApp Meta Central CI`;
- `attendance-papoai-send-ci`.

Depois, foi feito apenas um ajuste semântico no gateway para mapear `meta_send_uncertain` como HTTP 409 e o mesmo código foi sincronizado no GitHub após o deploy. A Edge Function v18 está ACTIVE com esse conteúdo.

## Segurança pendente antes do canário real

- revogar tokens que apareceram em capturas;
- gerar credencial de produção nova;
- armazenar access token, App Secret e verify token somente server-side;
- resolver quota e implantar webhook próprio;
- configurar/validar callback/subscription Meta no 1018;
- manter gates OFF até canário controlado.

## Não reativar legado

- `whatsapp-meta-direct-v1`
- `admin-whatsapp-direct-v1`
- `whatsapp-ingest`
- `whatsapp-ingest-make-v1`
- `conversation-worker-v3`
- `dona-antonia-agent-core-v1`

## Próxima ação exata

1. inventariar Edge Functions aposentadas e uso recente para liberar uma vaga com segurança;
2. resolver a quota sem apagar função ativa útil;
3. implantar `whatsapp-meta-webhook-v1`;
4. configurar secrets server-side e challenge do webhook;
5. validar webhook no 1018 mantendo PapoAI em sombra;
6. somente então preparar Task 6 — canário 1018.

## Rollback operacional

```text
human_send_enabled=false
-> nenhum send humano novo
-> preservar outbox/mensagens/webhook events
-> fallback Copiar resposta + Abrir PapoAI
-> nunca retry cego de estado uncertain
```
