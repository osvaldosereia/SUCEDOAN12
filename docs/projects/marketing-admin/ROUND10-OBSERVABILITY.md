# Rodada 10 — Observabilidade segura

Data: 2026-09-18.

## Objetivo

Avançar as etapas 19, 21, 22 e 24 sem depender da homologação Meta/Pinterest e sem abrir publicação externa.

## Implementado

- migration `marketing_round10_observability_v1`;
- RPC `marketing_observability_read_model_v1()`;
- leitura determinística de jobs, publicados, itens que pedem atenção, agendamentos vencidos, touchpoints e eventos com side effect;
- visão por canal somente quando houver dados;
- confiança `insufficient_data` até existir evidência mínima de 3 publicações e 5 touchpoints;
- nenhuma IA, ranking, autoação, autoagendamento ou autopublicação;
- EXECUTE restrito a `service_role`;
- teste estrutural `tests/marketing-round10-observability-v1.test.mjs`.

## Validação real no Supabase

A migration foi aplicada com sucesso e a RPC retornou:

- `mode=observe_only`;
- publication_jobs=0;
- published=0;
- touchpoints=0;
- stale_scheduled=0;
- external_side_effect_events=0;
- confidence=`insufficient_data`;
- performance_claims_allowed=false;
- ai_used=false;
- auto_action=false;
- auto_schedule=false;
- auto_publish=false.

Runtime reconfirmado pela própria RPC:

- enabled=false;
- execution_mode=off;
- kill_switch=true;
- publishing_enabled=false;
- max_daily_publications=0.

## Commits

- `e71aa55bbc9cd7c7ce3fbf23d1d8ce00ba342b18` — RPC/migration;
- `b958937a671e90a45e4e51791f5936ca5a2ce053` — testes estruturais.

## Bloqueios humanos preservados

1. configurar App Domains e Valid OAuth Redirect URI na Meta;
2. concluir OAuth e homologar Page/Instagram exatos;
3. configurar Pinterest App/Secret/board;
4. autorização explícita futura para canary unitário.

Nenhum desses bloqueios foi contornado.

## Próximo trabalho autônomo seguro

- expor observabilidade pelo `admin-marketing-insights-v1` com validação fail-closed;
- adicionar painel read-only de saúde/confiança na UI;
- ampliar testes de regressão e documentação;
- continuar sem cron e sem qualquer publicação externa.
