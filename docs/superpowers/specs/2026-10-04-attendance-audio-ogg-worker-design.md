# Design — Gravador OGG/Opus local para a Central de Atendimento

**Data:** 2026-10-04  
**Projeto:** Dona Antônia — Central de Atendimento WhatsApp própria  
**Escopo:** Task 9B — áudio outbound pelo Admin  
**Estado:** especificação aprovada pelo usuário; plano em `docs/superpowers/plans/2026-10-04-attendance-audio-ogg-worker.md`

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
- nenhum token Meta, WABA, `phone_number_id` ou destino é exposto ao browser além do que já existe;
- envio continua passando por `admin-whatsapp-ops-v1`, outbox, canário, idempotência, WAMID e status canônico;
- falha no encoder local nunca faz fallback silencioso para M4A/fMP4;
- mídia live continua OFF até readiness server-side ficar verde.

## 3. Não objetivos

Este lote não deve:
- liberar mídia para clientes fora do canário 0975↔1018;
- ativar `meta_media_live_enabled`;
- ligar ANA, campanhas ou automações;
- alterar checkout, pedidos, estoque ou Bling;
- criar um serviço de transcodificação no Supabase;
- enviar áudio a CDN, API de terceiros ou serviço externo de mídia;
- substituir o pipeline Meta existente;
- homologar áudio apenas porque recebeu WAMID; o webhook final precisa atingir estado canônico válido.

## 4. Decisão arquitetural

### 4.1 Caminho nativo
Se o navegador suportar `audio/ogg;codecs=opus` nativamente, continuar usando `MediaRecorder` nativo.

### 4.2 Caminho worker/WASM
Quando OGG/Opus nativo não existir, usar um **encoder Opus em Web Worker/WASM, hospedado no próprio domínio**, para produzir OGG/Opus diretamente a partir do stream do microfone.

A implementação recomendada é um adapter isolado sobre `opus-media-recorder` 0.8.0, usando somente os artefatos necessários para Ogg/Opus (`OpusMediaRecorder`, worker e encoder Ogg/Opus/WASM), todos versionados e servidos pelo próprio `donaantonia.com.br`.

Motivos:
- produz `audio/ogg`/Opus diretamente, sem fMP4 intermediário;
- usa Web Worker/WASM e não bloqueia a thread principal durante a codificação;
- mantém a API semelhante a `MediaRecorder`, reduzindo alterações no gravador atual;
- licença MIT no wrapper;
- não exige backend adicional.

### 4.3 O que muda em relação ao desenho inicial WebM → OGG
A especificação usa **codificação OGG/Opus direta no worker**, eliminando demux WebM e uma segunda passagem sobre o áudio, preservando processamento 100% local antes do envio.

## 5. Dependência e distribuição

Não usar CDN em produção.

Artefatos em `vitrine/admin/atendimento/vendor/opus-media-recorder/0.8.0/`:
- versão fixada; nunca `latest`;
- JS/worker/WASM same-origin;
- LICENSE/NOTICE incluídos;
- hash/tamanho cobertos por manifesto/teste;
- carregamento lazy quando OGG nativo não estiver disponível.

## 6. Fluxo detalhado
1. Selecionar conversa.
2. Clicar **Gravar áudio**.
3. Resolver encoder: nativo OGG/Opus ou worker OGG/Opus.
4. Solicitar `getUserMedia({audio:true})`.
5. Gravar ~64 kbps.
6. Ao parar, entrar em `finalizing` enquanto o container é fechado.
7. Resultado deve ser `File .ogg`, `type='audio/ogg'`.
8. Validar tamanho > 0, `OggS` e `OpusHead`.
9. Preview usa o mesmo File final.
10. Enviar dispara `attendance:send-recorded-audio`.
11. `attendance-media-send.js` continua dono do envio.
12. Backend reaplica validação, janela, canário, destino, outbox e idempotência.
13. UI acompanha WAMID/status canônico.

## 7. Estados de UX
- `idle`;
- `requesting_permission`;
- `recording`;
- `finalizing` — “Preparando áudio OGG/Opus…”;
- `ready` — “Áudio pronto (OGG/Opus)”;
- `sending`;
- `error_permission`;
- `error_encoder` — sem fallback M4A;
- `cancelled`.

Preservar `aria-live`, teclado, timer e envio desabilitado até OGG validado.

## 8. Segurança e privacidade
- áudio local até clicar Enviar;
- worker/WASM same-origin;
- sem CDN/runtime externo;
- sem segredos no browser;
- destino derivado de `conversation_id` no servidor;
- canário estrito 0975↔1018;
- live OFF;
- encoder sem sockets/fetch de terceiros;
- liberar streams/workers/ObjectURLs em cancelar/troca/erro/unload.

## 9. Compatibilidade e fallback
1. MediaRecorder nativo OGG/Opus;
2. Worker/WASM OGG/Opus;
3. erro explícito + **Anexar**.

**Não haverá fallback automático para MP4/M4A no gravador.** M4A manual pode permanecer no seletor legado sem contar como homologação.

## 10. Performance
- WASM/worker lazy;
- zero custo no carregamento inicial;
- codificação fora da main thread;
- ~64 kbps;
- sem SharedArrayBuffer/COOP/COEP;
- worker encerrado ou reutilizado controladamente só durante a página.

## 11. Observabilidade
Evento `attendance:recorded-audio-ready` inclui:
- `recording_container: 'ogg'`;
- `recording_codec: 'opus'`;
- `recording_encoder: 'native' | 'worker'`;
- tamanho final.

Evidência Supabase final:
- `provider='meta'`;
- `message_type='audio'`;
- WAMID;
- status não falho;
- MIME `audio/ogg`;
- zero duplicação;
- fila limpa.

## 12. TDD e validação
Cobrir caminho nativo, fallback worker, same-origin, ausência de CDN, ausência de M4A automático, OggS/OpusHead, erro fail-closed, troca de conversa, ausência de Graph no browser, pipeline existente, sintaxe e guard de segredos.

Quando CI não puder capturar áudio real, testar adapter deterministicamente e deixar captura real para canário autenticado.

Gate humano final:
1. Ctrl+F5;
2. 0975→1018 2–5 s;
3. UI mostra OGG/Opus;
4. enviar uma vez;
5. verificar WAMID/status/dedupe/fila;
6. repetir 1018→0975;
7. só então fechar Task 9B.

## 13. Rollback
Sem migration. Reverter gravador/adapter/assets; manter backend e pipeline; live OFF; preservar evidências históricas; Anexar/Biblioteca continuam disponíveis.

## 14. Alternativas consideradas
- WebM→OGG: viável, porém mais complexo.
- Transcodificação servidor: rejeitada por custo/privacidade/runtime.
- Ajustar MIME M4A: rejeitada por dois failures Meta reais.

## 15. Arquivos previstos
- `vitrine/admin/atendimento/attendance-audio-recorder.js`
- `vitrine/admin/atendimento/attendance-audio-ogg-worker-adapter.js`
- `vitrine/admin/atendimento/vendor/opus-media-recorder/0.8.0/*`
- `scripts/test-attendance-audio-recorder-v2.mjs`
- `.github/workflows/whatsapp-meta-central-ci.yml`
- `docs/RETOMADA-WHATSAPP-CENTRAL-PROPRIA.md`

Nenhuma migration esperada.

## 16. Critério de conclusão
- Admin produz OGG/Opus no Edge/Chrome do operador;
- 0975→1018 status canônico válido;
- 1018→0975 status canônico válido;
- zero WAMID duplicado;
- fila limpa;
- readiness reconhece áudio nos dois canais;
- live continua OFF até decisão posterior.
