# HANDOFF — Marketing Admin / Organic Social — Dona Antônia

Leia primeiro `CURRENT-STATE.md`, `AUTONOMOUS-COMPLETION-PLAN.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS-AND-GUARDRAILS.md` e `TECHNICAL-INVENTORY.md`.

## Branch canônica
`marketing-admin-round8-continue-20260918`

## Estado consolidado
Fase `connection_homologation`, com desenvolvimento interno autônomo. Meta App ID `1547249776748513` validado via Graph `v26.0`; backend aceita somente Page `1928140920768577` e Instagram Business `17841451162237654` / `@dona_antonia_cuiaba`. Meta ainda depende de App Domain/Valid OAuth Redirect URI e consentimento. Pinterest depende de App/Secret/board.

Publicação deve permanecer fechada: `enabled=false`, `execution_mode=off`, `kill_switch=true`, `publishing_enabled=false`, `max_daily_publications=0`, `attribution_recording_enabled=false`, channel gates=false. Sem canary sem autorização explícita. Make não é runtime novo.

## Rodadas concluídas
- Rodada 11 — Observabilidade + Agenda Editorial.
- Rodada 12 — Atribuição Comercial + Métricas de Canal, com fundação completa OFF/read-only: UTM preview, evidence chain, snapshots RLS/service-role-only, adapters puros Meta/Pinterest, fixtures/contratos sem rede e `channel_metrics` fail-closed.

## Rodada 13 — checkpoint
Learning/Planner V1 já existem como read-model/dry-run determinísticos. Foi adicionada a camada pura V2 em `scripts/marketing-round13-learning-planner-v2.mjs`, cobrindo thresholds mínimos, `insufficient_data`, anti-repetição produto/hook/formato/canal, memória criativa, `NO_ACTION`/`SUGGEST`, limites de custo/frequência lógica, DRAFT gate OFF e zero IA/side effect.

Testes/contratos adicionados:
- `scripts/marketing-round13-learning-planner-v2.test.mjs`;
- `scripts/marketing-round13-contract.test.mjs`.

## Próxima ação segura
Continuar a Rodada 13: integrar a política V2 ao caminho canônico apenas em dry-run/fail-closed, validar testes quando houver checkout executável e fechar seu gate. Em seguida avançar à Rodada 14 — Autonomy State Machine + Connection Readiness. Não fabricar métricas, não consultar providers reais e não abrir DRAFT/publishing.

## Bloqueios humanos
- Meta App Domains + Valid OAuth Redirect URI;
- consentimento OAuth e identidade Meta;
- Pinterest App/Secret/board;
- autorização explícita futura de canary.

## Plano autônomo condensado
São 9 rodadas amplas, Rodada 11–19. Após `PROGRAMMATIC_COMPLETE=true`, não criar novo escopo; preservar gates e aguardar `HUMAN-ACTIONS.md`.
