# RETOMADA — Central WhatsApp Própria via Meta Cloud API

**Checkpoint canônico:** 2026-10-03 (Cuiabá)  
**Main confirmada:** `628cfd0f66c63bc4f38f7dac5d246fab38a75190`  
**Supabase canônico:** `ssbesxgaijknwsjbsbcz`  
**Issue mestre:** #630  
**Task mídia:** #649

> Este arquivo é o ponto de retomada obrigatório. Antes de programar, ler os comentários mais recentes de #630/#649 e auditar PRs/branches abertos, principalmente trabalho paralelo de Atendimento.

## Estado executivo

- Tasks 0–8: concluídas/homologadas conforme #630.
- Task 9A — inbound mídia Meta: concluída/homologada.
- Task 9B — outbound mídia Meta: imagem/PDF comprovados; gravador de áudio no Admin agora implementado; falta somente o canário real de áudio gravado pelo Admin com evidência WAMID/status/dedupe/fila limpa.
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

## Últimos merges relevantes

### PR #686 — observabilidade de mídia

Merge `405f1c0f11371ddb17c97fcd5229af9b99b8bbb7`.

- WAMID/provider_message_id correlacionado com refresh canônico;
- estados Aceito/Enviado/Entregue/Lido/Falhou;
- sem polling concorrente.

### PR #688 — recovery de claim órfão ANA

Merge `800f7e270bb355f9bccffea6d456f57ca4f59501`.

Migration aplicada: `whatsapp_ana_preview_stale_claim_recovery_v3`.

- lease de 2 minutos para preview `claimed`;
- claim recente retorna `ana_preview_busy`;
- somente `admin_preview` + `dry_run=true` + `dry_run_not_sendable=true` pode ser recuperado;
- cleanup auditável de claim antigo;
- nenhum caminho de envio WhatsApp foi criado.

### PR #690 — gravador de áudio no Atendimento

Merge `628cfd0f66c63bc4f38f7dac5d246fab38a75190`.

Objetivo: remover o bloqueio humano da Task 9B — antes o Admin aceitava arquivo de áudio, mas não permitia gravar áudio dentro da conversa.

Entregue:
- botão `🎙 Gravar áudio` no composer;
- acesso ao microfone solicitado somente após clique do usuário;
- vínculo da gravação à conversa selecionada;
- cronômetro acessível;
- botões Parar e Cancelar;
- preview com player antes do envio;
- cancelamento automático se a conversa mudar durante a gravação;
- liberação do `MediaStream`/tracks ao parar, cancelar ou sair;
- liberação do Object URL anterior para evitar vazamento de memória;
- escolha dinâmica de formato com `MediaRecorder.isTypeSupported()`;
- somente formatos já aceitos pelo transporte atual: MP4/AAC ou OGG/Opus;
- `audio/webm` não entra no pipeline Meta atual;
- áudio gravado vira `File` e entra no MESMO `send_media` já existente;
- nenhuma rota/backend Meta nova;
- navegador nunca chama Graph diretamente;
- idempotência, canário, janela de 24h, WAMID e observação de status permanecem no pipeline existente;
- mobile: botões de gravação ampliados/empilhados no painel;
- erro explícito de permissão, microfone ausente/ocupado ou formato incompatível.

TDD/CI:
1. RED comprovado no `Audio recorder contract` antes da implementação;
2. primeiro GREEN revelou regressão do contrato nativo porque foi criada uma segunda folha CSS;
3. correção preservou o contrato de uma única folha CSS própria; estilos do gravador ficaram inline no `index.html`;
4. head final `91444e0943b027177ad1158180ea29c27705f41c` passou os dois checks:
   - `WhatsApp Meta Central CI` = success;
   - `attendance-papoai-send-ci` = success;
5. #690 só foi mergeado depois desses dois checks.

Arquivos centrais do gravador:
- `vitrine/admin/atendimento/attendance-audio-recorder.js`
- `vitrine/admin/atendimento/attendance-media-send.js`
- `vitrine/admin/atendimento/index.html`
- `scripts/test-attendance-audio-recorder-v1.mjs`

## Task 9B — gate exato AGORA

Já comprovado:
- imagem outbound Meta;
- PDF/documento outbound Meta;
- upload Meta oficial server-side;
- WAMID persistido;
- status canônicos;
- dedupe/idempotência;
- retry seguro;
- fila limpa nos testes anteriores;
- seleção de áudio por arquivo;
- gravador de áudio dentro do Admin implementado em #690.

**Ainda falta somente a prova real do áudio gravado pelo Admin:**

1. usuário abre o Atendimento autenticado;
2. seleciona conversa controlada 0975↔1018;
3. clica `🎙 Gravar áudio`;
4. autoriza o microfone;
5. grava uma mensagem curta;
6. clica `Parar`;
7. ouve a prévia;
8. clica `Enviar anexo`;
9. depois a programação deve consultar Supabase e comprovar:
   - `direction='outbound'`;
   - `message_type='audio'`;
   - `provider='meta'`;
   - `provider_message_id LIKE 'wamid.%'`;
   - progressão de status;
   - nenhuma duplicação;
   - outbox sem queued/claimed/failed residual.

**Não declarar Task 9B concluída antes dessa evidência.**

## Se o botão/gravador não aparecer no Admin

1. confirmar que `main` contém `628cfd0f...` ou commit posterior;
2. atualizar a página do Atendimento ignorando cache (`Ctrl+F5` no desktop);
3. confirmar que `attendance-audio-recorder.js` é servido;
4. não criar bypass de autenticação nem enviar áudio por outra rota para “simular” o gate.

A ferramenta de navegação externa usada no checkpoint não conseguiu abrir a rota autenticada/publicada do Admin; portanto o deploy visual deve ser confirmado pelo usuário no próprio navegador. O código e os dois CIs do merge estão comprovados.

## Task 11 — ANA após fechar 9B

Próximo trabalho técnico depois do canário de áudio:
- executar preview ANA autenticado pós-#688 até `completed`;
- revisar decisão/confiança/contexto ausente/modelo/latência;
- ampliar canários de qualidade sem outbound automático;
- manter `ana_enabled=false` até homologação explícita.

## Trabalho paralelo

PR draft #687 — Biblioteca Rápida do Atendimento — existe em paralelo e toca principalmente backend/mídia. Antes de qualquer alteração futura no Atendimento, auditar/rebasear contra a `main` corrente para não sobrescrever trabalho paralelo.

## Próxima ação exata para retomada

1. ler #630 e #649 mais recentes;
2. confirmar `main` e PRs ativos;
3. consultar Supabase por outbound `audio + provider=meta` posterior ao merge #690;
4. se o usuário já tiver enviado o áudio gravado, verificar imediatamente WAMID/status/dedupe/outbox;
5. se tudo passar, fechar Task 9B em #649/#630;
6. então continuar Task 11 ANA;
7. depois marketing/agendamentos/templates/automação;
8. retirada do PapoAI somente no final e de modo reversível.

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
