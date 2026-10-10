# Task 9B — checkpoint pós-merge WebCodecs

Data: 2026-10-04

## Código integrado
- PR #733 mergeado na `main` em `c75d45ae2448ce459bbaaa13ae735ee7d8babe2b`.
- Head verificado do PR: `2814d37eee0b9d9598dedf4aa8bef8b303f4b853`.
- `WhatsApp Meta Central CI` run 408: GREEN.
- `attendance-papoai-send-ci` run 426: GREEN.
- Arquitetura final: OGG/Opus nativo quando disponível; fallback WebCodecs Opus + AudioWorklet + mux Ogg local em JavaScript; sem CDN, WASM ou serviço externo; sem fallback automático M4A/fMP4.

## Runtime verificado
- 0975 e 1018: `outbound_provider=meta`.
- `meta_media_live_enabled=false` nos dois canais.
- `meta_media_canary_enabled=true` nos dois canais.
- allowlist permanece estrita 0975↔1018 via `meta_media_canary_to_e164`.
- `ana_enabled=false` e `campaigns_enabled=false` nos dois canais.
- Baseline outbound áudio Meta ainda contém apenas os dois testes históricos M4A/fMP4, ambos `status_current=failed`.
- Nenhum canário OGG/Opus novo foi disparado neste checkpoint.

## Gate pendente
Executar canário humano autenticado no Admin após Ctrl+F5:
1. 0975 → 1018, confirmar UI `OGG/Opus`, enviar uma vez.
2. Validar `provider=meta`, `mime_type=audio/ogg`, WAMID, status final diferente de `failed`, zero duplicação e fila limpa.
3. Repetir 1018 → 0975.
4. Só então fechar Task 9B. Mídia live permanece OFF mesmo após homologação até decisão separada de graduação.
