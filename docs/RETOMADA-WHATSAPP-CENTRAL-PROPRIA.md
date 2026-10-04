# RETOMADA — Central WhatsApp Própria via Meta Cloud API

**Checkpoint canônico:** 2026-10-04 (Cuiabá)  
**Main auditada antes deste handoff:** `81803ac8d1c8d3e3424063c0e6c786a31ea80e2d`  
**Supabase canônico:** `ssbesxgaijknwsjbsbcz`  
**Issue mestre:** #630  
**Task mídia:** #649

> Este arquivo é o ponto de retomada obrigatório. Antes de programar, ler os comentários mais recentes de #630/#649, conferir a `main` corrente e auditar PRs/commits posteriores. Trabalho paralelo no Admin é frequente; nunca assumir que este SHA continua sendo o HEAD.

## Estado executivo

- Tasks 0–8: concluídas/homologadas conforme #630.
- Task 9A — inbound mídia Meta: concluída/homologada.
- **Task 9B — outbound áudio Meta: CONCLUÍDA/HOMOLOGADA bilateralmente em 2026-10-04.**
- Imagem e documento outbound Meta já possuíam evidência anterior.
- Task 10 — Humano × IA: implementada com gates fail-closed; revisar estado atual antes de qualquer promoção.
- Task 11 — ANA própria: preview/dry-run implementado; próximo gate é homologação funcional autenticada sem outbound automático.
- `ana_enabled=false`.
- `campaigns_enabled=false`.
- PapoAI permanece sombra/fallback; não remover antes dos gates finais.

## Runtime canônico auditado em 2026-10-04

Canais:

```text
dona-antonia-0975 = +5565998150975
dona-antonia-1018 = +5565984491018
```

Nos dois canais:

```text
inbound_provider = papoai
outbound_provider = meta
capture_enabled = true
send_enabled = true
human_send_enabled = true
ana_enabled = false
campaigns_enabled = false
meta_media_live_enabled = false
meta_media_canary_enabled = true
```

Allowlist de canário permanece estrita 0975↔1018.

Observação importante sobre imagem:
- 0975 possui `meta_image_live_enabled=true` por gate independente e específico de imagem;
- 1018 possui `meta_image_live_enabled=false`;
- isso **não** significa mídia global live: `meta_media_live_enabled=false` continua nos dois canais;
- áudio e documento permanecem sob gate de mídia/canário.

## PR #733 — solução final do gravador OGG/Opus

PR #733 foi mergeado.

- merge commit: `c75d45ae2448ce459bbaaa13ae735ee7d8babe2b`
- head final: `2814d37eee0b9d9598dedf4aa8bef8b303f4b853`

Arquitetura final:
- usa OGG/Opus nativo via `MediaRecorder` quando disponível;
- fallback próprio com `AudioWorklet` + `WebCodecs AudioEncoder` em Opus;
- PCM mono 48 kHz;
- ~64 kbps;
- frames de 20 ms;
- mux Ogg local com `OpusHead`, `OpusTags`, CRC, BOS/EOS e granule position;
- valida OGG antes de preview/envio;
- sem CDN, sem WASM externo, sem fallback M4A;
- erro fecha em fail-closed e preserva opção de anexar mídia manualmente;
- pipeline Meta server-side, canário, idempotência, WAMID e status preservados.

Evidência de TDD/CI do PR:
- RED WebCodecs;
- GREEN funcional;
- RED mux Ogg;
- GREEN mux Ogg;
- correção adicional de cleanup em `WebCodecsOggSession.stop()` via `try/finally`;
- `WhatsApp Meta Central CI` e `attendance-papoai-send-ci` verdes antes do merge.

O HTML ainda pode usar versão antiga no query string do módulo do gravador. Em navegador com cache persistente, `Ctrl+F5` continua sendo uma precaução operacional válida até um cache-bust explícito futuro.

## Task 9B — evidência real bilateral FECHADA

### 0975 → 1018

```text
canonical_message_id = e8e8d994-b9c2-4666-9012-3520d5bc715c
provider_message_id = wamid.HBgMNTU2NTg0NDkxMDE4FQIAERgUQ0U4NTgxOTA3M0Y3Q0FCMzFCNEIA
mime_type = audio/ogg
filename = audio-atendimento-2026-10-04T18-01-49-443Z.ogg
provider_media_id = 1808295133645476
destination = +5565984491018
status observado = delivered
outbox = sent
attempt_count = 1
last_error = NULL
meta_media_mode = canary
meta_media_canary = true
meta_media_live = false
```

Validações:
- WAMID único;
- sem duplicação;
- fila problemática de áudio = 0;
- readiness do 0975 passou a `ready=true`.

### 1018 → 0975

```text
canonical_message_id = c82d2e29-1049-469b-992d-359e5c47daa2
provider_message_id = wamid.HBgMNTU2NTk4MTUwOTc1FQIAERgUQ0U4ODU3NThDRjk2QjdDMEU3MzEA
mime_type = audio/ogg
filename = audio-atendimento-2026-10-04T18-13-20-807Z.ogg
provider_media_id = 28595536886734917
destination = +5565998150975
status observado = delivered
outbox = sent
attempt_count = 1
last_error = NULL
```

Validações:
- WAMID único;
- sem duplicação;
- fila problemática de áudio = 0.

### Readiness após homologação

0975:

```text
ready = true
audio = 1
image = 11
document = 1
duplicate_wamid = 0
unhealthy_queue_24h = 0
```

1018:

```text
ready = false
audio = 2
image = 0
document = 2
duplicate_wamid = 0
unhealthy_queue_24h = 0
```

O `ready=false` do 1018 ocorre porque falta evidência de **imagem** no canal (`image=0`). Isso não invalida a Task 9B de áudio, que está bilateralmente homologada. Não promover mídia global por causa disso.

## Backend/runtime conhecido

Na auditoria que precedeu a homologação:
- `admin-whatsapp-ops-v1` estava ACTIVE, versão 28, `verify_jwt=false` na camada da plataforma porque a função possui autenticação Admin própria;
- `admin-whatsapp-ana-preview-v1` estava ACTIVE, versão 6, `verify_jwt=true`;
- não alterar essas decisões de autenticação sem revisar o contrato atual.

Como a `main` recebe trabalho paralelo, revalidar versão e SHA das Edge Functions antes de qualquer mudança.

## Task 10/11 — próxima frente

Após o fechamento da Task 9B, a próxima frente é retomar Task 10/11 sem promover automação para clientes reais.

### Gate funcional da ANA

Próximo teste esperado:
1. ler checkpoints mais recentes de #630;
2. auditar PRs/commits mais novos relacionados a Atendimento/ANA;
3. confirmar runtime do `admin-whatsapp-ana-preview-v1`;
4. executar **preview ANA autenticado** no Admin em conversa controlada;
5. comprovar ciclo `start/claim → OpenAI → completed/observability`;
6. revisar decisão, confiança, contexto ausente, modelo, latência e tratamento de erro;
7. garantir que `dry_run=true` / `dry_run_not_sendable=true` continuem impedindo qualquer outbound automático;
8. manter `ana_enabled=false` até homologação explícita.

Não contornar autenticação do Admin para concluir esse gate. Se a etapa depender de interação humana autenticada, registrar checkpoint e pedir apenas a ação mínima necessária ao usuário.

## Decisão de promoção de mídia

**Não promover `meta_media_live_enabled` neste checkpoint.**

Motivos:
- Task 9B de áudio está concluída, mas o readiness geral do 1018 ainda não está completo por `image=0`;
- promoção global não é necessária para continuar Task 10/11;
- manter rollout reversível e limitado.

## Próxima ação exata para retomada

1. ler #630 e #649 mais recentes;
2. confirmar `main` atual e PRs/commits posteriores a este handoff;
3. auditar runtime Supabase antes de programar;
4. considerar Task 9B de áudio encerrada — não repetir canário sem motivo novo;
5. não ativar mídia global;
6. retomar o gate funcional autenticado da ANA / Task 10/11;
7. trabalhar em branch/PR isolado com TDD quando houver alteração de código;
8. CI verde e revisão antes de merge;
9. salvar checkpoint em #630 ao fim de cada rodada;
10. retirada do PapoAI somente no final, reversível e após gates explícitos.

## Invariantes de segurança

- branch/PR isolado; nunca programar diretamente em `main`;
- TDD RED→GREEN para mudança funcional;
- CI verde antes do merge;
- WAMID é identidade externa canônica;
- timeout/estado incerto nunca recebe retry cego;
- canários 0975↔1018 permanecem restritos;
- `meta_media_live_enabled=false` até promoção explícita;
- ANA e campanhas permanecem desligadas até gate explícito;
- preview ANA não pode virar outbound automático por acidente;
- não tocar checkout, pedidos, estoque ou Bling fora do escopo;
- somente APIs oficiais Meta/OpenAI;
- checkpoint obrigatório em #630 e, para mídia, #649.
