# Marketing Center — Run 56 — 2026-09-12

## Escopo desta rodada

Continuidade estritamente no módulo Marketing da Dona Antônia, sem Make, sem rollout e sem alterar integração externa. A rodada executou o próximo bloco seguro registrado na Run 55:

1. summary privado/read-only de `latest + comparison + blockers`;
2. stale-snapshot guards por `asset_id`, revisão, `package_sha256` e `idempotency_key`;
3. handoff exclusivamente em memória;
4. manutenção integral dos gates, kill switches, canary e budgets fechados.

Nenhum publisher, IA paga, Storage, migration, Edge Function, Instagram/Messenger/Ads, credencial, endpoint ou gasto foi ativado.

## Auditoria antes de alterar

- Lido `docs/RETOMADA-DONA-ANTONIA.md`.
- Lido `docs/MARKETING-CENTER-RUN55-20260912.md`.
- PR isolada mantida: `#276`, branch `feat/marketing-center-clean-20260911`, draft.
- `main` auditada em `cdbf955cc9bcb80847d5cd12fe57a5b8e9e2d44a`, com mudanças recentes concentradas em Chat/WhatsApp Flow/Admin e fora do Marketing.
- A branch Marketing estava 111 commits à frente e 257 atrás da `main`, portanto permaneceu isolada; não houve rebase, merge ou force-push.
- Supabase confirmado fail-closed antes da implementação: Marketing OFF, `execution_mode=off`, kill switch ON, canary 0%, geração/render/IA/publicadores OFF, aprovação obrigatória e budgets 0.
- Contagens prévias: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests, 0 channel accounts, 8 eventos internos e 0 externos.
- 15/15 tabelas `marketing_%` com RLS ativo.
- 20/20 funções `marketing_%` auditadas como `SECURITY INVOKER`, sem EXECUTE para `anon` e `authenticated`.

## Bloco implementado

### Summary privado/read-only de revisão

Novo arquivo:

- `admin-v3/marketing-quick-edit-review-summary-readonly-v1.js`

Contrato:

- schema `marketing-quick-edit-review-summary-v1`;
- consome somente snapshot sanitizado do `DAMarketingQuickEditReviewHandoffV1`;
- une somente metadados de `latest`, resumo da `comparison` e `blockers`;
- não transporta `quick_edit`, `approval_preview`, `render_integrity`, conteúdo textual bruto, caption, request body, SVG ou PNG;
- `preview_only=true`;
- `mutations_allowed=false`;
- `network_allowed=false`;
- `external_side_effect=false`;
- continua fora do loader público `admin/app-lite.js`.

### Stale-snapshot guards

Antes de renderizar, o summary exige correspondência exata entre o snapshot atual e o contexto esperado:

- `asset_id`;
- `revision`;
- `package_sha256`;
- `idempotency_key`.

Qualquer divergência falha fechado com `stale_snapshot:*`.

Também são validados:

- schema e flags read-only do handoff;
- SHA-256 de package/spec/SVG/PNG;
- vínculo `from_revision -> revision`;
- histórico limitado a no máximo duas revisões;
- comparação contígua ligada ao mesmo asset/revisão;
- até 200 paths sanitizados;
- blockers limitados e convertidos apenas para texto de metadado.

A superfície não possui `fetch`, XHR, axios, tokens, secrets, Storage, local/session storage, IndexedDB, filesystem write, aprovação, scheduling, publishing, execute ou requeue.

## TDD comprovado

### RED

Primeiro foram adicionados:

- `scripts/test-marketing-quick-edit-review-summary-readonly-ui-v1.mjs`;
- wiring do teste e syntax-check no workflow `.github/workflows/marketing-center-clean-v1.yml`.

Run RED:

- `34694430676` — `completed / failure`.

A falha ocorreu exatamente no passo `Syntax check dormant private Marketing UI and local tooling`, porque `admin-v3/marketing-quick-edit-review-summary-readonly-v1.js` ainda não existia. Todos os contratos seguintes foram skipped, comprovando ausência da implementação antes do código de produção.

### GREEN

Commit funcional:

- `5fbba8f5eb35b637a69cb5241a62cbe9a73760c5` — `feat(marketing): add stale-guarded readonly review summary`.

Run GREEN:

- `34694470582` — `completed / success`.

O job `safety-contract` passou integralmente. Especificamente:

- `Syntax check dormant private Marketing UI and local tooling` — success;
- `Validate memory-only Marketing quick edit review handoff` — success;
- `Validate dormant readonly Marketing revision comparison UI` — success;
- `Validate dormant readonly Marketing review summary UI` — success;
- todos os contratos anteriores do Marketing permaneceram verdes.

## Pós-auditoria Supabase

Após a implementação, o runtime continuou exatamente fechado:

- Marketing OFF;
- `execution_mode=off`;
- canary 0%;
- kill switch ON;
- geração OFF;
- deterministic render OFF;
- IA imagem/vídeo OFF;
- publicação global OFF;
- WhatsApp Status OFF;
- Instagram Stories OFF;
- Instagram Carrossel OFF;
- Facebook Stories OFF;
- Pinterest OFF;
- Google Perfil da Empresa OFF;
- aprovação obrigatória;
- attribution/triage/requeue OFF;
- budgets e limites diários em 0.

Contagens pós-implementação:

- `marketing_assets`: 0;
- `marketing_render_jobs`: 0;
- `marketing_publication_jobs`: 0;
- `marketing_render_triage_requests`: 0;
- `marketing_channel_accounts`: 0;
- `marketing_events`: 8;
- eventos com `external_side_effect=true`: 0.

RLS pós-implementação: 15/15 tabelas `marketing_%` continuam com RLS ativo.

Nenhuma migration, Edge Function, Storage, credencial, integração externa ou configuração de Auth foi alterada nesta rodada.

O Security Advisor continua com avisos preexistentes fora do Marketing, incluindo tabelas server-only com RLS sem policy, três funções Agent Workflow `SECURITY DEFINER` executáveis por `authenticated` e leaked-password protection desativada. Não foram alterados por escopo.

## Concorrência / main / PR

A `main` avançou durante esta sequência e foi auditada em `cdbf955cc9bcb80847d5cd12fe57a5b8e9e2d44a` antes da implementação. A branch de Marketing permaneceu isolada e draft. Não houve rebase, merge ou force-push.

## Próximo bloco seguro sugerido

O Marketing ainda não está integralmente concluído/homologado.

Próxima rodada segura:

1. adicionar um token efêmero determinístico de snapshot (`asset + revision + package_sha256 + idempotency_key`) somente para detectar troca de contexto entre build e mount;
2. tornar o summary capaz de recusar também regressão de revisão (`latest.revision < last_seen_revision`) sem persistir histórico fora da memória;
3. manter toda a superfície privada, dormente e fora do loader público;
4. continuar sem vídeo real, IA paga, Storage, publishers, dispatch, requeue, canary, Instagram/Messenger/Ads ou gasto até autorização explícita.
