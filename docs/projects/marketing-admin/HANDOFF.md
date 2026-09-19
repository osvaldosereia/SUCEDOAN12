# HANDOFF — Marketing Admin / Organic Social — Dona Antônia

Leia primeiro `CURRENT-STATE.md`, `AUTONOMOUS-COMPLETION-PLAN.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS-AND-GUARDRAILS.md` e `TECHNICAL-INVENTORY.md`.

## Branch canônica
`marketing-admin-round8-continue-20260918`

## Estado consolidado
Fase `connection_homologation`, com desenvolvimento interno autônomo. Meta App ID `1547249776748513` validado via Graph `v26.0`; backend aceita somente Page `1928140920768577` e Instagram Business `17841451162237654` / `@dona_antonia_cuiaba`. Meta ainda depende de App Domain/Valid OAuth Redirect URI e consentimento. Pinterest depende de App/Secret/board.

Publicação deve permanecer fechada: `enabled=false`, `execution_mode=off`, `kill_switch=true`, `publishing_enabled=false`, `max_daily_publications=0`, `attribution_recording_enabled=false`, channel gates=false. Sem canary sem autorização explícita. Make não é runtime novo.

## Rodadas concluídas
- Rodada 11: Observabilidade + Agenda Editorial concluída.

## Rodada 12 — checkpoint avançado
Atribuição e métricas agora possuem fundação completa em modo seguro: tracking UTM preview-only, touchpoints/evidence chain, snapshots RLS/service-role-only, `evidence_key` único, read-model normalizado, adapters puros Meta/Pinterest e testes/contratos sem rede.

Novo estado:
- `marketing_channel_metric_snapshots` e `marketing_channel_metrics_read_model_v1()` ativos;
- adapters puros em `scripts/marketing-channel-metrics-adapters-v1.mjs`;
- fixtures/teste em `scripts/marketing-channel-metrics-adapters-v1.test.mjs`;
- contrato fail-closed em `scripts/marketing-round12-contract.test.mjs`;
- `admin-marketing-insights-v1` v19 / ACTIVE / JWT=true com action `channel_metrics` read-only;
- Admin client expõe `getMarketingChannelMetrics(days)`;
- read-model real: `insufficient_data`, 0 snapshots, collection OFF, automatic=false, external_side_effect=false;
- nenhum coletor externo criado/ativado e nenhuma chamada Meta/Pinterest executada.

## Próxima ação segura
Executar/confirmar testes disponíveis, fechar formalmente o gate da Rodada 12 e avançar imediatamente à Rodada 13 — Learning Engine + Memória Criativa + Daily Planner. Não fabricar métricas e não consultar providers reais.

## Bloqueios humanos
- Meta App Domains + Valid OAuth Redirect URI;
- consentimento OAuth e identidade Meta;
- Pinterest App/Secret/board;
- autorização explícita futura de canary.

## Plano autônomo condensado
São 9 rodadas amplas, Rodada 11–19. Após `PROGRAMMATIC_COMPLETE=true`, não criar novo escopo; preservar gates e aguardar `HUMAN-ACTIONS.md`.
