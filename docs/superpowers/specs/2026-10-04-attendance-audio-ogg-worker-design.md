# Design — Gravador OGG/Opus local para a Central de Atendimento

**Data:** 2026-10-04  
**Projeto:** Dona Antônia — Central de Atendimento WhatsApp própria  
**Escopo:** Task 9B — áudio outbound pelo Admin  
**Estado:** especificação aprovada pelo usuário; plano final em `docs/superpowers/plans/2026-10-04-attendance-audio-ogg-worker.md`

## 1. Contexto e evidência

O gravador atual usa `MediaRecorder` nativo. No Edge/Chrome do operador, `MediaRecorder.isTypeSupported()` não oferece OGG/Opus nem AAC para gravação; a seleção cai no fallback MP4/AAC e gera `.m4a`/fMP4.

Dois canários reais 0975 → 1018 chegaram à Meta, receberam `provider_media_id` e WAMID, mas o webhook final marcou as mensagens como `failed`. O caso mais recente terminou com `message_type=audio`, `provider=meta`, `status_current=failed`, `mime_type=audio/mp4`. Portanto, aceitação inicial/WAMID não conta como homologação.

O WhatsApp Cloud API aceita áudio OGG apenas com codec Opus. O backend atual da Central já aceita `audio/ogg`, preserva o mesmo outbox, idempotência, canário e observação de status.

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
Usar `MediaRecorder` quando `audio/ogg;codecs=opus` for suportado.

### 4.2 Caminho worker/WASM
Caso contrário, usar **encoder Opus em Web Worker/WASM same-origin** para produzir OGG/Opus diretamente do microfone.

Adapter isolado sobre `opus-media-recorder` 0.8.0, usando somente `OpusMediaRecorder`, worker e `OggOpusEncoder.wasm`, versionados e servidos por `donaantonia.com.br`.

### 4.3 Refinamento do desenho inicial
Em vez de WebM→OGG, gerar OGG/Opus diretamente no worker, reduzindo uma etapa e superfície de erro, mantendo processamento 100% local.

## 5. Dependência e distribuição
- sem CDN em produção;
- vendor em `vitrine/admin/atendimento/vendor/opus-media-recorder/0.8.0/`;
- versão fixada;
- JS/worker/WASM same-origin;
- licença incluída;
- hashes/tamanhos em manifesto/teste;
- lazy-load apenas quando OGG nativo não existir.

## 6. Fluxo
Selecionar conversa → Gravar áudio → resolver nativo/worker → pedir microfone → gravar ~64 kbps → finalizar Ogg → validar `OggS`/`OpusHead` → criar `File .ogg` → preview → `attendance:send-recorded-audio` → pipeline atual → status canônico.

## 7. UX
Estados: idle, permission, recording, finalizing, ready, sending, error_permission, error_encoder, cancelled. Preservar `aria-live`, teclado, timer e envio bloqueado até OGG validado.

## 8. Segurança/privacidade
Áudio local até envio; worker/WASM same-origin; sem segredos; destino server-side; canário estrito; live OFF; sem sockets/fetch terceiros; limpar streams/workers/ObjectURLs.

## 9. Fallback
1. OGG/Opus nativo;
2. OGG/Opus Worker/WASM;
3. erro explícito + Anexar.

Sem fallback automático M4A/fMP4.

## 10. Performance
Lazy-load, worker fora da main thread, ~64 kbps, sem SharedArrayBuffer/COOP/COEP.

## 11. Observabilidade
Evento ready inclui container `ogg`, codec `opus`, encoder `native|worker`, tamanho. Evidência final permanece provider Meta + áudio + WAMID + status não failed + MIME OGG + zero duplicação + fila limpa.

## 12. TDD
Cobrir caminho nativo, fallback worker, same-origin, ausência de CDN/M4A automático, OggS/OpusHead, falha fail-closed, troca de conversa, pipeline existente, sintaxe e guard de segredos. Captura real fica para canário autenticado.

## 13. Rollback
Sem migration. Reverter gravador/adapter/vendor; manter backend/pipeline, live OFF e Anexar/Biblioteca.

## 14. Alternativas rejeitadas
WebM→OGG: mais complexo. Servidor: custo/privacidade. Ajuste MIME M4A: dois failures reais provaram insuficiência.

## 15. Arquivos previstos
- `attendance-audio-recorder.js`
- `attendance-audio-ogg-worker-adapter.js`
- `vendor/opus-media-recorder/0.8.0/*`
- testes/CI/handoff.

## 16. Critério de conclusão
OGG/Opus no Edge/Chrome usado pelo operador, canários válidos nos dois sentidos, zero WAMID duplicado, fila limpa, readiness bilateral e live ainda OFF.
