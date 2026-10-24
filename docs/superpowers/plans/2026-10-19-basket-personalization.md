# Plano: personalização das cestas na vitrine

**Data:** 2026-10-19  
**Base:** `main` em `8f736cbe00e61d9e1239cbf6ea61c2d9aaa81ade`

## Escopo aprovado
- Oferecer cinco tamanhos de cesta: Econômica, Mini, Pequena, Média e Grande.
- Cada item da composição permite quantidade, remoção/restauração e escolha entre até três produtos/marcas; mostrar fotos dos produtos.
- Selecionar inicialmente a opção de menor preço de venda, respeitando preço e estoque atuais.
- Produtos adicionais ficam fora da composição inicial e só entram após ação explícita; administráveis em uma aba dentro de Cestas.
- Preservar preço individual oculto, ajustes ocultos, regras de estoque, cotação e pedido.

## Etapas
1. Mapear contrato atual de cesta, cotação, pedido e editor Admin.
2. Escrever testes de regressão para limite/seleção das opções, restauração, fotos, opcionais e regras de preço/estoque.
3. Ajustar UI pública e editor Admin em branch isolada.
4. Acrescentar contrato/API e migração compatíveis, sem truncar as opções existentes nem tocar diretamente a produção.
5. Executar testes e inspeções; atualizar documentação necessária.
6. Criar PR para revisão, sem mesclar nem publicar automaticamente.

## Cuidados de migração
Existem posições com mais de três opções cadastradas. Não excluir dados existentes automaticamente. A apresentação pública deve limitar a três marcas curadas, e o Admin deve permitir escolhê-las explicitamente. Itens opcionais devem ter configuração separada das posições obrigatórias para não afetar estoque, composição, nem ajustes ocultos da cesta.

