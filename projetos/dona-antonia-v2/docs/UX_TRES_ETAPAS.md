# UX: cesta → extras → checkout

## Decisões
1. Primeira etapa: seleção do tamanho e composição da cesta. Cada tipo tem título, subtotal, carrossel de SKUs reais e uma única linha inferior de quantidade.
2. A opção de produto troca o SKU selecionado sem alterar a quantidade. O seletor de quantidade pertence ao tipo, não ao card. Remover é quantidade 0 e não apaga o tipo do cadastro.
3. Segunda etapa: extras comuns a todos os tamanhos, usando a MESMA interface e entidade de tipo de produto. Iniciam com quantidade 0; tocar um card adiciona 1; extras são opcionais.
4. Barra fixa: no passo 1, total + Próximo; no passo 2, total acumulado + Finalizar pedido; no passo 3, checkout demonstrativo sem enviar pedidos.
5. Navegação Voltar preserva marcas e quantidades; progresso textual 1/3, 2/3, 3/3. Troca de cesta reconfigura os itens da cesta sem zerar extras já escolhidos.
6. Checkout mostra resumo de todos os SKUs e os totais. Cliente poderá editar cesta e extras, sem cadastro obrigatório. Checkout REAL exige backend, validação transacional e regras de entrega.
7. Carrossel nativo por tipo, rolagem por toque, setas com rótulo de acessibilidade, próxima opção parcialmente visível, cards compactos, sem autoplay.
8. Itens indisponíveis ficam fora das opções vendáveis. Quantidade e troca são validadas. Fotos entram por carregamento sob demanda.
9. O protótipo é desacoplado do banco e tem dados claramente demonstrativos. Nenhum dado pessoal digitado será enviado a servidor nesta versão.

## Referências de UX
- Baymard mobile ecommerce: https://baymard.com/research-articles/mobile-ux-ecommerce
- Baymard checkout linear: https://baymard.com/blog/checkout-flow-ux-optimization
- Nielsen Norman Group carrosséis mobile: https://www.nngroup.com/articles/mobile-carousels/
- Baymard variações em listas horizontais: https://baymard.com/research-articles/mobile-interactive-color-swatches

## Pendências de produção
- CRUD persistente para tipos, cestas e extras; autenticação admin e papéis.
- Integração Bling e espelho de produtos reais após balanço, Supabase RLS e banco separado.
- Checkout real com contato, entrega, pagamento na entrega e idempotência.
- Imagens, responsividade validada em múltiplos aparelhos e testes navegador ponta a ponta.
