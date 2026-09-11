# Marketing Center — Run 21 — 2026-09-10

## Escopo
Somente Marketing da Dona Antônia. Sem Make, rollout externo, Meta Ads, Messenger, ativação de Instagram ou gasto pago.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN20-20260910.md` relidos antes das alterações.
- PR #254 segue aberta e isolada em `feat/marketing-center-v1-20260910`; `main` avançou por outras frentes e a PR continua com conflito, portanto nenhum rebase/merge foi forçado.
- PRs recentes auditadas: mudanças novas concentram-se em Agent Core/Flow, fora do escopo desta rodada.
- Supabase `ssbesxgaijknwsjbsbcz` auditado antes e depois.
- Runtime preservado: `enabled=false`, `execution_mode=off`, `canary_percent=0`, `kill_switch=true`, `require_approval=true`, `generation_enabled=false`, `deterministic_render_enabled=false`, `ai_image_enabled=false`, `ai_video_enabled=false`, `publishing_enabled=false`, seis publishers OFF, `attribution_recording_enabled=false`, budgets/limites em zero.

## Implementado

### 1. Read-model de métricas do renderer V13
Nova migration `20260911005000_marketing_render_metrics_v13.sql` e RPC `marketing_render_metrics_read_model_v1`.

Somente leitura, `SECURITY INVOKER`, janela limitada a até 366 dias e saída `external_side_effect=false`.

Métricas:
- jobs total/queued/processing/rendered/failed/review_required/cancelled;
- distribuição por `status` e `render_kind`;
- espera média e p95 de fila;
- tempo médio e p95 de render;
- tentativas totais, jobs com retry e taxa de sucesso determinística.

Privilégios homologados:
- `anon_execute=false`;
- `authenticated_execute=false`;
- `service_role_execute=true`.

### 2. Insights Edge V4
`admin-marketing-insights-v1` passou a compor em paralelo:
- `marketing_metrics_read_model_v1`;
- `marketing_render_metrics_read_model_v1`.

A Edge falha fechada se o read-model de render não declarar `external_side_effect=false`, mantém RBAC `owner|operator`, JWT obrigatório e não contém endpoints/tokens de Meta, Pinterest, Google ou OpenAI.

Deploy efetuado como versão 4, `ACTIVE`, `verify_jwt=true`.

### 3. Contrato CI ampliado
`test-marketing-insights-admin-v1.mjs` agora verifica:
- presença e composição server-only do read-model de renderer;
- fail-closed de `external_side_effect`;
- latência média/p95 e taxa de sucesso;
- `SECURITY INVOKER`;
- revogação de `public/anon/authenticated` e grant somente ao `service_role`;
- ausência de chamadas de rede/provider na migration.

O workflow dedicado já executa esse teste; a alteração da Edge/test dispara o `Marketing Center V1` na PR.

## Homologação transacional V12 — rollback-only
Foi executada fixture real dentro de transação seguida de `ROLLBACK`, cobrindo:
- worker incorreto -> `lease_mismatch_or_expired`;
- lease expirado -> `lease_mismatch_or_expired`;
- cross-slide -> `carousel_job_scope_mismatch`;
- cross-version -> `carousel_job_scope_mismatch`;
- mídia vinculada a outro job -> `output_media_job_mismatch`;
- conclusão válida -> sucesso não idempotente;
- replay idêntico -> sucesso idempotente.

O bloco terminou sem exceção e foi integralmente revertido.

## Auditoria pós-rodada
- assets: 0;
- render jobs: 0;
- fixtures Run 21 remanescentes: 0;
- eventos Marketing com `external_side_effect=true`: 0.
- read-model de 30 dias retornou todos os contadores/latências em zero e `external_side_effect=false`.

Todos os gates continuam OFF e nenhum provider externo foi chamado.

## Próxima rodada
1. Confirmar o GitHub Actions `Marketing Center V1` do HEAD da Run 21 e corrigir qualquer falha sem relaxar contratos.
2. Exibir no Admin, de forma compacta, os novos indicadores de render (fila, processando, renderizados, falhas, p95 e taxa de sucesso), sem polling contínuo.
3. Evoluir observabilidade de falhas/retries por `render_kind`, somente leitura.
4. Manter publishers oficiais exclusivamente em dry-run até autorização expressa.

## Status
Marketing ainda não está integralmente concluído/homologado programaticamente. A automação recorrente deve continuar.
