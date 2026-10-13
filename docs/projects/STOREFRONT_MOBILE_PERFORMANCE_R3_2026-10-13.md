# Dona Antônia — Performance mobile — Rodada 3 (2026-10-13)

## Objetivo
Preservar os elementos já visíveis da vitrine durante o carregamento progressivo do catálogo completo, principalmente no navegador interno do WhatsApp e em celulares sob 4G. Não alterar contratos do Supabase, Bling ou checkout.

## Implementação
- `index.html` e `vitrine/index.html` continuam rigorosamente idênticos.
- `renderHome()` recria a página inteira **somente na entrada inicial ou quando o cliente volta de outra página**. Atualizações de catálogo reutilizam o conteúdo existente.
- `syncHomeBasketGroups` atualiza separadamente cada grupo e subdivisão, usando assinatura derivada dos dados públicos. Se a subdivisão não mudou, o nó DOM, o botão, a fotografia e o estado da imagem permanecem intactos.
- Cestas `Grande` carregadas pela resposta prioritária permanecem montadas quando chegam os demais grupos. O estado "Outras cestas / Carregando" desaparece quando o catálogo final é recebido.
- `BasketCarousel.mount` só é executado quando há alteração efetiva nos cards. O `#homeOffersMount`, o hero e os observadores de ofertas não são destruídos na atualização.
- A primeira foto de cesta recebe `fetchpriority="high"` e `loading="eager"`; todas as outras fotos recebem `loading="lazy"`. A proteção adicional de `IntersectionObserver` continua impedindo carregamento de fotos fora da área visível.
- O script `/vitrine/basket-carousel.js` usa versão de URL `20261013-mobile-r3` para evitar que o cliente continue com o JavaScript antigo no cache.
- Marcadores `da-home-first-cestas` e `da-home-full-catalog` agora são emitidos **após** a atualização do DOM. A vitrine que reutiliza cache local marca `da-home-cached-cestas`.

## Contratos e regressões
- `scripts/test-storefront-mobile-r3.mjs`: teste de montagem incremental com DOM simulado; exige que o card Grande sobreviva ao carregamento completo e que uma atualização igual não remonte observadores; verifica a troca seletiva do card modificado.
- `scripts/test-basket-home-browser.mjs`: ampliado para Playwright; segura a resposta completa até a primeira cesta ficar visível e então verifica identidade real dos nós (card, foto, hero e seção de ofertas) e prioridade da imagem.
- Testes existentes preservados: `scripts/test-storefront-mobile-r1.mjs`, `scripts/test-storefront-mobile-r2.mjs`, `scripts/test-home-performance-contract.mjs`, `scripts/test-checkout-whatsapp-return.mjs`.
- Os cinco testes de contrato foram exercitados com sucesso no ambiente de integração, com simulação DOM. O script Playwright foi verificado sintaticamente, **mas não foi executado num navegador real neste ambiente**.

## Publicação / rollback
- Alterações restritas à vitrine pública e ao JS do carousel. Não há migração, deploy Supabase ou alteração fiscal.
- Integrar o PR à branch main; o domínio `donaantonia.com.br` utiliza GitHub Pages pelo arquivo `CNAME` (confirmar cache/publicação).
- Reverter o PR de R3 para voltar ao render completo, sem mexer nas rodadas R1/R2.

## Próximos passos
- Rodada 4: métricas reais de LCP mobile/4G e otimização dos bytes de imagem e background hero, sem alterar identificação de produtos.
- Rodada 5: simular composição, preço, carrinho e finalização no mobile.
- Rodada 6: validar no WhatsApp de Android e iOS, acompanhar regressões e status de produção.
