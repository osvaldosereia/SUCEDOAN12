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

## Rodada 11
- action `observability` implementada na Edge Function com fail-closed;
- `getMarketingObservability()` implementado no cliente Admin;
- `admin-marketing-insights-v1` agora está **v17 / ACTIVE / JWT=true** no Supabase;
- deploy não abriu publicação, cron, Make ou qualquer gate externo;
- checkpoint documental: `ffd56b37f9b39e387530b8470f1275bac5f1bbd6` atualizou CURRENT-STATE antes deste HANDOFF.

## Próxima ação segura
1. reler o HEAD antes de editar, pois existem frentes paralelas no mesmo repositório;
2. integrar observability ao `load()` e painel read-only de Saúde/Confiança;
3. adicionar testes estruturais fail-closed/zero side effect para action/client/UI;
4. validar action v17 pelo fluxo autenticado do Admin;
5. continuar agenda/métricas/attribution preview/learning/daily dry-run.

## Bloqueios humanos
- Meta App Domains + Valid OAuth Redirect URI;
- consentimento OAuth e identidade Meta;
- Pinterest App/Secret/board;
- autorização explícita futura de canary.

Se bloqueado externamente, continue tarefas internas. Não misture com Customer & Marketing OS.
## Plano autônomo até conclusão programática

A sequência canônica das próximas rodadas está em `docs/projects/marketing-admin/AUTONOMOUS-COMPLETION-PLAN.md`.

Executar da Rodada 11 até a Rodada 27, sempre pulando o que já estiver concluído por implementação equivalente e avançando para a próxima tarefa segura. O objetivo é terminar toda programação que não depende do owner e só então marcar `PROGRAMMATIC_COMPLETE=true`.

Após `PROGRAMMATIC_COMPLETE=true`, não inventar novo escopo: rodadas futuras devem apenas confirmar o gate, preservar segurança e aguardar as ações humanas descritas em `HUMAN-ACTIONS.md`.


## Plano autônomo condensado — 9 rodadas

O plano canônico foi condensado para **9 rodadas amplas**, da Rodada 11 à Rodada 19, em `AUTONOMOUS-COMPLETION-PLAN.md`. Cada execução deve concluir múltiplos subblocos sempre que possível. Esta regra substitui qualquer referência anterior a Rodadas 11–27.
