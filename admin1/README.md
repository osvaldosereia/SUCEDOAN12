# Admin1 · Produtos e Cestas

Painel independente para operar o catálogo próprio da Dona Antônia. A tela atende desktop e celular e não publica mudanças na loja atual.

## Operação implementada

- Cadastro, edição, busca, filtros, paginação, detalhes e ativação de produtos persistidos no projeto Supabase `Dona Antonia Admin1`.
- Categorias fixas: Mercearia, Limpeza, Lavanderia, Higiene, Beleza, Casa e Pet.
- Validação de SKU, EAN/GTIN, categoria, preço, estoque e dados fiscais disponíveis.
- Imagens convertidas para WebP no navegador, até 1.200 px e no máximo 30 KB.
- Estoque ligado a lotes e movimentos; quantidade zero deixa o produto inativo e uma reposição não o reativa automaticamente.
- Conferência de XML no navegador, vínculo por GTIN/SKU exatos e rascunhos locais até o usuário salvar o produto no Admin1.
- Entrada da quantidade de XML é explícita e registra lote/movimento no banco próprio do Admin1.
- Transferência de uma sequência de EANs: consulta somente leitura ao catálogo antigo, prévia dos resultados e confirmação antes de gravar no Admin1.
- Produtos transferidos entram inativos e com estoque zero; a chave de origem impede importação duplicada.
- Configuração de cestas em duas partes: tamanhos editáveis e tipos de produtos.
- Cada tipo vincula produtos existentes no Admin1, permite ordenar esses produtos e define a quantidade do tipo em cada tamanho.
- Importação inicial de cestas copiou do Vitrine Admin os 29 tipos compartilhados e as 145 quantidades (29 × 5 tamanhos) para o banco Admin1; os vínculos de produtos seguem vazios até os produtos correspondentes serem transferidos individualmente.
- A origem no Supabase público foi consultada somente para leitura. Alguns rótulos/alternativas legados não correspondem claramente entre si, então as alternativas antigas não foram copiadas automaticamente.
- Tamanhos e tipos podem ser arquivados e reativados sem perder configurações ou quantidades anteriores.
- A atualização dos dados de cada tipo, seus produtos e quantidades é atômica no banco separado do Admin1.

## Limite entre os bancos

- Leitura do catálogo legado passa somente pela função `admin1-legacy-catalog-read-v1` (GET).
- Gravações do módulo de produtos usam `admin1_save_product_v1` e tabelas do projeto separado `xaoeldjuxzsdsblimzxo`.
- O banco ligado ao site público e o Bling não são alterados por esse módulo.

## Estrutura

- `src/app.js`: interface, eventos e estados da tela.
- `src/api.js`: ações da interface e adaptação para os dados Admin1.
- `src/admin1-data.js`: acesso ao banco Admin1, busca legada somente leitura, cadastro e transferência EAN.
- `src/baskets.js`: tela independente para cadastro, composição, ativação e consulta de cestas.
- `supabase/migrations/20261022130000_admin1_basket_configuration_v1.sql`: tamanhos, tipos, vínculos ordenados de produtos, quantidades por tamanho e gravação atômica da configuração.
- `supabase/migrations/20261022133000_admin1_basket_sizes_reorder_v1.sql`: reordenação atômica dos tamanhos.
- `src/product-management.js`: validação de campos fiscais/comerciais e categorias permitidas.
- `src/product-drafts.js`: leitura da NF-e e rascunhos locais antes do cadastro.
- `src/product-images.js`: conversão e redução de imagem.
- `supabase/migrations/20261022100000_admin1_product_operations_v1.sql`: extensão do produto e rotina transacional de produto/estoque.
- `supabase/migrations/20261022021445_admin1_baskets_v1.sql`: tabelas, índices, políticas e gatilho de disponibilidade de cestas.
- `supabase/migrations/20261022021506_admin1_basket_save_v1.sql`: rotina atômica para salvar a cesta e seus componentes.
- `tests/`: testes automatizados da lógica e dos adaptadores.

## Prévia privada

O pacote estático é reproduzido com `node scripts/build-preview.mjs`; o resultado em `dist/` contém apenas a interface e os módulos necessários, sem migrações ou testes no diretório publicado.

## Testes

```sh
node --test tests/*.test.mjs
```

O teste visual em celular e desktop e a validação manual com uma NF-e real e uma sequência real de EANs ficam para a próxima sessão do usuário.
