# Biblioteca Rápida do Atendimento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma Biblioteca Rápida compartilhada dentro da Central de Atendimento para cadastrar, otimizar, organizar, selecionar e enviar imagens, vídeos, áudios e documentos pelo WhatsApp, sempre respeitando a janela de 24 horas e os gates Meta existentes.

**Architecture:** A biblioteca usa um bucket privado dedicado `attendance-library-v1` e catálogo próprio no Postgres. O navegador compacta imagens e faz upload direto ao Storage por signed upload URL autorizada pelo gateway `admin-whatsapp-ops-v1`; o backend finaliza o item, gera previews assinados e envia arquivos da biblioteca pelo mesmo pipeline Meta já usado por anexos avulsos. O transporte de mídia será refatorado para uma função comum baseada em bytes, para que anexo avulso e Biblioteca compartilhem exatamente os mesmos gates de 24h, idempotência, outbox, claim e persistência canônica.

**Tech Stack:** HTML/CSS/JavaScript nativo no Vitrine Admin; Supabase Postgres + Storage privado + Edge Functions (Deno/TypeScript); WhatsApp Cloud API / Meta; Node 22 para testes de contrato.

**Spec:** `docs/superpowers/specs/2026-10-03-attendance-quick-library-design.md`

## Global Constraints

- Biblioteca única e compartilhada pelos canais 0975 e 1018 e por todos os usuários autorizados do Vitrine Admin.
- Bucket privado dedicado: `attendance-library-v1`; nunca tornar público.
- Máximo de 10 itens por lote.
- Imagens: JPEG/PNG; objetivo operacional normalmente abaixo de 1–1,5 MB após compactação; limite de envio Meta validado novamente antes da implementação.
- Vídeo: MP4/3GPP; validar codec/formato compatível; sem transcodificação pesada na v1.
- Áudio: AAC/AMR/MPEG-MP3/MP4-M4A/OGG-Opus; sem transcodificação na v1.
- Documentos: PDF/TXT/DOC/DOCX/XLS/XLSX/PPT/PPTX; limite operacional da Biblioteca de 25 MB.
- Toda mensagem livre deve respeitar a janela de 24 horas; frontend e backend devem bloquear envio fora da janela.
- Fora da janela, somente templates aprovados podem permanecer disponíveis conforme as regras Meta já homologadas.
- Destino nunca vem do navegador; é sempre resolvido server-side a partir de `conversation_id`.
- Preservar `send_enabled`, `human_send_enabled`, canal ativo, transporte homologado, idempotência, rate limit e demais gates existentes.
- Não expor service role, tokens Meta ou caminhos privilegiados no frontend.
- Upload para a Biblioteca nunca envia automaticamente ao cliente.
- Exclusão é soft delete; mensagens já enviadas e histórico não são alterados.
- Commits pequenos; TDD RED → GREEN por tarefa; CI atual da Central/Meta deve permanecer verde.

## Review Focus

- Arquivo selecionado em uma conversa e envio tentado após trocar de conversa: seleção deve ser invalidada ou explicitamente vinculada à conversa original, nunca enviada ao contato errado. Coberto na Task 7.
- Janela de 24h expira entre o primeiro e o segundo item do lote: o segundo item e os seguintes não podem sair. Coberto na Task 7.
- Signed upload criado e arquivo alterado/trocado antes do finalize: backend deve conferir path, MIME, tamanho e metadados esperados antes de ativar o item. Coberto na Task 3.
- Retry após falha incerta da Meta: não deve gerar duplicação silenciosa; seguir a semântica de idempotência/`meta_send_uncertain` existente. Coberto nas Tasks 4 e 7.
- Soft delete enquanto um item está selecionado: o backend deve recusar o envio por item inativo mesmo que a UI ainda tenha o ID selecionado. Coberto nas Tasks 3 e 7.

---

## File Structure

### Database / Storage
- Create: `supabase/sql/20261003_attendance_library_v1.sql` — bucket, catálogo, auditoria, índices e funções SQL service-role-only.
- Create: `scripts/test-admin-attendance-library-schema-v1.mjs` — contratos de banco/Storage e segurança.

### Backend shared modules
- Create: `supabase/functions/_shared/admin-attendance-library-v1.mjs` — validação de catálogo, signed uploads, finalize, listagem, preview, edição e soft delete.
- Modify: `supabase/functions/_shared/admin-attendance-media-send-v1.mjs` — extrair transporte comum por bytes e ampliar tipos suportados.
- Modify: `supabase/functions/_shared/whatsapp-meta-media-v1.mjs` — MIME/tipos outbound Meta somente onde necessário.
- Modify: `supabase/functions/_shared/whatsapp-meta-transport-v1.mjs` — garantir suporte a `video`/`document` sem duplicar transporte.
- Modify: `supabase/functions/admin-whatsapp-ops-v1/index.ts` — registrar ações da Biblioteca e delegar ao helper.

### Frontend
- Create: `vitrine/admin/atendimento/attendance-library-image.js` — compactação/thumbnail de imagem no navegador.
- Create: `vitrine/admin/atendimento/attendance-library.js` — estado, galeria, upload, CRUD, seleção e envio sequencial.
- Modify: `vitrine/admin/atendimento/index.html` — botão Biblioteca, drawer/dialog e templates de UI.
- Modify: `vitrine/admin/atendimento/attendance.css` — drawer, grid, cards, mobile e estados de upload/envio.
- Modify: `vitrine/admin/atendimento/attendance-app.js` — somente integração mínima com troca de conversa/estado de janela se necessário; não mover lógica da Biblioteca para este arquivo.

### Tests / CI
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
- Consumes: `admin_users`, `conversations`, `whatsapp_accounts`, `whatsapp_outbox_v1`, `whatsapp_messages_v1` existentes.
- Produces: tabela `attendance_library_items_v1`, tabela `attendance_library_audit_v1`, bucket `attendance-library-v1`, e funções service-role-only `ops2_admin_attendance_library_*_v1` usadas pelo helper da Task 3.

- [ ] **Step 1: Write the failing schema contract test**

Criar `scripts/test-admin-attendance-library-schema-v1.mjs` com asserts que exijam no SQL:
- bucket `attendance-library-v1` com `public=false`;
- tabela `attendance_library_items_v1` com `id,title,media_kind,mime_type,storage_path,thumbnail_path,original_filename,original_size_bytes,stored_size_bytes,category,tags,is_active,created_by,updated_by,created_at,updated_at,deleted_at,deleted_by`;
- `media_kind` limitado a `image|video|audio|document`;
- índice para itens ativos + tipo/categoria/criação;
- tabela `attendance_library_audit_v1` com `admin_user_id,item_id,conversation_id,whatsapp_account_id,action,result,error_code,outbox_id,message_id,provider_message_id,metadata,created_at`;
- funções de create/finalize/update/deactivate/audit revogadas de `public,anon,authenticated` e concedidas apenas a `service_role`.

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-admin-attendance-library-schema-v1.mjs`
Expected: FAIL porque `supabase/sql/20261003_attendance_library_v1.sql` ainda não existe.

- [ ] **Step 3: Implement the SQL schema and service-role-only RPCs**

Criar `supabase/sql/20261003_attendance_library_v1.sql` com:
- bucket privado com `file_size_limit=26214400`;
- `attendance_library_items_v1` com soft delete;
- `attendance_library_audit_v1` append-only;
- RPCs para reservar item/path, finalizar upload, editar metadados, desativar e registrar auditoria;
- validações de `title`, `media_kind`, `mime_type`, path controlado por UUID e `stored_size_bytes <= 25 MB`;
- item só fica `is_active=true` depois do finalize válido.

- [ ] **Step 4: Run schema contract GREEN**

Run: `node scripts/test-admin-attendance-library-schema-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Apply SQL to canonical Supabase and verify read-only state**

Aplicar no projeto `ssbesxgaijknwsjbsbcz`; depois consultar:
- bucket privado existe;
- tabelas existem;
- nenhuma linha de biblioteca foi criada por engano;
- grants dos RPCs estão restritos a `service_role`.

Expected: tudo presente, biblioteca vazia, sem objeto público.

- [ ] **Step 6: Commit**

```bash
git add supabase/sql/20261003_attendance_library_v1.sql scripts/test-admin-attendance-library-schema-v1.mjs
git commit -m "feat: add attendance quick library storage schema"
```

---

### Task 2: Transporte de mídia único para anexo avulso e Biblioteca

**Files:**
- Modify: `supabase/functions/_shared/admin-attendance-media-send-v1.mjs`
- Modify: `supabase/functions/_shared/whatsapp-meta-media-v1.mjs`
- Modify: `supabase/functions/_shared/whatsapp-meta-transport-v1.mjs`
- Modify: `scripts/test-attendance-meta-media-v1.mjs`
- Modify: `scripts/test-attendance-meta-media-retry-v1.mjs`
- Create: `scripts/test-admin-attendance-library-send-v1.mjs`

**Interfaces:**
- Consumes: RPCs existentes `ops2_admin_attendance_enqueue_media_v1`, `ops2_admin_attendance_claim_media_outbox_v1`, `ops2_admin_attendance_accept_meta_media_outbound_v1` e `ops2_admin_attendance_requeue_failed_media_v1`.
- Produces: `sendAttendanceMediaBytesViaMeta({db,conversationId,idempotencyKey,bytes,mimeType,filename,caption,accessToken,graphVersion,markClaimFailed,markMetaUncertain})` e mantém `sendAttendanceMediaViaMeta({db,form,...})` como wrapper compatível.

- [ ] **Step 1: Extend the failing transport contracts**

Em `scripts/test-admin-attendance-library-send-v1.mjs`, exigir export de `sendAttendanceMediaBytesViaMeta` e assertar que:
- destino não é parâmetro da função;
- recebe `conversationId` e resolve destino via outbox/claim existente;
- aceita `image`, `audio`, `video`, `document`;
- mantém `service_window_closed`, `human_send_not_homologated`, idempotência, rate limit e `meta_send_uncertain` via RPCs/gates existentes.

Atualizar `scripts/test-attendance-meta-media-v1.mjs` para exigir que `sendAttendanceMediaViaMeta` continue existindo e delegue ao caminho comum por bytes.

- [ ] **Step 2: Run transport tests to verify RED**

Run:
```bash
node scripts/test-admin-attendance-library-send-v1.mjs
node scripts/test-attendance-meta-media-v1.mjs
node scripts/test-attendance-meta-media-retry-v1.mjs
```
Expected: novo teste FAIL; testes antigos permanecem como referência do comportamento existente.

- [ ] **Step 3: Extract `sendAttendanceMediaBytesViaMeta`**

Em `supabase/functions/_shared/admin-attendance-media-send-v1.mjs`:
- mover validação/enqueue/claim/upload Meta/send/persistência para a nova função por bytes;
- manter `sendAttendanceMediaViaMeta` somente responsável por validar FormData, ler File e delegar;
- preservar chaves de idempotência e retry existentes.

- [ ] **Step 4: Expand MIME mapping to video and approved documents**

Atualizar os helpers Meta para mapear:
- image: JPEG/PNG;
- audio: tipos já homologados;
- video: MP4/3GPP compatíveis;
- document: PDF/TXT/DOC/DOCX/XLS/XLSX/PPT/PPTX conforme MIME atual validado na implementação.

Não adicionar transcodificação.

- [ ] **Step 5: Run transport tests GREEN**

Run:
```bash
node scripts/test-admin-attendance-library-send-v1.mjs
node scripts/test-attendance-meta-media-v1.mjs
node scripts/test-attendance-meta-media-retry-v1.mjs
```
Expected: PASS em todos.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/admin-attendance-media-send-v1.mjs supabase/functions/_shared/whatsapp-meta-media-v1.mjs supabase/functions/_shared/whatsapp-meta-transport-v1.mjs scripts/test-admin-attendance-library-send-v1.mjs scripts/test-attendance-meta-media-v1.mjs scripts/test-attendance-meta-media-retry-v1.mjs
git commit -m "refactor: share Meta media transport with quick library"
```

---

### Task 3: Backend da Biblioteca — upload assinado, finalize, listagem, preview e CRUD

**Files:**
- Create: `supabase/functions/_shared/admin-attendance-library-v1.mjs`
- Modify: `supabase/functions/admin-whatsapp-ops-v1/index.ts`
- Create: `scripts/test-admin-attendance-library-api-v1.mjs`

**Interfaces:**
- Consumes: tabelas/RPCs da Task 1; `db.storage.from('attendance-library-v1').createSignedUploadUrl()`, `createSignedUrl()`, `download()`; `adminAuth()` do gateway.
- Produces actions HTTP: `library_list`, `library_upload_prepare`, `library_upload_finalize`, `library_preview`, `library_update`, `library_deactivate`, `library_send`.

- [ ] **Step 1: Write failing API contract tests**

Criar `scripts/test-admin-attendance-library-api-v1.mjs` exigindo:
- `READ_ACTIONS` inclui `library_list`, `library_preview`;
- `SAFE_POST_ACTIONS` inclui prepare/finalize/update/deactivate/send;
- todas as ações passam por `adminAuth()` já existente;
- prepare retorna signed upload apenas para `attendance-library-v1` e path `items/<uuid>/...`;
- finalize nunca aceita `storage_path` arbitrário fora do item reservado;
- preview usa signed URL curta;
- deactivate é soft delete;
- `library_send` aceita apenas `conversation_id`, `item_id`, `idempotency_key`, `caption` opcional; campos de destino são proibidos.

- [ ] **Step 2: Run API test RED**

Run: `node scripts/test-admin-attendance-library-api-v1.mjs`
Expected: FAIL porque helper/actions não existem.

- [ ] **Step 3: Implement library validation/domain helpers**

Criar `admin-attendance-library-v1.mjs` exportando:
- `listAttendanceLibrary({db,query,kind,category,limit,cursor})`;
- `prepareAttendanceLibraryUpload({db,adminUserId,input})`;
- `finalizeAttendanceLibraryUpload({db,adminUserId,input})`;
- `signAttendanceLibraryPreview({db,itemId})`;
- `updateAttendanceLibraryItem({db,adminUserId,input})`;
- `deactivateAttendanceLibraryItem({db,adminUserId,itemId})`;
- `loadActiveAttendanceLibraryItem({db,itemId})`.

Finalize deve conferir objeto no Storage, path reservado, MIME e tamanho antes de ativar.

- [ ] **Step 4: Wire actions into `admin-whatsapp-ops-v1`**

Adicionar as ações e delegação ao helper; manter autenticação única do gateway e `Cache-Control:no-store`.

- [ ] **Step 5: Verify signed-upload tampering and soft-delete behavior**

Adicionar ao teste asserts para:
- item desativado não aparece em listagem normal;
- item desativado não é retornado por `loadActiveAttendanceLibraryItem`;
- finalize rejeita path/MIME/tamanho divergente do reservado.

Run: `node scripts/test-admin-attendance-library-api-v1.mjs`
Expected: PASS.

- [ ] **Step 6: Syntax-check Edge Function modules**

Run:
```bash
node --check supabase/functions/_shared/admin-attendance-library-v1.mjs
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/admin-attendance-library-v1.mjs supabase/functions/admin-whatsapp-ops-v1/index.ts scripts/test-admin-attendance-library-api-v1.mjs
git commit -m "feat: add attendance quick library API"
```

---

### Task 4: Envio de um item da Biblioteca pelo pipeline Meta existente

**Files:**
- Modify: `supabase/functions/_shared/admin-attendance-library-v1.mjs`
- Modify: `supabase/functions/admin-whatsapp-ops-v1/index.ts`
- Modify: `scripts/test-admin-attendance-library-send-v1.mjs`

**Interfaces:**
- Consumes: `loadActiveAttendanceLibraryItem()` da Task 3; `sendAttendanceMediaBytesViaMeta()` da Task 2.
- Produces: `sendAttendanceLibraryItem({db,adminUserId,conversationId,itemId,idempotencyKey,caption,accessToken,graphVersion,markClaimFailed,markMetaUncertain})`.

- [ ] **Step 1: Add failing send tests for active item + 24h gate**

Testar por contrato que `library_send`:
- carrega somente item ativo;
- baixa bytes do bucket privado server-side;
- chama `sendAttendanceMediaBytesViaMeta` com `conversationId` e nunca telefone;
- registra auditoria de tentativa/sucesso/falha;
- propaga `service_window_closed` e `meta_send_uncertain` sem mascarar.

- [ ] **Step 2: Run send test RED**

Run: `node scripts/test-admin-attendance-library-send-v1.mjs`
Expected: FAIL nas novas expectativas.

- [ ] **Step 3: Implement `sendAttendanceLibraryItem`**

Fluxo:
1. validar item ativo;
2. download privado pelo path canônico;
3. conferir byte length contra catálogo;
4. chamar `sendAttendanceMediaBytesViaMeta`;
5. inserir auditoria com `outbox_id`, `message_id`, provider ID e erro normalizado;
6. retornar resultado normalizado ao frontend.

- [ ] **Step 4: Verify item removed after selection cannot send**

Adicionar teste que exige `library_item_inactive` antes de qualquer chamada de transporte.

- [ ] **Step 5: Run send tests GREEN**

Run:
```bash
node scripts/test-admin-attendance-library-send-v1.mjs
node scripts/test-attendance-meta-media-v1.mjs
node scripts/test-attendance-meta-media-retry-v1.mjs
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/admin-attendance-library-v1.mjs supabase/functions/admin-whatsapp-ops-v1/index.ts scripts/test-admin-attendance-library-send-v1.mjs
git commit -m "feat: send quick library items through Meta pipeline"
```

---

### Task 5: Compactação e thumbnail de imagens no navegador

**Files:**
- Create: `vitrine/admin/atendimento/attendance-library-image.js`
- Create: `scripts/test-admin-attendance-library-image-v1.mjs`

**Interfaces:**
- Produces: `optimizeLibraryImage(file, options?) -> Promise<{file: File, thumbnail: File, originalBytes:number, storedBytes:number, width:number, height:number}>`.
- Consumes later: Task 6 upload controller.

- [ ] **Step 1: Write failing image-processing contract**

Criar teste exigindo:
- apenas JPEG/PNG;
- uso de `createImageBitmap`/canvas no browser;
- limite de dimensão definido em constante única;
- JPEG otimizado para fotos e PNG preservado quando transparência for detectada/necessária;
- thumbnail separado;
- nunca retornar silenciosamente o original em caso de falha;
- metadados `originalBytes`, `storedBytes`, `width`, `height`.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-admin-attendance-library-image-v1.mjs`
Expected: FAIL porque módulo ainda não existe.

- [ ] **Step 3: Implement `optimizeLibraryImage`**

Usar APIs nativas do navegador; sem nova dependência externa. Aplicar redimensionamento preservando proporção, qualidade JPEG operacional e thumbnail pequeno.

- [ ] **Step 4: Run GREEN + syntax check**

Run:
```bash
node scripts/test-admin-attendance-library-image-v1.mjs
node --check vitrine/admin/atendimento/attendance-library-image.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vitrine/admin/atendimento/attendance-library-image.js scripts/test-admin-attendance-library-image-v1.mjs
git commit -m "feat: optimize quick library images before upload"
```

---

### Task 6: Drawer responsivo, galeria, busca e gerenciamento

**Files:**
- Create: `vitrine/admin/atendimento/attendance-library.js`
- Modify: `vitrine/admin/atendimento/index.html`
- Modify: `vitrine/admin/atendimento/attendance.css`
- Create: `scripts/test-admin-attendance-library-ui-v1.mjs`

**Interfaces:**
- Consumes: HTTP actions da Task 3; `optimizeLibraryImage()` da Task 5.
- Produces UI: botão `#libraryBtn`, drawer `#attendanceLibrary`, grid, upload manager, seleção local e CRUD.

- [ ] **Step 1: Write failing UI contract test**

Exigir no HTML/JS/CSS:
- botão `Biblioteca` em Ferramentas rápidas;
- drawer/dialog acessível com fechar;
- busca;
- filtros `Todos`, `Imagens`, `Vídeos`, `Áudios`, `Arquivos`;
- cards com thumbnail/ícone, título, tamanho, categoria e checkbox/estado selecionado;
- `Adicionar à biblioteca`, `Editar`, `Remover`, `Limpar seleção`, `Enviar N itens`;
- upload múltiplo;
- mobile quase tela inteira e desktop drawer lateral;
- máximo local de 10 selecionados.

- [ ] **Step 2: Run UI test RED**

Run: `node scripts/test-admin-attendance-library-ui-v1.mjs`
Expected: FAIL.

- [ ] **Step 3: Add HTML skeleton and script loading**

Modificar `index.html` para adicionar `#libraryBtn`, drawer e `<script type="module" src="./attendance-library.js">`; não remover composer/anexo atual.

- [ ] **Step 4: Implement gallery state and CRUD**

`attendance-library.js` deve manter um único estado `{open,items,query,kind,category,selected,uploads,sending}` e funções focadas para load/render/filter/select/upload/edit/deactivate.

- [ ] **Step 5: Implement signed upload flow**

Para cada arquivo:
1. imagem passa por `optimizeLibraryImage`; outros validam MIME/tamanho;
2. POST `library_upload_prepare`;
3. upload direto à signed upload URL do Storage;
4. POST `library_upload_finalize`;
5. reload/insert do item ativo na galeria.

- [ ] **Step 6: Add responsive styles**

Desktop: drawer lateral com grid e footer sticky. Mobile: drawer quase full-screen, cards maiores e barra fixa.

- [ ] **Step 7: Run UI tests GREEN**

Run:
```bash
node scripts/test-admin-attendance-library-ui-v1.mjs
node scripts/test-admin-attendance-library-image-v1.mjs
node --check vitrine/admin/atendimento/attendance-library.js
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add vitrine/admin/atendimento/attendance-library.js vitrine/admin/atendimento/index.html vitrine/admin/atendimento/attendance.css scripts/test-admin-attendance-library-ui-v1.mjs
git commit -m "feat: add responsive quick library gallery"
```

---

### Task 7: Seleção múltipla, envio sequencial e compliance de 24h na UI

**Files:**
- Modify: `vitrine/admin/atendimento/attendance-library.js`
- Modify: `vitrine/admin/atendimento/attendance-app.js` only if a small event/hook is needed for conversation/window changes.
- Modify: `scripts/test-admin-attendance-library-ui-v1.mjs`
- Modify: `scripts/test-admin-attendance-library-send-v1.mjs`

**Interfaces:**
- Consumes: `library_send` da Task 4 e `service_window` já retornado pelo endpoint de conversa.
- Produces: `sendSelectedLibraryItems()` com fila sequencial e resultado por item.

- [ ] **Step 1: Add failing sequential-send UI tests**

Exigir:
- `selected.size <= 10`;
- botão exibe `Enviar N itens`;
- fora da janela botão fica disabled com texto `Janela de atendimento encerrada. Mídia livre não pode ser enviada.`;
- envio usa loop sequencial (`await` item a item), não `Promise.all`;
- mostra `Enviando X de N` e resumo final;
- `Tentar novamente os que falharam` usa apenas IDs falhos.

- [ ] **Step 2: Add failing safety tests for conversation/window changes**

Exigir que:
- ao trocar de conversa, seleção seja limpa ou vinculada à conversa original e bloqueada até confirmação; escolher implementação: limpar seleção automaticamente;
- antes de cada POST `library_send`, verificar estado local da janela;
- backend continua sendo autoridade final;
- se resposta for `service_window_closed`, interromper imediatamente o lote;
- erros de arquivo individual podem seguir para o próximo;
- `meta_send_uncertain`, auth inválida, canal não homologado ou destino inconsistente interrompem lote.

- [ ] **Step 3: Run tests RED**

Run:
```bash
node scripts/test-admin-attendance-library-ui-v1.mjs
node scripts/test-admin-attendance-library-send-v1.mjs
```
Expected: FAIL nas novas regras de lote.

- [ ] **Step 4: Implement `sendSelectedLibraryItems()`**

Para cada item, gerar idempotency key própria estável durante retry da mesma tentativa; chamar `library_send` sequencialmente e registrar status local.

- [ ] **Step 5: Integrate conversation/window lifecycle**

Observar a conversa selecionada e o estado de janela já renderizado pela Central. Limpar seleção ao trocar de conversa. Fora da janela, biblioteca permanece navegável mas envio desabilitado.

- [ ] **Step 6: Run GREEN**

Run:
```bash
node scripts/test-admin-attendance-library-ui-v1.mjs
node scripts/test-admin-attendance-library-send-v1.mjs
node --check vitrine/admin/atendimento/attendance-library.js
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add vitrine/admin/atendimento/attendance-library.js vitrine/admin/atendimento/attendance-app.js scripts/test-admin-attendance-library-ui-v1.mjs scripts/test-admin-attendance-library-send-v1.mjs
git commit -m "feat: send quick library batches within service window"
```

---

### Task 8: CI completa e regressão da Central

**Files:**
- Modify: `.github/workflows/attendance-papoai-send-ci.yml`
- Possibly modify: existing attendance tests only when requirements intentionally changed by approved spec.

**Interfaces:**
- Consumes: all tests/tasks above.
- Produces: CI gate único para Biblioteca + contratos antigos.

- [ ] **Step 1: Add new tests to attendance CI**

Adicionar comandos:
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

Adicionar paths do helper/SQL ao filtro do workflow.

- [ ] **Step 2: Run the complete local contract suite**

Run every command already present in `.github/workflows/attendance-papoai-send-ci.yml` plus all new library tests.
Expected: PASS, no legacy regression.

- [ ] **Step 3: Run diff/syntax sanity**

Run:
```bash
git diff --check
node --check vitrine/admin/atendimento/attendance-app.js
node --check vitrine/admin/atendimento/attendance-send.js
node --check vitrine/admin/atendimento/attendance-media-send.js
node --check vitrine/admin/atendimento/attendance-templates.js
node --check vitrine/admin/atendimento/attendance-human-ai.js
node --check vitrine/admin/atendimento/attendance-ana-preview.js
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/attendance-papoai-send-ci.yml
git commit -m "ci: validate attendance quick library"
```

---

### Task 9: Deploy seguro, validação canônica e PR

**Files:**
- No new product files expected; only deployment/checkpoint docs if current project convention requires them.

**Interfaces:**
- Consumes: fully green branch from Tasks 1–8.
- Produces: deployed Supabase schema/function + Pages UI with no unsolicited customer message.

- [ ] **Step 1: Re-read current `main` and rebase/update branch if needed**

Check current `main` SHA and compare against branch base. Resolve only real conflicts; rerun full CI after sync.

- [ ] **Step 2: Deploy SQL changes to canonical project**

Apply `supabase/sql/20261003_attendance_library_v1.sql` to `ssbesxgaijknwsjbsbcz` only after test/inspection; verify bucket private and tables/RPC grants.

- [ ] **Step 3: Deploy `admin-whatsapp-ops-v1`**

Deploy the Edge Function with the new shared modules. Do not change Meta tokens/runtime gates.

- [ ] **Step 4: Production-safe smoke checks without messaging real customers**

Verify authenticated endpoints:
- list empty/non-empty library;
- prepare upload for a controlled test image;
- signed upload;
- finalize;
- preview signed URL;
- edit metadata;
- soft delete;
- confirm item inactive no longer lists/sends.

Do not invoke `library_send` to a real customer during smoke unless the user separately authorizes a controlled recipient.

- [ ] **Step 5: Open PR and wait for CI**

PR title: `feat: adicionar Biblioteca Rápida ao Atendimento`

PR body must summarize:
- private Storage + signed upload;
- image optimization;
- shared Meta media transport;
- sequential multi-send;
- 24h backend + frontend gate;
- audit and soft delete;
- tests run.

- [ ] **Step 6: Verify required workflows GREEN**

Require at minimum:
- `attendance-papoai-send-ci`;
- `WhatsApp Meta Central CI` if triggered by changed media/backend paths;
- any Admin guard workflows triggered by `vitrine/admin/atendimento/**`.

- [ ] **Step 7: Whole-branch review**

Review especially:
- no public bucket;
- no service role/token in frontend;
- no destination supplied by browser;
- no send path bypasses 24h gate;
- no `Promise.all` media blasting;
- no duplicate retry path;
- old attachment flow still works.

- [ ] **Step 8: Merge by squash only after verification**

Use expected head SHA. After merge, verify `main` points to merge commit and Pages deployment for that SHA completes successfully.

- [ ] **Step 9: Final production verification**

Check the live Central on desktop/mobile:
- drawer opens;
- upload/preview works;
- gallery remains available outside service window;
- send button is blocked outside 24h;
- existing text/anexo/templates remain intact.

No real customer message should be sent as part of verification unless separately authorized.
