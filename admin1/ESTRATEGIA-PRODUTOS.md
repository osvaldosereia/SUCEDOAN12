# Estratégia de conclusão da gestão de produtos do Admin1

## Prioridade de trabalho

Concluir e validar a gestão de produtos antes de iniciar qualquer trabalho na gestão de cestas. Esta ordem vale para as próximas rodadas.

## Objetivo desta fase

Concluir a operação de produtos usando o projeto Supabase exclusivo do Admin1. O catálogo antigo fica disponível somente para consulta exata por EAN/SKU; nenhuma gravação é feita no banco antigo, na loja pública ou no Bling.

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
5. gravações estiverem limitadas ao banco próprio do Admin1 e continuarem impossíveis no banco da loja pública e no Bling.

O cadastro persistente no banco próprio do Admin1 está autorizado. A conclusão ainda depende da verificação automatizada e do teste manual do usuário em celular/desktop. Não iniciar Cestas antes desse fechamento.


## Revisão técnica concluída nesta rodada

- O card agora expõe SKU e GTIN; a conferência do XML distingue corretamente um item sem correspondência de uma consulta do catálogo que falhou.
- A NF-e mantém identificadores originais para revisão mesmo quando um campo do catálogo é corrigido manualmente. Campos ausentes permanecem ausentes, não são convertidos em zero.
- A leitura preserva fornecedor, documento, número/série/data/chave da nota, código de origem do fornecedor, GTINs brutos, NCM, CEST, CFOP, origem, unidades e quantidades comerciais/tributáveis, valores unitários e totais, despesas/abatimentos da linha, escala/fabricante, informações adicionais e classificadores fiscais de ICMS, PIS, COFINS, IPI e IBS/CBS quando informados.
- CFOP, CST/CSOSN e demais classificadores recebidos na nota permanecem referências da operação de compra. Não são copiados como regras padrão de venda. Frete, desconto, seguro e outras despesas são exibidos, sem rateio automático.
- A unidade comercial do catálogo é iniciada pela unidade tributável da NF-e, mantendo separadas as unidades e quantidades originais. Associações continuam restritas a SKU/GTIN exatos, com ambiguidade visível.
- A busca de duplicidade indisponível fica marcada como pendente; não é apresentada como verificação concluída. Rascunhos permanecem apenas no navegador.

**Limite de persistência:** produtos, imagens, lotes e movimentos são gravados somente no projeto Supabase próprio do Admin1. O catálogo legado é usado por uma função proxy somente GET. Não publicar alterações no site público nem conectar o Bling nesta etapa.

## Estratégia permanente de execução aprovada pelo usuário

- Implementar ferramentas operacionais de ponta a ponta; não deixar botões ou telas como protótipo quando a ação puder ser feita no escopo aprovado.
- Priorizar a operação de produtos até ela estar concluída antes de avançar para cestas.
- O Admin1 consulta o catálogo antigo por uma função somente leitura e grava produtos exclusivamente no banco próprio `Dona Antonia Admin1`. Nunca escrever no projeto Supabase ligado ao site público.
- A experiência deve criar, editar, conferir, ativar e desativar produtos no banco Admin1 e sincronizar os dados entre dispositivos.
- Produto com estoque zero fica inativo. Reposição não ativa automaticamente. A ativação exige estoque positivo e imagem válida.
- Imagem escolhida pelo usuário deve ser convertida no navegador para WebP, redimensionada e reduzida para no máximo 30 KB antes de salvar no cadastro do Admin1.
- Quando o teste automatizado ou técnico for possível, executar e apresentar o resultado. Se o fluxo depender de navegador real, login ou acesso indisponível, informar exatamente o que falta e pedir teste manual, sem afirmar que foi validado visualmente.
- Manter módulos pequenos, responsabilidades explícitas e testes sobre regras de negócio. Separar claramente a consulta do catálogo legado, a escrita no banco próprio do Admin1 e a apresentação da tela.

## Transferência em lote por EAN aprovada

- Leitor ou sequência colada aceita um EAN por linha e remove duplicatas.
- Consultar somente a função proxy `admin1-legacy-catalog-read-v1` por GET.
- Exibir itens encontrados, não encontrados e já transferidos antes de qualquer gravação.
- Exigir categoria oficial entre Mercearia, Limpeza, Lavanderia, Higiene, Beleza, Casa e Pet quando não houver correspondência inequívoca.
- Transferir somente após confirmação. Produto entra inativo e com estoque zero; SKU/EAN/origem e imagem disponível são preservados.
- A origem é marcada com projeto e ID do produto para impedir transferência duplicada.

## Fluxo de produto vindo de XML

- Ler XML no navegador, associar produto existente somente por GTIN ou SKU exatos e manter os campos fiscais da nota como referência.
- Permitir revisar todos os campos permanentes do produto e gravar no banco Admin1.
- Para a quantidade da nota, mostrar uma opção explícita para somar o estoque. A entrada cria lote e movimento no banco Admin1, com validade quando informada.
- Repetir a mesma linha de NF-e não deve duplicar entrada do mesmo lote.

