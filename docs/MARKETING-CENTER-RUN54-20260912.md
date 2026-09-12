# Marketing Center — Run 54 — 2026-09-12

## Escopo desta rodada

Continuidade estritamente no módulo Marketing, sem Make e sem alterar rollout. O objetivo seguro registrado na Run 53 foi concluído: criar um handoff local/somente memória entre o pacote privado de revisão do quick edit e a futura superfície dormente do editor, com comparação entre revisões por paths/hashes.

Nenhuma integração externa, publisher, IA paga, Storage, migration, Edge Function, canary, Meta Ads, Instagram/Messenger ou gasto foi ativado.

## Auditoria antes de alterar

- Lido `docs/RETOMADA-DONA-ANTONIA.md`.
- Lido `docs/MARKETING-CENTER-RUN53-20260912.md`.
- PR isolada mantida: `#276`, branch `feat/marketing-center-clean-20260911`, draft.
- `main` continuou avançando principalmente em WhatsApp Flow/Admin; não foi feito rebase, merge ou force-push automático.
- Supabase permaneceu fail-closed: Marketing desligado, `execution_mode=off`, kill switch ligado, canary 0%, geração/render/IA/publicadores desligados, aprovação obrigatória e budgets 0.

## Bloco implementado

### Handoff privado, bounded-memory e metadata-only

Novo arquivo:

- `admin-v3/marketing-quick-edit-review-handoff-v1.js`

Contrato:

- aceita somente `marketing-quick-edit-review-package-v1` validado pela superfície read-only existente;
- exige `preview_only=true`;
- exige `mutations_allowed=false`;
- exige `network_allowed=false`;
- exige `external_side_effect=false`;
- exige provider, Storage e filesystem writes desligados;
- valida vínculo de `asset_id`, revisão, `render_profile` e `spec_sha256` entre quick edit e render integrity;
- mantém somente metadados, revisões, blockers, idempotency keys e hashes SHA-256;
- não mantém `change_note`, spec completa, legenda, corpo de request, approval payload, SVG bytes ou PNG bytes;
- histórico em memória limitado a no máximo duas revisões;
- não usa `fetch`, XHR, axios, credenciais, localStorage, sessionStorage, IndexedDB, filesystem write, Supabase ou publishers.

### Comparação local entre revisões

Schema novo:

- `marketing-quick-edit-revision-comparison-v1`

Regras:

- comparação somente do mesmo `asset_id`;
- revisões precisam ser contíguas (`previous.revision === current.from_revision`);
- diferenças são representadas somente por `path`, `before_sha256`, `after_sha256` e status;
- revisão não contígua falha fechada com `non_contiguous_revisions`;
- pacote inseguro falha fechado com `unsafe_review_packet`.

## TDD comprovado

### RED

O teste foi adicionado antes da implementação:

- `scripts/test-marketing-quick-edit-review-handoff-v1.mjs`

Runs vermelhos do workflow `Marketing Center Clean Transplant`:

- push: `34689325546`
- pull_request: `34689327175`

A falha ocorreu antes de existir o bridge de produção, comprovando que o contrato novo detectava a ausência da funcionalidade.

### GREEN

Após implementar o bridge e corrigir o binding para o nome real do validador read-only (`validatePacket`), o commit funcional ficou em:

- `fa89bb020d26b64b44ddef5680f3d80321fd0f53`

Run GREEN:

- pull_request: `34689428247` — `completed / success`

O job `safety-contract` também confirmou sucesso explícito no passo:

- `Validate memory-only Marketing quick edit review handoff`

Todos os passos anteriores do workflow Marketing permaneceram verdes, incluindo editor, biblioteca, operações/readiness, preflights, approval preview, IA offline, SVG, manifesto, PNG em memória, pipeline de preview, quick edit e pacote/UI de revisão.

## Pós-auditoria Supabase

Estado observado após a implementação:

- `marketing_assets`: 0
- `marketing_render_jobs`: 0
- `marketing_publication_jobs`: 0
- `marketing_render_triage_requests`: 0
- `marketing_channel_accounts`: 0
- `marketing_events`: 8
- eventos com `external_side_effect=true`: 0
- 15/15 tabelas `marketing_%` com RLS ligado
- 20/20 funções `marketing_%` auditadas sem `SECURITY DEFINER` e sem EXECUTE para `anon`/`authenticated`

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
- triage/requeue OFF
- limites diários e budgets em 0

Nenhuma migration, Edge Function, credencial ou integração externa foi implantada/reimplantada nesta rodada.

## Concorrência / main

Na pós-auditoria, `main` estava em:

- `ec27b786618cfd385e8f5887dee7078f7d100f2f`

Último commit observado: `docs(flow): checkpoint RUN46 V64 contamination guard`.

A branch Marketing permaneceu isolada; nenhuma tentativa automática de reconciliar a divergência foi feita.

## Próximo bloco seguro sugerido

O Marketing ainda não está integralmente concluído/homologado.

Próxima rodada segura:

1. criar uma visualização dormente/read-only da comparação entre as duas revisões sanitizadas;
2. permitir handoff apenas em memória para essa superfície privada, sem ligar o arquivo ao loader público do Admin;
3. reforçar idempotência para reentrega da mesma revisão/chave sem duplicar histórico;
4. manter vídeo real, provider de IA, Storage, publishers, dispatch, requeue, canary e qualquer gasto bloqueados até autorização explícita.
