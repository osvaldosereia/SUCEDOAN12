# Attendance Audio OGG/Opus WebCodecs Implementation Plan

> **Execution mode:** Native / `superpowers:executing-plans`. O plano original foi aprovado com Worker/WASM; a execução foi refinada para WebCodecs nativo após pesquisa e REDs documentados no ledger. O objetivo, UX, pipeline e gates não mudaram.

**Goal:** Fazer o gravador da Central produzir OGG/Opus válido no Edge/Chrome atual, inteiramente no navegador, e reutilizar o pipeline Meta existente sem fallback automático para M4A/fMP4.

**Architecture:** O gravador tenta `MediaRecorder` nativo somente quando `audio/ogg;codecs=opus`/`audio/ogg` são suportados. Caso contrário, `attendance-audio-webcodecs-adapter.js` usa `AudioWorklet` para PCM mono 48 kHz, `AudioEncoder(codec='opus', format='opus')` para frames de 20 ms e um muxer Ogg local para `OpusHead`, `OpusTags`, CRC e granule position. O arquivo final é validado antes do evento `attendance:recorded-audio-ready`; envio, canário, idempotência, WAMID e status continuam no pipeline atual.

**Tech Stack:** HTML/JavaScript estático, AudioWorklet, WebCodecs AudioEncoder/AudioData, Ogg mux local, Node.js `assert`, GitHub Actions, pipeline Supabase/Meta existente.

**Spec:** `docs/superpowers/specs/2026-10-04-attendance-audio-ogg-worker-design.md`

## Global Constraints
- Processamento de áudio 100% local antes do clique em **Enviar áudio**.
- Não usar CDN/runtime externo, WASM ou serviço de transcodificação.
- Caminho preferencial: OGG/Opus nativo; fallback: WebCodecs Opus + Ogg local; último estado: erro explícito + **Anexar**.
- Não produzir nem enviar AAC/M4A/fMP4 automaticamente pelo gravador.
- Resultado enviável: `File` `.ogg`, `type='audio/ogg'`, `OggS`, `OpusHead` e `OpusTags` válidos.
- Nenhum token Meta, WABA, `phone_number_id`, `service_role` ou segredo novo no browser.
- `meta_media_live_enabled=false` durante desenvolvimento e homologação.
- Canário de mídia restrito a 0975↔1018.
- ANA e campanhas desligadas.
- Não alterar checkout, pedidos, estoque ou Bling.
- Não criar migration nem serviço novo no Supabase.

## Review Focus
- WebCodecs/AudioWorklet indisponível: UI falha explicitamente e mantém envio desabilitado.
- Bytes OGG inválidos: não habilitar envio.
- CRC, BOS/EOS, granule position e pre-skip consistentes com RFC 7845.
- Troca de conversa durante gravação/finalização: descartar resultado e limpar recursos.
- Clique duplo em Enviar áudio: preservar idempotência do pipeline existente.
- Browser com OGG nativo: não instanciar WebCodecs fallback.
- Nenhuma regressão em Anexar/Biblioteca/M4A manual.

---

### Task 1: Contrato e decisão de encoder local
**Files:** spec/plan/ledger, testes, CI.
- [x] Reproduzir M4A/fMP4 failed na Meta e manter 9B aberta.
- [x] Teste RED original do vendor/WASM e validação dos bytes pinados.
- [x] Pesquisar WebCodecs atual e registrar ruling de pivot.
- [x] Remover workflow/teste experimental de vendor antes da integração final.
- [x] RED específico `Audio WebCodecs OGG contract` com todos os contratos anteriores verdes.

### Task 2: Adapter WebCodecs + Ogg mux
**Files:** `attendance-audio-webcodecs-adapter.js`, `attendance-audio-pcm-worklet.js`, testes, CI.
**Interface:** `AttendanceOggRecorder.resolve`, `isValidOggOpus`, `dispose`.
- [x] AudioWorklet same-origin para PCM mono.
- [x] `AudioEncoder.isConfigSupported` + Opus raw, 48 kHz, 64 kbps, voice/voip, frame 20 ms.
- [x] Ogg mux com `OpusHead`, `OpusTags`, pre-skip, CRC, BOS/EOS e granule position.
- [x] `isValidOggOpus` antes de liberar arquivo.
- [x] GREEN do contrato estático + sintaxe.
- [ ] GREEN do teste comportamental independente de Ogg/CRC/granule no HEAD final.

### Task 3: Integrar gravador, UX e pipeline existente
**Files:** `attendance-audio-recorder.js`, testes, CI.
- [x] OGG nativo como caminho preferencial.
- [x] Fallback WebCodecs somente quando OGG nativo não existe.
- [x] Remover fallback automático AAC/MP4/M4A.
- [x] Estados `Preparando áudio OGG/Opus…`, recording, ready nativo/compatibilidade e erro explícito.
- [x] `.ogg` + `audio/ogg` + validação antes do preview/envio.
- [x] Preservar `aria-live`, timer, preview, conversa vinculada e eventos de envio existentes.
- [x] Manter M4A apenas como anexo manual no composer, não como saída do gravador.

### Task 4: Hardening, documentação, CI e sincronização
- [ ] Atualizar cache-bust do gravador para `audio-webcodecs-v1`.
- [x] Sintaxe de recorder/adapter/worklet no Meta CI.
- [ ] Guard final: sem CDN/Graph/segredos/AAC-M4A automático; Anexar/Biblioteca preservados.
- [ ] `WhatsApp Meta Central CI` e `attendance-papoai-send-ci` GREEN no mesmo HEAD.
- [ ] Sincronizar com `main` atual sem trazer regressões/arquivos fora do escopo.
- [ ] Diff final limitado a Atendimento/testes/CI/docs; zero migration/checkout/pedidos/estoque/Bling.
- [ ] Atualizar handoff/checkpoints #630/#649.
- [ ] Final review do branch conforme Superpowers.

### Task 5: Homologação bilateral Task 9B
- [ ] Baseline live OFF, canário ON, allowlist 0975↔1018, fila limpa.
- [ ] Canário 0975→1018: UI mostra OGG/Opus e enviar uma vez.
- [ ] Validar provider Meta, `audio/ogg`, WAMID, status não `failed`, dedupe zero e fila limpa.
- [ ] Repetir 1018→0975.
- [ ] Readiness bilateral áudio > 0; live continua OFF.
- [ ] Registrar #630/#649/handoff e só então fechar 9B.

## Execution status
Tasks 1 e 3 concluídas no branch. Task 2 está no último GREEN comportamental. Task 4 segue em seguida. Task 5 depende de canário humano autenticado e nunca será fabricada por bypass de JWT/session.
