# Marketing Center — Run 55 — 2026-09-12

## Escopo desta rodada

Continuidade estritamente no módulo Marketing da Dona Antônia, sem Make, sem rollout e sem alterar qualquer integração externa. A rodada executou exatamente o próximo bloco seguro registrado na Run 54:

1. visualização dormente/read-only da comparação entre duas revisões sanitizadas;
2. handoff somente em memória para essa superfície privada;
3. idempotência de reentrega da mesma revisão/chave sem duplicar histórico;
4. manutenção integral dos gates, kill switches, canary e budgets fechados.

Nenhum publisher, IA paga, Storage, migration, Edge Function, Instagram/Messenger/Ads, credencial, endpoint ou gasto foi ativado.

## Auditoria antes de alterar

- Lido `docs/RETOMADA-DONA-ANTONIA.md`.
- Lido `docs/MARKETING-CENTER-RUN54-20260912.md`.
- PR isolada mantida: `#276`, branch `feat/marketing-center-clean-20260911`, draft.
- `main` auditada em `dc55facd0a46eb62de978ff324533a22a4489924`, último commit `fix: align WhatsApp Flow payment rules V65`.
- PRs recentes concentradas principalmente em Admin/Vitrine; nenhuma reconciliação automática foi feita com a branch Marketing.
- Supabase confirmado fail-closed antes da implementação: Marketing OFF, `execution_mode=off`, kill switch ON, canary 0%, geração/render/IA/publicadores OFF, aprovação obrigatória e budgets 0.

## Bloco implementado

### 1. Idempotência do handoff em memória

Atualizado:

- `admin-v3/marketing-quick-edit-review-handoff-v1.js`

Regras novas:

- `idempotency_key` tornou-se obrigatório no snapshot sanitizado;
- reentrega exata da mesma revisão/chave/hash retorna o snapshot existente sem duplicar histórico;
- reentrega exata da revisão atual preserva a comparação já calculada;
- mesma `idempotency_key` com conteúdo/hashes diferentes falha fechado com `idempotency_conflict`;
- mesma revisão do mesmo asset com conteúdo diferente falha fechado com `revision_conflict`;
- histórico continua limitado às duas revisões sanitizadas mais recentes;
- continuam proibidos rede, Storage, filesystem write, provider, publisher, credenciais e efeitos externos.

### 2. UI privada/read-only da comparação entre revisões

Novo arquivo:

- `admin-v3/marketing-quick-edit-revision-comparison-readonly-v1.js`

Contrato:

- aceita somente `marketing-quick-edit-revision-comparison-v1`;
- exige `preview_only=true`, `mutations_allowed=false`, `network_allowed=false` e `external_side_effect=false`;
- exige revisões contíguas e `status=contiguous`;
- valida paths, SHA-256 e status `added | removed | changed | unchanged`;
- limita o pacote visual a até 200 paths e path de até 256 caracteres;
- mostra apenas asset, revisão, path, status e prefixos de hashes;
- todo conteúdo é escapado antes de renderizar;
- `mountFromHandoff()` consome exclusivamente o snapshot em memória do bridge e confirma asset/revisão atual;
- não persiste nada e não é carregada pelo `admin/app-lite.js`.

## TDD comprovado

### RED

Os testes foram escritos antes da implementação:

- `scripts/test-marketing-quick-edit-review-handoff-v1.mjs` passou a exigir replay idempotente e conflito fail-closed;
- criado `scripts/test-marketing-quick-edit-revision-comparison-readonly-ui-v1.mjs`;
- workflow atualizado para exigir o novo contrato e syntax-check do arquivo de produção.

Run RED:

- `34691772079` — `completed / failure`.

A falha ocorreu exatamente em `Syntax check dormant private Marketing UI and local tooling`, porque `admin-v3/marketing-quick-edit-revision-comparison-readonly-v1.js` ainda não existia. Os passos posteriores foram skipped, comprovando ausência da implementação antes do código de produção.

### GREEN

Commits funcionais principais:

- UI read-only: `9c52bc1dfd63f34b807d4e10246951fc09be1668`;
- handoff idempotente: `15f32f929438c1808f2b783badd1b6febbad13f9`.

Run GREEN:

- `34691817127` — `completed / success`.

O job `safety-contract` confirmou sucesso em todos os passos existentes do Marketing e, especificamente:

- `Validate memory-only Marketing quick edit review handoff` — success;
- `Validate dormant readonly Marketing revision comparison UI` — success.

Também permaneceram verdes editor, biblioteca, operações/readiness, preflights, request bundles, approval preview, IA offline, SVG, manifesto, rasterização PNG em memória, pipeline de preview, quick edit e pacote/UI de revisão.

## Pós-auditoria Supabase

Estado observado após a implementação:

- `marketing_assets`: 0
- `marketing_render_jobs`: 0
- `marketing_publication_jobs`: 0
- `marketing_render_triage_requests`: 0
- `marketing_channel_accounts`: 0
- `marketing_events`: 8
- eventos com `external_side_effect=true`: 0
- 15/15 tabelas `marketing_%` com RLS ativo
- 20/20 funções `marketing_%` auditadas com `SECURITY DEFINER=false`
- 20/20 funções `marketing_%` sem EXECUTE para `anon` e `authenticated`

Runtime permaneceu:

- Marketing OFF
- `execution_mode=off`
- kill switch ON
- canary 0%
- geração OFF
- deterministic render OFF
- IA imagem/vídeo OFF
- publicação global OFF
- WhatsApp Status OFF
- Instagram Stories OFF
- Instagram Carrossel OFF
- Facebook Stories OFF
- Pinterest OFF
- Google Perfil da Empresa OFF
- aprovação obrigatória
- attribution/triage/requeue OFF
- limites diários e budgets em 0

O Security Advisor continua apontando `RLS Enabled No Policy` para tabelas server-only, compatível com o desenho fail-closed já documentado, além de três funções Agent Workflow `SECURITY DEFINER` executáveis por `authenticated` e leaked-password protection desativada. Esses avisos são fora do escopo Marketing e foram deixados intactos.

Nenhuma migration, Edge Function, credencial, Storage, integração externa ou configuração de Auth foi alterada nesta rodada.

## Concorrência / main / PR

Na pós-auditoria, `main` permaneceu em:

- `dc55facd0a46eb62de978ff324533a22a4489924`

Último commit observado: `fix: align WhatsApp Flow payment rules V65`.

A PR `#276` permaneceu aberta e draft. Após o commit funcional `15f32f929438c1808f2b783badd1b6febbad13f9`, o GitHub reportava `mergeable=true`. Não foi feito rebase, merge ou force-push.

## Próximo bloco seguro sugerido

O Marketing ainda não está integralmente concluído/homologado.

Próxima rodada segura:

1. criar um summary privado/read-only que una `latest + comparison + blockers` sem conteúdo bruto e sem ação de aprovação;
2. adicionar stale-snapshot guards por `asset_id`, revisão, `package_sha256` e `idempotency_key` antes de qualquer handoff visual;
3. manter a superfície fora do loader público e sem persistência;
4. continuar sem vídeo real, IA paga, Storage, publishers, dispatch, requeue, canary, Instagram/Messenger/Ads ou gasto até autorização explícita.
