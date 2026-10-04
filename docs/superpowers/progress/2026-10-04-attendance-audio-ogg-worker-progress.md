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
Ruling: substituir `opus-media-recorder@0.8.0`/WASM pelo WebCodecs nativo do Chromium/Edge para codificar Opus, mantendo um AudioWorklet same-origin para PCM e um muxer Ogg pequeno/auditável em JavaScript. O caminho preferencial continua sendo `MediaRecorder` nativo quando `audio/ogg;codecs=opus` existir; o fallback passa a ser `AudioEncoder.isConfigSupported({codec:'opus', sampleRate:48000, numberOfChannels:1, bitrate:64000, opus:{format:'ogg', signal:'voice', application:'voip', frameDuration:20000}})`. Se WebCodecs/AudioWorklet/configuração Opus não estiver disponível, falhar fechado e oferecer Anexar. Nunca cair para M4A/fMP4.

Evidência: a especificação WebCodecs Opus atual (W3C, 2026) define `OpusEncoderConfig.format = 'opus'|'ogg'`, `signal='voice'`, `application='voip'` e `frameDuration`; MDN/BCD registram `AudioEncoder` no Chrome 119+ e Opus encoding no Chrome/Edge 110+. O operador usa Edge/Chromium moderno. O formato `ogg` entrega pacotes de áudio Opus e metadata `decoderConfig.description` com o Identification Header; o adapter monta `OpusTags` e páginas Ogg conforme RFC 7845, valida `OggS` + `OpusHead` antes de liberar envio.

Motivo: o binário WASM exato foi adquirido e validado, mas o harness não oferece um canal seguro de escrita binária local→Git; a tentativa de workflow `contents: write` foi bloqueada pelas proteções da plataforma. WebCodecs elimina 300 KB de vendor, licença/WASM, CDN e risco de cadeia de suprimentos, mantendo processamento 100% local. Custo se errado: navegadores sem WebCodecs Opus não gravam pelo fallback; o comportamento é fail-closed e o botão Anexar permanece disponível.

### 2026-10-04 — tentativas de vendor/WASM (superseded)
RED do vendor foi testemunhado no CI: todos os contratos anteriores passaram e somente `Audio vendor contract` falhou pela ausência deliberada do vendor. O workflow read-only confirmou os bytes do pacote npm `opus-media-recorder@0.8.0`: JS principal 22.121 bytes (`bcb406a8…b3d7e`), worker 44.115 (`084c3fe2…b241b`), WASM 225.576 (`0329f6f1…95f4`) e licença 9.089 (`d2ce51ad…bd29`). Foram testados artifact read-only, blob cross-repo, partes binárias e bootstrap; nenhum artefato incompleto foi referenciado na árvore. Essa linha de implementação foi abandonada antes de produção e será removida do PR.
