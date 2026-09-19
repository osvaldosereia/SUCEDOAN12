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
- `admin-marketing-insights-v1` v17 / ACTIVE / JWT=true com `observability` read-only;
- painel Saúde e Confiança fail-closed no Admin;
- agenda permanece apenas sugestiva/preview, sem auto-schedule.

## Rodada 12 — Atribuição Comercial + Métricas de Canal — em andamento
- a fundação de atribuição existente já cobre `marketing_tracking_link_v1`, `marketing_attribution_touchpoints`, `evidence_key`, cadeia pai e `marketing_attribution_read_model_v1`;
- UTM permanece preview-only e `attribution_recording_enabled=false`;
- criada e aplicada migration `marketing_round12_channel_metrics_v1`;
- criada tabela `marketing_channel_metric_snapshots`, RLS ligada e sem acesso `anon/authenticated`; escrita/leitura bruta reservada a `service_role`;
- `evidence_key` é único para dedupe/idempotência;
- snapshots suportam providers `meta` e `pinterest`, mas nenhum coletor externo foi criado/ativado;
- criada RPC service-role-only `marketing_channel_metrics_read_model_v1()`;
- read-model normaliza `reach`, `impressions`, `views`, `engagement`, `saves`, `shares` por canal;
- estado real atual é `insufficient_data`, 0 snapshots, `collection.enabled=false`, `automatic=false`, `external_side_effect=false`;
- migration canônica também foi salva no GitHub em `supabase/migrations/20260919001500_marketing_round12_channel_metrics_v1.sql`.

## Invariantes revalidados
- runtime permanece OFF/fail-closed;
- attribution recording OFF;
- coletores Meta/Pinterest OFF/inexistentes;
- published jobs continuam 0;
- external side effect events continuam 0.

## Bloqueios humanos restantes
1. Meta App Domains + Valid OAuth Redirect URI;
2. concluir OAuth Meta e homologar identidade exata;
3. Pinterest App/Secret/board;
4. autorização explícita futura para canary unitário.

## Próximo ponto seguro
Continuar a Rodada 12: adicionar contratos/adapters puros de normalização Meta/Pinterest, fixtures sintéticas, testes de dedupe/evidence e integrar o novo read-model ao backend/Admin sem criar coletor externo. Depois, se o gate da Rodada 12 estiver comprovado, avançar diretamente à Rodada 13 — Learning Engine + Memória Criativa + Daily Planner.
