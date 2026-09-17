# Checkpoint — Histórico de Compras — Etapa 2

Data: 17/09/2026  
Status: **CONCLUÍDA**

## Entregas realizadas

Foi criada e aplicada a migration:

`supabase/migrations/20260917232500_customer_purchase_intelligence_summary_v1.sql`

### Resumo inteligente

Criados:

- `customer_purchase_intelligence_v1`
- `get_customer_purchase_intelligence_v1(customer_id, product_limit, category_limit)`

### Dados calculados

O resumo agora entrega:

- quantidade de pedidos válidos;
- valor total comprado;
- ticket médio;
- primeira compra;
- última compra;
- dias desde a última compra;
- quantidade de produtos distintos;
- última cesta;
- cesta favorita;
- quantidade de vezes que a cesta favorita foi comprada;
- última forma de pagamento;
- forma de pagamento mais usada;
- quantidade de usos da forma de pagamento favorita;
- intervalo médio entre compras;
- quantidade de amostras usadas no intervalo;
- frequência estimada de recompra;
- próxima data estimada de recompra;
- nível de confiança do histórico;
- produtos mais recorrentes;
- categorias mais recorrentes.

### Ranking de produtos

Os produtos são ordenados por:

1. número de pedidos distintos em que apareceram;
2. recência;
3. quantidade total;
4. nome como desempate.

O retorno inclui também preço, estoque e situação atual do produto, mas esses dados atuais não alteram o snapshot histórico.

### Ranking de categorias

As categorias usam preferencialmente a taxonomia atual voltada ao cliente:
- `customer_category`;
- fallback para `category`;
- fallback final para `Outros`.

### Frequência de recompra

A classificação inicial é determinística:

- até 10 dias: semanal;
- até 20 dias: quinzenal;
- até 45 dias: mensal;
- até 75 dias: bimestral;
- até 110 dias: trimestral;
- acima disso: ocasional.

A frequência só é calculada quando existem pelo menos 2 compras válidas.

### Confiança

- 0 pedidos: `none`;
- 1 pedido: `low`;
- 2 pedidos: `medium`;
- 3 ou mais: `high`.

## Segurança

A view e a RPC ficam disponíveis apenas para `service_role`.

Verificado:
- anon: bloqueado;
- authenticated: bloqueado;
- service_role: permitido.

## Verificação em produção

Após aplicação:

- 504 clientes no resumo;
- 10 clientes com histórico;
- 10 com cesta favorita calculável;
- 9 com forma de pagamento favorita;
- 3 com intervalo de recompra calculável.

Teste real retornou:
- última compra;
- cesta favorita;
- forma de pagamento favorita;
- produtos recorrentes;
- categorias recorrentes;
- frequência;
- próxima recompra estimada.

## Observação

A base local ainda é pequena e contém compras de teste/implantação próximas no tempo. Portanto a frequência estimada já funciona tecnicamente, mas ficará muito mais representativa após a importação do histórico antigo do Bling.

## Próximo passo

**Etapa 3 — Histórico no Admin**

Criar na ficha do cliente:
- indicadores principais;
- linha do tempo de pedidos;
- detalhe do pedido;
- cesta;
- itens;
- pagamento;
- status;
- produtos/categorias recorrentes;
- resumo de comportamento comercial.
