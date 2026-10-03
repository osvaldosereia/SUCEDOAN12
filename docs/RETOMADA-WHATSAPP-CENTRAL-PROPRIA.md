# RETOMADA — Central WhatsApp Própria via Meta Cloud API

**Checkpoint canônico:** 2026-10-03  
**Main confirmada:** `800f7e270bb355f9bccffea6d456f57ca4f59501`  
**Supabase canônico:** `ssbesxgaijknwsjbsbcz`  
**Issue mestre:** #630  
**Task mídia:** #649

> Este arquivo é o ponto de retomada obrigatório. Antes de programar, ler também os comentários mais recentes de #630 e #649 e auditar PRs abertos para evitar colisão com trabalho paralelo.

## Estado executivo atual

- Tasks 0–8: concluídas/homologadas conforme checkpoints de #630.
- Task 9A — inbound de mídia Meta: **concluída e homologada**; áudio real inbound Meta foi resolvido, cacheado e reproduzido no Admin.
- Task 9B — outbound de mídia Meta: **implementação, segurança e UX concluídas; gate real de áudio ainda pendente**.
- Task 10 — Humano × IA: **implementada**, com takeover/resume explícito e fail-closed para IA durante modo humano.
- Task 11 — ANA própria: **dry-run/preview implementado, sem envio automático**. Recovery de claim órfão foi concluído em #688.
- Marketing/campanhas: **desligados**.
- Retirada do PapoAI: **não iniciar ainda**; continua sombra/fallback até os gates finais.

## Últimos merges relevantes

### PR #686 — observabilidade canônica de mídia

Merge: `405f1c0f11371ddb17c97fcd5229af9b99b8bbb7`.

Entregue:
- correlação pelo `provider_message_id`/WAMID;
- estados Aceito/Enviado/Entregue/Lido/Falhou no composer;
- evento `attendance:conversation-refreshed` produzido pelo refresh canônico existente;
- nenhum polling concorrente;
- bridge antigo que monkeypatchava `fetch` removido;
- CIs verdes antes do merge.

### PR #688 — recovery de claim órfão da prévia ANA

Merge: `800f7e270bb355f9bccffea6d456f57ca4f59501`.

Migration aplicada no Supabase: `whatsapp_ana_preview_stale_claim_recovery_v3`.

Entregue:
- lease de **2 minutos** para job `claimed` da prévia administrativa;
- claim recente continua retornando `ana_preview_busy`;
- somente `dry_run=true`, `source=admin_preview` e `dry_run_not_sendable=true` podem ser recuperados;
- claim stale é recuperado de forma auditável, incrementando `attempt_count` e metadados de recovery;
- migration faz cleanup auditável dos claims órfãos que já existiam no momento do deploy;
- não há cron, trigger, outbox ou envio WhatsApp nesse recovery;
- TDD teve RED real no CI antes da implementação e GREEN final no `WhatsApp Meta Central CI`.

Smoke transacional com rollback no Supabase canônico:
- claim com menos de 2 minutos → `ana_preview_busy`;
- claim com mais de 2 minutos → `recovered_stale_claim=true`;
- rollback confirmou ausência de resíduos do smoke.

O job ANA que estava preso em `claimed` foi encerrado auditavelmente como `failed` / `stale_preview_claim_timeout`, com recovery registrado em metadata. Ele continua `dry_run` e nunca foi enviável.

## Runtime canônico atual

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

Última auditoria da outbox Meta em 24h:

```text
sent = 13
queued/claimed = 0 observados
failed = 0 observados
```

Nenhuma allowlist foi ampliada para clientes reais durante esta rodada.

## Task 9B — estado exato do gate

Já comprovado em produção controlada:
- imagem outbound Meta;
- PDF/documento outbound Meta;
- WAMID persistido;
- estados canônicos de entrega/leitura;
- dedupe;
- fila limpa;
- UX de seleção, progresso, retry/idempotência e observabilidade no Admin.

**Ainda falta uma única prova real específica:**

1. pelo Admin autenticado, enviar um **áudio outbound via Meta** entre os canários 0975↔1018;
2. confirmar em `whatsapp_messages_v1` `direction='outbound'`, `message_type='audio'`, `provider='meta'`;
3. confirmar `provider_message_id`/WAMID;
4. confirmar progressão de status e ausência de duplicação;
5. confirmar outbox sem pendências/falhas após o teste.

Na última auditoria, a consulta de outbound `audio + provider=meta` retornou **0 linhas**. Não declarar Task 9B concluída até aparecer evidência real.

## Task 11 — ANA própria: estado e próximo gate

Entregue:
- fila `whatsapp_ana_jobs_v1` service-role-only para worker batch;
- preview administrativo autenticado separado do worker batch;
- OpenAI Responses API + Structured Outputs + `store:false`;
- contexto operacional server-side;
- bloqueio de afirmações dinâmicas sem contexto confiável;
- orientação para catálogo/site e humano;
- não coletar CPF/CNPJ ou endereço completo no chat;
- aba Assistente gera sugestão e somente copia para rascunho;
- `dry_run_not_sendable=true` em todo o fluxo;
- gate Humano × IA antes/depois da geração;
- recovery de claims stale concluído em #688.

Ainda falta:
1. executar uma prévia ANA autenticada que termine `completed` após o fix de #688;
2. revisar decisão, confiança, contexto ausente, modelo e latência;
3. acumular canários de qualidade antes de criar qualquer outbound automático;
4. manter `ana_enabled=false` até homologação explícita.

## Trabalho paralelo / atenção antes de tocar frontend

Existe PR draft **#687 — Biblioteca Rápida do Atendimento** (`feat/attendance-quick-library-20261003`). Ele foi aberto em paralelo e deve ser auditado/rebaseado contra a `main` atual antes de qualquer merge. Não sobrescrever arquivos de UI dele sem comparar o diff.

## Próxima ação exata

Ordem recomendada para a próxima execução:

1. ler comentários mais recentes de #630 e #649;
2. auditar #687 e qualquer PR mais novo;
3. consultar Supabase para saber se já apareceu áudio outbound Meta real;
4. se apareceu, fechar Task 9B com WAMID/status/dedupe/fila limpa;
5. se não apareceu e não houver navegador/Admin autenticado disponível, manter o gate aberto sem criar bypass;
6. executar/homologar uma prévia ANA autenticada pós-#688 até `completed`;
7. depois avançar Task 11 em canário, mantendo ANA/campanhas OFF;
8. marketing/agendamentos/templates automáticos somente depois dos gates anteriores;
9. retirar PapoAI apenas na fase final, reversível e com checkpoints.

## Invariantes de segurança

- nunca trabalhar direto em `main`;
- branch/PR isolado para cada lote;
- TDD RED → GREEN;
- CI verde antes de merge;
- WAMID é identidade externa canônica;
- timeout/estado incerto nunca recebe retry cego;
- canários 0975↔1018 permanecem restritos;
- nenhuma expansão para cliente real sem homologação;
- ANA e campanhas permanecem desligadas até gate explícito;
- não tocar checkout, pedidos, estoque ou Bling durante este projeto salvo escopo explícito;
- somente APIs oficiais Meta/OpenAI; nada de engenharia reversa;
- registrar checkpoint em #630 e, quando mídia estiver envolvida, também em #649 ao final de cada rodada.
