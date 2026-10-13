# Dona Antônia — Performance mobile — Rodada 5 — 2026-10-13

## Escopo e segurança
Confiabilidade do fluxo de compra pelo celular, preservando o cache público de catálogo das rodadas R1–R4. Não altera Supabase/Edge, banco, estoque, preço fiscal, Bling, WhatsApp nem confirma pedidos reais. Mudanças limitadas aos dois arquivos HTML idênticos, scripts de teste e esta nota.

## Falhas verificadas na implementação anterior
1. Após alterar a quantidade de cesta legada, o botão «Adicionar cesta» permanecia ativo antes de o servidor confirmar o novo total. Respostas HTTP fora de ordem podiam sobrescrever uma cotação recente com um valor antigo.
2. A troca assíncrona da opção de produto em uma cesta de molde permitia outra ação antes da confirmação; o valor e os componentes podiam divergir.
3. O molde permitia inserir uma cesta sem produtos e não consolidava corretamente a demanda quando um mesmo produto aparecia em várias posições.
4. O recálculo de componentes no checkout era indexado pela posição do item no carrinho. Remover ou deslocar um item durante a resposta podia aplicar o preço a outra cesta.
5. `paintCheckout` destruía os campos já digitados ao redesenhar o painel depois de uma cotação. O envio de pedido não possuía trava própria contra duas chamadas simultâneas.
6. Uma requisição lenta de abertura de cesta ou preparação do checkout podia responder depois que o usuário fechou ou mudou a janela.

## Correções
- `state.sheetSeq`: invalida respostas antigas de abertura/preparação de painéis, com botão «Tentar novamente» se a abertura da cesta falhar. Limpa temporizador da cesta anterior.
- Cesta com molde: `optionPending` desabilita trocar produtos, mudar quantidades ou adicionar enquanto valida a alternativa. Rejeita cesta vazia e verifica disponibilidade antes de inserir no carrinho. `maxBasketQty` soma quantidades de posições que usam o mesmo SKU e ignora quantidades zero.
- Cesta legada: `scheduleBasketQuote` atribui versão a cada edição, sinaliza `quotePending` e desabilita adicionar até a resposta válida; resposta antiga é ignorada. Em erro há botão «Recalcular valor», mantendo a composição e o carrinho intactos.
- Checkout: `checkoutQuoteFlags` é um `WeakMap` por objeto do carrinho e **não** fica persistido em localStorage. Temporizadores e requisições ficam associados ao item e à versão, nunca ao índice. O botão de finalizar fica bloqueado durante recálculo pendente/falho; há novo botão «Recalcular» no aviso de erro.
- Antes do redesenho do checkout, preserva os valores digitados de nome, documento e endereço, além da escolha de pagamento; preserva a posição de rolagem do painel.
- `orderSubmitting` impede requisições de envio simultâneas; em falha, mantém o carrinho salvo e reabilita tentativa após o erro.
- Regras de mínimo de R$ 75, validação de estoque/preço do servidor, entrega, Bling, WhatsApp e consentimento permanecem sem mudança.

## Testes realizados
- PASS: `scripts/test-storefront-mobile-r1.mjs`, `r2.mjs`, `r3.mjs`, `r4.mjs`, `r5.mjs`, `scripts/test-home-performance-contract.mjs`, `scripts/test-checkout-whatsapp-return.mjs` — sete contratos.
- R5 executa sequências assíncronas **simuladas**, inclusive respostas fora de ordem, cesta removida, falha de cotação, molde vazio, alternância concorrente de produto e dois cliques simultâneos no botão de pedido, sem envio real.
- `scripts/test-basket-home-browser.mjs` foi ampliado para Playwright/Chromium cobrindo conexão lenta (cotação retida), botão de adicionar bloqueado, valor confirmado, carrinho e abertura do checkout sem `submit_order`. **Sintaxe aprovada; navegador real ainda não executado neste ambiente.**
- `index.html` e `vitrine/index.html` idênticos byte a byte na branch.
- Teste HTTP no domínio após publicação deve confirmar arquivos novos. A hospedagem costuma ter `Cache-Control: max-age=600`, de modo que propagação pode demorar alguns minutos.

## Rollback
Reverter somente o PR da R5. R1–R4, cache do Supabase e dados comerciais permanecem intactos.

## Rodada 6
Teste real em celular Android/iOS e WhatsApp, dados de desempenho FCP/LCP, navegação completa, abandono/falhas de cotação; monitoramento dos erros e avaliação de deploy progressivo.
