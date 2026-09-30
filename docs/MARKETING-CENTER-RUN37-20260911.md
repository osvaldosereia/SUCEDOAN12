# Marketing Center — Run 37 — 2026-09-11

## Objetivo da rodada

Substituir a estratégia de integração da PR histórica #254 por uma branch limpa baseada na `main` atual, sem carregar centenas de commits divergentes nem ressuscitar módulos removidos de outras frentes.

## Auditoria inicial

- `docs/RETOMADA-DONA-ANTONIA.md` relido antes das alterações.
- Checkpoint anterior: `docs/MARKETING-CENTER-RUN36-20260911.md` na branch histórica.
- Branch limpa `feat/marketing-center-clean-20260911` estava sem delta próprio e foi primeiro avançada sem force para a `main` observada.
- Durante a rodada a `main` avançou novamente somente por Product Studio; o delta foi auditado e não tocava Marketing, Admin, Supabase config ou migrations.
- Supabase antes da alteração: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests e 0 eventos Marketing com `external_side_effect=true`.
- `marketing_readiness_v1()` permaneceu NOT READY com Marketing OFF, execution mode OFF, canary 0%, kill switch ON, render/IA/publicação/atribuição/triagem/requeue OFF e budgets em zero.
- `marketing_render_triage_sla_v1()` permaneceu `healthy`, redigido e `external_side_effect=false`.

## Implementação

Criada a PR limpa #276 a partir de `feat/marketing-center-clean-20260911`.

Foram transplantados por SHA de blob, sem reescrever SQL e sem reaplicar migrations no banco:

- 25 migrations do Marketing Center, da fundação até V19/SLA;
- 7 fontes de Edge Functions administrativas:
  - `admin-marketing-v1`;
  - `admin-marketing-workflow-v1`;
  - `admin-marketing-media-v1`;
  - `admin-marketing-dry-run-v1`;
  - `admin-marketing-insights-v1`;
  - `admin-marketing-carousel-v1`;
  - `admin-marketing-render-triage-v1`.

`supabase/config.toml` foi reconstruído sobre a versão da `main` atual e recebeu somente as sete seções de Marketing, todas com `verify_jwt=true`.

A fonte `admin-marketing-v1` foi preservada no repositório, mas não foi implantada/ativada nesta rodada. O inventário real do Supabase mostrou ativas as demais Edges de Marketing já homologadas, todas com JWT obrigatório.

## Guard contra exposição pelo Admin público

O Admin oficial atual usa `admin/app-lite.js` e é deliberadamente público/sem sessão JWT. Por isso a UI do Marketing NÃO foi ligada a ele nesta rodada.

Criado `scripts/test-marketing-clean-transplant-v1.mjs`, que falha se:

- `admin/app-lite.js` passar a carregar qualquer Edge/superfície de Marketing;
- qualquer uma das sete funções Marketing deixar de usar `verify_jwt=true` no config;
- faltar alguma migration V1–V19;
- faltar fonte de alguma das sete Edge Functions;
- a migration de fundação deixar de conter os invariantes `kill_switch`, `canary_percent` e `execution_mode`.

Criado workflow `.github/workflows/marketing-center-clean-v1.yml` para executar esse contrato na PR/branch limpa.

## Integração com a main corrente

Enquanto a PR era criada, a `main` avançou dois commits por processamento de imagens do Product Studio. O delta foi auditado e continha apenas `automation/product-image-studio/state.json` e imagens de produto.

Foi criado merge commit não-forçado preservando integralmente a `main` mais nova e reaplicando somente o delta Marketing. A PR #276 passou a `mergeable=true`.

## CI real

Workflow `Marketing Center Clean Transplant`, run `34630743358`:

- job `safety-contract`: `completed` / `success`;
- checkout: success;
- Node setup: success;
- `Validate clean Marketing transplant safety contract`: success.

Portanto o primeiro bloco da branch limpa possui CI real verde.

## Gates preservados

Nenhum rollout foi aberto nesta rodada:

- Marketing OFF;
- execution mode OFF;
- canary 0%;
- kill switch ON;
- deterministic render OFF;
- AI render OFF;
- publishing global OFF;
- WhatsApp Status OFF;
- Instagram Stories OFF;
- Instagram carousel OFF;
- Facebook Stories OFF;
- Pinterest OFF;
- Google Perfil da Empresa OFF;
- attribution OFF;
- triage OFF;
- requeue OFF;
- triage kill switch ON;
- aprovação obrigatória;
- budgets e limites de publicação em zero.

Não houve deploy de Edge, chamada de provider, publicação real, anúncio pago, ativação de Instagram/Messenger/Ads ou aumento de canary.

## Estado da PR histórica

A PR #254 deve permanecer somente como histórico técnico. Ela não é candidata segura a merge direto.

## Próximo bloco seguro

1. transplantar para a PR #276 a UI privada/dormente de Marketing (`admin-v3/marketing-*`) e seus scripts determinísticos;
2. transplantar os contratos históricos compatíveis, adaptando apenas os que ainda pressupõem `admin/config.js` antigo;
3. executar a suíte completa de Marketing na PR limpa;
4. manter a UI fora do `app-lite.js` até existir uma superfície oficial autenticada;
5. continuar sem habilitar publishers, render/IA pagos, requeue ou canary.
