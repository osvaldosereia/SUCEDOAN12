# SDD ledger — plan: docs/superpowers/plans/2026-10-04-attendance-audio-ogg-worker.md

Base inicial: `1e1b875051c7ad10d7c3a13fb959c5a4b9c9123e`
Branch: `feat/attendance-audio-ogg-worker-20261004`

Pre-flight interfaces (revisado após pesquisa WebCodecs 2026):
- Task 1 → Task 2: `attendance-audio-webcodecs-adapter.js` expõe `AttendanceOggRecorder.resolve`, `isValidOggOpus`, `dispose`; sem vendor/WASM.
- Task 2 → Task 3: fallback usa WebCodecs `AudioEncoder(codec=opus)` + captura PCM por AudioWorklet e mux Ogg local; Task 3 consome apenas essa superfície.
- Task 3 → Task 4: gravador expõe somente `File .ogg` validado ao pipeline existente; Task 4 verifica segurança/tamanho sem mudar transporte.
- Task 4 → Task 5: CI verde + live OFF + canário ON são pré-condições da homologação bilateral.

Global constraints preservados: sem CDN/runtime externo; sem serviço Supabase novo; sem fallback automático M4A/fMP4; mídia live OFF; canário 0975↔1018; ANA/campanhas OFF; não tocar checkout/pedidos/estoque/Bling.

## Rulings de execução

### 2026-10-04 — pivot de Worker/WASM para WebCodecs nativo
Ruling: substituir `opus-media-recorder@0.8.0`/WASM pelo WebCodecs nativo do Chromium/Edge para codificar Opus, mantendo um AudioWorklet same-origin para PCM e um muxer Ogg pequeno/auditável em JavaScript. O caminho preferencial continua sendo `MediaRecorder` nativo quando `audio/ogg;codecs=opus` existir; o fallback passa a ser `AudioEncoder.isConfigSupported({codec:'opus', sampleRate:48000, numberOfChannels:1, bitrate:64000, opus:{format:'opus', signal:'voice', application:'voip', frameDuration:20000}})`. Se WebCodecs/AudioWorklet/configuração Opus não estiver disponível, falhar fechado e oferecer Anexar. Nunca cair para M4A/fMP4.

Evidência: a especificação WebCodecs Opus atual define `OpusEncoderConfig` e o Chromium atual rejeita `format='ogg'`; por isso o encoder produz pacotes Opus crus e o adapter monta `OpusHead`, `OpusTags` e páginas Ogg conforme RFC 7845. O operador usa Edge/Chromium moderno.

Motivo: o binário WASM exato foi adquirido e validado, mas o harness não oferece um canal seguro de escrita binária local→Git; a tentativa de workflow `contents: write` foi bloqueada pelas proteções da plataforma. WebCodecs elimina ~300 KB de vendor, licença/WASM, CDN e risco de cadeia de suprimentos, mantendo processamento 100% local. Custo se errado: navegadores sem WebCodecs Opus não gravam pelo fallback; o comportamento é fail-closed e o botão Anexar permanece disponível.

### 2026-10-04 — tentativas de vendor/WASM (superseded)
RED do vendor foi testemunhado no CI: todos os contratos anteriores passaram e somente `Audio vendor contract` falhou pela ausência deliberada do vendor. O workflow read-only confirmou os bytes do pacote npm `opus-media-recorder@0.8.0`: JS principal 22.121 bytes (`bcb406a8…b3d7e`), worker 44.115 (`084c3fe2…b241b`), WASM 225.576 (`0329f6f1…95f4`) e licença 9.089 (`d2ce51ad…bd29`). Foram testados artifact read-only, blob cross-repo, partes binárias e bootstrap; nenhum artefato incompleto foi referenciado na árvore. Workflow/teste experimental foram removidos do diff final antes da integração.

## Evidência TDD
- RED WebCodecs: run `37203487589`; contratos anteriores 1–20 GREEN e somente `Audio WebCodecs OGG contract` RED.
- GREEN funcional: run `37204117679`; contratos 1–52 e post-steps GREEN, incluindo recorder, WebCodecs, sintaxe e guard de segredos.
- RED mux comportamental: run `37204266231`; contratos anteriores 1–21 GREEN e somente `Audio Ogg mux behavior` RED por ausência deliberada do export de teste.
- GREEN mux + regressão: run `37204348118`; `WhatsApp Meta Central CI` GREEN. `attendance-papoai-send-ci` run `37204348144` GREEN no mesmo code head.

## Estado da execução
- Task 1: complete — decisão WebCodecs documentada; experimentos WASM removidos.
- Task 2: complete — adapter, AudioWorklet, Ogg mux, CRC/granule e testes GREEN.
- Task 3: complete — gravador só libera OGG/Opus validado; sem AAC/M4A automático; pipeline existente preservado.
- Task 4: em fechamento — cache-bust, sync com main, diff/review/checkpoint final do PR.
- Task 5: pendente de canário autenticado bilateral 0975↔1018 após merge; live permanece OFF até então.
