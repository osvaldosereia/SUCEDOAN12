# TECHNICAL INVENTORY — Marketing Admin

## Supabase

Projeto:
`ssbesxgaijknwsjbsbcz`

### Edge Functions principais

- `admin-marketing-workflow-v1` — workflow, revisão, preflight, publicação, OAuth/Connection Manager.
- `admin-marketing-media-v1` — render WebP + JPEG provider-ready.
- `admin-marketing-insights-v1` — overview/gates/jobs.
- `admin-marketing-carousel-v1` — carrossel.
- `admin-marketing-brain-v1` — estratégia/seleção.
- `creative-studio-director` — diretor criativo reutilizável.
- `creative-studio-assets-v1`.
- `creative-studio-jobs-v1`.

Versions no checkpoint:
- workflow v15;
- media v10;
- insights v15.

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
- `20260918185019_marketing_connection_manager_hardening_v2.sql`.

### Funções/RPCs críticas

- `marketing_publication_preflight_v1`;
- `marketing_publication_mark_started_v1`;
- `marketing_channel_secret_v1`;
- `marketing_oauth_cleanup_v1`;
- `marketing_vault_put_secret_v1`;
- `marketing_vault_get_secret_v1`;
- `marketing_vault_delete_provider_secret_v1`;
- `prepare_marketing_publication_jobs_v1`;
- `complete_marketing_light_video_preview_v1`.

RPCs sensíveis: service_role only.

## GitHub

Repositório:
`osvaldosereia/SUCEDOAN12`

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
- `supabase/functions/admin-marketing-media-v1/marketing-art-v1.mjs`.

### Workers/workflows

- `scripts/marketing-light-video-render-worker.mjs`;
- `scripts/marketing-preview-homologation.mjs`;
- `.github/workflows/marketing-light-video-preview.yml`;
- `.github/workflows/marketing-preview-homologation.yml`.

### Testes

- `tests/marketing-light-video-render-worker.test.mjs`;
- `tests/marketing-official-publish-connectors-v1.test.mjs`;
- `tests/marketing-connection-manager-oauth-v1.test.mjs`;
- `tests/marketing-visual-quality-v1.test.mjs`.

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

## Runtime seguro esperado

- publishing_enabled=false;
- execution_mode=off;
- kill_switch=true;
- max_daily_publications=0;
- todos os gates false;
- 0 publication jobs reais até canary;
- 0 external side effects.
