# Admin V3 + Vitrine V3 — release note

A V3 foi construída em caminhos paralelos e não substitui os caminhos atuais nesta etapa.

Novos caminhos após merge no `main`:
- `/vitrine-v3/`
- `/admin-v3/`

Caminhos existentes permanecem intactos:
- `/vitrine-v2/`
- `/admin/`
- `/contagem/`

O backend V3 usa `catalog-v3` para leitura cacheável e `admin-v3-api` para o painel. O fechamento da Vitrine continua reutilizando o backend de pedido `storefront-v2`, que recalcula e valida o pedido no servidor antes de retornar o link de WhatsApp.
