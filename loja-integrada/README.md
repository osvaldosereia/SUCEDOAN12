# CanecaFácil · Loja Integrada

Integração comercial da CanecaFácil com a Loja Integrada.

## Arquitetura atual

A **Loja Integrada é a fonte de verdade comercial** para catálogo publicado, preço, estoque, URLs, login, favoritos, carrinho, pedido, checkout, pagamento e frete.

O código próprio existe apenas para melhorar apresentação, navegação e personalização.

### Entradas próprias no painel

Manter somente duas entradas fixas:

1. **CSS crítico** em `Personalize sua loja > Editar CSS`
   - fonte: `CODIGO-CSS-CRITICO-V1.txt`
   - colar no final do CSS existente
   - não usar `<style>`

2. **BASE UX V1.js**
   - tipo: JavaScript
   - posição: Rodapé
   - página: Todas as páginas exceto checkout
   - fonte: `CODIGO-BASE-UX-REMOTO.txt`

O CSS crítico evita o flash do tema original no primeiro paint. O loader JavaScript carrega os módulos completos do GitHub.

Não instalar loaders adicionais do personalizador, storefront, produto, carrinho, header ou footer no painel.

## Runtime central

`canecafacil-site-runtime-v1.js` carrega condicionalmente:

- `canecafacil-core-v1.css` — identidade visual, header, produto, relacionados, carrinho, banners e footer;
- `canecafacil-storefront-v1.js` + CSS — home, categorias e busca;
- `canecafacil-product-v1.js` — página de produto e relacionados;
- `canecafacil-commerce-runtime-v1.js` — recursos comerciais complementares;
- `loader-personalizador-inline-producao-v10.js` — personalizador, somente em produto.

Não usar bootstrap intermediário.

## Personalizador

O personalizador de produção é carregado automaticamente pelo runtime central apenas nas páginas de produto. Ele funciona dentro da própria página do produto, sem loader separado no painel.

Arquivos antigos de homologação, hotfix e loader de rodapé permanecem apenas como histórico e estão marcados como **LEGADO / NÃO INSTALAR**.

## Códigos antigos do painel

Com a arquitetura consolidada ativa, remover/desativar:

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

Consulte `ARQUITETURA-CANECA-FACIL-V3.md` e `LIMPEZA-PAINEL-LOJA-INTEGRADA.md` para detalhes e rollback.

## Integrações e dados

- **Admin Canecas / Firebase:** cadastro criativo, arte horizontal, mockups, configuração de personalização e metadados de sincronização.
- **Loja Integrada:** operação comercial.
- **Make:** ponte segura entre Admin Canecas e APIs quando necessária.
- **Caneca Print:** produção/impressão a partir da arte aprovada.

## Segurança

Nunca adicionar ao GitHub tokens, Authorization da Loja Integrada, credenciais OpenAI, Bling, transportadoras ou outras chaves privadas.
