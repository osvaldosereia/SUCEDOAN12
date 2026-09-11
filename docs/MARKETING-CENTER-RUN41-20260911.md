# Marketing Center — Run 41 — 2026-09-11

## Escopo desta rodada

Somente Marketing, sem Make. A rodada continuou a branch limpa `feat/marketing-center-clean-20260911` / PR #276 e preservou a decisão de manter toda a UI de Marketing privada/dormente enquanto o Admin oficial continuar público e sem sessão JWT.

## Auditoria antes das alterações

- `docs/RETOMADA-DONA-ANTONIA.md` e o checkpoint Run 40 foram relidos antes das mudanças.
- PR #276 foi reavaliada contra a `main` atual; nenhuma tentativa de rebase/merge forçado foi feita.
- Supabase real `ssbesxgaijknwsjbsbcz` foi auditado antes das alterações.
- Todas as tabelas `public.marketing_%` auditadas continuam com RLS ligado.
- Funções `public.marketing_%` auditadas permanecem `SECURITY INVOKER` (`prosecdef=false`).
- Runtime real continua fail-closed: `enabled=false`, `execution_mode=off`, `kill_switch=true`, `canary_percent=0`, `generation_enabled=false`, `deterministic_render_enabled=false`, `ai_image_enabled=false`, `ai_video_enabled=false`, `publishing_enabled=false`, todos os publishers por canal OFF, attribution OFF, triage/requeue OFF, triage kill switch ON, aprovação obrigatória e todos os budgets/limites pagos em zero.
- Contagens antes da alteração: 0 assets, 0 render jobs, 0 publication jobs e 0 triage requests. Existem 8 eventos históricos internos de Marketing; nenhum novo side effect externo foi criado nesta rodada.

## Implementado

### Operações privadas somente leitura

Novo módulo: `admin-v3/marketing-operations-readonly-v1.js`.

Ele entrega uma visão consolidada, exclusivamente de leitura, de:

- Campanhas, agrupando assets pelo `campaign_id` do read model do editor.
- Calendário de Marketing.
- Fila de render.
- Fila de publicação já existente no banco.
- Conteúdos aguardando aprovação.

O módulo:

- exige JWT salvo em `da_admin_v3_auth`;
- chama somente `admin-marketing-workflow-v1`;
- usa apenas as ações de leitura `workflow_overview` e `editor_overview`;
- exige `external_side_effect=false` em cada resposta e falha fechado caso contrário;
- não oferece `submit_review`, `approve_asset`, `schedule_job`, `unschedule_job`, `publish`, `execute` ou `requeue`;
- não possui polling automático (`setInterval` ausente);
- não contém endpoint direto de Meta, OpenAI, Pinterest ou Google;
- continua dormente e não é importado pelo `admin/app-lite.js` público.

A escolha deliberada foi NÃO transplantar `admin-v3/marketing-workflow-v1.js` histórico, porque aquele módulo contém botões/mutações de aprovação e agendamento. Nesta fase, o slice equivalente entrou como read-only para preservar todos os gates de rollout.

## Testes e guards

TDD iniciou com `scripts/test-marketing-operations-readonly-v1.mjs` antes da implementação. O contrato exige JWT/Bearer, Edge interna protegida, ambos os read models, fail-closed, Campanhas/Calendário/Filas/Aprovação, ausência de ações mutantes, ausência de polling e ausência de providers externos.

`test-marketing-clean-transplant-v1.mjs` foi ampliado para incluir o novo módulo na lista de superfícies privadas/dormentes e proibir que o Admin público o carregue.

`.github/workflows/marketing-center-clean-v1.yml` agora executa `node --check admin-v3/marketing-operations-readonly-v1.js` e o novo contrato dedicado.

Commit funcional do bloco/CI: `84cf5b40b1be1315a04ec0514f8c3c0485c4e86b`.

Workflow `Marketing Center Clean Transplant` run `34650914670` terminou `completed/success` para esse commit funcional. O HEAD documental posterior não altera código executável nem entra nos paths de disparo desse workflow.

## Rollout / produção

Nenhuma migration, Edge Function ou integração foi implantada/reimplantada no Supabase nesta rodada. Nenhum publisher foi ligado. Nenhum canary foi aumentado. Nenhum uso de IA paga, Meta Ads, Instagram/Messenger ou gasto externo foi habilitado.

## Próxima rodada segura

1. Reauditar PR #276 contra a `main` atual.
2. Transplantar o próximo slice privado/read-only de métricas/publicadores oficiais, priorizando observabilidade e readiness por canal, sem executar publicação real.
3. Continuar mantendo o Marketing fora do Admin público até existir uma superfície autenticada compatível com JWT/RBAC.
