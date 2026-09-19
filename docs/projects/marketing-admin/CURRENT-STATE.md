# CURRENT STATE — Marketing Admin Dona Antônia

Snapshot de continuidade: **18/09/2026**.

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

## Rodada 9 — autonomia segura
- `marketing_editorial_plan_v1`: agenda `preview_only`, sem auto-schedule;
- `marketing_tracking_link_v1`: UTM/asset/channel sem gravação;
- `marketing_learning_read_model_v1`: learning determinístico, sem IA e sem auto-otimização;
- `marketing_daily_plan_preview_v1`: dry-run, sem criar campanha/job/agendamento/publicação;
- migration `marketing_round9_autonomy_foundation_v1` aplicada.

## Rodada 10 — observabilidade
- migration/RPC `marketing_observability_read_model_v1` aplicada;
- modelo é `observe_only`, determinístico, sem IA e sem ações automáticas;
- confidence=`insufficient_data`; performance claims proibidos até pelo menos 3 publicações e 5 touchpoints reais.

## Rodada 11 — Observabilidade + Agenda Editorial
- `admin-marketing-insights-v1` permanece v17 / ACTIVE / JWT=true com action read-only `observability`;
- `admin/marketing-api.js` mantém `getMarketingObservability()`;
- novo `admin/marketing-observability-panel.js` monta no Painel a leitura de Saúde e Confiança após autenticação do Admin;
- painel valida fail-closed `mode=observe_only`, `auto_action=false`, `auto_publish=false`, `auto_schedule=false` antes de renderizar;
- painel mostra runtime, kill switch, publicações, touchpoints, stale scheduled e external side effects sem IA nem mutação;
- refresh do Marketing também renova a leitura de observabilidade;
- teste contratual `tests/marketing-observability-admin-contract.mjs` protege action, autenticação/no-store e ausência de operações de publicação/conexão no módulo;
- agenda V1 continua `preview_only`, com conflitos e sugestões operacionais, sem auto-schedule.

## Invariantes revalidados no Supabase após as mudanças
- enabled=false;
- execution_mode=off;
- kill_switch=true;
- publishing_enabled=false;
- max_daily_publications=0;
- attribution_recording_enabled=false;
- Instagram/Facebook/Pinterest/WhatsApp publish gates=false;
- published_jobs=0;
- external_side_effect_events=0.

## Bloqueios humanos restantes
1. Meta App Domains + Valid OAuth Redirect URI;
2. concluir OAuth Meta e homologar identidade exata;
3. Pinterest App/Secret/board;
4. autorização explícita futura para canary unitário.

## Próximo ponto seguro
1. seguir a Rodada 12 do `AUTONOMOUS-COMPLETION-PLAN.md`: Atribuição Comercial + Métricas de Canal;
2. preservar ingestão/coletores OFF e trabalhar com fixtures sintéticas;
3. manter todos os gates externos fechados;
4. não usar Make como runtime novo.