# Editor completo de sugestões automáticas de cestas v2

## Regras preservadas
- geração automática apenas cria sugestões;
- aprovação é humana;
- lote aprovado nasce com `sale_enabled=false`;
- estoque é revalidado no momento da aprovação;
- diferença comercial entre preço da cesta e soma dos componentes permanece interna;
- lotes antigos sem preço próprio continuam usando `basket_templates.base_price`.

## Editor
Uma sugestão pendente permite alterar:
- quantidade de cestas do lote;
- preço de venda por cesta;
- produto de qualquer posição;
- quantidade do produto por cesta;
- remover produto;
- adicionar produto.

Produtos substituídos recebem destaque visual `SUBSTITUÍDO`. Produtos adicionados manualmente também ficam identificados.

## Preço por lote
`basket_stock_lots.sale_price_override` guarda o preço comercial aprovado para aquele lote. O storefront usa esse preço quando presente; se nulo, mantém o preço padrão da cesta.

## Segurança
Somente lotes `legacy_full`, `ready`, com saldo e `sale_enabled=true` podem ser usados pelo fluxo legacy do site. Aprovar sugestão não ativa o lote no site.
