# Design — Gravador OGG/Opus local para a Central de Atendimento

**Data:** 2026-10-04  
**Projeto:** Dona Antônia — Central de Atendimento WhatsApp própria  
**Escopo:** Task 9B — áudio outbound pelo Admin  
**Estado:** especificação aprovada pelo usuário; refinada durante execução após pesquisa do Chromium/WebCodecs; plano em `docs/superpowers/plans/2026-10-04-attendance-audio-ogg-worker.md`

## 1. Contexto e evidência

O gravador anterior usava `MediaRecorder` nativo. No Edge/Chrome do operador, `MediaRecorder.isTypeSupported()` não oferece OGG/Opus nem AAC para gravação; a seleção caía no fallback MP4/AAC e gerava `.m4a`/fMP4.

Dois canários reais 0975 → 1018 chegaram à Meta, receberam `provider_media_id` e WAMID, mas o webhook final marcou as mensagens como `failed`, incluindo erro Meta 131053. Portanto, aceitação inicial/WAMID não conta como homologação.

O WhatsApp Cloud API aceita áudio OGG somente com codec Opus. O backend atual da Central já aceita `audio/ogg`, preserva o mesmo outbox, idempotência, canário e observação de status.

Durante a execução foi validado que o Chromium/Edge atual oferece WebCodecs `AudioEncoder` para Opus, mas rejeita `OpusEncoderConfig.format='ogg'`. Assim, o fallback usa **pacotes Opus crus (`format='opus'`) + mux Ogg local em JavaScript**, sem WASM, CDN ou serviço externo.

## 2. Objetivo
Permitir que o operador grave voz dentro do Atendimento e produza um arquivo **OGG/Opus determinístico**, inteiramente no navegador, antes de reutilizar o pipeline `send_media` existente.

Critérios de sucesso:
- gravação funciona no Edge/Chrome atual mesmo quando `MediaRecorder` nativo não oferece `audio/ogg`;
- arquivo final é `audio/ogg`, container Ogg válido e codec Opus;
- nenhuma conversão ocorre em serviço externo;
- envio continua passando por `admin-whatsapp-ops-v1`, outbox, canário, idempotência, WAMID e status canônico;
- falha no encoder local nunca faz fallback silencioso para M4A/fMP4;
- mídia live continua OFF até readiness server-side ficar verde.

## 3. Não objetivos
- não liberar mídia fora do canário 0975↔1018;
- não ativar `meta_media_live_enabled`;
- não ligar ANA/campanhas;
- não alterar checkout/pedidos/estoque/Bling;
- não criar transcodificação no Supabase;
- não usar CDN/API externa de mídia;
- não substituir o pipeline Meta existente;
- não homologar apenas por WAMID inicial.

## 4. Decisão arquitetural

### 4.1 Caminho nativo
Usar `MediaRecorder` somente quando `audio/ogg;codecs=opus` ou `audio/ogg` for realmente suportado.

### 4.2 Caminho WebCodecs
Quando OGG nativo não existir:
1. capturar PCM mono por `AudioWorklet` same-origin;
2. manter `AudioContext` em 48 kHz;
3. agrupar PCM em frames de 20 ms (960 amostras);
4. codificar com `AudioEncoder(codec='opus', format='opus', signal='voice', application='voip', frameDuration=20000)` a ~64 kbps;
5. encapsular os pacotes Opus em páginas Ogg locais com `OpusHead`, `OpusTags`, granule position, BOS/EOS e CRC;
6. validar `OggS` + `OpusHead` + `OpusTags` antes de criar o `File` enviável.

### 4.3 Por que não Worker/WASM
O desenho inicialmente aprovado previa `opus-media-recorder` 0.8.0 + Worker/WASM. Os bytes do pacote foram validados em CI, mas o harness disponível não oferece transporte binário seguro local→Git e a plataforma bloqueou a alternativa temporária com `contents: write`. A pesquisa de compatibilidade mostrou que WebCodecs nativo elimina essa dependência e reduz superfície de supply chain. O objetivo e os gates originais permanecem os mesmos.

## 5. Dependência e distribuição
- zero dependência de áudio de terceiros em runtime;
- zero CDN;
- `attendance-audio-webcodecs-adapter.js` e `attendance-audio-pcm-worklet.js` são same-origin;
- nenhuma biblioteca WASM/vendor é necessária;
- módulos carregados somente pelo fluxo do gravador.

## 6. Ogg/Opus
- `OpusHead` versão 1, mono, 48 kHz, mapping family 0;
- pre-skip 312 samples;
- `OpusTags` com vendor local e zero comentários;
- páginas Ogg com serial lógico único, sequência monotônica e CRC polynomial `0x04C11DB7`;
- header pages com granule zero;
- páginas de áudio em unidades de 48 kHz;
- EOS usa a duração PCM real para cortar eventual padding do último frame.

## 7. Fluxo
Selecionar conversa → Gravar áudio → pedir microfone → tentar OGG nativo → fallback WebCodecs → capturar PCM → codificar Opus → mux Ogg → validar bytes → criar `File .ogg` → preview → `attendance:send-recorded-audio` → pipeline atual → status canônico.

## 8. UX
Estados: idle, permission, preparing, recording, finalizing, ready, sending, error_permission, error_encoder, cancelled. Preservar `aria-live`, teclado, timer e envio bloqueado até OGG validado. A UI informa `OGG/Opus nativo` ou `OGG/Opus compatibilidade`.

## 9. Segurança/privacidade
Áudio permanece local até o clique em enviar; worklet e adapter same-origin; sem segredos; destino validado server-side; canário estrito; live OFF; sem sockets/fetch terceiros; limpar streams, AudioContext, encoder e ObjectURLs.

## 10. Fallback
1. OGG/Opus nativo;
2. OGG/Opus via WebCodecs + mux local;
3. erro explícito + **Anexar**.

Sem fallback automático AAC/M4A/fMP4.

## 11. Performance
- WebCodecs usa encoder nativo do navegador;
- AudioWorklet evita processamento pesado no compositor da UI;
- mono 48 kHz / ~64 kbps / frames de 20 ms;
- sem SharedArrayBuffer, COOP/COEP ou binário WASM.

## 12. Observabilidade
Evento ready inclui `container='ogg'`, `codec='opus'`, `encoder='native|webcodecs'` e MIME `audio/ogg`. Evidência final permanece provider Meta + áudio + WAMID + status não failed + MIME OGG + zero duplicação + fila limpa.

## 13. TDD
Cobrir caminho nativo, fallback WebCodecs, ausência de rede/CDN/M4A automático, OggS/OpusHead/OpusTags, CRC, granule position, fail-closed, troca de conversa, pipeline existente, sintaxe e guard de segredos. Captura real fica para canário autenticado.

## 14. Rollback
Sem migration. Reverter gravador/adapter/worklet; manter backend/pipeline, live OFF e Anexar/Biblioteca.

## 15. Alternativas rejeitadas
- WebM→OGG: mais complexo e exige remux/transcode extra.
- Servidor: custo, latência e privacidade desnecessários.
- Ajuste MIME M4A: dois failures reais provaram insuficiência.
- Worker/WASM externo: viável tecnicamente, mas inferior a WebCodecs nativo neste browser/harness e adiciona supply chain/binário.

## 16. Arquivos previstos
- `attendance-audio-recorder.js`
- `attendance-audio-webcodecs-adapter.js`
- `attendance-audio-pcm-worklet.js`
- testes/CI/handoff.

## 17. Critério de conclusão
OGG/Opus válido no Edge/Chrome usado pelo operador, canários válidos nos dois sentidos, WAMID/status canônico, zero WAMID duplicado, fila limpa, readiness bilateral e live ainda OFF.
