# RETOMADA — Central WhatsApp Própria via Meta Cloud API

**Última atualização:** 2026-10-02  
**Branch:** `feat/whatsapp-meta-central-task0-task1`  
**Issue mestre:** #630  
**PR:** #632

## Estado executivo

- Task 0 — safeguard/baseline/secrets: **concluída**.
- Task 1 — outbox provider-neutral v3: **concluída e aplicada em produção com gates OFF**.
- Task 2 — adapter de envio Meta: **concluída em código/testes e incluída no gateway v18**.
- Task 3 — webhook Meta próprio: **código/testes concluídos; deploy bloqueado somente pela quota máxima de Edge Functions**.
- Task 4 — canonical outbound/status/dedupe: **concluída, aplicada em produção e validada com dry-run transacional + rollback**.
- Task 5 — gateway/botão Admin: **backend gateway v18 ACTIVE e fail-closed; UI provider-aware está no branch e ainda não foi promovida ao main**.
- Task 6 — canário 1018: **não iniciado**.

## Invariantes atuais

```text
0975: send_enabled=true, human_send_enabled=false, homologated_at=null, inbound_provider=papoai, outbound_provider=papoai
1018: send_enabled=true, human_send_enabled=false, homologated_at=null, inbound_provider=papoai, outbound_provider=papoai
```

Verificado após Tasks 3–5:
- `human_attendance` outbox: **0 linhas**;
- botão Enviar continua bloqueado pelos gates;
- PapoAI continua provider runtime dos dois canais;
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

Contrato validado:
- challenge GET;
- HMAC `X-Hub-Signature-256` sobre bytes exatos;
- App Secret e verify token somente por env;
- limite de payload 2 MiB;
- canal resolvido exclusivamente por `phone_number_id`;
- `phone_number_id` malformado/desconhecido falha fechado;
- inbound reutiliza `whatsapp_ingest_event_v1`;
- status bruto é capturado antes da reconciliação;
- status antecipado fica pendente e Task 4 reaplica depois que o outbound existe;
- nenhuma IA roda sincronicamente no webhook;
- fixtures cobrem inbound + sent + delivered + read + failed.

### Bloqueio de deploy

Tentativa real de criar `whatsapp-meta-webhook-v1` no Supabase retornou:

```text
Max number of functions reached for project, please upgrade Plan or disable spend cap
```

Não houve deploy parcial e nenhum callback Meta foi alterado.

### Slot de Edge Function — candidato seguro identificado

`whatsapp-ingest-make-v1`:
- versão 12;
- código atual é somente stub HTTP 410 `retired_outside_site_vitrine_admin`;
- pertence ao legado Make, que o projeto não usa mais;
- consulta dos logs das últimas 24h em 2026-10-02 encontrou **zero eventos** relacionados a `whatsapp-ingest-make-v1`/`whatsapp-ingest`.

Outros stubs 410 confirmados, mas não remover sem necessidade:
- `whatsapp-ingest`;
- `admin-whatsapp-direct-v1`;
- `whatsapp-meta-direct-v1`;
- `conversation-worker-v3`;
- `dona-antonia-agent-core-v1`.

**Não remover automaticamente:** exclusão de Edge Function é destrutiva e o conector atual não expõe essa operação. Para abrir um slot, a primeira escolha é remover manualmente somente `whatsapp-ingest-make-v1` após autorização explícita.

## Task 4 — outbound canônico/status/dedupe

Migration aplicada: `whatsapp_meta_canonical_outbound_v1`.

Função de aceite:
- `ops2_admin_attendance_accept_meta_outbound_v1(uuid,text,timestamptz)`

Também foi endurecido:
- `whatsapp_ingest_event_v1(...)`.

Índice novo:
- `whatsapp_messages_wamid_account_uidx` — UNIQUE por `(whatsapp_account_id, provider_message_id)` somente quando `provider_message_id LIKE 'wamid.%'`.

Comportamento:
1. recebe outbox Meta `claimed` + `wamid`;
2. grava imediatamente outbound canônico `provider='meta'`, `status_current='accepted'`, `sender_kind='human'`;
3. um mesmo `wamid` só pode existir uma vez por conta, mesmo que Meta e PapoAI o enxerguem;
4. se PapoAI ecoar primeiro, o aceite Meta promove a mesma linha canônica para `provider='meta'` em vez de duplicar;
5. corrida Meta/PapoAI é tratada via índice + `unique_violation`;
6. liga `outbox.message_id` + `provider_message_id`;
7. registra `accepted` em status events;
8. reaplica status Meta que chegaram antes do outbound existir;
9. não apaga histórico/evidência.

### TDD / dry-run real

RED observado: o teste novo falhou especificamente porque a migration antiga não tinha unicidade cross-provider por `wamid`.

Depois da implementação, foi executado no banco um `BEGIN ... ROLLBACK` com funções/índice temporariamente ativos:
- evento PapoAI com `wamid` sintético;
- evento Meta com o mesmo `wamid`;
- resultado: **1 mensagem canônica**, provider `meta`;
- outbox Meta sintética `claimed` aceita com `wamid` sintético;
- resultado: **1 outbound**, `sender_kind='human'`, `status_current='accepted'`;
- rollback executado;
- resultado final do dry-run: `task4_transactional_dry_run_ok`.

A migration foi então aplicada em produção e verificada: índice e funções existem, com **0 human_attendance rows** criadas pela implantação.

## Guard de estado Meta incerto

O gateway/contrato mantém estado incerto sem retry cego:
- network/timeout/5xx podem resultar em `meta_send_uncertain:*`;
- a outbox fica preservada para reconciliação;
- UI orienta não reenviar até conferência.

## Task 5 — gateway provider-neutral

`admin-whatsapp-ops-v1` está **version 18, ACTIVE**, com autenticação Admin própria preservada.

O gateway v18:
- usa `enqueue_text_v3` + `claim_outbox_v3`;
- escolhe transporte pelo provider da outbox;
- mantém fallback PapoAI;
- chama adapter Meta somente quando provider=`meta`;
- exige server-side `META_WHATSAPP_ACCESS_TOKEN` + `META_WHATSAPP_GRAPH_VERSION` + Phone Number ID válido;
- sucesso Meta exige `wamid` e chama `ops2_admin_attendance_accept_meta_outbound_v1`;
- resultado incerto não é reenviado cegamente;
- browser nunca recebe token Meta.

### UI no branch

`vitrine/admin/atendimento/attendance-send.js` está provider-aware:
- Meta/PapoAI exibidos conforme capability;
- draft só limpa após sucesso;
- mensagens para `meta_transport_not_configured` e `meta_send_uncertain`;
- browser não chama Graph diretamente;
- Enter envia / Shift+Enter quebra linha;
- botão só habilita quando capability estiver realmente habilitada.

A UI ainda não foi promovida ao main/produção.

## CI/TDD

Workflow do branch: `.github/workflows/whatsapp-meta-central-ci.yml`.

Ele foi corrigido para não referenciar Tasks futuras inexistentes. O workflow novo ainda não disparou automaticamente porque não existe no branch-base atual do PR; portanto, **não usar CI novo como evidência de conclusão desta última alteração**.

Evidência fresca disponível:
- testes comportamentais locais do adapter Meta: GREEN;
- challenge/HMAC/Phone Number ID do webhook: GREEN local;
- sintaxe do webhook: GREEN local;
- Task 4: dry-run transacional real no Postgres + rollback: GREEN;
- gates/outbox verificados diretamente no Supabase.

## Segurança pendente antes do canário real

- revogar tokens que apareceram em capturas;
- gerar credencial de produção nova;
- armazenar access token, App Secret e verify token somente server-side;
- liberar 1 slot e implantar o webhook próprio;
- configurar/validar callback/subscription Meta no 1018;
- manter gates OFF até canário controlado.

## Próxima ação exata

1. liberar **1 slot** de Edge Function, preferencialmente removendo o stub aposentado `whatsapp-ingest-make-v1`;
2. deployar `whatsapp-meta-webhook-v1` com `verify_jwt=false` e autenticação HMAC própria;
3. configurar secrets server-side, sem colar valores em chat/Git;
4. validar challenge do webhook;
5. configurar callback/subscription somente no 1018, mantendo PapoAI em sombra;
6. observar inbound/status e dedupe;
7. somente então iniciar Task 6 — canário 1018.

## Rollback operacional

```text
human_send_enabled=false
-> nenhum send humano novo
-> preservar outbox/mensagens/webhook events
-> fallback Copiar resposta + Abrir PapoAI
-> nunca retry cego de estado uncertain
```
