# HANDOFF — Marketing Admin / Organic Social — Dona Antônia

Leia primeiro `CURRENT-STATE.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS-AND-GUARDRAILS.md` e `TECHNICAL-INVENTORY.md`.

## Branch canônica de desenvolvimento
`marketing-admin-round8-continue-20260918`

## Estado consolidado
Fase `connection_homologation`, com frentes internas avançando em paralelo. Meta App ID `1547249776748513` validado com o segredo do Vault em Graph `v26.0`; OAuth aceita somente Page `1928140920768577` e Instagram Business `17841451162237654` / `@dona_antonia_cuiaba`. Meta ainda depende de App Domain/Valid OAuth Redirect URI e consentimento. Pinterest depende de App/Secret/board.

Publicação deve permanecer fechada: `enabled=false`, `execution_mode=off`, `kill_switch=true`, `publishing_enabled=false`, `max_daily_publications=0`, channel gates=false. Sem canary sem autorização explícita. Make não é runtime novo.

## Rodada 9
Agenda V1 `preview_only`, tracking UTM preview sem gravação, Learning Engine determinístico sem IA/auto-otimização e Daily Plan dry-run sem campanha/job/agendamento/publicação.

## Rodada 10
`marketing_observability_read_model_v1()` aplicada. Snapshot real: 0 publication jobs, 0 published, 0 touchpoints, 0 stale scheduled e 0 external side effects. Confidence=`insufficient_data`; performance claims bloqueados até 3 publicações + 5 touchpoints reais.

## Rodada 11 — checkpoint atual
HEAD de entrada: `1fb5c99d260acf861d9f45cc4d153cb59252b575`.

Commits:
- `70429979020acc86f2c0ca19dc4e82083bcf5c54` — action `observability` na Edge Function com fail-closed;
- `e7340cbc1228d8801a957ecd0d04eeb5f1120dce` — `getMarketingObservability()` no cliente Admin;
- `f2991f542463c38af65a923dfcfa396a18143f10` — CURRENT-STATE atualizado.

A Edge Function ainda não foi redeployada nesta rodada; runtime v16 conhecido permanece até deploy posterior. Não afirmar que a action nova está ativa antes do deploy.

## Próxima ação segura
1. integrar observability ao `load()` e painel read-only de Saúde/Confiança;
2. adicionar testes estruturais fail-closed/zero side effect;
3. verificar checks;
4. deployar nova versão de `admin-marketing-insights-v1` com JWT=true somente após checks;
5. validar action no runtime real;
6. continuar agenda/métricas/attribution preview/learning/daily dry-run.

## Bloqueios humanos
- Meta App Domains + Valid OAuth Redirect URI;
- consentimento OAuth e identidade Meta;
- Pinterest App/Secret/board;
- autorização explícita futura de canary.

Se bloqueado externamente, continue tarefas internas. Não misture com Customer & Marketing OS.