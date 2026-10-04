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
- Worker/WASM indisponível ou corrompido: UI falha explicitamente e mantém envio desabilitado.
- MIME `audio/ogg` com bytes inválidos: não habilitar envio sem `OggS` + `OpusHead`.
- Troca de conversa durante gravação/finalização: cancelar stream, worker, preview e arquivo pronto.
- Clique duplo em Enviar áudio: preservar idempotência e impedir segundo disparo do gravador.
- Browser com OGG nativo: não carregar vendor Worker/WASM.

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

- [ ] Escrever teste RED exigindo versão `0.8.0`, artefatos, licença, hashes/tamanhos, ausência de CDN e magic WASM `00 61 73 6d`.
- [ ] Rodar `node scripts/test-attendance-audio-vendor-v1.mjs`; esperado FAIL por artefatos ausentes.
- [ ] Adicionar somente `OpusMediaRecorder.umd.js`, `encoderWorker.umd.js`, `OggOpusEncoder.wasm` e licença do pacote 0.8.0; não incluir WebM encoder.
- [ ] Gerar `MANIFEST.json` com SHA-256 e bytes reais.
- [ ] Adicionar teste ao `whatsapp-meta-central-ci.yml` e rodar GREEN.
- [ ] Commit `build(audio): vendorizar encoder OGG Opus pinado`.

---

### Task 2: Adapter OGG/Opus nativo + Worker/WASM

**Files:**
- Create: `vitrine/admin/atendimento/attendance-audio-ogg-recorder.js`
- Create: `scripts/test-attendance-audio-ogg-recorder-v1.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Produces: `window.AttendanceOggRecorder.resolve(stream, options?) -> Promise<{ recorder, encoder, mimeType, fileType, extension }>`.
- Produces: `window.AttendanceOggRecorder.isValidOggOpus(blob) -> Promise<boolean>`.
- Produces: `window.AttendanceOggRecorder.dispose()`.

- [ ] Escrever RED cobrindo nativo OGG/Opus primeiro, fallback same-origin, ausência de MP4/AAC/WebM como saída, erro fail-closed e validação Ogg/Opus.
- [ ] Rodar `node scripts/test-attendance-audio-ogg-recorder-v1.mjs`; esperado FAIL por módulo inexistente.
- [ ] Implementar loader lazy com `VENDOR_BASE='./vendor/opus-media-recorder/0.8.0/'`, cacheando uma única Promise.
- [ ] Implementar `resolve(stream,{audioBitsPerSecond=64000}={})`: nativo OGG/Opus ou `OpusMediaRecorder` com worker + Ogg WASM same-origin.
- [ ] Implementar `isValidOggOpus(blob)`: `size>0`, `OggS` no início e `OpusHead` dentro dos primeiros 64 KiB.
- [ ] Implementar `dispose()` sem encerrar stream externo.
- [ ] Rodar teste + `node --check`; esperado PASS.
- [ ] Commit `feat(audio): adicionar adapter OGG Opus local`.

---

### Task 3: Integrar gravador, UX e pipeline existente

**Files:**
- Modify: `vitrine/admin/atendimento/index.html`
- Modify: `vitrine/admin/atendimento/attendance-audio-recorder.js`
- Modify: `scripts/test-attendance-audio-recorder-v1.mjs`
- Create: `scripts/test-attendance-audio-recorder-v2.mjs`
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`

**Interfaces:**
- Consumes: `AttendanceOggRecorder.resolve/isValidOggOpus/dispose`.
- Produces: `attendance:recorded-audio-ready` com `file` OGG e diagnósticos `recording_container='ogg'`, `recording_codec='opus'`, `recording_encoder='native'|'worker'`, `size_bytes`.
- Preserva: `attendance:send-recorded-audio` e `attendance-media-send.js` como único owner de `send_media`/idempotência.

- [ ] Escrever RED v2 para ordem dos scripts, remoção do fallback M4A, adapter, finalizing, validação OGG, erros, troca de conversa e clique duplo.
- [ ] Rodar `node scripts/test-attendance-audio-recorder-v2.mjs`; esperado FAIL.
- [ ] Carregar adapter antes do gravador; assets pesados continuam lazy.
- [ ] Refatorar `startRecording()` para microfone → resolver OGG recorder → gravar → finalizar → validar → criar `.ogg` → preview.
- [ ] Estados exatos: `Solicitando acesso ao microfone…`, `Gravando…`, `Preparando áudio OGG/Opus…`, `Áudio pronto (OGG/Opus · nativo|compatibilidade).`, erro explícito com tentar novamente/Anexar.
- [ ] Preservar `aria-live`, timer, preview e pipeline atual.
- [ ] Rodar v1 + v2 + adapter + `node --check`; esperado tudo PASS.
- [ ] Commit `feat(audio): gravar OGG Opus compatível no Atendimento`.

---

### Task 4: CI, segurança, tamanho e rollback operacional

**Files:**
- Modify: `.github/workflows/whatsapp-meta-central-ci.yml`
- Create: `scripts/test-attendance-audio-ogg-security-v1.mjs`
- Modify: `docs/RETOMADA-WHATSAPP-CENTRAL-PROPRIA.md`

**Interfaces:**
- Produces gates que bloqueiam CDN, segredo, M4A automático, asset ausente e regressão de sintaxe.

- [ ] Testar same-origin/version pin, ausência de `@latest`/CDN/Graph, ausência de fallback MP4 no gravador, ausência de segredos e teto de bundle baseado no tamanho real + 5%.
- [ ] Confirmar Anexar/Biblioteca permanecem disponíveis se encoder falhar.
- [ ] Rodar `node scripts/test-attendance-audio-ogg-security-v1.mjs`; esperado PASS.
- [ ] Rodar os dois workflows completos: `WhatsApp Meta Central CI` e `attendance-papoai-send-ci` GREEN no mesmo HEAD.
- [ ] Revisar diff: somente Atendimento/vendor/testes/CI/docs; zero migration, checkout, pedidos, estoque ou Bling.
- [ ] Atualizar handoff com PR/SHA, formato OGG, hashes vendor, live OFF/canário ON e failures M4A históricos.
- [ ] Commit `test(audio): endurecer gravador OGG Opus`.

---

### Task 5: Homologação bilateral Task 9B

**Files:** checkpoints #630/#649 e handoff somente após evidência.

- [ ] Confirmar baseline: live OFF, canário ON, allowlist recíproca 0975↔1018, fila limpa, áudio ainda não homologado.
- [ ] Canário humano 0975→1018: Ctrl+F5, gravar 2–5 s, UI deve mostrar OGG/Opus, enviar uma vez.
- [ ] Validar: outbound/audio/meta, MIME `audio/ogg`, WAMID, status final não failed, zero WAMID duplicado, fila limpa.
- [ ] Repetir 1018→0975 com os mesmos requisitos.
- [ ] Conferir readiness bilateral com áudio > 0 nos dois canais, sem duplicação/fila suja; live continua OFF.
- [ ] Registrar WAMIDs/status/timestamps/dedupe/readiness em #630/#649 e handoff; só então fechar Task 9B.

## Self-review result
- Cobertura da especificação: completa; requisitos das seções 1–16 estão mapeados para Tasks 1–5.
- Interfaces: `AttendanceOggRecorder` é definido na Task 2 e consumido com os mesmos nomes na Task 3.
- Review Focus: os cinco riscos prioritários têm teste explícito nas Tasks 2–4.
- Rollback: nenhum schema/backend novo; rollback remove adapter/vendor/referências e mantém Anexar/Biblioteca.
- Dependência: `opus-media-recorder` 0.8.0 usa Worker + WASM e suporta `audio/ogg`; produção será same-origin e sem CDN.
