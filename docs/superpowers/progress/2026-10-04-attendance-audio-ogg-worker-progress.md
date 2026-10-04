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

### 2026-10-04 — checkpoint/bloqueio de transporte binário no harness
RED foi testemunhado novamente no HEAD `70cca6905687ceb9de6d0286a979143f4344df05`: todos os contratos anteriores até `Audio recorder contract` passaram e somente `Audio vendor contract` falhou por ausência deliberada do vendor. O workflow auxiliar read-only empacotou `opus-media-recorder@0.8.0` com sucesso e produziu o artifact exato.

Bytes verificados do pacote npm:
- `OpusMediaRecorder.umd.js`: 22.121 bytes, SHA-256 `bcb406a8ed33ae1a2a1236707573efab3b62083823072187738ca8c46ffb3d7e`.
- `encoderWorker.umd.js`: 44.115 bytes, SHA-256 `084c3fe284f45fb35e37652563fd8c72bb7b089c27e2acb72ab46d98008b241b`.
- `OggOpusEncoder.wasm`: 225.576 bytes, SHA-256 `0329f6f157cda633f1a0c2cd021beecb23dc37f1dbc3f91b7eb64e03e7fb95f4`, magic bytes `00 61 73 6d`.
- `LICENSE.md`: 9.089 bytes, SHA-256 `d2ce51ad73cb4c65926d8e0c30e90f29725f42d67a315036a4156233ffe1bd29`.

Foram testadas sem mover a branch: escrita por caminho local, referência de arquivo montado, blob cross-repo e transferência manual base64. O conector não possui argumento de arquivo/binário e a transferência manual de conteúdo opaco não preservou SHA; os blobs órfãos de teste nunca foram referenciados. Não será usado workflow com `contents: write`, push autoeditável, CDN em runtime nem binário sem hash.

Também foi investigada a alternativa de submódulo público. O commit oficial upstream `daddd0aa5934ac955e05a2d0c599aab9b73454de` é o bump para `v0.8.0`, mas sua árvore não contém `OpusMediaRecorder.umd.js`, `encoderWorker.umd.js` nem `OggOpusEncoder.wasm`; esses outputs são gerados para o pacote npm. Busca binária pública encontrou um demo antigo com WASM de 370.474 bytes (não compatível com o artifact pinado) e uma entrada indexada que é apenas symlink/caminho local. Assim, não há fonte Git pública comprovada que possa ser pinada como submódulo mantendo os bytes exatos do pacote npm `0.8.0`.

**Bloqueio atual:** Task 1 precisa apenas de um canal de escrita Git que aceite os bytes exatos do artifact já adquirido/validado (por exemplo, checkout Git/Codex com filesystem e push normal). Até isso existir, o PR permanece draft/RED de propósito e nenhuma mudança de produção é feita. Task 2 não deve começar antes do vendor GREEN.
