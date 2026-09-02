# CanecaFácil — instalação native-first na Loja Integrada

## Objetivo
Eliminar a piscada do tema original e usar a Loja Integrada como estrutura nativa do e-commerce.

A página não é reconstruída por JavaScript. O HTML original da Loja Integrada é estilizado diretamente no primeiro carregamento e o JavaScript fica restrito a comportamento.

## Arquivos ativos no painel

### 1. CF BASE CSS
- Arquivo fonte: `LI-CF-BASE-CSS.txt`
- Tipo: CSS
- Posição: Cabeçalho
- Página: Todas as páginas exceto checkout
- Função: identidade, cabeçalho, busca, rodapé e carrinho

### 2. CF VITRINE CSS
- Arquivo fonte: `LI-CF-VITRINE-CSS.txt`
- Tipo: CSS
- Posição: Cabeçalho
- Página: Todas as páginas exceto checkout
- Função: home, categorias, busca, banner e cards foto-first

### 3. CF PRODUTO CSS
- Arquivo fonte: `LI-CF-PRODUTO-CSS.txt`
- Tipo: CSS
- Posição: Cabeçalho
- Página: Todas as páginas exceto checkout
- Função: galeria quadrada sem corte, hierarquia comercial, personalizador antes da compra, botão obrigatório e relacionados

### 4. CF NAVEGAÇÃO CSS
- Arquivo fonte: `LI-CF-NAVEGACAO-CSS.txt`
- Tipo: CSS
- Posição: Cabeçalho
- Página: Todas as páginas exceto checkout
- Função: header sticky desktop, chips recolhíveis e barra inferior estilo app no mobile

### 5. CF FUNÇÕES JS
- Arquivo fonte: `LI-CF-FUNCOES-JS.txt`
- Tipo: JavaScript
- Posição: Rodapé
- Página: Todas as páginas exceto checkout
- Função: nomes curtos, favorito nativo, 12 produtos iniciais + Ver mais, chips, navegação mobile, categorias e módulos opcionais

### 6. CF PRODUTO FUNÇÕES JS
- Arquivo fonte: `LI-CF-PRODUTO-FUNCOES-JS.txt`
- Tipo: JavaScript
- Posição: Rodapé
- Página: Todas as páginas exceto checkout
- Função: move o personalizador antes da quantidade/compra, lê `personalizacao.obrigatoria` no Firebase, bloqueia compra sem personalização e transforma Criar em Personalizar no produto mobile

## Filosofia visual
- muito espaço em branco;
- fotos grandes e quadradas;
- card com contorno e sombra quase imperceptíveis;
- foto, favorito, nome e preço como únicos elementos essenciais do card;
- header fixo e baixo;
- chips só quando ajudam; recolhem na rolagem desktop;
- barra inferior mobile estilo app;
- banner curto;
- produto aparece cedo;
- mobile em duas colunas para descoberta visual;
- página de produto com imagem grande e personalização antes da compra.

## Personalização obrigatória
O campo existente no Admin Canecas é a fonte da regra: `personalizacao.obrigatoria`.

Quando `personalizacao.ativa === true` e `personalizacao.obrigatoria === true`:
- o personalizador é posicionado antes da quantidade e do Comprar;
- o botão nativo muda para `Personalize para comprar`;
- qualquer tentativa de compra é bloqueada e leva ao personalizador;
- a compra correta é concluída pelo botão `APROVAR E COMPRAR` do personalizador, que vincula a arte ao produto original da Loja Integrada e segue para o carrinho.

## Galeria do produto
Todas as molduras são quadradas. As imagens usam `object-fit: contain`, portanto os recortes 3 e 4, que não são quadrados, se ajustam dentro da moldura sem cortar conteúdo.

## Paginação
A primeira visualização mostra 3 linhas nativas da Loja Integrada, normalmente 12 produtos no desktop. O botão `Ver mais canecas` revela mais 3 linhas por vez. Quando necessário, o JavaScript busca a próxima página nativa e anexa novas `listagem-linha` sem mover os cards já renderizados.

## Personalizador remoto
O aplicativo do personalizador continua hospedado fora da Loja Integrada porque é uma aplicação própria. A tela de prévia usa `personalizar/preview-polish-v1.css`, com arte maior, menos área cinza, controles menores e CTA de aprovação no laranja da marca.

## Não instalar
- `CODIGO-BASE-UX-REMOTO.txt`
- `CODIGO-CSS-CRITICO-V1.txt`
- `canecafacil-site-runtime-v1.js` como loader visual
- `canecafacil-core-v1.css` remotamente
- `canecafacil-storefront-v1.css` remotamente
- SOCIAL FEED antigos
- PRODUTO SOCIAL antigos
- BASE HEADER antigo
- CARRINHO antigo
- FOOTER antigo
- RELATED antigo
- FULL BANNER antigo

## Regra futura
GitHub é a fonte mestre e histórico. O visual crítico permanece copiado no painel da Loja Integrada para renderizar no primeiro paint. Alterações devem ser feitas primeiro nos arquivos `LI-CF-*`, revisadas e depois copiadas para o painel.
