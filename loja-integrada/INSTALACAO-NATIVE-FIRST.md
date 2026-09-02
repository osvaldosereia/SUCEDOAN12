# CanecaFácil — instalação native-first na Loja Integrada

## Objetivo
Eliminar a piscada do tema original e usar a Loja Integrada como estrutura nativa do e-commerce.

A página não é mais reconstruída por JavaScript. O HTML original da Loja Integrada é estilizado diretamente no primeiro carregamento.

## Arquivos ativos no painel

### 1. CF BASE CSS
- Arquivo fonte: `LI-CF-BASE-CSS.txt`
- Tipo: CSS
- Posição: Cabeçalho
- Página: Todas as páginas exceto checkout
- Função: identidade, cabeçalho, busca, categorias nativas, rodapé e carrinho

### 2. CF VITRINE CSS
- Arquivo fonte: `LI-CF-VITRINE-CSS.txt`
- Tipo: CSS
- Posição: Cabeçalho
- Página: Todas as páginas exceto checkout
- Função: home, categorias, busca, banner e cards

### 3. CF PRODUTO CSS
- Arquivo fonte: `LI-CF-PRODUTO-CSS.txt`
- Tipo: CSS
- Posição: Cabeçalho
- Página: Todas as páginas exceto checkout
- Função: página do produto, galeria, compra, frete, personalizador e relacionados

### 4. BASE UX V1.js
- Conteúdo: `LI-CF-FUNCOES-JS.txt`
- Tipo: JavaScript
- Posição: Rodapé
- Página: Todas as páginas exceto checkout
- Função: nome visual curto, favorito, 12 produtos iniciais + botão Ver mais canecas, deduplicação de páginas adicionais e carregamento opcional de Minhas Artes/personalizador

## Filosofia visual
- muito espaço em branco;
- fotos grandes e quadradas;
- card sem moldura pesada;
- apenas foto, favorito, nome e preço;
- sem compartilhar na listagem;
- sem barra inferior mobile;
- sem setas/carrossel dentro do card;
- banner curto;
- produto aparece cedo;
- mobile em duas colunas para descoberta visual;
- página de produto com imagem grande e compra clara.

## Paginação
A primeira visualização mostra 3 linhas nativas da Loja Integrada, normalmente 12 produtos no desktop. O botão `Ver mais canecas` revela mais 3 linhas por vez. Quando necessário, o JavaScript busca a próxima página nativa e anexa novas `listagem-linha` sem mover os cards já renderizados.

## Não instalar
- `CODIGO-BASE-UX-REMOTO.txt`
- `canecafacil-site-runtime-v1.js` como loader visual
- `canecafacil-core-v1.css` remotamente
- `canecafacil-storefront-v1.css` remotamente
- SOCIAL FEED antigos
- PRODUTO SOCIAL antigos
- BASE HEADER antigo
- CARRINHO antigo
- FOOTER antigo
- FULL BANNER antigo

## Regra futura
GitHub é a fonte mestre e histórico. O visual crítico permanece copiado no painel da Loja Integrada para renderizar no primeiro paint. Alterações devem ser feitas primeiro nos arquivos `LI-CF-*`, revisadas e depois copiadas para o painel.
