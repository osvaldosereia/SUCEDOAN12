# Inventário das Edge Functions

Retrato de produção em 28/11/2026 (projeto `ssbesxgaijknwsjbsbcz`). Chamadas somadas de 21/11 a 28/11/2026 nos logs do Supabase.

| Grupo | Total |
|---|---|
| Em uso | 22 |
| AME MAIS | 6 |
| Sem uso em 7 dias | 153 |
| **Total publicado** | **181** |

`No GitHub`: `sim` quando o código está em `supabase/functions/`, `arquivo` quando está em `supabase/functions-archive/`. `JWT` indica se o Supabase exige login antes de chamar a função.

## Achados desta conferência

1. **Só 22 das 181 funções da Dona Antônia foram chamadas em 7 dias.** As outras 153 não receberam nenhuma chamada e são candidatas a desativação, depois de confirmar que nenhuma integração externa (Meta, Bling, PapoAI) aponta para elas.
2. **6 funções do AME MAIS estão publicadas neste projeto.** Devem ir para o projeto `AME MAIS` (`awcclxehwzvvgajgpnmf`), junto com as tabelas que usam.
3. **Todas as funções publicadas foram baixadas e comparadas com a `main` em 28/11/2026.** 25 das 31 funções que existem em `supabase/functions/` são idênticas à produção. As diferenças estão na tabela abaixo.
4. **As funções que estavam só em produção agora estão no GitHub.** As 4 em uso (`admin-service-intelligence-v1`, `papo-external-agent-v1`, `whatsapp-1018-basket-flow-v1`, `whatsapp-flow-data-exchange-v1`) ficam em `supabase/functions/`. As 150 sem uso ficam em `supabase/functions-archive/`, fora da pasta publicada. `whatsapp-meta-order-router` e `whatsapp-outbox-worker` estão parciais no arquivo, porque importavam arquivos de fora da pasta de funções.
5. **`admin-service-intelligence-v1` tem um único `index.ts` de 594 KB** (mais 186 KB em `purchase-xml-v1/`). É a função mais chamada depois da vitrine e do admin, e a mais difícil de manter; o próximo passo é dividi-la em módulos.
6. **PapoAI não é mais usado.** A captura está desligada no banco desde 06/10/2026, e `papo-external-agent-v1` recusa cerca de 500 eventos por dia (401) que o PapoAI continua enviando. O webhook deve ser removido no painel do PapoAI; depois disso a função pode ser desativada.

### Diferenças entre produção e GitHub

| Função | Diferença | Situação |
|---|---|---|
| `whatsapp-meta-webhook-v1` | Módulo `whatsapp-meta-transport-v1.mjs` antigo em produção | **Republicada a partir da `main` em 28/11/2026 (versão 35)** |
| `site-card-admin-v1` | Produção tinha a versão nova do Cartão (locais Assaí, Fort e Atacadão), que faltava no GitHub | GitHub atualizado com a versão de produção |
| `whatsapp-ana-worker-v1` | Usa `_shared/ana-customer-context-v1.mjs`, que não existia no GitHub | Arquivo trazido da produção |
| `admin-orders-v1` | Módulo `whatsapp-meta-transport-v1.mjs` antigo em produção | **Republicada em 28/11/2026** |
| `admin-whatsapp-templates-v1` | Módulos `whatsapp-meta-transport-v1.mjs` e `whatsapp-meta-templates-v1.mjs` antigos em produção | **Republicada em 28/11/2026** |
| `whatsapp-ana-worker-v1` | Módulo `whatsapp-meta-transport-v1.mjs` antigo em produção | **Republicada em 28/11/2026** |
| `papo-external-agent-v1` | Módulo `whatsapp-core-v1.mjs` antigo em produção | **Removida em 28/11/2026** |

## Próximas ações sugeridas

| Ação | Risco | Depende de |
|---|---|---|
| ~~Republicar admin-orders-v1, admin-whatsapp-templates-v1 e whatsapp-ana-worker-v1~~ — feito em 28/11/2026 | — | — |
| Remover o webhook no painel do PapoAI (a função já foi removida) | Baixo | Dono |
| ~~Desativar as funções sem uso~~ — feito em 28/11/2026, ver "Limpeza" abaixo | — | — |
| ~~Mover as funções do AME MAIS~~ — revisado em 28/11/2026, ver "AME MAIS" abaixo | — | — |
| Dividir `admin-service-intelligence-v1` em módulos | Médio | Testes de contrato |

## Em uso

| Função | Chamadas 7d | Versão | Última publicação | JWT | No GitHub |
|---|---:|---:|---|---|---|
| `storefront-v2` | 26505 | 166 | 2026-11-28 | não | sim |
| `admin-service-intelligence-v1` | 11538 | 396 | 2026-11-26 | não | sim |
| `site-admin-v1` | 11003 | 74 | 2026-11-28 | não | sim |
| `whatsapp-meta-webhook-v1` | 7605 | 34 | 2026-10-29 | não | sim |
| `admin-products-live-v1` | 5033 | 196 | 2026-11-25 | não | sim |
| `whatsapp-1018-basket-flow-v1` | 4092 | 8 | 2026-10-25 | não | sim |
| `whatsapp-flow-data-exchange-v1` | 3976 | 77 | 2026-10-25 | não | sim |
| `papo-external-agent-v1` | 3548 | 128 | 2026-10-02 | não | sim |
| `instagram-automation-manager-v1` | 2031 | 8 | 2026-11-18 | não | sim |
| `whatsapp-ana-worker-v1` | 813 | 29 | 2026-10-28 | não | sim |
| `delivery-ops-v1` | 677 | 8 | 2026-11-28 | não | sim |
| `site-maintenance-v1` | 231 | 1 | 2026-11-28 | não | sim |
| `site-card-admin-v1` | 188 | 2 | 2026-11-23 | não | sim |
| `order-public-view-v1` | 172 | 20 | 2026-10-28 | não | sim |
| `order-customer-actions-v1` | 104 | 14 | 2026-10-28 | não | sim |
| `daily-offer-status-images-v1` | 80 | 8 | 2026-11-17 | não | sim |
| `admin-orders-v1` | 30 | 52 | 2026-10-28 | não | sim |
| `order-separation-notify-v1` | 25 | 17 | 2026-11-28 | não | sim |
| `whatsapp-papoai-guard-v1` | 14 | 1 | 2026-10-29 | não | sim |
| `publish-daily-offer-instagram-stories-v1` | 6 | 2 | 2026-11-18 | não | sim |
| `admin-whatsapp-templates-v1` | 4 | 31 | 2026-10-28 | não | sim |
| `site-order-message-admin-v1` | 4 | 7 | 2026-11-10 | não | sim |

## AME MAIS

| Função | Chamadas 7d | Versão | Última publicação | JWT | No GitHub |
|---|---:|---:|---|---|---|
| `caneca-studio` | 71 | 22 | 2026-11-16 | não | arquivo |
| `capineca-b2b` | 5 | 4 | 2026-11-25 | não | arquivo |
| `ame-estoque-cover-ai` | 0 | 13 | 2026-10-16 | não | arquivo |
| `ame-mais-analyze-v1` | 0 | 29 | 2026-09-25 | não | arquivo |
| `ame-mais-analyze-v2` | 0 | 20 | 2026-09-25 | não | arquivo |
| `ame-mais-loja-integrada` | 0 | 20 | 2026-09-25 | não | arquivo |

## Sem uso em 7 dias

| Função | Chamadas 7d | Versão | Última publicação | JWT | No GitHub |
|---|---:|---:|---|---|---|
| `admin-agent-learning-v1` | 0 | 22 | 2026-09-25 | não | arquivo |
| `admin-ai-action-registry-v1` | 0 | 25 | 2026-09-25 | não | arquivo |
| `admin-basket-configuration-v1` | 0 | 7 | 2026-10-25 | sim | arquivo |
| `admin-basket-guided-v1` | 0 | 17 | 2026-11-14 | sim | sim |
| `admin-basket-molds-browser-v1` | 0 | 1 | 2026-10-28 | sim | arquivo |
| `admin-basket-molds-v1` | 0 | 22 | 2026-10-20 | sim | arquivo |
| `admin-baskets-v1` | 0 | 25 | 2026-09-25 | não | arquivo |
| `admin-chat-deterministic-v1` | 0 | 20 | 2026-09-25 | não | arquivo |
| `admin-chat-menu-v1` | 0 | 23 | 2026-09-25 | não | arquivo |
| `admin-core-v1` | 0 | 25 | 2026-09-25 | não | arquivo |
| `admin-ean-capture-v1` | 0 | 23 | 2026-10-20 | sim | arquivo |
| `admin-experience-orchestrator-v1` | 0 | 26 | 2026-09-25 | não | arquivo |
| `admin-gondolas-v1` | 0 | 19 | 2026-09-25 | não | arquivo |
| `admin-kit-builder-v1` | 0 | 14 | 2026-10-06 | sim | arquivo |
| `admin-marketing-audiences-v1` | 0 | 14 | 2026-10-20 | sim | arquivo |
| `admin-marketing-brain-v1` | 0 | 30 | 2026-09-25 | não | arquivo |
| `admin-marketing-campaign-report-v1` | 0 | 14 | 2026-10-29 | não | sim |
| `admin-marketing-campaigns-v1` | 0 | 16 | 2026-10-20 | sim | arquivo |
| `admin-marketing-carousel-v1` | 0 | 24 | 2026-09-25 | não | arquivo |
| `admin-marketing-dry-run-v1` | 0 | 23 | 2026-09-25 | não | arquivo |
| `admin-marketing-insights-v1` | 0 | 37 | 2026-09-25 | não | arquivo |
| `admin-marketing-media-v1` | 0 | 29 | 2026-09-25 | não | arquivo |
| `admin-marketing-render-triage-v1` | 0 | 28 | 2026-09-25 | não | arquivo |
| `admin-marketing-strategy-campaign-v1` | 0 | 14 | 2026-11-14 | sim | sim |
| `admin-marketing-strategy-learnings-v1` | 0 | 13 | 2026-10-06 | sim | arquivo |
| `admin-marketing-strategy-v1` | 0 | 14 | 2026-11-14 | sim | sim |
| `admin-marketing-template-lifecycle-v1` | 0 | 13 | 2026-10-06 | sim | arquivo |
| `admin-marketing-workflow-v1` | 0 | 36 | 2026-09-25 | não | arquivo |
| `admin-ops-v1` | 0 | 27 | 2026-09-25 | não | arquivo |
| `admin-order-delivery-comms-v1` | 0 | 13 | 2026-10-05 | sim | arquivo |
| `admin-order-vitrine-send-v1` | 0 | 15 | 2026-10-05 | não | arquivo |
| `admin-orders-comprar-v1` | 0 | 23 | 2026-09-25 | não | arquivo |
| `admin-pin-auth-v1` | 0 | 26 | 2026-10-04 | não | arquivo |
| `admin-product-categories-v1` | 0 | 25 | 2026-09-25 | não | arquivo |
| `admin-product-image-editor-v1` | 0 | 19 | 2026-09-25 | não | arquivo |
| `admin-product-image-v1` | 0 | 2 | 2026-10-27 | sim | arquivo |
| `admin-product-images-bulk-grid18-v1` | 0 | 19 | 2026-09-25 | não | arquivo |
| `admin-product-images-v1` | 0 | 26 | 2026-09-25 | não | arquivo |
| `admin-product-names-v1` | 0 | 20 | 2026-09-25 | não | arquivo |
| `admin-product-whatsapp-availability-v1` | 0 | 2 | 2026-10-27 | sim | arquivo |
| `admin-products-browser-v1` | 0 | 2 | 2026-10-28 | sim | arquivo |
| `admin-service-intelligence-simple-v1` | 0 | 33 | 2026-09-30 | não | arquivo |
| `admin-service-strategy-v1` | 0 | 20 | 2026-09-25 | não | arquivo |
| `admin-simple-v2` | 0 | 28 | 2026-09-25 | não | arquivo |
| `admin-store-baskets-v1` | 0 | 18 | 2026-11-14 | sim | sim |
| `admin-v3-api` | 0 | 19 | 2026-09-25 | não | arquivo |
| `admin-v3-product-names` | 0 | 19 | 2026-09-25 | não | arquivo |
| `admin-whatsapp-1018-canary-v1` | 0 | 4 | 2026-10-24 | não | arquivo |
| `admin-whatsapp-1018-pilot-v1` | 0 | 17 | 2026-10-14 | não | arquivo |
| `admin-whatsapp-ana-customer-profile-v1` | 0 | 13 | 2026-10-05 | sim | arquivo |
| `admin-whatsapp-ana-preview-v1` | 0 | 31 | 2026-10-08 | sim | arquivo |
| `admin-whatsapp-direct-v1` | 0 | 26 | 2026-09-25 | não | arquivo |
| `admin-whatsapp-flow-setup-v1` | 0 | 3 | 2026-10-27 | sim | arquivo |
| `admin-whatsapp-flow-v1` | 0 | 25 | 2026-09-25 | não | arquivo |
| `admin-whatsapp-interactive-send-v1` | 0 | 2 | 2026-10-27 | sim | arquivo |
| `admin-whatsapp-ops-v1` | 0 | 40 | 2026-10-04 | não | arquivo |
| `admin-whatsapp-template-carousel-v1` | 0 | 13 | 2026-10-05 | não | arquivo |
| `admin-whatsapp-weekly-consent-v1` | 0 | 14 | 2026-10-05 | sim | arquivo |
| `admin-xml-catalog-stage-v1` | 0 | 21 | 2026-10-09 | sim | arquivo |
| `admin-xml-fiscal-evidence-stage-v4` | 0 | 12 | 2026-10-09 | sim | arquivo |
| `admin1-products-read-v1` | 0 | 10 | 2026-10-23 | não | arquivo |
| `basket-lot-image-v1` | 0 | 15 | 2026-11-14 | não | sim |
| `basket-shop-v1` | 0 | 29 | 2026-09-25 | não | arquivo |
| `basket-storefront-v1` | 0 | 24 | 2026-09-25 | não | arquivo |
| `bling-customers-import-once` | 0 | 27 | 2026-09-25 | não | arquivo |
| `bling-history-contact-enrichment-v1` | 0 | 19 | 2026-09-25 | não | arquivo |
| `bling-history-customer-backfill-v1` | 0 | 22 | 2026-09-25 | não | arquivo |
| `bling-history-import-v1` | 0 | 23 | 2026-09-25 | não | arquivo |
| `bling-history-status-discovery-v1` | 0 | 22 | 2026-09-25 | não | arquivo |
| `bling-products-import-once` | 0 | 25 | 2026-09-25 | não | arquivo |
| `bling-products-ingest` | 0 | 25 | 2026-09-25 | não | arquivo |
| `bootstrap-owner-v1` | 0 | 25 | 2026-09-25 | não | arquivo |
| `catalog-v3` | 0 | 22 | 2026-09-25 | não | arquivo |
| `conversation-worker-v2` | 0 | 26 | 2026-09-25 | não | arquivo |
| `conversation-worker-v3` | 0 | 28 | 2026-09-25 | não | arquivo |
| `cosmos-catalog-research-v1` | 0 | 14 | 2026-10-09 | sim | arquivo |
| `creative-storyboard-director` | 0 | 28 | 2026-09-25 | não | arquivo |
| `creative-storyboard-image` | 0 | 27 | 2026-09-25 | não | arquivo |
| `creative-storyboard-projects` | 0 | 34 | 2026-09-25 | não | arquivo |
| `creative-studio-assets-v1` | 0 | 21 | 2026-09-25 | não | arquivo |
| `creative-studio-director` | 0 | 24 | 2026-09-25 | não | arquivo |
| `creative-studio-jobs-v1` | 0 | 24 | 2026-09-25 | não | arquivo |
| `creative-video-projects-v1` | 0 | 19 | 2026-09-25 | não | arquivo |
| `customer-intelligence-v1` | 0 | 40 | 2026-09-25 | não | arquivo |
| `dona-antonia-agent-core-v1` | 0 | 37 | 2026-09-25 | não | arquivo |
| `dona-antonia-agent-eval-v1` | 0 | 29 | 2026-09-25 | não | arquivo |
| `dona-antonia-agent-learning-v1` | 0 | 23 | 2026-09-25 | não | arquivo |
| `inventory-count-v2` | 0 | 28 | 2026-09-25 | não | arquivo |
| `inventory-fast-autosave-v1` | 0 | 23 | 2026-09-25 | não | arquivo |
| `inventory-fast-balance-v2` | 0 | 22 | 2026-09-25 | não | arquivo |
| `inventory-fast-balance-v3` | 0 | 28 | 2026-09-25 | não | arquivo |
| `inventory-fast-stock-v1` | 0 | 23 | 2026-09-25 | não | arquivo |
| `inventory-fast-v1` | 0 | 26 | 2026-09-25 | não | arquivo |
| `inventory-product-research-v1` | 0 | 26 | 2026-09-25 | não | arquivo |
| `loja-integrada-probe-v1` | 0 | 9 | 2026-10-23 | não | arquivo |
| `loja-integrada-readonly-v1` | 0 | 7 | 2026-10-23 | sim | arquivo |
| `marketing-tracking-v1` | 0 | 13 | 2026-10-06 | não | arquivo |
| `meta-account-readiness-v1` | 0 | 2 | 2026-10-27 | sim | arquivo |
| `meta-catalog-link-verify-v1` | 0 | 2 | 2026-10-27 | sim | arquivo |
| `mini-catalog-v1` | 0 | 28 | 2026-09-25 | não | arquivo |
| `ops-order-template-bootstrap-20261005` | 0 | 14 | 2026-10-05 | não | arquivo |
| `order-addon-public-v1` | 0 | 14 | 2026-10-12 | não | arquivo |
| `order-postorder-confirm-v1` | 0 | 12 | 2026-10-13 | não | arquivo |
| `order-public-view-shortlink-smoke` | 0 | 14 | 2026-10-03 | não | arquivo |
| `order-public-view-v1-canary` | 0 | 14 | 2026-10-03 | não | arquivo |
| `oscb-catalog-worker-v1` | 0 | 12 | 2026-10-20 | não | arquivo |
| `papo-comprar-webhook-v1` | 0 | 27 | 2026-09-30 | não | arquivo |
| `product-catalog-enrichment-v1` | 0 | 9 | 2026-10-21 | não | arquivo |
| `product-image-manual-v1` | 0 | 20 | 2026-09-25 | não | arquivo |
| `product-image-openai-grid-v1` | 0 | 21 | 2026-09-25 | não | arquivo |
| `product-image-openai-grid18-v1` | 0 | 35 | 2026-09-25 | não | arquivo |
| `product-image-openai-v1` | 0 | 27 | 2026-11-13 | não | sim |
| `product-image-openai-v2` | 0 | 23 | 2026-09-25 | não | arquivo |
| `product-image-photo-only-v1` | 0 | 19 | 2026-09-25 | não | arquivo |
| `product-name-normalizer-v1` | 0 | 20 | 2026-09-25 | não | arquivo |
| `shopping-chat-admin-test-v1` | 0 | 20 | 2026-09-25 | não | arquivo |
| `shopping-chat-checkout-v2` | 0 | 19 | 2026-09-25 | não | arquivo |
| `shopping-chat-customer-v1` | 0 | 30 | 2026-09-25 | não | arquivo |
| `shopping-chat-deterministic-v1` | 0 | 19 | 2026-09-25 | não | arquivo |
| `shopping-chat-menu-v1` | 0 | 26 | 2026-09-25 | não | arquivo |
| `shopping-chat-products-v1` | 0 | 36 | 2026-09-25 | não | arquivo |
| `shopping-chat-v1` | 0 | 30 | 2026-09-25 | não | arquivo |
| `shopping-checkout-v2` | 0 | 23 | 2026-09-25 | não | arquivo |
| `shopping-room-reset-v1` | 0 | 20 | 2026-09-28 | não | arquivo |
| `shopping-room-sales-v1` | 0 | 24 | 2026-09-25 | não | arquivo |
| `shopping-room-v1` | 0 | 29 | 2026-09-25 | não | arquivo |
| `si5-catalog-research-v1` | 0 | 15 | 2026-10-09 | sim | arquivo |
| `site-order-separation-message-admin-v1` | 0 | 12 | 2026-11-10 | não | sim |
| `site-product-taxonomy-v1` | 0 | 1 | 2026-10-29 | não | sim |
| `tiktok-shop-oauth-callback` | 0 | 24 | 2026-09-25 | não | arquivo |
| `tiktok-shop-oauth-start` | 0 | 23 | 2026-09-25 | não | arquivo |
| `wfk-b7aea3edeffd37211d12` | 0 | 24 | 2026-09-25 | não | arquivo |
| `whatsapp-1018-meta-draft-once-v1` | 0 | 20 | 2026-10-14 | sim | arquivo |
| `whatsapp-admin-api` | 0 | 9 | 2026-10-26 | não | arquivo |
| `whatsapp-checkout-webhook` | 0 | 2 | 2026-10-26 | não | arquivo |
| `whatsapp-flow-data-exchange-greenfield-v1` | 0 | 3 | 2026-10-27 | não | arquivo |
| `whatsapp-flow-health-webhook-v1` | 0 | 23 | 2026-09-25 | não | arquivo |
| `whatsapp-flow-key-bootstrap-v1` | 0 | 24 | 2026-09-25 | não | arquivo |
| `whatsapp-flow-runtime` | 0 | 6 | 2026-10-26 | não | arquivo |
| `whatsapp-flow-session-open-v1` | 0 | 2 | 2026-10-27 | não | arquivo |
| `whatsapp-ingest` | 0 | 27 | 2026-09-25 | não | arquivo |
| `whatsapp-ingest-make-v1` | 0 | 29 | 2026-09-25 | não | arquivo |
| `whatsapp-marketing-worker-v1` | 0 | 18 | 2026-10-20 | não | arquivo |
| `whatsapp-meta-direct-v1` | 0 | 23 | 2026-09-30 | sim | arquivo |
| `whatsapp-meta-order-router` | 0 | 2 | 2026-10-26 | não | arquivo |
| `whatsapp-meta-order-webhook-v1` | 0 | 2 | 2026-10-27 | não | arquivo |
| `whatsapp-order-catalog-confirmation-v1` | 0 | 2 | 2026-10-27 | sim | arquivo |
| `whatsapp-order-confirmation-sender-v1` | 0 | 2 | 2026-10-27 | não | arquivo |
| `whatsapp-order-confirmation-v1` | 0 | 2 | 2026-10-27 | não | arquivo |
| `whatsapp-order-flow-send-v1` | 0 | 2 | 2026-10-27 | sim | arquivo |
| `whatsapp-order-intake-v1` | 0 | 2 | 2026-10-27 | não | arquivo |
| `whatsapp-outbound-v1` | 0 | 30 | 2026-10-01 | não | arquivo |
| `whatsapp-outbox-worker` | 0 | 2 | 2026-10-26 | não | arquivo |

## Limpeza de 28/11/2026

Depois da conferência, 126 funções foram removidas da produção. O código de todas está em `supabase/functions-archive/`, e cada uma pode ser publicada de novo a partir dali. Antes de remover, foi confirmado que:

- nenhuma delas recebeu chamada entre 07/11 e 28/11/2026 (21 dias de logs);
- nenhuma é chamada pelo site, pelo Admin, por rotinas agendadas, por funções SQL ou por outra função que continua publicada.

Com isso, a produção passou de 181 para 55 funções.

### Mantidas, mesmo sem chamadas recentes

| Função | Motivo |
|---|---|
| `admin-marketing-campaign-report-v1` | usada pelo painel (relatório de campanha) |
| `admin-whatsapp-ops-v1` | chamada por admin-products-live-v1 |
| `loja-integrada-probe-v1` | chamada por função SQL |
| `order-postorder-confirm-v1` | chamada por função SQL |
| `oscb-catalog-worker-v1` | rotina agendada (desligada) |
| `product-catalog-enrichment-v1` | rotina agendada (desligada) |
| `product-image-openai-v1` | usada pelo painel (imagens de produto) |
| `shopping-room-reset-v1` | chamada por admin-products-live-v1 |
| `site-order-separation-message-admin-v1` | usada pelo painel |
| `site-product-taxonomy-v1` | usada pelo painel |
| `whatsapp-marketing-worker-v1` | chamada por site-admin-v1 e por função SQL |
| `admin-basket-configuration-v1` | usada pelo build antigo em `/site2/` |
| `admin-basket-molds-browser-v1` | usada pelo build antigo em `/site2/` |
| `admin-product-image-v1` | usada pelo build antigo em `/site2/` |
| `admin-product-whatsapp-availability-v1` | usada pelo build antigo em `/site2/` |
| `admin-products-browser-v1` | usada pelo build antigo em `/site2/` |
| `admin-whatsapp-ana-preview-v1` | usada pelo build antigo em `/site2/` |
| `admin-whatsapp-flow-setup-v1` | usada pelo build antigo em `/site2/` |
| `admin-whatsapp-interactive-send-v1` | usada pelo build antigo em `/site2/` |
| `meta-account-readiness-v1` | usada pelo build antigo em `/site2/` |
| `meta-catalog-link-verify-v1` | usada pelo build antigo em `/site2/` |
| `whatsapp-order-catalog-confirmation-v1` | usada pelo build antigo em `/site2/` |
| `whatsapp-order-flow-send-v1` | usada pelo build antigo em `/site2/` |
| `admin-basket-guided-v1` | código mantido em `supabase/functions/` |
| `admin-marketing-strategy-campaign-v1` | código mantido em `supabase/functions/` |
| `admin-marketing-strategy-v1` | código mantido em `supabase/functions/` |
| `admin-store-baskets-v1` | código mantido em `supabase/functions/` |
| `basket-lot-image-v1` | código mantido em `supabase/functions/` |
| `caneca-studio`, `capineca-b2b` | em uso; usam tabelas deste banco |

### Removidas (126)

`admin-agent-learning-v1`, `admin-ai-action-registry-v1`, `admin-basket-molds-v1`, `admin-baskets-v1`, `admin-chat-deterministic-v1`, `admin-chat-menu-v1`, `admin-core-v1`, `admin-ean-capture-v1`, `admin-experience-orchestrator-v1`, `admin-gondolas-v1`, `admin-kit-builder-v1`, `admin-marketing-audiences-v1`, `admin-marketing-brain-v1`, `admin-marketing-campaigns-v1`, `admin-marketing-carousel-v1`, `admin-marketing-dry-run-v1`, `admin-marketing-insights-v1`, `admin-marketing-media-v1`, `admin-marketing-render-triage-v1`, `admin-marketing-strategy-learnings-v1`, `admin-marketing-template-lifecycle-v1`, `admin-marketing-workflow-v1`, `admin-ops-v1`, `admin-order-delivery-comms-v1`, `admin-order-vitrine-send-v1`, `admin-orders-comprar-v1`, `admin-pin-auth-v1`, `admin-product-categories-v1`, `admin-product-image-editor-v1`, `admin-product-images-bulk-grid18-v1`, `admin-product-images-v1`, `admin-product-names-v1`, `admin-service-intelligence-simple-v1`, `admin-service-strategy-v1`, `admin-simple-v2`, `admin-v3-api`, `admin-v3-product-names`, `admin-whatsapp-1018-canary-v1`, `admin-whatsapp-1018-pilot-v1`, `admin-whatsapp-ana-customer-profile-v1`, `admin-whatsapp-direct-v1`, `admin-whatsapp-flow-v1`, `admin-whatsapp-template-carousel-v1`, `admin-whatsapp-weekly-consent-v1`, `admin-xml-catalog-stage-v1`, `admin-xml-fiscal-evidence-stage-v4`, `admin1-products-read-v1`, `basket-shop-v1`, `basket-storefront-v1`, `bling-customers-import-once`, `bling-history-contact-enrichment-v1`, `bling-history-customer-backfill-v1`, `bling-history-import-v1`, `bling-history-status-discovery-v1`, `bling-products-import-once`, `bling-products-ingest`, `bootstrap-owner-v1`, `catalog-v3`, `conversation-worker-v2`, `conversation-worker-v3`, `cosmos-catalog-research-v1`, `creative-storyboard-director`, `creative-storyboard-image`, `creative-storyboard-projects`, `creative-studio-assets-v1`, `creative-studio-director`, `creative-studio-jobs-v1`, `creative-video-projects-v1`, `customer-intelligence-v1`, `dona-antonia-agent-core-v1`, `dona-antonia-agent-eval-v1`, `dona-antonia-agent-learning-v1`, `inventory-count-v2`, `inventory-fast-autosave-v1`, `inventory-fast-balance-v2`, `inventory-fast-balance-v3`, `inventory-fast-stock-v1`, `inventory-fast-v1`, `inventory-product-research-v1`, `loja-integrada-readonly-v1`, `marketing-tracking-v1`, `mini-catalog-v1`, `ops-order-template-bootstrap-20261005`, `order-addon-public-v1`, `order-public-view-shortlink-smoke`, `order-public-view-v1-canary`, `papo-comprar-webhook-v1`, `papo-external-agent-v1`, `product-image-manual-v1`, `product-image-openai-grid-v1`, `product-image-openai-grid18-v1`, `product-image-openai-v2`, `product-image-photo-only-v1`, `product-name-normalizer-v1`, `shopping-chat-admin-test-v1`, `shopping-chat-checkout-v2`, `shopping-chat-customer-v1`, `shopping-chat-deterministic-v1`, `shopping-chat-menu-v1`, `shopping-chat-products-v1`, `shopping-chat-v1`, `shopping-checkout-v2`, `shopping-room-sales-v1`, `shopping-room-v1`, `si5-catalog-research-v1`, `tiktok-shop-oauth-callback`, `tiktok-shop-oauth-start`, `wfk-b7aea3edeffd37211d12`, `whatsapp-1018-meta-draft-once-v1`, `whatsapp-admin-api`, `whatsapp-checkout-webhook`, `whatsapp-flow-data-exchange-greenfield-v1`, `whatsapp-flow-health-webhook-v1`, `whatsapp-flow-key-bootstrap-v1`, `whatsapp-flow-runtime`, `whatsapp-flow-session-open-v1`, `whatsapp-ingest`, `whatsapp-ingest-make-v1`, `whatsapp-meta-direct-v1`, `whatsapp-meta-order-router`, `whatsapp-meta-order-webhook-v1`, `whatsapp-order-confirmation-sender-v1`, `whatsapp-order-confirmation-v1`, `whatsapp-order-intake-v1`, `whatsapp-outbound-v1`, `whatsapp-outbox-worker`

### AME MAIS (revisão de 28/11/2026)

- `ame-estoque-cover-ai`, `ame-mais-analyze-v1`, `ame-mais-analyze-v2` e `ame-mais-loja-integrada` foram removidas deste projeto. Não tiveram chamadas em 21 dias, e a geração de capa de evento já existe no projeto do AME MAIS (`generate-event-cover`). O código está em `supabase/functions-archive/`.
- `caneca-studio` e `capineca-b2b` continuam aqui. Elas usam tabelas deste banco (`customers`, `admin_users`, `capineca_b2b_rate_limits`) e estão em uso, então não pertencem ao AME MAIS.

A produção ficou com 51 funções.
