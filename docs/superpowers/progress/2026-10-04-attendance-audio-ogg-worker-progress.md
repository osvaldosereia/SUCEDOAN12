# SDD ledger — plan: docs/superpowers/plans/2026-10-04-attendance-audio-ogg-worker.md

Base inicial: `1e1b875051c7ad10d7c3a13fb959c5a4b9c9123e`
Branch: `feat/attendance-audio-ogg-worker-20261004`

Pre-flight interfaces:
- Task 1 → Task 2: vendor versionado em `vitrine/admin/atendimento/vendor/opus-media-recorder/0.8.0/`; Task 2 consome apenas `OpusMediaRecorder.umd.js`, `encoderWorker.umd.js` e o WASM lógico `OggOpusEncoder.wasm` reconstruído localmente.
- Task 2 → Task 3: `AttendanceOggRecorder.resolve`, `isValidOggOpus`, `dispose`; Task 3 consome exatamente essa superfície.
- Task 3 → Task 4: gravador expõe apenas OGG validado ao pipeline existente; Task 4 verifica segurança/tamanho sem mudar transporte.
- Task 4 → Task 5: CI verde + live OFF + canário ON são pré-condições da homologação bilateral.

Global constraints preservados: sem CDN/runtime externo; sem serviço Supabase novo; sem fallback automático M4A/fMP4; mídia live OFF; canário 0975↔1018; ANA/campanhas OFF; não tocar checkout/pedidos/estoque/Bling.

## Rulings de execução

### 2026-10-04 — WASM em duas partes binárias raw
O conector GitHub desta sessão consegue criar blobs binários apenas quando os bytes são enviados como base64, mas não aceita um arquivo local/mounted diretamente e o campo UTF-8 não preserva bytes arbitrários. Para não introduzir CI com permissão de escrita, CDN, base64 em runtime ou alterar o codec, `OggOpusEncoder.wasm` será armazenado em exatamente duas partes binárias raw de 112.788 bytes cada. O manifesto mantém o SHA-256/tamanho do WASM lógico original (`0329f6f157cda633f1a0c2cd021beecb23dc37f1dbc3f91b7eb64e03e7fb95f4`, 225.576 bytes) e os hashes individuais das partes. O adapter da Task 2 fará `fetch` same-origin das duas partes, concatenará os bytes e criará um Blob URL para o worker. O teste de integridade reconstrói o WASM e continua exigindo magic bytes `00 61 73 6d` e o SHA-256 exato do pacote npm `opus-media-recorder@0.8.0`.

Esse ruling altera apenas o empacotamento físico do binário; versão, bytes, segurança, origem, codec e comportamento funcional do plano permanecem iguais. Não há mudança de schema/backend/deploy.
