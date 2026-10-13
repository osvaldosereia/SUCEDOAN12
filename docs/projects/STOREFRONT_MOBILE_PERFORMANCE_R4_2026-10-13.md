# Dona Antônia — Performance mobile — Rodada 4 (2026-10-13)

## Objetivo
Diminuir downloads decorativos no acesso 4G e antecipar a primeira foto das cestas, sem mudar composição, fotos de produtos, atendimento, preços, estoque ou checkout. Evitar o segundo redesenho do hero no primeiro carregamento.

## Inventário de produção (medidas verificadas)
- Documento `index.html` antes da alteração: **146.432 bytes** (tamanho fonte UTF-8 no repositório; não equivale ao peso comprimido transferido).
- `/vitrine/assets/home-grocery.webp`: **40.782 bytes**, conforme resposta HTTP `206 Content-Range bytes 0-0/40782` ao domínio público.
- `/img/logoantonia5.png`: **34.195 bytes**, medidos com a mesma técnica.
- Três fotos únicas usadas nas 15 cestas: **19.666**, **18.142** e **75.484 bytes** segundo `storage.objects.metadata.size` do Supabase. As fotos já são WebP, de modo que uma regravação global seria desnecessária e arriscaria mudar a identificação visual dos produtos.

## Alterações
1. Mobile abaixo de 760px: `.home-hero{background-image:none;background-color:#eee5d5}`, mantendo a foto original no desktop e a identidade visual do cabeçalho no celular, mas eliminando a solicitação da imagem decorativa no 4G.
2. `renderInitialShell` cria diretamente o `#basketSections` e o `#homeOffersMount` que a página final usa. A primeira resposta substitui **apenas o placeholder das cestas**, preservando o cabeçalho, atalhos e estrutura das ofertas. Também retira a lista redundante de categorias na tela de carregamento (os atalhos permanecem).
3. As ofertas continuam com carregamento adiado; o observador só é ativado quando as primeiras cestas são inseridas. A seção de ofertas não deve ser recriada com a chegada do catálogo completo.
4. `BasketCarousel.card(..., index=0)` insere `src` da primeira foto diretamente e usa `loading="eager" fetchpriority="high"`. As demais fotos continuam com `data-basket-src`, `loading="lazy"` e `IntersectionObserver`, inclusive quando estão fora da área visível horizontal.
5. Novo versionamento de recurso: `/vitrine/basket-carousel.js?v=20261013-mobile-r4`.
6. `window.DAStorefrontPerf.snapshot()`: diagnóstico **somente local no navegador**, com FCP, LCP, tempo de resposta da primeira foto e marcas `da-home-shell`, `da-home-first-cestas`, `da-home-full-catalog`; não envia dados a APIs externas.

## Validação
- `scripts/test-storefront-mobile-r4.mjs`: regra de banner mobile, integridade do desktop, shell estável, prioridade da primeira foto e métricas locais.
- Testes de regressão `test-storefront-mobile-r1/r2/r3`, `test-home-performance-contract`, `test-checkout-whatsapp-return` devem permanecer aprovados.
- `scripts/test-basket-home-browser.mjs` ampliado para reter a resposta prioritária até registrar identidade do hero e das ofertas, depois retê-la até o catálogo completo. Verifica `src` imediato na primeira foto. Requer execução com Playwright/Chromium em ambiente de CI/navegador.
- **Limitação:** testes de contrato executados com o JavaScript do repositório e DOM simulado; a execução integral do teste Playwright e as métricas reais em Android/4G permanecem pendentes até haver acesso a um navegador reproduzível.

## Segurança de publicação
- Mudanças somente nos dois HTMLs públicos, no JS do carrossel e nos testes/documentação.
- Nenhuma atualização Supabase, banco, checkout, pedidos, WhatsApp ou Bling.
- O HTML `index.html` e `vitrine/index.html` devem permanecer idênticos.
- Depois do merge, verificar HTTP 200 no domínio para a página e o carrossel novo e confirmar os indicadores de código.

## Rollback
- Reverter apenas o PR da Rodada 4 para voltar à implementação anterior; R1/R2/R3 e a função do Supabase permanecem ativos.

## R5
Verificação ponta a ponta em fluxo mobile: escolher cesta, alterar composição, cotar, adicionar ao carrinho e preparar checkout sem concluir pedido real de cliente. Exercitar respostas lentas e falhas transitórias.
