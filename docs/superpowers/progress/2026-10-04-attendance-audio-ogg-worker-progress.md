# SDD ledger — plan: docs/superpowers/plans/2026-10-04-attendance-audio-ogg-worker.md

Base inicial: `1e1b875051c7ad10d7c3a13fb959c5a4b9c9123e`
Branch: `feat/attendance-audio-ogg-worker-20261004`

Pre-flight interfaces:
- Task 1 → Task 2: vendor versionado em `vitrine/admin/atendimento/vendor/opus-media-recorder/0.8.0/`; Task 2 consome apenas `OpusMediaRecorder.umd.js`, `encoderWorker.umd.js` e `OggOpusEncoder.wasm`.
- Task 2 → Task 3: `AttendanceOggRecorder.resolve`, `isValidOggOpus`, `dispose`; Task 3 consome exatamente essa superfície.
- Task 3 → Task 4: gravador expõe apenas OGG validado ao pipeline existente; Task 4 verifica segurança/tamanho sem mudar transporte.
- Task 4 → Task 5: CI verde + live OFF + canário ON são pré-condições da homologação bilateral.

Global constraints preservados: sem CDN/runtime externo; sem serviço Supabase novo; sem fallback automático M4A/fMP4; mídia live OFF; canário 0975↔1018; ANA/campanhas OFF; não tocar checkout/pedidos/estoque/Bling.
