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
- Cadastro de cestas com SKU, nome, preço, imagem, descrição e composição por produtos existentes no Admin1.
- Cestas ativas exigem imagem e composição com produtos ativos e com estoque; quando um componente zera ou é desativado, as cestas ligadas a ele também são desativadas.
- A criação e edição da cesta e de sua composição são atômicas; cada componente é vinculado por ID ao cadastro de produto do Admin1.

## Limite entre os bancos

- Leitura do catálogo legado passa somente pela função `admin1-legacy-catalog-read-v1` (GET).
- Gravações do módulo de produtos usam `admin1_save_product_v1` e tabelas do projeto separado `xaoeldjuxzsdsblimzxo`.
- O banco ligado ao site público e o Bling não são alterados por esse módulo.

## Estrutura

- `src/app.js`: interface, eventos e estados da tela.
- `src/api.js`: ações da interface e adaptação para os dados Admin1.
- `src/admin1-data.js`: acesso ao banco Admin1, busca legada somente leitura, cadastro e transferência EAN.
- `src/baskets.js`: tela independente para cadastro, composição, ativação e consulta de cestas.
- `src/product-management.js`: validação de campos fiscais/comerciais e categorias permitidas.
- `src/product-drafts.js`: leitura da NF-e e rascunhos locais antes do cadastro.
- `src/product-images.js`: conversão e redução de imagem.
- `supabase/migrations/20261022100000_admin1_product_operations_v1.sql`: extensão do produto e rotina transacional de produto/estoque.
- `supabase/migrations/20261022021445_admin1_baskets_v1.sql`: tabelas, índices, políticas e gatilho de disponibilidade de cestas.
- `supabase/migrations/20261022021506_admin1_basket_save_v1.sql`: rotina atômica para salvar a cesta e seus componentes.
- `tests/`: testes automatizados da lógica e dos adaptadores.

## Testes

```sh
node --test admin1/tests/*.test.mjs
```

O teste visual em celular e desktop e a validação manual com uma NF-e real e uma sequência real de EANs ficam para a próxima sessão do usuário.
