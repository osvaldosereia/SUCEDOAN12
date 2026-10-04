# Attendance Audio OGG/Opus Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o gravador da Central produzir OGG/Opus válido no Edge/Chrome atual, inteiramente no navegador, e reutilizar o pipeline Meta existente sem fallback automático para M4A/fMP4.

**Architecture:** O gravador tenta `MediaRecorder` nativo somente quando `audio/ogg;codecs=opus` é suportado. Caso contrário, um adapter pequeno carrega `opus-media-recorder` 0.8.0 de forma lazy e same-origin, cria um encoder Worker/WASM para OGG/Opus e devolve ao gravador a mesma superfície mínima de `MediaRecorder`. O arquivo final é validado (`OggS` + `OpusHead`) antes de entrar no evento existente `attendance:recorded-audio-ready`; envio, canário, idempotência, WAMID e observação de status continuam no pipeline atual.

**Tech Stack:** HTML/JavaScript estático, Web Worker, WebAssembly, `opus-media-recorder` 0.8.0 pinado, Node.js `assert` para contratos, GitHub Actions, pipeline Supabase/Meta existente.

**Spec:** `docs/superpowers/specs/2026-10-04-attendance-audio-ogg-worker-design.md`

## Global Constraints

- Processamento de áudio 100% local antes do clique em **Enviar áudio**.
- Não usar CDN/runtime externo para JS, Worker ou WASM.
- Dependência `opus-media-recorder` fixada exatamente em `0.8.0`; não usar `latest`.
- Caminho preferencial: OGG/Opus nativo; fallback: OGG/Opus Worker/WASM; último estado: erro explícito + **Anexar**.
- Não produzir nem enviar M4A/fMP4 automaticamente pelo gravador.
- O resultado enviável deve ser `File` `.ogg`, `type='audio/ogg'`, assinatura `OggS` e `OpusHead` presente no cabeçalho inicial.
- Nenhum token Meta, WABA, `phone_number_id`, `service_role` ou segredo novo no browser.
- `meta_media_live_enabled=false` durante desenvolvimento e homologação.
- Canário de mídia continua restrito a 0975↔1018.
- ANA e campanhas continuam desligadas.
- Não alterar checkout, pedidos, estoque ou Bling.
- Não criar migration nem serviço novo no Supabase para esta feature.

## Review Focus

- **Worker/WASM indisponível ou corrompido:** UI deve falhar explicitamente e manter envio desabilitado; cobrir na Task 2.
- **Arquivo com MIME `audio/ogg` mas bytes inválidos:** não habilitar envio; cobrir `OggS`/`OpusHead` na Task 2.
- **Troca de conversa durante gravação/finalização:** cancelar captura, worker, preview e arquivo pronto; cobrir na Task 3.
- **Clique duplo em Enviar áudio:** continuar usando o idempotency key/pipeline existente, sem segundo envio; cobrir regressão na Task 3.
- **Browser com OGG nativo:** não baixar/carregar vendor Worker/WASM desnecessariamente; cobrir na Task 2.

---

### Task 1: Vendor pinado e integridade same-origin

**Files:**
- Create: `vitrine/admin/atendimento/vendor/opus-media-recorder/0.8.0/OpusMediaRecorder.umd.js`
- Create: `vitrine/admin/atendimento/vendor/opus-media-recorder/0.8.0/encoderWorker.umd.js`
- Create: `vitrine/admin/atendimento/vendor/opus-media-recorder/0.8.0/OggOpusEncoder.wasm`
- Create: `vitrine/admin/atendimento/vendor/opus-media-recorder/0.8.0/LICENSE.md`
- Create: `vitrine/admin/atendimento/vendor/opus-media-recorder/0.8.0/MANIFEST.json`
- Create: `scripts/test-attendance-audio-vendor-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Produces: diretório vendor imutável por versão; `MANIFEST.json` com `version`, `files[path].sha256`, `files[path].bytes`.
- Consumes: nenhum código de runtime da Central.

- [ ] **Step 1: Escrever o teste RED do vendor**

Criar `test-attendance-audio-vendor-v1.mjs` com asserts para:
- versão exatamente `0.8.0`;
- existência dos quatro artefatos necessários + licença;
- nenhum URL `http://`, `https://`, `cdn.jsdelivr`, `unpkg` nos arquivos de configuração/runtime;
- SHA-256 e tamanho de cada arquivo iguais ao manifesto;
- WASM começa com magic bytes `00 61 73 6d`.

- [ ] **Step 2: Rodar o teste e confirmar RED**

Run: `node scripts/test-attendance-audio-vendor-v1.mjs`
Expected: FAIL por artefatos/manifesto inexistentes.

- [ ] **Step 3: Adicionar artefatos pinados do pacote `opus-media-recorder@0.8.0`**

Usar somente:
- `OpusMediaRecorder.umd.js`;
- `encoderWorker.umd.js`;
- `OggOpusEncoder.wasm`;
- licença correspondente.

Não incluir `WebMOpusEncoder.wasm`, porque esta implementação só produz OGG.

- [ ] **Step 4: Gerar `MANIFEST.json` com hashes/tamanhos dos artefatos vendorizados**

Formato:
```json
{
  "package": "opus-media-recorder",
  "version": "0.8.0",
  "files": {
    "OpusMediaRecorder.umd.js": {"sha256": "...", "bytes": 0}
  }
}
```

- [ ] **Step 5: Adicionar o teste do vendor ao `whatsapp-meta-central-ci.yml` e rodar GREEN**

Run: `node scripts/test-attendance-audio-vendor-v1.mjs`
Expected: `PASS test-attendance-audio-vendor-v1`.

- [ ] **Step 6: Commit**

```bash
git add vitrine/admin/atendimento/vendor/opus-media-recorder/0.8.0 scripts/test-attendance-audio-vendor-v1.mjs .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "build(audio): vendorizar encoder OGG Opus pinado"
```

---

### Task 2: Adapter OGG/Opus nativo + Worker/WASM

**Files:**
- Create: `vitrine/admin/atendimento/attendance-audio-ogg-recorder.js`
- Create: `scripts/test-attendance-audio-ogg-recorder-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Produces: `window.AttendanceOggRecorder.resolve(stream, options?) -> Promise<{ recorder, encoder, mimeType, fileType, extension }>`.
- Produces: `window.AttendanceOggRecorder.isValidOggOpus(blob) -> Promise<boolean>`.
- Produces: `window.AttendanceOggRecorder.dispose()` para limpar loader/worker mantido pelo adapter quando aplicável.
- Consumes: vendor da Task 1 e `MediaRecorder` nativo quando suportar `audio/ogg;codecs=opus`.

- [ ] **Step 1: Escrever teste RED do adapter**

Asserts mínimos:
- `resolve()` escolhe nativo quando `MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') === true`;
- caminho nativo não referencia/carrega `OpusMediaRecorder.umd.js`;
- fallback worker usa `OpusMediaRecorder.umd.js`, `encoderWorker.umd.js` e `OggOpusEncoder.wasm` no diretório same-origin `vendor/opus-media-recorder/0.8.0/`;
- `mimeType` final é `audio/ogg;codecs=opus`, `fileType='audio/ogg'`, `extension='ogg'`;
- erro de carregamento do worker/wasm rejeita `resolve()` e não retorna MediaRecorder MP4;
- `isValidOggOpus()` rejeita blob vazio e bytes sem `OggS`/`OpusHead`;
- `isValidOggOpus()` aceita fixture sintética com `OggS` no offset 0 e `OpusHead` na janela inicial;
- não há `fetch`/URL de CDN nem `graph.facebook.com`.

- [ ] **Step 2: Rodar teste e confirmar RED**

Run: `node scripts/test-attendance-audio-ogg-recorder-v1.mjs`
Expected: FAIL porque `attendance-audio-ogg-recorder.js` não existe.

- [ ] **Step 3: Implementar o loader lazy same-origin**

No arquivo novo, definir as constantes exatas:
- `VENDOR_BASE='./vendor/opus-media-recorder/0.8.0/'`;
- script `OpusMediaRecorder.umd.js`;
- worker `encoderWorker.umd.js`;
- wasm `OggOpusEncoder.wasm`.

O loader deve cachear uma única Promise para impedir downloads/instâncias duplicadas quando o operador clicar repetidamente.

- [ ] **Step 4: Implementar `resolve(stream, {audioBitsPerSecond=64000}={})`**

Regras:
- caminho nativo: `new MediaRecorder(stream,{mimeType:'audio/ogg;codecs=opus',audioBitsPerSecond})`;
- fallback: instanciar `OpusMediaRecorder` com `mimeType:'audio/ogg'` e `workerOptions` same-origin;
- nunca selecionar `audio/mp4`, `audio/aac` ou `audio/webm` como saída do gravador novo.

- [ ] **Step 5: Implementar `isValidOggOpus(blob)`**

Ler apenas uma janela inicial limitada (máximo 64 KiB), exigir:
- bytes 0..3 = ASCII `OggS`;
- sequência ASCII `OpusHead` dentro da janela;
- `blob.size > 0`.

- [ ] **Step 6: Implementar `dispose()`**

Limpar somente recursos internos do adapter. Não interromper streams externos que pertencem ao gravador chamador.

- [ ] **Step 7: Rodar GREEN + sintaxe**

Run:
```bash
node scripts/test-attendance-audio-ogg-recorder-v1.mjs
node --check vitrine/admin/atendimento/attendance-audio-ogg-recorder.js
```
Expected: PASS / exit 0.

- [ ] **Step 8: Commit**

```bash
git add vitrine/admin/atendimento/attendance-audio-ogg-recorder.js scripts/test-attendance-audio-ogg-recorder-v1.mjs .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "feat(audio): adicionar adapter OGG Opus local"
```

---

### Task 3: Integrar gravador, UX e pipeline existente

**Files:**
- Modify: `vitrine/admin/atendimento/index.html`
- Modify: `vitrine/admin/atendimento/attendance-audio-recorder.js`
- Modify: `scripts/test-attendance-audio-recorder-v1.mjs`
- Create: `scripts/test-attendance-audio-recorder-v2.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: `window.AttendanceOggRecorder.resolve()`, `.isValidOggOpus()`, `.dispose()` da Task 2.
- Produces: evento existente `attendance:recorded-audio-ready` com `detail.file` OGG válido e diagnósticos `recording_container='ogg'`, `recording_codec='opus'`, `recording_encoder='native'|'worker'`, `size_bytes`.
- Preserva: evento `attendance:send-recorded-audio` e pipeline atual de `attendance-media-send.js`.

- [ ] **Step 1: Escrever teste RED v2 do gravador**

Cobrir:
- `index.html` carrega `attendance-audio-ogg-recorder.js` antes de `attendance-audio-recorder.js`;
- M4A/MP4 não aparece mais em `FORMAT_CANDIDATES` de gravação automática;
- `startRecording()` resolve o recorder via `AttendanceOggRecorder.resolve(stream,{audioBitsPerSecond:64000})`;
- após `stop`, UI entra em estado `finalizing` com texto **Preparando áudio OGG/Opus…**;
- arquivo só fica ready após `isValidOggOpus(blob) === true`;
- arquivo final tem extensão `.ogg` e MIME `audio/ogg`;
- erro do encoder/validação mantém `Enviar áudio` desabilitado e oferece tentar novamente/Anexar;
- evento `attendance:recorded-audio-ready` carrega encoder/container/codec/tamanho;
- troca de conversa durante recording/finalizing limpa stream, preview e estado;
- clique duplo em envio não cria nova chamada de transporte: o gravador apenas dispara o evento existente uma vez enquanto `recordedAudioReady` está true e passa a estado sending até `attendance:media-cleared`/erro do pipeline.

- [ ] **Step 2: Rodar RED**

Run: `node scripts/test-attendance-audio-recorder-v2.mjs`
Expected: FAIL nas integrações ainda inexistentes.

- [ ] **Step 3: Carregar adapter antes do gravador em `index.html`**

Somente o adapter pequeno entra no carregamento normal; os assets pesados continuam lazy dentro do adapter.

- [ ] **Step 4: Refatorar `attendance-audio-recorder.js` para usar o adapter**

Remover seleção automática MP4/AAC. `startRecording()` deve:
1. selecionar conversa;
2. pedir microfone;
3. resolver OGG recorder;
4. gravar;
5. finalizar;
6. validar OGG/Opus;
7. criar `File` `.ogg`;
8. habilitar preview/envio.

- [ ] **Step 5: Implementar estados UX**

Estados/textos exatos:
- requesting: `Solicitando acesso ao microfone…`;
- recording: `Gravando… fale normalmente e toque em Parar quando terminar.`;
- finalizing: `Preparando áudio OGG/Opus…`;
- ready native: `Áudio pronto (OGG/Opus · nativo).`;
- ready worker: `Áudio pronto (OGG/Opus · compatibilidade).`;
- encoder error: `Não consegui preparar o áudio em OGG/Opus. Tente novamente ou use Anexar.`

Manter `aria-live`, timer e preview existentes.

- [ ] **Step 6: Preservar envio/idempotência existente**

Não adicionar `fetch` Meta nem rota nova. `sendRecordedAudio()` continua disparando `attendance:send-recorded-audio`; `attendance-media-send.js` continua sendo o único owner do `send_media` e da idempotency key.

- [ ] **Step 7: Rodar regressão completa local**

Run:
```bash
node scripts/test-attendance-audio-recorder-v1.mjs
node scripts/test-attendance-audio-recorder-v2.mjs
node scripts/test-attendance-audio-ogg-recorder-v1.mjs
node --check vitrine/admin/atendimento/attendance-audio-recorder.js
node --check vitrine/admin/atendimento/attendance-audio-ogg-recorder.js
```
Expected: todos PASS / exit 0.

- [ ] **Step 8: Commit**

```bash
git add vitrine/admin/atendimento/index.html vitrine/admin/atendimento/attendance-audio-recorder.js scripts/test-attendance-audio-recorder-v1.mjs scripts/test-attendance-audio-recorder-v2.mjs .github/workflows/whatsapp-meta-central-ci.yml
git commit -m "feat(audio): gravar OGG Opus compatível no Atendimento"
```

---

### Task 4: CI, segurança, tamanho e rollback operacional

**Files:**
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`
- Create: `scripts/test-attendance-audio-ogg-security-v1.mjs`
- Modify: `docs/RETOMADA-WHATSAPP-CENTRAL-PROPRIA.md`

**Interfaces:**
- Consumes: vendor/adapter/gravador das Tasks 1–3.
- Produces: gates de CI que bloqueiam CDN, segredo, M4A automático, asset ausente e regressão de sintaxe.

- [ ] **Step 1: Escrever teste de segurança/rollback**

Asserts:
- vendor é same-origin e versão pinada;
- nenhuma referência runtime a `@latest`, `cdn.jsdelivr`, `unpkg`, `graph.facebook.com` no gravador/adapter;
- `attendance-audio-recorder.js` não cria `File(...m4a...)` nem escolhe `audio/mp4` como fallback;
- adapter não contém `service_role`, `WHATSAPP_TOKEN`, `phone_number_id` ou segredo;
- tamanho total dos três artefatos executáveis do vendor fica registrado no manifesto e dentro de um teto explícito documentado no teste (usar o tamanho real pinado + margem de 5%, não um número inventado antes de vendorizar);
- `index.html` mantém Anexar/Biblioteca mesmo se encoder falhar.

- [ ] **Step 2: Rodar RED/GREEN do guard**

Run: `node scripts/test-attendance-audio-ogg-security-v1.mjs`
Expected: PASS após os ajustes finais.

- [ ] **Step 3: Rodar as duas suítes CI completas no PR**

GitHub Actions obrigatórios:
- `WhatsApp Meta Central CI` GREEN;
- `attendance-papoai-send-ci` GREEN.

Não marcar ready/mergear com check pendente, skipped por falha anterior, ou head diferente do revisado.

- [ ] **Step 4: Revisar diff final**

Esperado: somente Admin Atendimento, vendor pinado, testes/CI e docs. Zero migration, zero checkout/pedidos/estoque/Bling.

- [ ] **Step 5: Atualizar checkpoint canônico**

`docs/RETOMADA-WHATSAPP-CENTRAL-PROPRIA.md` deve registrar:
- PR/SHA;
- formato final OGG/Opus;
- vendor 0.8.0 + hashes;
- live OFF/canário ON;
- histórico dos dois M4A failed preservado;
- próximo passo = canário humano bilateral.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/whatsapp-meta-central-ci.yml scripts/test-attendance-audio-ogg-security-v1.mjs docs/RETOMADA-WHATSAPP-CENTRAL-PROPRIA.md
git commit -m "test(audio): endurecer gravador OGG Opus"
```

---

### Task 5: Homologação bilateral Task 9B

**Files:**
- No product-code changes expected unless evidence exposes a defect.
- Update: issue `#630` checkpoint.
- Update: issue `#649` Task 9B evidence.
- Update: `docs/RETOMADA-WHATSAPP-CENTRAL-PROPRIA.md` only if the gate closes.

**Interfaces:**
- Consumes: Admin autenticado + runtime production after merged CI-green code.
- Produces: evidência final de readiness, sem alterar gates automaticamente.

- [ ] **Step 1: Confirmar baseline antes do canário**

Read-only Supabase:
- `meta_media_live_enabled=false`;
- `meta_media_canary_enabled=true`;
- allowlist estrita recíproca 0975↔1018;
- fila de mídia `queued/claimed/failed` limpa, desconsiderando failures históricos já encerrados;
- readiness áudio ainda não homologada.

- [ ] **Step 2: Canário humano 0975 → 1018**

Operador:
- Ctrl+F5;
- gravar 2–5 s;
- UI deve mostrar `OGG/Opus` antes de enviar;
- enviar uma única vez.

- [ ] **Step 3: Validar 0975 → 1018 no Supabase**

Exigir no mesmo registro/evidência:
- `direction='outbound'`;
- `message_type='audio'`;
- `provider='meta'`;
- `metadata.media.mime_type='audio/ogg'`;
- WAMID não nulo;
- status canônico final não `failed`;
- zero WAMID duplicado;
- fila limpa.

- [ ] **Step 4: Repetir 1018 → 0975**

Mesmos requisitos do Step 3.

- [ ] **Step 5: Conferir readiness server-side bilateral**

Esperado: contagem válida de áudio > 0 nos dois canais, sem duplicação e sem fila suja. `meta_media_live_enabled` deve **continuar false**; readiness verde não implica graduação automática.

- [ ] **Step 6: Registrar fechamento da 9B**

Comentar #630/#649 com WAMIDs, status, timestamps, dedupe, fila e readiness; atualizar handoff. Somente então marcar Task 9B homologada e avançar a prioridade para Task 10/11.
