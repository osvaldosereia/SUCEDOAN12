# Caneca Fácil — Arquitetura V3

## Princípio
A Loja Integrada é a fonte de verdade para catálogo, preço, estoque, URLs, login, favoritos, carrinho, pedido e checkout. O código próprio apenas melhora apresentação e usabilidade.

## Loader único no painel da Loja Integrada
Manter apenas um loader-base para a camada remota:

- Descrição: `BASE UX V1.js`
- Tipo: JavaScript
- Posição: Rodapé
- Página: Todas as páginas exceto checkout
- Código-fonte para copiar: `CODIGO-BASE-UX-REMOTO.txt`

Esse loader chama `canecafacil-site-runtime-v1.js`.

## Runtime central
`canecafacil-site-runtime-v1.js`

Responsável por:
- menu/drawer mobile;
- contador/carrinho mobile;
- botão voltar em produto mobile;
- carregar recursos comerciais;
- carregar personalizador somente em página de produto;
- carregar storefront somente em home, categoria e busca.

Não usar bootstrap intermediário.

## Storefront
`canecafacil-storefront-v1.js`
`canecafacil-storefront-v1.css`

Responsável por:
- 4 colunas desktop, 3 tablet, 2 mobile;
- imagens quadradas sem corte (`object-fit: contain`);
- setas desktop e swipe/dots mobile quando houver mais de uma imagem;
- favorito via rota/classe nativa da Loja Integrada;
- compartilhamento nativo do dispositivo;
- preço, nome, link e produto sempre originados da Loja Integrada;
- chips derivados das categorias nativas;
- 8 produtos iniciais + carregamento progressivo de 8 em 8;
- fallback para paginação nativa se a busca da próxima página falhar;
- benefícios após os 8 primeiros no desktop e antes da grade no mobile;
- barra inferior mobile: Início, Categorias, Criar, Conta, Pedidos;
- neutralização defensiva do antigo Social Feed V6.

## Códigos antigos da home
Depois que a V3 estiver carregando, remover/desativar no painel:
- `SOCIAL FEED V6 JS`
- `SOCIAL FEED V3 CSS`
- qualquer `Caneca Fácil - Teste Visual Home` antigo

Não remover ainda sem revisão específica:
- `RELATED`
- `BANNER ORDER`
- `FULL BANNER CWSS`
- `PRODUTO SOCIAL V4 CSS`
- `PRODUTO SOCIAL V4 JS`
- `BASE HEADER V10`
- `CARRINHO V3`
- `FOOTER V5`

Esses módulos serão migrados/limpos em etapas próprias.

## Rollback
Antes da V3 foi criado o branch:
`backup/canecafacil-pre-storefront-v3-20260902`

## Produtos da home
Para a rolagem progressiva conseguir chegar a um catálogo grande sem usar Firebase ou sitemap como catálogo paralelo, configure a Loja Integrada para disponibilizar o maior número possível de produtos na home. O JavaScript continua exibindo apenas 8 por vez.
