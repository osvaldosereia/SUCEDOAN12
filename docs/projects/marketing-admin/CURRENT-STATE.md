# CURRENT STATE — Marketing Admin Dona Antônia

Snapshot de continuidade: **19/09/2026**.

## Fase atual
`connection_homologation` com desenvolvimento interno autônomo em paralelo. Publicação externa continua proibida.

## Runtime seguro confirmado
- enabled=false;
- execution_mode=off;
- kill_switch=true;
- publishing_enabled=false;
- max_daily_publications=0;
- todos os gates de publicação por canal=false;
- attribution_recording_enabled=false.

## Conexões
Meta App ID `1547249776748513` validado contra o App Secret do Vault via Graph `v26.0`. OAuth de usuário continua bloqueado pela configuração manual de App Domain/Valid OAuth Redirect URI no app Meta. Backend aceita somente Page `1928140920768577` e Instagram Business `17841451162237654` / `@dona_antonia_cuiaba`. Pinterest App/Secret/board continuam pendentes. Não contornar esses gates.

## Rodadas concluídas
- Rodada 11 — Observabilidade + Agenda Editorial: concluída.
- Rodada 12 — Atribuição Comercial + Métricas de Canal: fundação programática concluída em modo OFF/read-only, com tracking UTM preview-only, touchpoints/evidence chain, snapshots RLS/service-role-only, adapters puros Meta/Pinterest, fixtures/contratos sem rede e action `channel_metrics` fail-closed. Nenhum coletor externo foi criado/ativado.

## Rodada 13 — Learning Engine + Memória Criativa + Daily Planner — em andamento
A fundação Round 9 já fornece `marketing_learning_read_model_v1()` e `marketing_daily_plan_preview_v1()` determinísticos. Nesta rodada foi adicionada uma camada V2 pura e testável em `scripts/marketing-round13-learning-planner-v2.mjs`:
- thresholds mínimos de 3 publicações + 5 touchpoints;
- `insufficient_data` como estado explícito;
- ranking e auto-action sempre OFF;
- anti-repetição por fingerprint produto/hook/formato/canal;
- memória criativa consolidada por fingerprint;
- planner `dry_run` com `NO_ACTION`/`SUGGEST`;
- limites de candidatos e custo lógico;
- DRAFT atrás de gate explícito OFF/humano;
- `wouldCreateDraft=false`, `wouldSchedule=false`, `wouldPublish=false`;
- IA não usada e zero side effect externo.

Testes adicionados:
- `scripts/marketing-round13-learning-planner-v2.test.mjs`;
- `scripts/marketing-round13-contract.test.mjs`, proibindo rede, persistência, IA, timers e operações de publish/schedule nessa camada pura.

## Invariantes preservados
- runtime OFF/fail-closed;
- publishing OFF;
- max_daily_publications=0;
- attribution recording OFF;
- todos os channel gates OFF;
- sem consulta real Meta/Pinterest;
- sem cron, canary ou publicação externa;
- Make fora do runtime novo.

## Bloqueios humanos restantes
1. Meta App Domains + Valid OAuth Redirect URI;
2. concluir OAuth Meta e homologar identidade exata;
3. Pinterest App/Secret/board;
4. autorização explícita futura para canary unitário.

## Próximo ponto seguro
Continuar a Rodada 13 integrando a política V2 ao read-model/planner canônico somente de forma fail-closed e dry-run, executar os testes em ambiente com checkout quando disponível e então fechar o gate da Rodada 13. Depois avançar à Rodada 14 — Autonomy State Machine + Connection Readiness. Não fabricar evidência e não abrir DRAFT/publishing gates.
