# Cestas pré-montadas por lote — 2026-09-29

## Objetivo

Controlar as cestas básicas que ficam fisicamente pré-montadas sem vender produto avulso que já está dentro de uma cesta, sem trocar silenciosamente a composição comprada pelo cliente e sem dar baixa dupla no Bling.

## Regra operacional consolidada

- `basket_templates` continua sendo o **modelo/receita comercial** da cesta.
- Cada montagem física cria um `basket_stock_lot`.
- O lote congela os produtos e quantidades que realmente foram colocados nas cestas.
- Produtos dentro de lotes prontos continuam fazendo parte do estoque físico do Bling, mas ficam **bloqueados para venda avulsa** no canal Dona Antônia.
- `ops2_loose_sellable_stock_v1` = saldo vendável do Bling menos componentes comprometidos em cestas prontas/alocadas.
- O site vende a composição do lote físico corrente, não uma composição teórica.
- Ao criar o pedido, a unidade da cesta é alocada ao lote e a composição real é gravada no pedido.
- O Bling recebe os componentes físicos reais da cesta no pedido.
- A baixa física continua acontecendo uma única vez no fluxo oficial do Bling.
- Cancelamento antes da expedição devolve a unidade ao mesmo lote.
- Alterar o modelo da cesta não modifica lotes já montados.

## Nova seção Cestas no Vitrine/Admin

A aba **Cestas** foi adicionada ao menu principal.

### Visão geral

Cada cesta mostra:
- preço;
- quantidade de posições do modelo;
- cestas prontas;
- número de lotes disponíveis;
- capacidade estimada para montar novas cestas usando o estoque solto;
- lote atualmente em venda;
- alerta de divergência nos lotes de implantação.

### Modelo da cesta

Permite:
- editar nome, descrição, foto, preço, ordem e status;
- adicionar produto;
- editar produto/quantidade;
- remover produto do modelo;
- configurar mínimo/máximo;
- configurar se o cliente pode retirar/alterar quantidade;
- manter regras de acréscimo/redução comercial.

Lotes existentes nunca são reescritos quando o modelo muda.

### Montagem de lote

A ferramenta permite:
- começar pelo modelo atual;
- copiar o último lote;
- informar quantidade de cestas a montar;
- alterar a quantidade de cada posição;
- trocar um produto apenas naquele lote;
- pesquisar qualquer outro produto;
- ver estoque **solto** do produto;
- ver quantas cestas cada opção suporta;
- receber sugestões automáticas de substituição;
- guardar uma substituição como alternativa preferida para futuras montagens.

A confirmação de um lote novo é bloqueada quando a composição escolhida ultrapassa o estoque solto.

### Sugestões de substituição

As sugestões são apenas apoio ao operador e nunca fazem troca automática.

A ordenação considera:
- alternativas já salvas;
- mesma subcategoria;
- mesmo tipo/sub-subcategoria;
- mesma categoria;
- embalagem/medida compatível;
- unidade;
- proximidade de preço;
- estoque solto disponível.

## Estruturas adicionadas

- `basket_template_item_alternatives`
- `basket_stock_lots`
- `basket_stock_lot_items`
- `basket_stock_allocations`
- `basket_locked_component_stock_v1`
- `ops2_loose_sellable_stock_v1`
- `basket_current_lot_v1`

Funções centrais:
- `create_basket_stock_lot_v1`
- `create_vitrine_cart_order_v1` adaptada para lotes pré-montados
- `reserve_vitrine_order_stock_v1` adaptada para não reservar novamente o conteúdo-base da cesta
- `consume_vitrine_order_stock_v1` adaptada para pedidos compostos apenas por cesta pré-montada
- `sync_basket_allocations_from_order_status_v1`

## Lotes iniciais registrados

Por orientação operacional, foi cadastrado um lote inicial de **10 unidades para cada uma das 9 cestas**, preservando exatamente a composição que estava configurada no modelo em 2026-09-29.

| Cesta | Lote | Prontas | Divergências digitais na implantação |
|---|---|---:|---:|
| Economica Bonini | CB-260929-01-69A5 | 10 | 0 |
| Mini Bonini | CB-260929-02-CE39 | 10 | 1 |
| Mini Koblenz | CB-260929-03-DDA2 | 10 | 2 |
| Pequena Bonini | CB-260929-04-0FE8 | 10 | 2 |
| Pequena Koblenz | CB-260929-05-2D54 | 10 | 2 |
| Média Koblenz | CB-260929-06-244D | 10 | 6 |
| Média Bonini | CB-260929-07-7B5D | 10 | 7 |
| Grande Koblenz | CB-260929-08-27E1 | 10 | 10 |
| Grande Bonini | CB-260929-09-122A | 10 | 13 |

Total inicial informado: **90 cestas prontas**.

### Importante sobre as divergências

Os lotes iniciais representam a informação de que as cestas já estão fisicamente montadas. Eles não inventam aumento de estoque no Bling.

Ao cruzar a composição de 10 unidades de cada cesta com o saldo digital atual, alguns componentes ficariam comprometidos acima do saldo informado pelo Bling. A divergência foi preservada no metadata de cada lote e aparece no Admin.

Nenhum novo lote criado pelo Admin pode repetir essa situação: para lotes futuros, o saldo solto é validado de forma cumulativa por SKU e a operação é bloqueada se faltar estoque.

A correção dos lotes iniciais deve ocorrer pelo balanço/reconciliação física, não por aumento artificial do saldo.

## Integração com a vitrine

`storefront-v2`:
- só lista cestas que possuam lote pronto;
- informa quantidade pronta do lote corrente;
- abre a composição real do lote;
- usa estoque solto apenas para acréscimos do cliente;
- fixa `lot_id` no carrinho/pedido;
- remove automaticamente do carrinho local cestas antigas sem identificação de lote;
- impede checkout com composição incompatível com o lote.

Produtos avulsos usam `ops2_loose_sellable_stock_v1`, evitando vender unidades já comprometidas dentro das cestas prontas.

## Teste transacional executado

Foi criado um pedido sintético de 1 unidade da **Economica Bonini**:
- total: R$ 92,00;
- lote: CB-260929-01-69A5;
- lote caiu de 10 para 9 disponíveis;
- 14 componentes reais foram gravados no pedido;
- `reserve_vitrine_order_stock_v1` retornou `preassembled_only`;
- nenhuma baixa física local foi feita;
- ao cancelar o pedido, a alocação virou `released`;
- o lote voltou de 9 para 10;
- o pedido sintético foi excluído após o teste.

## Implantação

Edge Functions:
- `storefront-v2` v20 ACTIVE;
- `admin-products-live-v1` v83 ACTIVE.

Frontend:
- `vitrine/index.html` atualizado;
- `index.html` sincronizado;
- `vitrine/admin/index.html` atualizado com a nova aba Cestas.

## Segurança e performance

As novas tabelas usam RLS e não possuem acesso `anon`/`authenticated`; a leitura/escrita passa pelas Edge Functions com autenticação administrativa ou service role.

Foram adicionados índices de FK para:
- `basket_stock_allocations(basket_id)`;
- `basket_stock_lot_items(source_template_item_id)`;
- `basket_template_item_alternatives(product_id)`.

## Próximo ponto operacional

No próximo balanço físico, conferir principalmente os componentes marcados como divergentes nos lotes de implantação. Depois que o saldo físico do Bling estiver conciliado, a criação de novos lotes passa a operar somente com estoque solto confirmado.
