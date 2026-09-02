# Caneca Fácil — Arquitetura consolidada

## Princípio
A Loja Integrada é a fonte de verdade para catálogo, preço, estoque, URLs, login, favoritos, carrinho, pedido e checkout. O código próprio melhora UX e apresentação sem criar um catálogo paralelo.

## Entradas fixas na Loja Integrada
A arquitetura final usa somente duas entradas próprias e estáveis:

### 1. CSS crítico no cabeçalho
- Local: `Personalize sua loja > Editar CSS`
- Fonte para copiar: `CODIGO-CSS-CRITICO-V1.txt`
- Colar no final do CSS existente
- Não usar `<style>`

Esse CSS contém apenas o necessário para o primeiro paint de home, categoria, busca e topo da página de produto. Ele evita o flash do tema original enquanto os módulos remotos são carregados.

### 2. Loader JavaScript
- Descrição: `BASE UX V1.js`
- Tipo: JavaScript
- Posição: Rodapé
- Página: Todas as páginas exceto checkout
- Fonte para copiar: `CODIGO-BASE-UX-REMOTO.txt`

Esse loader chama `canecafacil-site-runtime-v1.js`.

Não instalar outros loaders globais no painel.

## Runtime central
`canecafacil-site-runtime-v1.js`

Responsável por:
- carregar o CSS Core global completo;
- menu/drawer mobile;
- contador/carrinho mobile;
- botão voltar em produto mobile;
- carregar recursos comerciais;
- carregar o personalizador somente em página de produto;
- carregar o Product Runtime somente em página de produto;
- carregar Storefront somente em home, categoria e busca.

Não usar bootstrap intermediário.

## CSS crítico
`CODIGO-CSS-CRITICO-V1.txt`

Responsável somente pelo primeiro viewport antes do JavaScript remoto:
- header e busca;
- banner principal;
- grid/listagem inicial;
- cards e imagens quadradas;
- topo da página de produto;
- responsividade inicial desktop/tablet/mobile.

Não contém lógica, não esconde o `body` e não depende do GitHub em tempo de execução.

## Core global
`canecafacil-core-v1.css`

Responsável pelo visual completo após o runtime carregar:
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
- grid plano derivado dos produtos nativos da Loja Integrada;
- 4 colunas desktop, 3 tablet, 2 mobile;
- imagens quadradas sem corte (`object-fit: contain`);
- setas desktop e swipe/dots mobile quando houver mais de uma imagem;
- favorito via rota/classe nativa da Loja Integrada;
- compartilhamento;
- preço, nome e links originados da Loja Integrada;
- chips derivados das categorias nativas;
- 8 produtos iniciais + carregamento progressivo de 8 em 8;
- deduplicação por ID/URL e proteção contra repetir página;
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
- título único “Mais como esse”;
- organização e limite dos relacionados;
- limpeza defensiva de rótulos legados próximos ao personalizador;
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

O objetivo final é manter somente o **CSS crítico no Editar CSS** e o **BASE UX V1.js** como entradas próprias estáveis fora do checkout.

## Rollback
Branches preservados:
- `backup/canecafacil-pre-storefront-v3-20260902`
- `backup/canecafacil-pre-runtime-consolidation-20260902`

## Regra de manutenção
Novos ajustes devem ser feitos nos módulos do GitHub, nunca criando novos snippets V4/V5/V10 no painel da Loja Integrada. O CSS crítico só deve ser alterado quando a estrutura acima da dobra mudar de forma relevante. Alterar a versão de cache do runtime/loader quando necessário publicar uma nova revisão.
