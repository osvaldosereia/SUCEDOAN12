# Caneca Fácil — Arquitetura consolidada

## Princípio
A Loja Integrada é a fonte de verdade para catálogo, preço, estoque, URLs, login, favoritos, carrinho, pedido e checkout. O código próprio melhora UX e apresentação sem criar um catálogo paralelo.

## Único código no painel
Manter apenas um código próprio global no painel da Loja Integrada:

- Descrição: `BASE UX V1.js`
- Tipo: JavaScript
- Posição: Rodapé
- Página: Todas as páginas exceto checkout
- Fonte para copiar: `CODIGO-BASE-UX-REMOTO.txt`

Esse loader chama `canecafacil-site-runtime-v1.js`.

## Runtime central
`canecafacil-site-runtime-v1.js`

Responsável por:
- carregar o CSS Core global;
- menu/drawer mobile;
- contador/carrinho mobile;
- botão voltar em produto mobile;
- carregar recursos comerciais;
- carregar o personalizador somente em página de produto;
- carregar o Product Runtime somente em página de produto;
- carregar Storefront somente em home, categoria e busca.

Não usar bootstrap intermediário.

## Core global
`canecafacil-core-v1.css`

Responsável por:
- identidade visual e botões;
- cabeçalho nas páginas não controladas especificamente pela vitrine;
- drawer/mobile cart;
- página de produto;
- produtos relacionados;
- carrinho;
- full banners nativos;
- rodapé.

Ele substitui os antigos snippets de apresentação `BASE HEADER`, `CARRINHO`, `FULL BANNER`, `FOOTER` e a parte visual de `PRODUTO SOCIAL`.

## Storefront
`canecafacil-storefront-v1.js`
`canecafacil-storefront-v1.css`

Responsável por home, categoria e busca:
- 4 colunas desktop, 3 tablet, 2 mobile;
- imagens quadradas sem corte (`object-fit: contain`);
- setas desktop e swipe/dots mobile quando houver mais de uma imagem;
- favorito via rota/classe nativa da Loja Integrada;
- compartilhamento;
- preço, nome e links originados da Loja Integrada;
- chips derivados das categorias nativas;
- 8 produtos iniciais + carregamento progressivo de 8 em 8;
- fallback para paginação nativa;
- benefícios;
- barra inferior mobile.

Substitui `SOCIAL FEED`, `BANNER ORDER` e o antigo catálogo visual da home/categorias.

## Produto
`canecafacil-product-v1.js`

Responsável por:
- marcar/normalizar a página de produto;
- nome visual curto sem alterar o cadastro;
- título “Sobre esta caneca”;
- título “Mais como esse”;
- organização e limite dos relacionados;
- comportamento responsivo dos relacionados.

A personalização continua isolada em `loader-personalizador-inline-producao-v10.js` e seus módulos próprios.

## Recursos comerciais
`canecafacil-commerce-runtime-v1.js`

Responsável por recursos comerciais complementares, incluindo “Minhas Artes” e estado das criações personalizadas. Carrinho/pedido nativos continuam pertencendo à Loja Integrada.

## Códigos a remover do painel da Loja Integrada
Com a arquitetura consolidada ativa, remover/desativar os antigos:

- `SOCIAL FEED V6 JS`
- `SOCIAL FEED V3 CSS`
- `RELATED`
- `BANNER ORDER`
- `FULL BANNER CWSS` / `FULL BANNER CSS`
- `PRODUTO SOCIAL V4 CSS`
- `PRODUTO SOCIAL V4 JS`
- `BASE HEADER V10`
- `CARRINHO V3`
- `FOOTER V5`
- qualquer `Caneca Fácil - Teste Visual Home`
- loaders antigos do personalizador que tenham sido colados separadamente

O objetivo final é existir somente `BASE UX V1.js` como loader próprio global fora do checkout.

## Rollback
Branches preservados:
- `backup/canecafacil-pre-storefront-v3-20260902`
- `backup/canecafacil-pre-runtime-consolidation-20260902`

## Regra de manutenção
Novos ajustes devem ser feitos nos módulos do GitHub, nunca criando um novo snippet V4/V5/V10 no painel da Loja Integrada. Alterar a versão de cache do runtime/loader apenas quando necessário publicar uma nova revisão.
