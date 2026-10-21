# Admin de produtos · Dona Antônia

Painel independente em `/admin1`, focado na consulta rápida do catálogo de produtos da loja.

## Nesta etapa

- Lista de produtos publicados com imagem, categoria, SKU, preço e estoque.
- Busca no catálogo por nome, SKU, EAN e marca.
- Filtros rápidos por categoria e situação do estoque.
- Paginação para carregar mais produtos e versão responsiva para desktop e celular.
- Detalhes dos produtos ativos em painel responsivo, usando os dados públicos da vitrine.
- Conferência local de XML de NF-e com descrição, códigos, GTIN, NCM, CEST, origem, CFOP e unidades.
- Associação automática somente por GTIN ou SKU exatos entre os produtos carregados; o nome não cria vínculo.
- Rascunhos editáveis salvos no armazenamento local do navegador, sem enviar o XML ou alterações ao Supabase.
- Supabase continua somente leitura: a interface chama apenas `GET storefront-v2?action=products` e `GET storefront-v2?action=product`.

Cadastro e edição persistentes, integração com Bling e gestão de cestas ficam para etapas futuras. A camada da API bloqueia ações diferentes de `products` e `product` e não contém operações de escrita. O catálogo consultado nesta etapa contém somente produtos publicados e disponíveis; um item não encontrado nessa lista não deve ser considerado automaticamente um produto novo.

## Organização

- `index.html` e `styles.css`: estrutura visual e design responsivo.
- `src/app.js`: tela, eventos e carregamento.
- `src/products.js`: regras pequenas de busca, filtros e leitura do estoque.
- `src/product-drafts.js`: leitura local da NF-e, associação conservadora e rascunhos no navegador.
- `src/api.js`: adaptador da interface para a API de leitura.
- `src/public-api.js`: chamadas GET permitidas ao Supabase para lista e detalhe público.
- `tests/`: testes das regras de filtro e da política somente leitura.

## Verificação local

```sh
node --test tests/*.test.mjs
```

