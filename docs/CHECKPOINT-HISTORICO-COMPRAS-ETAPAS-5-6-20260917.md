# Checkpoint — Compras Frequentes e Início Personalizado — Etapas 5 e 6

Data: 17/09/2026  
Status: **CONCLUÍDAS**

## Etapa 5 — Minhas compras frequentes

Foi criada a RPC:

- `get_customer_frequent_purchases_v1(customer_id, product_limit, extra_limit)`

Migration:

- `supabase/migrations/20260918001000_customer_frequent_purchases_v1.sql`

A consulta usa somente histórico comercial real e prioriza produtos por:

1. número de pedidos distintos;
2. recência;
3. quantidade total;
4. disponibilidade atual.

A resposta inclui:

- cesta favorita;
- quantidade de compras da cesta;
- frequência aproximada;
- intervalo médio;
- produtos recorrentes;
- últimos extras;
- preço atual;
- estoque atual;
- disponibilidade atual.

Produtos só são tratados como recorrentes quando apareceram em pelo menos dois pedidos válidos.

## API do Comprar

`shopping-chat-customer-v1` foi publicada em produção na versão 8 com a ação:

- `frequent_purchases`

O cliente é sempre derivado da sessão atual; o navegador não envia um `customer_id` arbitrário.

## Interface

Criados:

- `comprar/frequent-purchases-v1.js`
- `comprar/frequent-purchases-v1.css`

Para clientes com recorrência suficiente aparece:

- **Minhas compras frequentes**
- cesta mais comprada;
- produtos recorrentes;
- extras recentes;
- ritmo aproximado de recompra;
- botão **Adicionar novamente**.

Ao adicionar novamente, o Comprar relê o carrinho atual e usa a mesma ação `set_quantity` do fluxo normal. Portanto estoque, limite de quantidade e regras atuais continuam sendo validados no backend.

Itens indisponíveis continuam visíveis como histórico, mas o botão fica desativado.

## Etapa 6 — Início personalizado

Criados:

- `comprar/personalized-start-v1.js`
- `comprar/personalized-start-v1.css`

Para cliente identificado com histórico, o início passa a organizar atalhos úteis:

- repetir última compra;
- minhas compras frequentes;
- comprar a cesta de sempre, quando realmente acrescenta uma opção diferente.

A cesta de sempre só aparece quando:

- foi comprada ao menos duas vezes;
- está disponível;
- o atalho não é redundante com a última compra simples.

As opções normais permanecem sempre visíveis:

- Cestas Básicas;
- Ofertas;
- Para Você;
- Para Casa.

Cliente sem histórico continua com o fluxo original.

## Testes

Criados:

- `scripts/test-comprar-frequent-purchases-v1.mjs`
- `scripts/test-comprar-personalized-start-v1.mjs`

O workflow **Testar Sala de Compra** concluiu com sucesso após as alterações.

## Segurança e arquitetura

- sem Make;
- sem exposição de `customer_id` arbitrário;
- sessão opaca continua sendo a fronteira de identidade;
- histórico não cria preço;
- estoque atual vence histórico;
- indisponibilidade atual vence histórico;
- nenhuma compra é adicionada automaticamente.

## Próximo passo

**Etapa 7 — Ofertas personalizadas dentro do Comprar**

Usar histórico somente para ordenar ofertas válidas, sem inventar descontos nem esconder as ofertas gerais.
