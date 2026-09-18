# TECHNICAL INVENTORY — Marketing Admin

## Supabase

Projeto:
`ssbesxgaijknwsjbsbcz`

### Edge Functions principais

- `admin-marketing-workflow-v1` — workflow, revisão, preflight, publicação, OAuth/Connection Manager.
- `admin-marketing-media-v1` — render WebP + JPEG provider-ready.
- `admin-marketing-insights-v1` — overview/gates/jobs + read-models seguros da Rodada 9.
- `admin-marketing-carousel-v1` — carrossel.
- `admin-marketing-brain-v1` — estratégia/seleção.
- `creative-studio-director` — diretor criativo reutilizável.
- `creative-studio-assets-v1`.
- `creative-studio-jobs-v1`.

Versions no checkpoint atual:
- workflow v17, ACTIVE, JWT=true;
- media v10;
- insights v16, ACTIVE, JWT=true.

### Tabelas principais

- `marketing_campaigns`;
- `marketing_assets`;
- `marketing_asset_revisions`;
- `marketing_media_objects`;
- `marketing_render_jobs`;
- `marketing_publication_jobs`;
- `marketing_events`;
- `marketing_runtime_config`;
- `marketing_channel_accounts`;
- `marketing_oauth_sessions`.

### Migrations relevantes

- `20260918171048_marketing_light_video_poster_hash_invalidation_v2.sql`;
- `20260918172504_marketing_production_review_flow_v1.sql`;
- `20260918182110_marketing_official_publish_connectors_v1.sql`;
- `20260918183416_marketing_connection_manager_oauth_v1.sql`;
- `20260918184518_marketing_connection_disconnect_v1.sql`;
- `20260918185019_marketing_connection_manager_hardening_v2.sql`;
- `20260918203000_marketing_round9_autonomy_foundation_v1.sql`.

### Funções/RPCs críticas

Publicação/segurança:
- `marketing_publication_preflight_v1`;
- `marketing_publication_mark_started_v1`;
- `marketing_channel_secret_v1`;
- `marketing_oauth_cleanup_v1`;
- `marketing_vault_put_secret_v1`;
- `marketing_vault_get_secret_v1`;
- `marketing_vault_delete_provider_secret_v1`;
- `prepare_marketing_publication_jobs_v1`;
- `complete_marketing_light_video_preview_v1`.

Rodada 9 — somente leitura/preview:
- `marketing_editorial_plan_v1` — agenda editorial determinística, `preview_only`, sem auto-schedule;
- `marketing_tracking_link_v1` — URL UTM/asset/channel determinística, sem gravação de atribuição;
- `marketing_learning_read_model_v1` — aprendizado estatístico read-only, exige evidência mínima e não chama IA;
- `marketing_daily_plan_preview_v1` — plano diário dry-run, sem criar campanha/job/agendamento/publicação.

RPCs sensíveis: service_role only. As funções da Rodada 9 não abrem gates nem produzem side effects externos.

## GitHub

Repositório:
`osvaldosereia/SUCEDOAN12`

Branch isolada atual:
`marketing-admin-round8-continue-20260918`

### Admin

- `admin/marketing.js`;
- `admin/marketing-api.js`;
- `admin/marketing.css`;
- `admin/marketing-oauth-callback.html`.

### Edge source

- `supabase/functions/admin-marketing-workflow-v1/index.ts`;
- `supabase/functions/admin-marketing-workflow-v1/marketing-publish-adapters-v1.ts`;
- `supabase/functions/admin-marketing-workflow-v1/marketing-oauth-v1.ts`;
- `supabase/functions/admin-marketing-media-v1/index.ts`;
- `supabase/functions/admin-marketing-media-v1/marketing-art-v1.mjs`;
- `supabase/functions/admin-marketing-insights-v1/index.ts`.

### Workers/workflows

- `scripts/marketing-light-video-render-worker.mjs`;
- `scripts/marketing-preview-homologation.mjs`;
- `.github/workflows/marketing-light-video-preview.yml`;
- `.github/workflows/marketing-preview-homologation.yml`.

Nenhum cron de publicação externa está autorizado antes do canary humano explícito.

### Testes

- `tests/marketing-light-video-render-worker.test.mjs`;
- `tests/marketing-official-publish-connectors-v1.test.mjs`;
- `tests/marketing-connection-manager-oauth-v1.test.mjs`;
- `tests/marketing-visual-quality-v1.test.mjs`;
- `tests/marketing-round9-autonomy-foundation-v1.test.mjs`.

Checks estruturais da Rodada 9 no checkpoint: 14/14.

## Make

Org:
`6493671`

Team:
`975208`

### Conexões

Facebook:
- `7490477` — lista páginas e contas Instagram corretamente;
- `7650626` — lista páginas e contas Instagram corretamente.

Pinterest:
- `7490792` — cadastrada; falha ao listar boards; provável reautorização necessária.

### IDs recuperados

Meta App:
- nome histórico: `cell principal`;
- App ID: `1547249776748513`;
- validado server-side contra o App Secret do Vault via Graph `v26.0`.

Facebook Page:
- nome: Super Cestas;
- ID: `1928140920768577`.

Instagram Business:
- nome: Super Cestas;
- username: `@dona_antonia_cuiaba`;
- ID: `17841451162237654`.

### Cenários históricos Instagram/carrossel

- `6032233`;
- `6051595`;
- `6253699`;
- `6508939`;
- `6940562`.

Todos observados como inativos neste checkpoint.

### Cenários Meta/WhatsApp de inspeção

Há diversos cenários temporários HTTP de Meta/Flow. Usar apenas como referência; não reativar automaticamente.

## Bloqueios humanos atuais

- configurar no app Meta o App Domain/Valid OAuth Redirect URI para `donaantonia.com.br` / callback do Admin;
- concluir consentimento OAuth Meta e homologar a identidade exata;
- cadastrar/homologar Pinterest App/Secret e board;
- autorizar explicitamente um futuro canary unitário.

Esses bloqueios não devem ser contornados por código, Make ou token copiado.

## Runtime seguro esperado e reconfirmado

- `enabled=false`;
- `execution_mode=off`;
- `kill_switch=true`;
- `publishing_enabled=false`;
- `max_daily_publications=0`;
- todos os gates de publicação por canal=false;
- `attribution_recording_enabled=false`;
- 0 publication jobs reais até canary;
- 0 external side effects.

No snapshot da Rodada 9 existe 1 sessão OAuth Meta em `started`, originada da tentativa interrompida pela configuração manual de domínio/redirect URI. Ela não representa conexão homologada e não autoriza publicação.