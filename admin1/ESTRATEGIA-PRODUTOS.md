# Estratégia de conclusão da gestão de produtos do Admin1

## Prioridade de trabalho

Concluir e validar a gestão de produtos antes de iniciar qualquer trabalho na gestão de cestas. Esta ordem vale para as próximas rodadas.

## Objetivo desta fase

Preparar o módulo de produtos para operação correta a partir das informações de notas fiscais XML, com interface simples e completa. Nesta fase, implementar e validar o fluxo no código sem habilitar gravações de produtos no Supabase, no site ou no Bling.

## Revisão obrigatória do produto

Analisar o card da lista e o detalhe do produto para que a operação consiga identificar rapidamente:

- nome e apresentação/embalagem;
- imagem;
- categoria;
- SKU interno e GTIN/EAN;
- preço de venda;
- unidade;
- estoque e situação ativo/inativo.

Os dados fiscais devem ficar acessíveis no detalhe ou no formulário de revisão, sem sobrecarregar o card da lista.

## Mapeamento obrigatório do XML para o formulário

Revisar cada campo presente na NF-e e definir se ele pertence ao cadastro permanente do produto, à operação da nota ou à revisão manual:

- descrição do item e código do fornecedor, mantendo o código do fornecedor separado do SKU interno;
- GTIN comercial e GTIN tributável, preservando a indicação SEM GTIN;
- NCM, CEST quando aplicável e origem da mercadoria;
- unidade comercial e quantidade de compra;
- unidade tributável e quantidade tributável;
- conversão entre embalagem de compra e unidade tributável, somente quando as quantidades do XML permitem calculá-la;
- custo unitário e identificação da nota/fornecedor como referência de origem;
- CFOP e CST/CSOSN como dados da operação fiscal da nota, sem transformá-los automaticamente em regras permanentes do produto;
- categoria e preço de venda como decisões do cadastro, sem inventar valores ausentes do XML.

## Regras de conferência

- Associar automaticamente a um produto existente somente por correspondência exata de GTIN ou SKU.
- Exibir candidatos e pedir revisão quando houver ambiguidade.
- Não criar vínculo pelo nome aproximado.
- Detectar SKU e GTIN duplicados antes de concluir uma revisão.
- Apontar dados fiscais ausentes ou inválidos sem inventar valores.
- Não aplicar estoque de uma nota antiga nem alterar preço, publicação ou status durante a conferência.
- Guardar os rascunhos localmente nesta fase; deixar claro que eles não foram gravados no catálogo.

## Critério para considerar Produtos concluído

Só avançar para Cestas quando:

1. o card, os detalhes e o formulário tiverem sido revisados em desktop e mobile;
2. cada campo relevante do XML estiver mapeado e tiver origem e finalidade claras;
3. os casos de produto existente, produto novo, GTIN ausente, unidades diferentes, conversão incompleta, duplicidade e dados fiscais pendentes estiverem cobertos;
4. busca, vínculo, validação e rascunhos tiverem testes e verificação funcional;
5. nenhuma gravação real no Supabase, no site ou no Bling estiver habilitada nesta fase.

A habilitação de gravações persistentes depende de uma autorização separada. Até lá, a conclusão significa deixar o fluxo de trabalho preparado, revisado e testado, sem efetivar cadastros no catálogo.
