# Inventário das Edge Functions

Retrato de produção em 28/11/2026 (projeto `ssbesxgaijknwsjbsbcz`). Chamadas somadas de 21/11 a 28/11/2026 nos logs do Supabase.

| Grupo | Total |
|---|---|
| Em uso | 22 |
| AME MAIS | 6 |
| Sem uso em 7 dias | 153 |
| **Total publicado** | **181** |

`No GitHub` indica se o código está em `supabase/functions/`. `JWT` indica se o Supabase exige login antes de chamar a função.

## Achados desta conferência

1. **Só 22 das 181 funções da Dona Antônia foram chamadas em 7 dias.** As outras 153 não receberam nenhuma chamada e são candidatas a desativação, depois de confirmar que nenhuma integração externa (Meta, Bling, PapoAI) aponta para elas.
2. **6 funções do AME MAIS estão publicadas neste projeto.** Devem ir para o projeto `AME MAIS` (`awcclxehwzvvgajgpnmf`), junto com as tabelas que usam.
3. **O código de produção foi conferido contra a `main` nas 8 funções mais críticas:** `storefront-v2`, `site-admin-v1`, `admin-products-live-v1`, `delivery-ops-v1`, `instagram-automation-manager-v1`, `whatsapp-meta-webhook-v1`, `order-separation-notify-v1` e `site-maintenance-v1`. Todas são idênticas à `main`, exceto o módulo compartilhado `_shared/whatsapp-meta-transport-v1.mjs` publicado com `whatsapp-meta-webhook-v1`. A versão publicada só aceita links de 64 caracteres em botões de modelo, enquanto a `main` aceita também os links públicos de 16 caracteres. Basta publicar de novo `whatsapp-meta-webhook-v1` a partir da `main` para alinhar.
4. **As 4 funções em uso que faltavam agora estão no GitHub:** `admin-service-intelligence-v1`, `papo-external-agent-v1`, `whatsapp-1018-basket-flow-v1` e `whatsapp-flow-data-exchange-v1`.
5. **`admin-service-intelligence-v1` tem um único `index.ts` de 594 KB** (mais 186 KB em `purchase-xml-v1/`). É a função mais chamada depois da vitrine e do admin, e a mais difícil de manter; o próximo passo é dividi-la em módulos.
6. **`papo-external-agent-v1` recusa cerca de 500 chamadas por dia (401).** A captura do PapoAI está desligada no banco (`papoai_webhook_runtime_v2.capture_enabled = false`) desde 06/10/2026, mas o PapoAI continua enviando eventos. Se o PapoAI não é mais usado, o webhook deve ser removido no painel dele; se ainda é, a captura precisa ser religada.
7. **Falta conferir 11 funções em uso que já estão no GitHub** (`admin-orders-v1`, `admin-whatsapp-templates-v1`, `whatsapp-ana-worker-v1`, `site-order-message-admin-v1`, `site-order-separation-message-admin-v1`, `site-card-admin-v1`, `daily-offer-status-images-v1`, `publish-daily-offer-instagram-stories-v1`, `order-public-view-v1`, `order-customer-actions-v1`, `whatsapp-papoai-guard-v1`). A última publicação delas é anterior ao último commit, então o GitHub pode ter mudanças ainda não publicadas.
8. **O código das 153 funções sem uso não foi baixado.** Para arquivá-las antes de desativar, e para fazer a conferência do item 7, é preciso um token de acesso do Supabase (`sbp_...`) válido nesta sessão.

## Próximas ações sugeridas

| Ação | Risco | Depende de |
|---|---|---|
| Publicar de novo `whatsapp-meta-webhook-v1` a partir da `main` | Baixo | Aprovação |
| Remover o webhook do PapoAI ou religar a captura | Baixo | Decisão do dono |
| Arquivar e desativar as 153 funções sem uso | Médio | Token `sbp_` e aprovação |
| Mover as funções do AME MAIS para o projeto próprio | Médio | Aprovação |
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
| `caneca-studio` | 71 | 22 | 2026-11-16 | não | **não** |
| `capineca-b2b` | 5 | 4 | 2026-11-25 | não | **não** |
| `ame-estoque-cover-ai` | 0 | 13 | 2026-10-16 | não | **não** |
| `ame-mais-analyze-v1` | 0 | 29 | 2026-09-25 | não | **não** |
| `ame-mais-analyze-v2` | 0 | 20 | 2026-09-25 | não | **não** |
| `ame-mais-loja-integrada` | 0 | 20 | 2026-09-25 | não | **não** |

## Sem uso em 7 dias

| Função | Chamadas 7d | Versão | Última publicação | JWT | No GitHub |
|---|---:|---:|---|---|---|
| `admin-agent-learning-v1` | 0 | 22 | 2026-09-25 | não | **não** |
| `admin-ai-action-registry-v1` | 0 | 25 | 2026-09-25 | não | **não** |
| `admin-basket-configuration-v1` | 0 | 7 | 2026-10-25 | sim | **não** |
| `admin-basket-guided-v1` | 0 | 17 | 2026-11-14 | sim | sim |
| `admin-basket-molds-browser-v1` | 0 | 1 | 2026-10-28 | sim | **não** |
| `admin-basket-molds-v1` | 0 | 22 | 2026-10-20 | sim | **não** |
| `admin-baskets-v1` | 0 | 25 | 2026-09-25 | não | **não** |
| `admin-chat-deterministic-v1` | 0 | 20 | 2026-09-25 | não | **não** |
| `admin-chat-menu-v1` | 0 | 23 | 2026-09-25 | não | **não** |
| `admin-core-v1` | 0 | 25 | 2026-09-25 | não | **não** |
| `admin-ean-capture-v1` | 0 | 23 | 2026-10-20 | sim | **não** |
| `admin-experience-orchestrator-v1` | 0 | 26 | 2026-09-25 | não | **não** |
| `admin-gondolas-v1` | 0 | 19 | 2026-09-25 | não | **não** |
| `admin-kit-builder-v1` | 0 | 14 | 2026-10-06 | sim | **não** |
| `admin-marketing-audiences-v1` | 0 | 14 | 2026-10-20 | sim | **não** |
| `admin-marketing-brain-v1` | 0 | 30 | 2026-09-25 | não | **não** |
| `admin-marketing-campaign-report-v1` | 0 | 14 | 2026-10-29 | não | sim |
| `admin-marketing-campaigns-v1` | 0 | 16 | 2026-10-20 | sim | **não** |
| `admin-marketing-carousel-v1` | 0 | 24 | 2026-09-25 | não | **não** |
| `admin-marketing-dry-run-v1` | 0 | 23 | 2026-09-25 | não | **não** |
| `admin-marketing-insights-v1` | 0 | 37 | 2026-09-25 | não | **não** |
| `admin-marketing-media-v1` | 0 | 29 | 2026-09-25 | não | **não** |
| `admin-marketing-render-triage-v1` | 0 | 28 | 2026-09-25 | não | **não** |
| `admin-marketing-strategy-campaign-v1` | 0 | 14 | 2026-11-14 | sim | sim |
| `admin-marketing-strategy-learnings-v1` | 0 | 13 | 2026-10-06 | sim | **não** |
| `admin-marketing-strategy-v1` | 0 | 14 | 2026-11-14 | sim | sim |
| `admin-marketing-template-lifecycle-v1` | 0 | 13 | 2026-10-06 | sim | **não** |
| `admin-marketing-workflow-v1` | 0 | 36 | 2026-09-25 | não | **não** |
| `admin-ops-v1` | 0 | 27 | 2026-09-25 | não | **não** |
| `admin-order-delivery-comms-v1` | 0 | 13 | 2026-10-05 | sim | **não** |
| `admin-order-vitrine-send-v1` | 0 | 15 | 2026-10-05 | não | **não** |
| `admin-orders-comprar-v1` | 0 | 23 | 2026-09-25 | não | **não** |
| `admin-pin-auth-v1` | 0 | 26 | 2026-10-04 | não | **não** |
| `admin-product-categories-v1` | 0 | 25 | 2026-09-25 | não | **não** |
| `admin-product-image-editor-v1` | 0 | 19 | 2026-09-25 | não | **não** |
| `admin-product-image-v1` | 0 | 2 | 2026-10-27 | sim | **não** |
| `admin-product-images-bulk-grid18-v1` | 0 | 19 | 2026-09-25 | não | **não** |
| `admin-product-images-v1` | 0 | 26 | 2026-09-25 | não | **não** |
| `admin-product-names-v1` | 0 | 20 | 2026-09-25 | não | **não** |
| `admin-product-whatsapp-availability-v1` | 0 | 2 | 2026-10-27 | sim | **não** |
| `admin-products-browser-v1` | 0 | 2 | 2026-10-28 | sim | **não** |
| `admin-service-intelligence-simple-v1` | 0 | 33 | 2026-09-30 | não | **não** |
| `admin-service-strategy-v1` | 0 | 20 | 2026-09-25 | não | **não** |
| `admin-simple-v2` | 0 | 28 | 2026-09-25 | não | **não** |
| `admin-store-baskets-v1` | 0 | 18 | 2026-11-14 | sim | sim |
| `admin-v3-api` | 0 | 19 | 2026-09-25 | não | **não** |
| `admin-v3-product-names` | 0 | 19 | 2026-09-25 | não | **não** |
| `admin-whatsapp-1018-canary-v1` | 0 | 4 | 2026-10-24 | não | **não** |
| `admin-whatsapp-1018-pilot-v1` | 0 | 17 | 2026-10-14 | não | **não** |
| `admin-whatsapp-ana-customer-profile-v1` | 0 | 13 | 2026-10-05 | sim | **não** |
| `admin-whatsapp-ana-preview-v1` | 0 | 31 | 2026-10-08 | sim | **não** |
| `admin-whatsapp-direct-v1` | 0 | 26 | 2026-09-25 | não | **não** |
| `admin-whatsapp-flow-setup-v1` | 0 | 3 | 2026-10-27 | sim | **não** |
| `admin-whatsapp-flow-v1` | 0 | 25 | 2026-09-25 | não | **não** |
| `admin-whatsapp-interactive-send-v1` | 0 | 2 | 2026-10-27 | sim | **não** |
| `admin-whatsapp-ops-v1` | 0 | 40 | 2026-10-04 | não | **não** |
| `admin-whatsapp-template-carousel-v1` | 0 | 13 | 2026-10-05 | não | **não** |
| `admin-whatsapp-weekly-consent-v1` | 0 | 14 | 2026-10-05 | sim | **não** |
| `admin-xml-catalog-stage-v1` | 0 | 21 | 2026-10-09 | sim | **não** |
| `admin-xml-fiscal-evidence-stage-v4` | 0 | 12 | 2026-10-09 | sim | **não** |
| `admin1-products-read-v1` | 0 | 10 | 2026-10-23 | não | **não** |
| `basket-lot-image-v1` | 0 | 15 | 2026-11-14 | não | sim |
| `basket-shop-v1` | 0 | 29 | 2026-09-25 | não | **não** |
| `basket-storefront-v1` | 0 | 24 | 2026-09-25 | não | **não** |
| `bling-customers-import-once` | 0 | 27 | 2026-09-25 | não | **não** |
| `bling-history-contact-enrichment-v1` | 0 | 19 | 2026-09-25 | não | **não** |
| `bling-history-customer-backfill-v1` | 0 | 22 | 2026-09-25 | não | **não** |
| `bling-history-import-v1` | 0 | 23 | 2026-09-25 | não | **não** |
| `bling-history-status-discovery-v1` | 0 | 22 | 2026-09-25 | não | **não** |
| `bling-products-import-once` | 0 | 25 | 2026-09-25 | não | **não** |
| `bling-products-ingest` | 0 | 25 | 2026-09-25 | não | **não** |
| `bootstrap-owner-v1` | 0 | 25 | 2026-09-25 | não | **não** |
| `catalog-v3` | 0 | 22 | 2026-09-25 | não | **não** |
| `conversation-worker-v2` | 0 | 26 | 2026-09-25 | não | **não** |
| `conversation-worker-v3` | 0 | 28 | 2026-09-25 | não | **não** |
| `cosmos-catalog-research-v1` | 0 | 14 | 2026-10-09 | sim | **não** |
| `creative-storyboard-director` | 0 | 28 | 2026-09-25 | não | **não** |
| `creative-storyboard-image` | 0 | 27 | 2026-09-25 | não | **não** |
| `creative-storyboard-projects` | 0 | 34 | 2026-09-25 | não | **não** |
| `creative-studio-assets-v1` | 0 | 21 | 2026-09-25 | não | **não** |
| `creative-studio-director` | 0 | 24 | 2026-09-25 | não | **não** |
| `creative-studio-jobs-v1` | 0 | 24 | 2026-09-25 | não | **não** |
| `creative-video-projects-v1` | 0 | 19 | 2026-09-25 | não | **não** |
| `customer-intelligence-v1` | 0 | 40 | 2026-09-25 | não | **não** |
| `dona-antonia-agent-core-v1` | 0 | 37 | 2026-09-25 | não | **não** |
| `dona-antonia-agent-eval-v1` | 0 | 29 | 2026-09-25 | não | **não** |
| `dona-antonia-agent-learning-v1` | 0 | 23 | 2026-09-25 | não | **não** |
| `inventory-count-v2` | 0 | 28 | 2026-09-25 | não | **não** |
| `inventory-fast-autosave-v1` | 0 | 23 | 2026-09-25 | não | **não** |
| `inventory-fast-balance-v2` | 0 | 22 | 2026-09-25 | não | **não** |
| `inventory-fast-balance-v3` | 0 | 28 | 2026-09-25 | não | **não** |
| `inventory-fast-stock-v1` | 0 | 23 | 2026-09-25 | não | **não** |
| `inventory-fast-v1` | 0 | 26 | 2026-09-25 | não | **não** |
| `inventory-product-research-v1` | 0 | 26 | 2026-09-25 | não | **não** |
| `loja-integrada-probe-v1` | 0 | 9 | 2026-10-23 | não | **não** |
| `loja-integrada-readonly-v1` | 0 | 7 | 2026-10-23 | sim | **não** |
| `marketing-tracking-v1` | 0 | 13 | 2026-10-06 | não | **não** |
| `meta-account-readiness-v1` | 0 | 2 | 2026-10-27 | sim | **não** |
| `meta-catalog-link-verify-v1` | 0 | 2 | 2026-10-27 | sim | **não** |
| `mini-catalog-v1` | 0 | 28 | 2026-09-25 | não | **não** |
| `ops-order-template-bootstrap-20261005` | 0 | 14 | 2026-10-05 | não | **não** |
| `order-addon-public-v1` | 0 | 14 | 2026-10-12 | não | **não** |
| `order-postorder-confirm-v1` | 0 | 12 | 2026-10-13 | não | **não** |
| `order-public-view-shortlink-smoke` | 0 | 14 | 2026-10-03 | não | **não** |
| `order-public-view-v1-canary` | 0 | 14 | 2026-10-03 | não | **não** |
| `oscb-catalog-worker-v1` | 0 | 12 | 2026-10-20 | não | **não** |
| `papo-comprar-webhook-v1` | 0 | 27 | 2026-09-30 | não | **não** |
| `product-catalog-enrichment-v1` | 0 | 9 | 2026-10-21 | não | **não** |
| `product-image-manual-v1` | 0 | 20 | 2026-09-25 | não | **não** |
| `product-image-openai-grid-v1` | 0 | 21 | 2026-09-25 | não | **não** |
| `product-image-openai-grid18-v1` | 0 | 35 | 2026-09-25 | não | **não** |
| `product-image-openai-v1` | 0 | 27 | 2026-11-13 | não | sim |
| `product-image-openai-v2` | 0 | 23 | 2026-09-25 | não | **não** |
| `product-image-photo-only-v1` | 0 | 19 | 2026-09-25 | não | **não** |
| `product-name-normalizer-v1` | 0 | 20 | 2026-09-25 | não | **não** |
| `shopping-chat-admin-test-v1` | 0 | 20 | 2026-09-25 | não | **não** |
| `shopping-chat-checkout-v2` | 0 | 19 | 2026-09-25 | não | **não** |
| `shopping-chat-customer-v1` | 0 | 30 | 2026-09-25 | não | **não** |
| `shopping-chat-deterministic-v1` | 0 | 19 | 2026-09-25 | não | **não** |
| `shopping-chat-menu-v1` | 0 | 26 | 2026-09-25 | não | **não** |
| `shopping-chat-products-v1` | 0 | 36 | 2026-09-25 | não | **não** |
| `shopping-chat-v1` | 0 | 30 | 2026-09-25 | não | **não** |
| `shopping-checkout-v2` | 0 | 23 | 2026-09-25 | não | **não** |
| `shopping-room-reset-v1` | 0 | 20 | 2026-09-28 | não | **não** |
| `shopping-room-sales-v1` | 0 | 24 | 2026-09-25 | não | **não** |
| `shopping-room-v1` | 0 | 29 | 2026-09-25 | não | **não** |
| `si5-catalog-research-v1` | 0 | 15 | 2026-10-09 | sim | **não** |
| `site-order-separation-message-admin-v1` | 0 | 12 | 2026-11-10 | não | sim |
| `site-product-taxonomy-v1` | 0 | 1 | 2026-10-29 | não | sim |
| `tiktok-shop-oauth-callback` | 0 | 24 | 2026-09-25 | não | **não** |
| `tiktok-shop-oauth-start` | 0 | 23 | 2026-09-25 | não | **não** |
| `wfk-b7aea3edeffd37211d12` | 0 | 24 | 2026-09-25 | não | **não** |
| `whatsapp-1018-meta-draft-once-v1` | 0 | 20 | 2026-10-14 | sim | **não** |
| `whatsapp-admin-api` | 0 | 9 | 2026-10-26 | não | **não** |
| `whatsapp-checkout-webhook` | 0 | 2 | 2026-10-26 | não | **não** |
| `whatsapp-flow-data-exchange-greenfield-v1` | 0 | 3 | 2026-10-27 | não | **não** |
| `whatsapp-flow-health-webhook-v1` | 0 | 23 | 2026-09-25 | não | **não** |
| `whatsapp-flow-key-bootstrap-v1` | 0 | 24 | 2026-09-25 | não | **não** |
| `whatsapp-flow-runtime` | 0 | 6 | 2026-10-26 | não | **não** |
| `whatsapp-flow-session-open-v1` | 0 | 2 | 2026-10-27 | não | **não** |
| `whatsapp-ingest` | 0 | 27 | 2026-09-25 | não | **não** |
| `whatsapp-ingest-make-v1` | 0 | 29 | 2026-09-25 | não | **não** |
| `whatsapp-marketing-worker-v1` | 0 | 18 | 2026-10-20 | não | **não** |
| `whatsapp-meta-direct-v1` | 0 | 23 | 2026-09-30 | sim | **não** |
| `whatsapp-meta-order-router` | 0 | 2 | 2026-10-26 | não | **não** |
| `whatsapp-meta-order-webhook-v1` | 0 | 2 | 2026-10-27 | não | **não** |
| `whatsapp-order-catalog-confirmation-v1` | 0 | 2 | 2026-10-27 | sim | **não** |
| `whatsapp-order-confirmation-sender-v1` | 0 | 2 | 2026-10-27 | não | **não** |
| `whatsapp-order-confirmation-v1` | 0 | 2 | 2026-10-27 | não | **não** |
| `whatsapp-order-flow-send-v1` | 0 | 2 | 2026-10-27 | sim | **não** |
| `whatsapp-order-intake-v1` | 0 | 2 | 2026-10-27 | não | **não** |
| `whatsapp-outbound-v1` | 0 | 30 | 2026-10-01 | não | **não** |
| `whatsapp-outbox-worker` | 0 | 2 | 2026-10-26 | não | **não** |
