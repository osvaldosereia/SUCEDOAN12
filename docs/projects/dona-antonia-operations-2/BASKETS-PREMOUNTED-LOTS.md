# Cestas pré-montadas por lote — implantação 2026-09-29

## Objetivo

Controlar cestas básicas que ficam fisicamente pré-montadas sem perder a verdade do estoque dos componentes e sem entregar uma composição diferente da que foi vendida.

A cesta comercial continua existindo em `basket_templates`, mas o estoque vendável da cesta passa a ser representado por lotes físicos imutáveis.

## Modelo implantado

### Modelo comercial
- `basket_templates`: nome, preço, imagem, status e ordem.
- `basket_template_items`: receita padrão para montar novos lotes.
- `basket_template_item_alternatives`: alternativas aprovadas/reutilizáveis para uma posição do modelo.

Alterar o modelo não altera lotes já montados.

### Estoque físico de cestas
- `basket_stock_lots`: lote de cestas pré-montadas.
- `basket_stock_lot_items`: composição real daquele lote.
- `basket_stock_allocations`: vincula pedido + lote e impede vender a mesma cesta duas vezes.

Cada lote guarda:
- código;
- quantidade montada;
- quantidade disponível;
- data/hora;
- operador;
- composição real;
- produtos substituídos;
- evidência de eventual divergência inicial.

### Estoque solto

`basket_locked_component_stock_v1` calcula quanto de cada SKU está fisicamente dentro de cestas prontas ou reservado por pedidos.

`ops2_loose_sellable_stock_v1` expõe:

`estoque solto = estoque vendável no Bling - componentes presos em cestas`

Assim, produto que já está dentro de uma cesta pronta deixa de ficar disponível para venda avulsa, sem alterar prematuramente o saldo físico do Bling.

## Bling

O Bling permanece autoridade física de estoque.

A montagem do lote **não faz baixa física no Bling**. Os componentes apenas ficam bloqueados localmente para venda avulsa.

Quando a cesta é vendida:
1. o pedido recebe os componentes reais do lote;
2. o lote é alocado ao pedido;
3. extras personalizados usam estoque solto;
4. na saída física normal do pedido, o Bling recebe/baixa os componentes efetivamente vendidos;
5. a alocação do lote deixa de bloquear os componentes quando o pedido passa para expedição;
6. cancelamento antes da saída devolve a unidade ao lote.

Isso evita dupla baixa.

## Vitrine pública

A vitrine agora:
- só mostra cesta que possua lote pronto;
- usa o lote mais antigo disponível (FIFO);
- mostra a composição real do lote;
- grava `lot_id` e `lot_code` no carrinho/pedido;
- limita a quantidade comprável ao estoque físico do lote;
- permite personalização, mas extras são validados contra estoque solto;
- mantém compatibilidade com carrinhos antigos e pedidos multicanal que ainda enviem o SKU do modelo: o motor converte para o SKU real do lote.

## Vitrine/Admin — nova seção Cestas

A seção `Cestas` foi adicionada ao menu principal.

Recursos:
- visão das 9 cestas;
- preço, quantidade pronta, lotes e capacidade de nova montagem;
- edição do modelo;
- adicionar/remover/editar componentes;
- estoque solto e quantidade já presa em cestas;
- histórico e composição de cada lote;
- novo lote a partir do modelo;
- copiar último lote;
- substituir um produto apenas naquele lote;
- guardar uma substituição como alternativa para próximas montagens;
- busca manual de produto mostrando estoque solto real;
- sugestões automáticas conservadoras por família/subcategoria + embalagem/faixa de preço;
- cálculo em tempo real de quantas cestas a composição escolhida permite montar;
- bloqueio de criação quando o estoque solto não suporta o lote;
- cancelamento de lote sem pedidos alocados.

As sugestões nunca substituem produto automaticamente. A escolha continua humana.

## Bootstrap solicitado

Foram registrados 9 lotes iniciais, 10 cestas em cada modelo:

| Cesta | Lote | Prontas | Divergências digitais no bootstrap |
| --- | --- | ---: | ---: |
| Economica Bonini | CB-260929-01-69A5 | 10 | 0 |
| Mini Bonini | CB-260929-02-CE39 | 10 | 1 |
| Mini Koblenz | CB-260929-03-DDA2 | 10 | 2 |
| Pequena Bonini | CB-260929-04-0FE8 | 10 | 2 |
| Pequena Koblenz | CB-260929-05-2D54 | 10 | 2 |
| Média Koblenz | CB-260929-06-244D | 10 | 6 |
| Média Bonini | CB-260929-07-7B5D | 10 | 7 |
| Grande Koblenz | CB-260929-08-27E1 | 10 | 10 |
| Grande Bonini | CB-260929-09-122A | 10 | 13 |

Total: **90 cestas prontas**.

O bootstrap foi autorizado como estoque físico já existente. Ele não inventou entrada no Bling. Onde o saldo digital atual não sustentava a composição informada, o lote foi criado com evidência de `stock_gap_at_creation`.

Estado após o bootstrap:
- 30 SKUs aparecem dentro das cestas;
- 3.280 unidades de componentes estão comprometidas nos 90 lotes;
- 13 SKUs ficaram com estoque solto zero porque o saldo digital atual é menor ou igual ao que foi informado como já pré-montado.

Essas divergências devem ser reconciliadas no balanço físico. Novos lotes não recebem essa exceção: o sistema bloqueia a montagem se faltar estoque solto.

## Teste de integração

Teste sintético executado com 1 Cesta Econômica:
- pedido criado com componentes reais do lote;
- `basket_stock_allocations` criada;
- lote passou de 10 para 9;
- reserva retornou `preassembled_only`;
- nenhuma baixa física antecipada foi feita no Bling;
- cancelamento devolveu o lote de 9 para 10;
- pedido e dados de teste foram apagados após a validação.

## Migrations Supabase

Aplicadas em 2026-09-29:
- `basket_premounted_lots_v1`
- `basket_premounted_order_engine_v2`
- `basket_lot_cumulative_stock_guard_v1`
- `basket_premounted_fk_indexes_v1`
- `basket_lot_legacy_component_compat_v1`

## Serviços publicados

- `storefront-v2`: versão 21
- `admin-products-live-v1`: versão 86

## Segurança

As novas tabelas possuem RLS habilitado e nenhum acesso direto para `anon` ou `authenticated`; acesso operacional ocorre via service role nos gateways existentes.

O advisor do Supabase mostra `RLS enabled no policy` como INFO para essas tabelas. Isso é intencional neste desenho: sem policy, o cliente não acessa as tabelas diretamente.

## Próxima ação operacional

1. Conferir fisicamente se existem realmente as 10 unidades pré-montadas de cada uma das 9 cestas.
2. No próximo balanço, reconciliar os 13 SKUs cujo saldo digital ficou totalmente comprometido.
3. Para novas montagens, usar **Cestas > Gerenciar > Montar lote** e trocar produtos somente pela composição real que será colocada fisicamente.
