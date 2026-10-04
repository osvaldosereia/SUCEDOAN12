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
**Files:** vendor `opus-media-recorder/0.8.0`, manifesto, licença, teste e CI.
- [ ] Teste RED: versão 0.8.0, artefatos, licença, SHA/tamanho, sem CDN, WASM magic.
- [ ] Vendorizar apenas `OpusMediaRecorder.umd.js`, `encoderWorker.umd.js`, `OggOpusEncoder.wasm`, licença.
- [ ] Gerar manifesto com hashes/tamanhos.
- [ ] GREEN e commit `build(audio): vendorizar encoder OGG Opus pinado`.

### Task 2: Adapter OGG/Opus nativo + Worker/WASM
**Files:** `attendance-audio-ogg-worker-adapter.js`, teste, CI.
**Interfaces:** `AttendanceOggRecorder.resolve`, `isValidOggOpus`, `dispose`.
- [ ] RED para caminho nativo, fallback same-origin, fail-closed e validação Ogg/Opus.
- [ ] Loader lazy em `./vendor/opus-media-recorder/0.8.0/`.
- [ ] `resolve(stream,{audioBitsPerSecond=64000})`: nativo OGG/Opus ou worker OGG/WASM; nunca MP4/AAC/WebM como saída.
- [ ] `isValidOggOpus`: tamanho>0, `OggS`, `OpusHead` em até 64 KiB.
- [ ] GREEN + sintaxe + commit `feat(audio): adicionar adapter OGG Opus local`.

### Task 3: Integrar gravador, UX e pipeline existente
**Files:** `index.html`, `attendance-audio-recorder.js`, testes v1/v2, CI.
- [ ] RED para ordem de scripts, remoção M4A, adapter, finalizing, OGG validation, erro, troca de conversa e clique duplo.
- [ ] Carregar adapter antes do gravador; vendor pesado lazy.
- [ ] Fluxo: microfone → resolver OGG → gravar → finalizar → validar → `.ogg` → preview.
- [ ] Estados: permission, recording, `Preparando áudio OGG/Opus…`, ready nativo/compatibilidade, error explícito.
- [ ] Preservar `aria-live`, timer, preview, `attendance:send-recorded-audio` e idempotência em `attendance-media-send.js`.
- [ ] Regressão completa GREEN e commit `feat(audio): gravar OGG Opus compatível no Atendimento`.

### Task 4: CI, segurança, tamanho e rollback
**Files:** workflow, guard de segurança, handoff.
- [ ] Guard: same-origin, pin, sem CDN/Graph/segredos/M4A automático, teto de bundle real +5%, Anexar/Biblioteca preservados.
- [ ] `WhatsApp Meta Central CI` e `attendance-papoai-send-ci` GREEN no mesmo HEAD.
- [ ] Diff limitado a Atendimento/vendor/testes/CI/docs; zero migration/checkout/pedidos/estoque/Bling.
- [ ] Atualizar handoff com PR/SHA, OGG, hashes, live OFF/canário ON e failures M4A históricos.
- [ ] Commit `test(audio): endurecer gravador OGG Opus`.

### Task 5: Homologação bilateral Task 9B
- [ ] Baseline live OFF, canário ON, allowlist 0975↔1018, fila limpa.
- [ ] Canário 0975→1018: UI OGG/Opus, enviar uma vez.
- [ ] Validar provider Meta, audio/ogg, WAMID, status não failed, dedupe zero, fila limpa.
- [ ] Repetir 1018→0975.
- [ ] Readiness bilateral áudio>0; live continua OFF.
- [ ] Registrar #630/#649/handoff e só então fechar 9B.

## Self-review result
- Cobertura da especificação: completa.
- Interfaces consistentes entre Tasks 2 e 3.
- Cinco riscos prioritários têm testes explícitos.
- Rollback sem schema/backend novo.
- `opus-media-recorder` 0.8.0 é pinado, Worker/WASM same-origin e sem CDN.
