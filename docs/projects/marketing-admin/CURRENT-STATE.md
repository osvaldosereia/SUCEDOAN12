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

## Rodadas 9–11 concluídas
- Agenda V1 `preview_only`, tracking UTM preview, Learning determinístico e Daily Plan dry-run;
- `marketing_observability_read_model_v1()` aplicada;
- painel Saúde e Confiança fail-closed no Admin;
- agenda permanece apenas sugestiva/preview, sem auto-schedule.

## Rodada 12 — Atribuição Comercial + Métricas de Canal — praticamente concluída
- fundação de atribuição cobre tracking UTM preview-only, touchpoints append-only, `evidence_key`, parent chain e read-model determinístico;
- `attribution_recording_enabled=false`;
- migration `marketing_round12_channel_metrics_v1` aplicada;
- tabela `marketing_channel_metric_snapshots` com RLS, sem acesso `anon/authenticated`, service-role-only e `evidence_key` único;
- RPC `marketing_channel_metrics_read_model_v1()` service-role-only normaliza reach/impressions/views/engagement/saves/shares;
- adapters puros Meta/Pinterest adicionados em `scripts/marketing-channel-metrics-adapters-v1.mjs` sem rede nem persistência;
- fixtures/teste de normalização adicionados em `scripts/marketing-channel-metrics-adapters-v1.test.mjs`;
- contrato fail-closed da Rodada 12 adicionado em `scripts/marketing-round12-contract.test.mjs`;
- backend `admin-marketing-insights-v1` ganhou action read-only `channel_metrics`, recusando qualquer read-model com collection enabled/automatic ou side effect;
- cliente Admin ganhou `getMarketingChannelMetrics(days)`;
- Edge Function `admin-marketing-insights-v1` implantada em v19 / ACTIVE / JWT=true preservando as actions anteriores;
- read-model real revalidado: `insufficient_data`, 0 snapshots, collection OFF/automatic=false/external_side_effect=false;
- nenhum coletor Meta/Pinterest foi criado ou ativado.

## Invariantes revalidados após deploy
- runtime OFF/fail-closed;
- publishing OFF;
- max_daily_publications=0;
- attribution recording OFF;
- todos os channel gates OFF;
- coletores Meta/Pinterest OFF/inexistentes;
- nenhuma consulta real aos providers nesta rodada.

## Bloqueios humanos restantes
1. Meta App Domains + Valid OAuth Redirect URI;
2. concluir OAuth Meta e homologar identidade exata;
3. Pinterest App/Secret/board;
4. autorização explícita futura para canary unitário.

## Próximo ponto seguro
Fechar formalmente o gate da Rodada 12 após executar/confirmar os testes disponíveis no ambiente e avançar diretamente à Rodada 13 — Learning Engine + Memória Criativa + Daily Planner. Não criar coleta externa para fabricar evidência.
