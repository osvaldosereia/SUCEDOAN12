# RETOMADA — Central WhatsApp Própria via Meta Cloud API

**Checkpoint canônico:** 2026-10-03/04 (Cuiabá)  
**Main confirmada:** `d4f6816e7c4727a2605d6115f1e87722075480e8`  
**Supabase canônico:** `ssbesxgaijknwsjbsbcz`  
**Issue mestre:** #630  
**Task mídia:** #649

> Este arquivo é o ponto de retomada obrigatório. Antes de programar, ler os comentários mais recentes de #630/#649 e auditar PRs/branches abertos, principalmente trabalho paralelo de Atendimento.

## Estado executivo

- Tasks 0–8: concluídas/homologadas conforme #630.
- Task 9A — inbound mídia Meta: concluída/homologada.
- Task 9B — outbound mídia Meta: imagem/PDF comprovados; gravador de áudio e envio direto implementados; correção de MIME M4A concluída; falta somente o canário real de áudio pelo Admin com evidência WAMID/status/dedupe/fila limpa.
- Task 10 — Humano × IA: implementada e fail-closed.
- Task 11 — ANA própria: preview/dry-run implementado; recovery de claim stale aplicado; `ana_enabled=false`.
- Marketing/campanhas: `campaigns_enabled=false`.
- PapoAI: permanece sombra/fallback; não remover antes dos gates finais.

## Runtime canônico conhecido

Nos canais `dona-antonia-0975` e `dona-antonia-1018`:

```text
inbound_provider = papoai
outbound_provider = meta
capture_enabled = true
send_enabled = true
human_send_enabled = true
ana_enabled = false
campaigns_enabled = false
```

Canários permanecem restritos a 0975↔1018. Não ampliar para clientes reais durante homologação.

## Merges relevantes mais recentes

### PR #686 — observabilidade de mídia

Merge `405f1c0f11371ddb17c97fcd5229af9b99b8bbb7`.

- WAMID/provider_message_id correlacionado com refresh canônico;
- estados Aceito/Enviado/Entregue/Lido/Falhou;
- sem polling concorrente.

### PR #688 — recovery de claim órfão ANA

Merge `800f7e270bb355f9bccffea6d456f57ca4f59501`.

Migration aplicada: `whatsapp_ana_preview_stale_claim_recovery_v3`.

- lease de 2 minutos para preview `claimed`;
- somente `admin_preview` + `dry_run=true` + `dry_run_not_sendable=true` pode ser recuperado;
- cleanup auditável de claim antigo;
- nenhum caminho de envio WhatsApp criado.

### PR #690 — gravador de áudio no Atendimento

Merge `628cfd0f66c63bc4f38f7dac5d246fab38a75190`.

Entregue:
- botão `🎙 Gravar áudio`;
- acesso ao microfone somente após clique;
- vínculo da gravação à conversa selecionada;
- cronômetro, Parar, Cancelar e preview;
- liberação de `MediaStream` e Object URL;
- formatos MP4/AAC ou OGG/Opus conforme `MediaRecorder.isTypeSupported()`;
- áudio gravado vira `File` e entra no mesmo pipeline `send_media`;
- sem Graph API no browser;
- canário, janela de 24h, idempotência e WAMID preservados.

### PR #693 — envio direto no painel do gravador

Merge `833e4a6fcdb972524bd51ba8fc42d98a8c14ec29`.

Motivo: o áudio já ficava em memória, mas a UI fazia parecer que era necessário baixar e anexar novamente.

Entregue:
- botão **Enviar áudio** dentro do painel do gravador;
- após Parar/ouvir, o áudio é enviado pelo mesmo `send_media`;
- download/anexo manual não é requisito;
- os dois CIs ficaram verdes antes do merge.

### PR #694 — aliases MIME de M4A

Merge `d4d6c5cc83b7341ba3e72bb19f341f95cd8a4312`.

Falha real reproduzida pelo usuário ao anexar:

```text
Áudio: 5c503739-9027-48b4-afb4-4f96442432b7.m4a
Tipo não permitido. Use imagem, áudio ou PDF.
```

Root cause: arquivos `.m4a` podem voltar do navegador/OS como `audio/x-m4a`, `audio/m4a`, MIME vazio ou `application/octet-stream`, enquanto o whitelist aceitava somente `audio/mp4`.

Correção:
- frontend reconhece esses aliases somente quando o nome termina em `.m4a`;
- backend possui `canonicalOutboundMetaMime()` para normalizar alias M4A → `audio/mp4`;
- MIME explícito incompatível, como `application/pdf`, não é sobrescrito pela extensão;
- alias M4A em arquivo que não termina `.m4a` continua bloqueado;
- conteúdo continua submetido à validação binária real `ftyp`, portanto renomear arquivo falso para `.m4a` não libera o envio.

TDD: RED real em `Meta media content signature contract`, depois GREEN completo.

### PR #695 — MIME canônico antes do FormData

Merge `d4f6816e7c4727a2605d6115f1e87722075480e8`.

Motivo: mesmo o frontend reconhecendo o `.m4a`, o `FormData` ainda poderia enviar o MIME original do SO ao runtime produtivo já publicado.

Correção:
- `fileForUpload(file)` preserva exatamente os bytes;
- se `.m4a` vier por alias, cria um novo `File([file], file.name, {type:'audio/mp4'})` somente para o upload;
- `FormData` recebe `uploadFile`, não o MIME alias original;
- demais arquivos não são reenvelopados;
- validação server-side de conteúdo continua ativa.

TDD:
1. RED real em `Audio recorder contract`;
2. implementação criada;
3. teste foi refinado para validar comportamento, não uma forma textual específica;
4. head final `a930f84ca3b03b4db99627997d286f33e1cc6980` passou:
   - `WhatsApp Meta Central CI` = success;
   - `attendance-papoai-send-ci` = success;
5. merge somente após ambos verdes.

## Observação de deploy backend

O repositório já contém canonicalização server-side do M4A em `whatsapp-meta-media-v1.mjs` e `admin-attendance-media-send-v1.mjs`. Na última inspeção, a Edge Function produtiva `admin-whatsapp-ops-v1` ainda estava na versão 25 e usava autenticação Admin customizada com `verify_jwt=false` na camada da plataforma.

O PR #695 resolve o teste atual sem depender desse deploy porque o navegador envia o `File` já canonicalizado como `audio/mp4`. Em futura publicação da Edge Function, preservar `verify_jwt=false` na plataforma porque a própria função valida o Bearer Admin; não alterar isso inadvertidamente.

## Task 9B — gate exato AGORA

Já comprovado:
- imagem outbound Meta;
- PDF/documento outbound Meta;
- upload Meta oficial server-side;
- WAMID persistido;
- status canônicos;
- dedupe/idempotência e retry seguro;
- gravador no Admin;
- envio direto pelo botão `Enviar áudio`;
- seleção/anexo de `.m4a` com MIME alternativo corrigida.

**Ainda falta a prova real do áudio:**

1. usuário faz `Ctrl+F5` no Atendimento;
2. seleciona conversa controlada 0975↔1018;
3. preferencialmente usa `🎙 Gravar áudio` → `Parar` → `Enviar áudio`;
4. como alternativa, pode anexar novamente o mesmo `.m4a` que antes foi rejeitado;
5. depois consultar Supabase e comprovar:
   - `direction='outbound'`;
   - `message_type='audio'`;
   - `provider='meta'`;
   - `provider_message_id LIKE 'wamid.%'`;
   - progressão de status;
   - nenhuma duplicação;
   - outbox sem `queued/claimed/failed` residual.

**Não declarar Task 9B concluída antes dessa evidência.**

## Task 11 — ANA após fechar 9B

Depois do canário de áudio:
- executar preview ANA autenticado pós-#688 até `completed`;
- revisar decisão/confiança/contexto ausente/modelo/latência;
- ampliar canários de qualidade sem outbound automático;
- manter `ana_enabled=false` até homologação explícita.

## Trabalho paralelo

PR draft #687 — Biblioteca Rápida do Atendimento — existe em paralelo e toca backend/mídia. Antes de qualquer alteração futura no Atendimento, auditar/rebasear contra a `main` corrente para não sobrescrever trabalho paralelo.

## Próxima ação exata para retomada

1. ler #630 e #649 mais recentes;
2. confirmar `main` e PRs ativos;
3. perguntar/verificar se o usuário já fez o teste pós-#695;
4. se enviou, consultar imediatamente `whatsapp_messages_v1` e `whatsapp_outbox_v1`;
5. comprovar WAMID/status/dedupe/fila limpa;
6. se tudo passar, fechar Task 9B em #649/#630;
7. então continuar Task 11 ANA;
8. depois marketing/agendamentos/templates/automação;
9. retirada do PapoAI somente no final, reversível e com checkpoints.

## Invariantes de segurança

- branch/PR isolado; nunca programar diretamente em `main`;
- TDD RED→GREEN;
- CI verde antes do merge;
- WAMID é identidade externa canônica;
- timeout/estado incerto nunca recebe retry cego;
- canários 0975↔1018 permanecem restritos;
- ANA e campanhas permanecem desligadas até gate explícito;
- não tocar checkout, pedidos, estoque ou Bling fora do escopo;
- somente APIs oficiais Meta/OpenAI;
- checkpoint obrigatório em #630 e, para mídia, #649.
