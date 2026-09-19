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
- runtime real consultado nesta continuidade: 0 publication jobs, 0 published, 0 touchpoints, 0 stale scheduled e 0 external side effects;
- confidence=`insufficient_data`; performance claims proibidos até pelo menos 3 publicações e 5 touchpoints reais.

## Rodada 11 — integração segura da observabilidade
- branch preservada: `marketing-admin-round8-continue-20260918`;
- `admin-marketing-insights-v1/index.ts` expõe ação read-only `observability` e recusa payload que não seja `observe_only` ou que indique auto_action/auto_publish/auto_schedule;
- `admin/marketing-api.js` possui `getMarketingObservability()` para consumo do Admin;
- `admin-marketing-insights-v1` foi implantada em **v17 / ACTIVE / JWT=true** em 18/09/2026, ativando a action read-only no runtime sem abrir publicação;
- nenhuma publicação, cron, Make ou gate externo foi ativado.

## Bloqueios humanos restantes
1. Meta App Domains + Valid OAuth Redirect URI;
2. concluir OAuth Meta e homologar identidade exata;
3. Pinterest App/Secret/board;
4. autorização explícita futura para canary unitário.

## Próximo ponto seguro
1. integrar `getMarketingObservability()` ao `load()` e a um painel read-only de saúde/confiança no Admin;
2. adicionar testes estruturais para action/client/UI e fail-closed;
3. validar a action v17 pelo fluxo autenticado do Admin;
4. continuar métricas/agenda/learning/dry-run sem side effects;
5. manter publicação externa totalmente OFF.