# Biblioteca Rápida do Atendimento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma Biblioteca Rápida compartilhada dentro da Central de Atendimento para cadastrar, otimizar, organizar, selecionar e enviar imagens, vídeos, áudios e documentos pelo WhatsApp, sempre respeitando a janela de 24 horas e os gates Meta existentes.

**Architecture:** A biblioteca usa o bucket privado `attendance-library-v1` e catálogo próprio no Postgres. O navegador compacta imagens e envia arquivos diretamente ao Storage por signed upload URL emitida pelo gateway `admin-whatsapp-ops-v1`; o backend finaliza o item, gera previews assinados e envia itens da biblioteca pelo mesmo pipeline Meta já usado por anexos avulsos. O transporte de mídia será refatorado para uma função comum baseada em bytes para que anexo avulso e Biblioteca compartilhem exatamente os mesmos gates de 24h, idempotência, outbox, claim e persistência canônica.

**Tech Stack:** HTML/CSS/JavaScript nativo; Supabase Postgres + Storage privado + Edge Functions (Deno/TypeScript); WhatsApp Cloud API / Meta; Node 22 para testes de contrato.

**Spec:** `docs/superpowers/specs/2026-10-03-attendance-quick-library-design.md`

## Global Constraints

- Biblioteca única para 0975 e 1018 e todos os usuários autorizados do Vitrine Admin.
- Bucket `attendance-library-v1` sempre privado.
- Máximo de 10 itens por lote.
- Imagens JPEG/PNG com objetivo operacional normalmente abaixo de 1–1,5 MB após compactação.
- Vídeo MP4/3GPP e áudio/documentos apenas nos formatos aceitos pelo pipeline Meta; sem transcodificação pesada na v1.
- Documentos limitados operacionalmente a 25 MB.
- Toda mensagem livre deve obedecer à janela de 24h no frontend e backend.
- Fora da janela, somente templates aprovados podem permanecer disponíveis conforme regras Meta já homologadas.
- Destino nunca vem do navegador; sempre é resolvido server-side por `conversation_id`.
- Preservar `send_enabled`, `human_send_enabled`, canal ativo, transporte homologado, idempotência, rate limit e demais gates existentes.
- Não expor service role, tokens Meta ou paths privilegiados no frontend.
- Upload para Biblioteca nunca envia automaticamente ao cliente.
- Exclusão é soft delete; histórico já enviado não é alterado.
- TDD RED → GREEN por tarefa; commits pequenos; CI atual da Central/Meta deve permanecer verde.

## Review Focus

- Troca de conversa com itens selecionados: limpar seleção antes de qualquer envio ao novo contato. Coberto na Task 7.
- Janela de 24h expira no meio do lote: interromper imediatamente os itens restantes. Coberto na Task 7.
- Signed upload adulterado antes do finalize: validar item reservado, path, MIME e tamanho contra `storage.objects`. Coberto na Task 3.
- Retry após `meta_send_uncertain`: não duplicar silenciosamente mensagem; preservar semântica de idempotência atual. Coberto nas Tasks 2, 4 e 7.
- Item sofre soft delete após seleção: backend deve responder `library_item_inactive` antes do transporte. Coberto nas Tasks 3 e 4.

---

## File Structure

### Banco / Storage
- Create: `supabase/sql/20261003_attendance_library_v1.sql`
- Create: `scripts/test-admin-attendance-library-schema-v1.mjs`

### Backend
- Create: `supabase/functions/_shared/admin-attendance-library-v1.mjs`
- Modify: `supabase/functions/_shared/admin-attendance-media-send-v1.mjs`
- Modify: `supabase/functions/_shared/whatsapp-meta-media-v1.mjs`
- Modify: `supabase/functions/_shared/whatsapp-meta-transport-v1.mjs`
- Modify: `supabase/functions/admin-whatsapp-ops-v1/index.ts`

### Frontend
- Create: `vitrine/admin/atendimento/attendance-library-image.js`
- Create: `vitrine/admin/atendimento/attendance-library.js`
- Modify: `vitrine/admin/atendimento/index.html`
- Modify: `vitrine/admin/atendimento/attendance.css`
- Modify: `vitrine/admin/atendimento/attendance-app.js` somente para um hook/evento mínimo de troca de conversa/estado de janela, se necessário.

### Testes / CI
- Create: `scripts/test-admin-attendance-library-api-v1.mjs`
- Create: `scripts/test-admin-attendance-library-image-v1.mjs`
- Create: `scripts/test-admin-attendance-library-ui-v1.mjs`
- Create: `scripts/test-admin-attendance-library-send-v1.mjs`
- Modify: `scripts/test-attendance-meta-media-v1.mjs`
- Modify: `scripts/test-attendance-meta-media-retry-v1.mjs`
- Modify: `.github/workflows/attendance-papoai-send-ci.yml`

---

### Task 1: Catálogo, auditoria e bucket privado

**Files:**
- Create: `supabase/sql/20261003_attendance_library_v1.sql`
- Create: `scripts/test-admin-attendance-library-schema-v1.mjs`

**Interfaces:**
- Consumes: `admin_users`, `conversations`, `whatsapp_accounts`, `whatsapp_outbox_v1`, `whatsapp_messages_v1`.
- Produces:
  - `attendance_library_items_v1`
  - `attendance_library_audit_v1`
  - bucket privado `attendance-library-v1`
  - `ops2_admin_attendance_library_reserve_v1(text,text,text,text,bigint,text,text[],uuid) -> jsonb`
  - `ops2_admin_attendance_library_finalize_v1(uuid,bigint,integer,integer,numeric,uuid) -> jsonb`
  - `ops2_admin_attendance_library_update_v1(uuid,text,text,text[],integer,uuid) -> jsonb`
  - `ops2_admin_attendance_library_deactivate_v1(uuid,uuid) -> jsonb`
  - `ops2_admin_attendance_library_audit_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,jsonb) -> jsonb`

- [ ] **Step 1: Write failing schema contract test**

`test-admin-attendance-library-schema-v1.mjs` deve exigir:
- bucket `attendance-library-v1` com `public=false` e `file_size_limit=26214400`;
- catálogo com `id,title,media_kind,mime_type,storage_path,thumbnail_path,original_filename,original_size_bytes,stored_size_bytes,width,height,duration_seconds,category,tags,sort_order,is_active,created_by,updated_by,created_at,updated_at,deleted_at,deleted_by`;
- `media_kind` limitado a `image|video|audio|document`;
- auditoria com `admin_user_id,item_id,conversation_id,whatsapp_account_id,action,result,error_code,outbox_id,message_id,provider_message_id,metadata,created_at`;
- todos os RPCs acima revogados de `public,anon,authenticated` e concedidos somente a `service_role`.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-admin-attendance-library-schema-v1.mjs`
Expected: FAIL porque SQL ainda não existe.

- [ ] **Step 3: Implement schema/RPCs**

Regras exatas:
- `reserve` cria UUID, paths `items/<uuid>/asset.<ext>` e `items/<uuid>/thumb.jpg`, mas deixa `is_active=false`;
- `finalize` só ativa após conferir em `storage.objects` que o asset está no bucket/path reservado, MIME bate e tamanho real é `>0` e `<=26214400`;
- `update` só altera `title,category,tags,sort_order`;
- `deactivate` grava `is_active=false,deleted_at,deleted_by`;
- `audit` é append-only.

- [ ] **Step 4: Run GREEN**

Run: `node scripts/test-admin-attendance-library-schema-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Apply to canonical Supabase and verify**

Project: `ssbesxgaijknwsjbsbcz`.
Verify bucket private, tables/RPCs present, grants service-role-only, biblioteca vazia.

- [ ] **Step 6: Commit**

```bash
git add supabase/sql/20261003_attendance_library_v1.sql scripts/test-admin-attendance-library-schema-v1.mjs
git commit -m "feat: add attendance quick library storage schema"
```

---

### Task 2: Transporte Meta único por bytes

**Files:**
- Modify: `supabase/functions/_shared/admin-attendance-media-send-v1.mjs`
- Modify: `supabase/functions/_shared/whatsapp-meta-media-v1.mjs`
- Modify: `supabase/functions/_shared/whatsapp-meta-transport-v1.mjs`
- Modify: `scripts/test-attendance-meta-media-v1.mjs`
- Modify: `scripts/test-attendance-meta-media-retry-v1.mjs`
- Create: `scripts/test-admin-attendance-library-send-v1.mjs`

**Interfaces:**
- Consumes: `ops2_admin_attendance_enqueue_media_v1`, `ops2_admin_attendance_claim_media_outbox_v1`, `ops2_admin_attendance_accept_meta_media_outbound_v1`, `ops2_admin_attendance_requeue_failed_media_v1`.
- Produces:
  - `sendAttendanceMediaBytesViaMeta({db,conversationId,idempotencyKey,bytes,mimeType,filename,caption,accessToken,graphVersion,markClaimFailed,markMetaUncertain}) -> Promise<object>`
  - mantém `sendAttendanceMediaViaMeta({db,form,accessToken,graphVersion,markClaimFailed,markMetaUncertain}) -> Promise<object>` como wrapper compatível.

- [ ] **Step 1: Write failing transport tests**

Exigir export da função por bytes e garantir que:
- não recebe telefone/account/customer;
- usa `conversationId` + outbox/claim para resolver destino;
- suporta `image|audio|video|document`;
- preserva `service_window_closed`, `human_send_not_homologated`, rate limit, idempotência e `meta_send_uncertain`.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-admin-attendance-library-send-v1.mjs
node scripts/test-attendance-meta-media-v1.mjs
node scripts/test-attendance-meta-media-retry-v1.mjs
```
Expected: novo contrato FAIL; antigos continuam como baseline.

- [ ] **Step 3: Extract common byte transport**

Mover enqueue/claim/upload/send/persistência para `sendAttendanceMediaBytesViaMeta`; wrapper FormData apenas valida File, lê bytes e delega.

- [ ] **Step 4: Expand supported outbound MIME mapping**

Mapear somente MIME atuais permitidos pela Meta no momento da implementação para imagem, áudio, vídeo e documentos aprovados; sem transcodificação.

- [ ] **Step 5: Run GREEN**

Mesmos três comandos; Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/admin-attendance-media-send-v1.mjs supabase/functions/_shared/whatsapp-meta-media-v1.mjs supabase/functions/_shared/whatsapp-meta-transport-v1.mjs scripts/test-admin-attendance-library-send-v1.mjs scripts/test-attendance-meta-media-v1.mjs scripts/test-attendance-meta-media-retry-v1.mjs
git commit -m "refactor: share Meta media transport with quick library"
```

---

### Task 3: API da Biblioteca — listagem, signed upload, finalize, preview e CRUD

**Files:**
- Create: `supabase/functions/_shared/admin-attendance-library-v1.mjs`
- Modify: `supabase/functions/admin-whatsapp-ops-v1/index.ts`
- Create: `scripts/test-admin-attendance-library-api-v1.mjs`

**Interfaces:**
- Consumes: RPCs da Task 1; `db.storage.from('attendance-library-v1').createSignedUploadUrl`, `createSignedUrl`, `download`.
- Produces helpers:
  - `listAttendanceLibrary({db,query,kind,category,limit,cursor})`
  - `prepareAttendanceLibraryUpload({db,adminUserId,input})`
  - `finalizeAttendanceLibraryUpload({db,adminUserId,input})`
  - `signAttendanceLibraryPreview({db,itemId})`
  - `updateAttendanceLibraryItem({db,adminUserId,input})`
  - `deactivateAttendanceLibraryItem({db,adminUserId,itemId})`
  - `loadActiveAttendanceLibraryItem({db,itemId})`
- Produces HTTP actions:
  - GET `library_list`
  - GET `library_preview`
  - POST `library_upload_prepare`
  - POST `library_upload_finalize`
  - POST `library_update`
  - POST `library_deactivate`
  - POST `library_send` (implemented fully in Task 4)

**Response contracts:**
- `library_upload_prepare` -> `{ok:true,item_id,storage_path,thumbnail_path,signed_upload:{path,token},thumbnail_signed_upload?:{path,token}}`
- `library_upload_finalize` -> `{ok:true,item}`
- `library_list` -> `{ok:true,items,next_cursor}`
- `library_preview` -> `{ok:true,url,expires_at}`

- [ ] **Step 1: Write failing API contract test**

Exigir actions, autenticação via `adminAuth`, bucket/path fixos e proibição de destination fields em `library_send`.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-admin-attendance-library-api-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement helpers**

`prepare` chama `reserve`, depois `createSignedUploadUrl` somente para o path reservado. `finalize` chama o RPC de finalize e nunca aceita path arbitrário vindo do cliente. `preview` assina por poucos minutos. `deactivate` faz soft delete.

- [ ] **Step 4: Wire actions in gateway**

Adicionar actions ao conjunto permitido e handlers mantendo `adminAuth`, CORS e `Cache-Control:no-store` atuais.

- [ ] **Step 5: Add tampering/soft-delete assertions and run GREEN**

Exigir finalize rejeitando MIME/tamanho divergente, item inativo fora da listagem normal e preview apenas de item ativo.

Run: `node scripts/test-admin-attendance-library-api-v1.mjs`
Expected: PASS.

- [ ] **Step 6: Syntax check and commit**

```bash
node --check supabase/functions/_shared/admin-attendance-library-v1.mjs
git add supabase/functions/_shared/admin-attendance-library-v1.mjs supabase/functions/admin-whatsapp-ops-v1/index.ts scripts/test-admin-attendance-library-api-v1.mjs
git commit -m "feat: add attendance quick library API"
```

---

### Task 4: Envio de um item da Biblioteca

**Files:**
- Modify: `supabase/functions/_shared/admin-attendance-library-v1.mjs`
- Modify: `supabase/functions/admin-whatsapp-ops-v1/index.ts`
- Modify: `scripts/test-admin-attendance-library-send-v1.mjs`

**Interfaces:**
- Consumes: `loadActiveAttendanceLibraryItem`, `sendAttendanceMediaBytesViaMeta`.
- Produces:
  - `sendAttendanceLibraryItem({db,adminUserId,conversationId,itemId,idempotencyKey,caption,accessToken,graphVersion,markClaimFailed,markMetaUncertain}) -> Promise<object>`

- [ ] **Step 1: Add failing send assertions**

Exigir item ativo, download privado, tamanho conferido, `conversationId` como único determinante do destino, auditoria em tentativa/sucesso/falha e propagação de `service_window_closed`/`meta_send_uncertain`.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-admin-attendance-library-send-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement send helper**

Fluxo exato: load active -> Storage download -> size check -> shared Meta byte transport -> audit -> normalized response.

- [ ] **Step 4: Pin soft-delete race**

Teste exige `library_item_inactive` antes de download/transporte se item foi removido após seleção.

- [ ] **Step 5: Run GREEN and commit**

```bash
node scripts/test-admin-attendance-library-send-v1.mjs
node scripts/test-attendance-meta-media-v1.mjs
node scripts/test-attendance-meta-media-retry-v1.mjs
git add supabase/functions/_shared/admin-attendance-library-v1.mjs supabase/functions/admin-whatsapp-ops-v1/index.ts scripts/test-admin-attendance-library-send-v1.mjs
git commit -m "feat: send quick library items through Meta pipeline"
```

---

### Task 5: Compactação e thumbnail de imagens

**Files:**
- Create: `vitrine/admin/atendimento/attendance-library-image.js`
- Create: `scripts/test-admin-attendance-library-image-v1.mjs`

**Interfaces:**
- Produces: `optimizeLibraryImage(file, options?) -> Promise<{file,thumbnail,originalBytes,storedBytes,width,height}>`.

- [ ] **Step 1: Write failing image contract**

Exigir JPEG/PNG, Canvas/createImageBitmap, limite de dimensão em constante única, thumbnail separado, PNG preservado quando necessário, e erro explícito sem fallback silencioso ao original.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-admin-attendance-library-image-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement browser-native optimizer**

Sem dependência externa; redimensionar preservando proporção, JPEG otimizado para foto e thumbnail pequeno.

- [ ] **Step 4: Run GREEN and commit**

```bash
node scripts/test-admin-attendance-library-image-v1.mjs
node --check vitrine/admin/atendimento/attendance-library-image.js
git add vitrine/admin/atendimento/attendance-library-image.js scripts/test-admin-attendance-library-image-v1.mjs
git commit -m "feat: optimize quick library images before upload"
```

---

### Task 6: Drawer responsivo, galeria e gerenciamento

**Files:**
- Create: `vitrine/admin/atendimento/attendance-library.js`
- Modify: `vitrine/admin/atendimento/index.html`
- Modify: `vitrine/admin/atendimento/attendance.css`
- Create: `scripts/test-admin-attendance-library-ui-v1.mjs`

**Interfaces:**
- Consumes: actions da Task 3 e `optimizeLibraryImage` da Task 5.
- Produces: `#libraryBtn`, `#attendanceLibrary`, busca/filtros/cards/upload manager/CRUD/seleção local.

- [ ] **Step 1: Write failing UI contract**

Exigir botão Biblioteca, drawer acessível, busca, filtros Todos/Imagens/Vídeos/Áudios/Arquivos, cards, upload múltiplo, editar/remover, limpar seleção, enviar N itens, máximo 10, mobile quase full-screen e desktop drawer lateral.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-admin-attendance-library-ui-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Add HTML skeleton and module loading**

Adicionar Biblioteca às ferramentas rápidas sem remover composer/anexo atual.

- [ ] **Step 4: Implement state/CRUD/upload**

Estado único: `{open,items,query,kind,category,selected,uploads,sending}`.
Fluxo upload: optimize/validate -> `library_upload_prepare` -> upload com `{path,token}` -> `library_upload_finalize` -> inserir/recarregar item.

- [ ] **Step 5: Add responsive CSS**

Footer sticky, cards tocáveis, drawer lateral desktop e quase tela inteira no mobile.

- [ ] **Step 6: Run GREEN and commit**

```bash
node scripts/test-admin-attendance-library-ui-v1.mjs
node scripts/test-admin-attendance-library-image-v1.mjs
node --check vitrine/admin/atendimento/attendance-library.js
git add vitrine/admin/atendimento/attendance-library.js vitrine/admin/atendimento/index.html vitrine/admin/atendimento/attendance.css scripts/test-admin-attendance-library-ui-v1.mjs
git commit -m "feat: add responsive quick library gallery"
```

---

### Task 7: Seleção múltipla, envio sequencial e janela de 24h

**Files:**
- Modify: `vitrine/admin/atendimento/attendance-library.js`
- Modify: `vitrine/admin/atendimento/attendance-app.js` apenas se necessário para emitir evento mínimo de troca de conversa/estado da janela.
- Modify: `scripts/test-admin-attendance-library-ui-v1.mjs`
- Modify: `scripts/test-admin-attendance-library-send-v1.mjs`

**Interfaces:**
- Consumes: `library_send` e `service_window` do endpoint de conversa.
- Produces: `sendSelectedLibraryItems()`.

- [ ] **Step 1: Add failing batch/UI safety tests**

Exigir `selected.size<=10`, `Enviar N itens`, `Enviando X de N`, resumo final, retry só de falhas, e nenhum `Promise.all` no envio.

- [ ] **Step 2: Add 24h/conversation-race tests**

Exigir:
- seleção limpa ao trocar conversa;
- frontend desabilita envio e mostra `Janela de atendimento encerrada. Mídia livre não pode ser enviada.`;
- antes de cada item, reconsulta/usa estado atual da janela;
- `service_window_closed`, auth inválida, canal não homologado, destino inconsistente ou `meta_send_uncertain` interrompem lote;
- erro individual de arquivo pode seguir para o próximo;
- backend continua autoridade final.

- [ ] **Step 3: Run RED**

```bash
node scripts/test-admin-attendance-library-ui-v1.mjs
node scripts/test-admin-attendance-library-send-v1.mjs
```
Expected: FAIL.

- [ ] **Step 4: Implement sequential queue**

Cada item recebe idempotency key própria e estável durante retry daquela tentativa; usar `await` em loop, atualizar status por item e abortar nos erros de segurança.

- [ ] **Step 5: Integrate conversation/window lifecycle**

Limpar seleção em mudança de conversa; permitir navegar na galeria fora da janela, mas nunca enviar.

- [ ] **Step 6: Run GREEN and commit**

```bash
node scripts/test-admin-attendance-library-ui-v1.mjs
node scripts/test-admin-attendance-library-send-v1.mjs
node --check vitrine/admin/atendimento/attendance-library.js
git add vitrine/admin/atendimento/attendance-library.js vitrine/admin/atendimento/attendance-app.js scripts/test-admin-attendance-library-ui-v1.mjs scripts/test-admin-attendance-library-send-v1.mjs
git commit -m "feat: send quick library batches within service window"
```

---

### Task 8: CI e regressão completa

**Files:**
- Modify: `.github/workflows/attendance-papoai-send-ci.yml`

**Interfaces:**
- Consumes: todos os testes anteriores.
- Produces: gate CI único de Biblioteca + regressão existente.

- [ ] **Step 1: Add library tests and paths to CI**

Adicionar:
```bash
node scripts/test-admin-attendance-library-schema-v1.mjs
node scripts/test-admin-attendance-library-api-v1.mjs
node scripts/test-admin-attendance-library-image-v1.mjs
node scripts/test-admin-attendance-library-ui-v1.mjs
node scripts/test-admin-attendance-library-send-v1.mjs
node --check vitrine/admin/atendimento/attendance-library-image.js
node --check vitrine/admin/atendimento/attendance-library.js
node --check supabase/functions/_shared/admin-attendance-library-v1.mjs
```

- [ ] **Step 2: Run every existing attendance CI command plus new tests**

Expected: PASS sem regressão.

- [ ] **Step 3: Run sanity checks**

```bash
git diff --check
node --check vitrine/admin/atendimento/attendance-app.js
node --check vitrine/admin/atendimento/attendance-send.js
node --check vitrine/admin/atendimento/attendance-media-send.js
node --check vitrine/admin/atendimento/attendance-templates.js
node --check vitrine/admin/atendimento/attendance-human-ai.js
node --check vitrine/admin/atendimento/attendance-ana-preview.js
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/attendance-papoai-send-ci.yml
git commit -m "ci: validate attendance quick library"
```

---

### Task 9: Deploy seguro, PR e validação final

**Files:**
- Nenhum arquivo de produto novo esperado; checkpoint opcional conforme padrão do projeto.

**Interfaces:**
- Consumes: branch totalmente verde.
- Produces: Supabase/Pages publicados sem mensagem não autorizada a cliente real.

- [ ] **Step 1: Sync with current `main`**

Comparar SHA atual, integrar mudanças concorrentes e rerodar CI completa.

- [ ] **Step 2: Deploy SQL to `ssbesxgaijknwsjbsbcz`**

Verificar bucket privado, grants e tabelas/RPCs.

- [ ] **Step 3: Deploy `admin-whatsapp-ops-v1`**

Incluir shared modules; não alterar Meta tokens/runtime gates.

- [ ] **Step 4: Production-safe smoke without sending to real customers**

Testar list -> prepare -> signed upload -> finalize -> preview -> edit -> deactivate. Confirmar item inativo fora da listagem e recusado no send helper sem efetivamente disparar mensagem real.

- [ ] **Step 5: Open PR**

Title: `feat: adicionar Biblioteca Rápida ao Atendimento`

Body: bucket privado/signed upload, image optimization, shared Meta transport, sequential batch, 24h gate, audit/soft delete, tests.

- [ ] **Step 6: Require workflows GREEN**

No mínimo `attendance-papoai-send-ci`, `WhatsApp Meta Central CI` quando acionado e guards de Admin disparados por `vitrine/admin/atendimento/**`.

- [ ] **Step 7: Whole-branch review**

Confirmar: sem bucket público, sem secret no frontend, sem destino do browser, sem bypass 24h, sem blasting paralelo, sem retry duplicado, anexo antigo intacto.

- [ ] **Step 8: Squash merge with expected head SHA**

Após merge, confirmar `main` no merge commit e Pages do mesmo SHA concluído com sucesso.

- [ ] **Step 9: Live verification desktop/mobile**

Drawer abre, upload/preview funciona, galeria acessível fora da janela, envio bloqueado fora da janela, texto/anexo/templates intactos. Não enviar mensagem real como parte da verificação sem autorização separada.
