# CanecaFácil — Limpeza do painel da Loja Integrada

Objetivo: deixar **somente um loader próprio global** no painel da Loja Integrada e centralizar manutenção no GitHub.

## 1. Código que deve permanecer

Manter ativo:

- `BASE UX V1.js`
- Tipo: JavaScript
- Posição: Rodapé
- Página: Todas as páginas exceto checkout
- Conteúdo: copiar de `CODIGO-BASE-UX-REMOTO.txt`

## 2. Remover/desativar snippets antigos

Após confirmar que `BASE UX V1.js` está salvo com a versão atual, remover/desativar:

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
- loaders antigos do personalizador instalados separadamente

## 3. Ordem recomendada de limpeza

### Grupo A — Vitrine
Remover:
- SOCIAL FEED
- BANNER ORDER
- Teste Visual Home

Validar:
- home;
- categoria;
- busca;
- 8 produtos iniciais;
- carregamento progressivo;
- favorito;
- compartilhar;
- swipe/setas das imagens.

### Grupo B — Produto
Remover:
- RELATED
- PRODUTO SOCIAL V4 CSS
- PRODUTO SOCIAL V4 JS
- loaders antigos do personalizador

Validar:
- galeria do produto;
- nome e preço;
- comprar;
- cálculo de frete;
- personalizar;
- aprovação/fluxo da personalização;
- relacionados `Mais como esse`.

### Grupo C — Estrutura visual
Remover:
- BASE HEADER V10
- FULL BANNER
- CARRINHO V3
- FOOTER V5

Validar:
- cabeçalho desktop/mobile;
- busca;
- menu;
- contador do carrinho;
- full banner;
- carrinho;
- footer;
- páginas de conta e pedidos.

## 4. Checkout

O loader próprio não deve ser publicado no checkout. O checkout permanece controlado pela Loja Integrada.

## 5. Regra futura

Não criar novos snippets `V4`, `V5`, `V10` no painel para corrigir comportamento visual.

Todo ajuste novo deve ser feito em um dos módulos:

- `canecafacil-core-v1.css`
- `canecafacil-site-runtime-v1.js`
- `canecafacil-storefront-v1.js`
- `canecafacil-storefront-v1.css`
- `canecafacil-product-v1.js`
- `canecafacil-commerce-runtime-v1.js`
- módulos do personalizador

## 6. Rollback

Se necessário, consultar os branches de backup documentados em `ARQUITETURA-CANECA-FACIL-V3.md`.
