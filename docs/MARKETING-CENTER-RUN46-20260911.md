# Marketing Center — Run 46 — 2026-09-11

## Escopo

Continuação autônoma exclusiva do módulo Marketing na branch isolada `feat/marketing-center-clean-20260911` / PR #276. Nenhum Make, deploy, publisher externo, credencial social, IA paga, canary, gasto ou integração real foi habilitado.

## Auditoria antes de alterar

- Lido `docs/RETOMADA-DONA-ANTONIA.md`.
- Lido o checkpoint anterior `docs/MARKETING-CENTER-RUN45-20260911.md`.
- `main` auditada no SHA `a6f7662cdff259b021f651b6f821c097f00a63b1`; PRs recentes continuam concentradas em Vitrine/Admin/Flow/Product Studio, sem motivo para merge/rebase forçado nesta rodada.
- PR #276 auditada antes de alterar; permaneceu isolada da `main` concorrente.
- Supabase `ssbesxgaijknwsjbsbcz` permaneceu `ACTIVE_HEALTHY`.
- Changelog atual do Supabase revisado; nenhuma mudança desta rodada exigiu DDL, Edge deploy ou alteração de grants.
- Todas as tabelas `marketing_%` auditadas continuam com RLS ligado.
- Funções `marketing_%` auditadas continuam `SECURITY INVOKER` (`prosecdef=false`) e sem EXECUTE para `anon`/`authenticated`; `service_role` permanece autorizado.

## Bloco implementado

### 1. Read-model local de custo/gates da IA

Arquivos:

- `admin-v3/marketing-ai-readiness-readonly-v1.js`
- `scripts/test-marketing-ai-readiness-readonly-ui-v1.mjs`

A nova superfície é totalmente local e dormente. Ela recebe somente um pacote já produzido por `marketing-ai-preflight-v1` e recusa o pacote se qualquer garantia segura estiver ausente.

Fail-closed obrigatório:

- `schema_version=marketing-ai-preflight-v1`;
- `external_side_effect=false`;
- `network_allowed=false`;
- `provider_call_allowed=false`;
- `dry_run=true`;
- `blockers` presente;
- custo estimado numérico.

A UI mostra modo, tipo de mídia, unidades, custo estimado, estado resumido dos gates e blockers. Não possui `fetch`, bearer token, local/session storage, credenciais, endpoint externo ou qualquer ação de rollout. O clean-transplant guard passou a impedir também que essa superfície seja ligada ao Admin público.

### 2. Request bundle oficial apenas dry-run

Arquivos:

- `scripts/marketing-channel-request-bundle-v1.mjs`
- `scripts/test-marketing-channel-request-bundle-v1.mjs`

Este builder consome exclusivamente um `marketing-channel-preflight-v1` válido e produz um envelope normalizado para os seis destinos já suportados:

- WhatsApp Status;
- Instagram Stories;
- Facebook Stories;
- Instagram Carrossel;
- Pinterest;
- Google Perfil da Empresa.

Garantias do bundle:

- `dry_run=true`;
- `dispatch_allowed=false`;
- `external_side_effect=false`;
- `network_allowed=false`;
- `credentials_required_now=false`;
- `endpoint=null`;
- `authorization=null`;
- rejeita material sensível (`token`, `secret`, `password`, `credential`, `authorization`, `private_key`, `api_key`);
- preserva a idempotency key do preflight;
- WhatsApp Status permanece `manual_confirmation_only`;
- nenhum endpoint ou payload executável de provider é criado.

O objetivo é separar claramente `preview/request shape` de um futuro dispatcher real, que continua proibido e inexistente nesta branch.

## TDD / CI

### RED — AI readiness UI

- teste criado antes da implementação;
- workflow run `34668423338`, commit `c93c95339f897ec54a0a4e092c13cb6f56ef3baf`, terminou `failure` no syntax-check porque `admin-v3/marketing-ai-readiness-readonly-v1.js` ainda não existia.

### GREEN — AI readiness UI

- implementação + guard no commit `c7352daf1f42713dabe56c2725d317b4ebb5743e`;
- workflow run `34668473445` terminou `completed/success` com todos os contratos Marketing verdes.

### RED — channel request bundle

- teste e CI criados antes da implementação;
- workflow run `34668516238`, commit `f81728ee05a4946648c216ea852d22518c79c45d`, terminou `failure` no syntax-check porque `scripts/marketing-channel-request-bundle-v1.mjs` ainda não existia.

### GREEN — channel request bundle

- implementação no commit `7219e23b2842e30be927309921d3fba141160801`;
- workflow run `34668560990` terminou `completed/success`;
- passaram syntax-check, clean transplant guard, editor, biblioteca, operações read-only, métricas/readiness, channel preflight, request bundle, approval preview, AI preflight, AI readiness UI e renderer SVG.

## Auditoria pós-implementação

Supabase foi reconsultado sem qualquer deploy/redeploy e permaneceu inalterado:

- 0 assets;
- 0 render jobs;
- 0 publication jobs;
- 0 triage requests;
- 0 channel accounts;
- 8 eventos internos;
- 0 eventos com efeito externo.

Runtime continua fechado:

- `enabled=false`;
- `execution_mode=off`;
- `canary_percent=0`;
- `kill_switch=true`;
- `generation_enabled=false`;
- `deterministic_render_enabled=false`;
- `ai_image_enabled=false`;
- `ai_video_enabled=false`;
- `publishing_enabled=false`;
- todos os seis publishers OFF;
- `require_approval=true`;
- `max_daily_publications=0`;
- `max_daily_ai_image_generations=0`;
- `max_daily_ai_video_seconds=0`;
- `max_daily_ai_cost_cents=0`;
- attribution/triage/requeue OFF;
- triage kill switch ON.

Nenhuma migration, Edge Function ou provider externo foi implantado/reimplantado nesta rodada.

## PR / concorrência

A PR #276 permanece aberta e draft. Após a rodada, GitHub voltou a reportar `mergeable=true`, mas a `main` continua muito à frente do merge-base por trabalho concorrente. Não fazer force/rebase/merge automático; reauditar imediatamente antes de qualquer integração. A PR histórica #254 continua apenas como referência técnica.

## Próximo bloco seguro

1. continuar geração sem IA com uma camada de rasterização/vídeo offline apenas se puder ser homologada sem provider, rede ou runtime pago;
2. criar um manifesto determinístico de render para formatos 1:1, 9:16 e Pinterest, reutilizando o SVG atual e mantendo output local;
3. ampliar os request bundles com validação de formato por canal, sem endpoint, credencial ou dispatch;
4. manter UI Marketing fora do Admin público até existir host autenticado apropriado;
5. continuar publishers reais, IA paga, requeue, canary e qualquer Ads/Messenger/Instagram real OFF.

## Estado de conclusão

Marketing ainda não está integralmente concluído/homologado. Não desativar a continuidade recorrente ainda.
