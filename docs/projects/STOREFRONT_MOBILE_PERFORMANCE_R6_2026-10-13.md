# Dona Antônia — Reformulação mobile — Rodada 6 — 13/10/2026

## Objetivo e escopo
Validar a renderização e o percurso de compra da vitrine em Chromium real, com navegação rápida, API atrasada e teste de carregamento público em rede 4G simulada. Não executar `submit_order` real nem modificar estoque, Bling ou fiscal.

## Regressões detectadas por GitHub Actions
Antes da R6, o PR R5 disparou:
- `Basket product carousel`: **FAIL** no Chromium, com `Cannot set properties of null (setting 'innerHTML')`, após navegar da categoria para a home enquanto a chamada de produtos ainda estava pendente.
- `Basket mold storefront R5`: **FAIL** por contrato estático antigo que exigia `const previous={...item}` e `if(!ok)Object.assign(...)` na mesma linha, apesar de a proteção funcional continuar presente.
- `Admin and Baskets Guard CI`: problema separado no contrato `channel_origin` da vitrine pública do pedido, fora do escopo de homepage/cestas. **Não foi corrigido por esta rodada**.

## Correções R6
1. `renderCategory`, `renderMarketingCategory` e `renderSearch` guardam o identificador do `#productGrid` construído para aquela navegação e descartam resultados ou erros atrasados se a pessoa já saiu da tela. Nenhuma resposta assíncrona pode tentar atualizar um grid destruído.
2. Teste Chromium `scripts/test-basket-home-browser.mjs` reproduz a navegação categoria → home antes de resolver a API e exige ausência de erros JavaScript, além de percorrer cesta → ajuste → recálculo lento → carrinho → checkout **sem envio de pedido**.
3. Contrato `test-basket-mold-storefront-r5.mjs` aceita o rollback correto após `await` em múltiplas linhas; mantém a exigência de desfazer a opção rejeitada.
4. Workflow `.github/workflows/basket-carousel-ci.yml` passa a executar os testes de contrato da vitrine R1 a R5, mais checkout e testes reais Chromium.
5. `scripts/test-storefront-mobile-r6-live-browser.mjs` abre **a URL pública de produção** em Chromium com emulação mobile/touch, 390×844 e 320×740, conexão limitada a ~1,6 Mb/s, 120 ms de latência e CPU 3× mais lento; coleta respostas HTTP, quantidade de cestas, carga da primeira imagem, overflow, exceções JS e marcas de paint. Visitas apenas GET, sem criação de pedidos. O smoke de produção é informativo (continue-on-error) por depender de rede e hospedagem externas.

## Evidência de execução — GitHub Actions
Workflow `Basket product carousel` no PR #1087, execução **38450750935**, concluído **SUCCESS**:
- `test-basket-carousel-browser.mjs` e `test-basket-home-browser.mjs`: PASS, incluindo corrida de navegação reproduzida e cotação lenta.
- Home perf, R1, R2, R3, R4, R5, checkout-whatsapp-return: PASS.
- `Basket mold storefront R5`: SUCCESS em execução paralela.
- Chromium na produção, após leitura do site (primeira medição, *não* percentil 75):
  - 390×844: `home` HTTP 200, `home_priority` HTTP 200, 15 cestas, LCP 2324 ms, FCP 456 ms, `da-home-full-catalog` 1268 ms, sem erros JS e sem overflow.
  - 320×740: `home_priority` HTTP 200, `home` HTTP 200, 15 cestas, LCP 468 ms, FCP 220 ms, `da-home-full-catalog` 1162 ms, sem erros JS e sem overflow.
- Primeira foto de cesta carregada em ambas. LCP pode medir o cabeçalho, não necessariamente a foto da cesta: usar marca `da-home-full-catalog` para a montagem do catálogo.
- No teste sintético (APIs interceptadas, sem ser medição da internet), marcas de cestas em ~92 ms e catálogo completo ~139 ms: **não** confundir com valores reais.
- A execução é de **Chromium emulado** em runner Linux, não de aparelhos físicos ou do navegador integrado ao WhatsApp.
- Snapshot no Supabase `storefront_public_home_snapshot_v1`: 15 cestas, lock de atualização liberado.

## Riscos residuais e aceite
- A reformulação do carregamento da vitrine e a regressão de navegação estão validadas em Chromium real; são necessários testes de campo Android/iOS e navegação dentro do WhatsApp para garantir o comportamento em aparelhos específicos.
- Continuar observando erros de `storefront-v2` e LCP de várias visitas; uma medição isolada não garante percentil 75 inferior a 2,5 segundos.
- `Admin and Baskets Guard CI` possui falha independente em expectativa de `channel_origin` do pedido público; abrir manutenção separada, sem alterar R6.
- O smoke ao vivo de R6 visita a produção atual; depois do merge, confirmar via HTTP que o novo HTML e os guardas estão publicados.

## Rollback
- Reverter PR #1087 caso a navegação de categorias seja afetada. Não envolve migrações nem deploy Supabase, e não reverte R1–R5.
