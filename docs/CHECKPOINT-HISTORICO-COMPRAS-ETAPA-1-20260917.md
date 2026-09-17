# Checkpoint — Histórico de Compras — Etapa 1

Data: 17/09/2026  
Status: **CONCLUÍDA**

## Entregas realizadas

Foi criada e aplicada a migration:

`supabase/migrations/20260917225500_customer_purchase_history_canonical_v1.sql`

### Camada canônica

Criados:

- `is_customer_purchase_valid_v1(status,cancelled_at,returned_at)`
- `customer_purchase_summary_v1`
- `get_customer_purchase_history_v1(customer_id,limit,offset)`
- `get_customer_last_purchase_v1(customer_id)`
- `get_customer_order_detail_v1(customer_id,order_id)`

### Correção do histórico existente

`refresh_customer_purchase_profile(uuid)` foi corrigida para excluir:

- pedidos `cancelled`;
- pedidos `returned`;
- pedidos com `cancelled_at`;
- pedidos com `returned_at`.

O trigger de pedidos agora também recalcula o perfil quando `cancelled_at` ou `returned_at` mudam.

### Índices

Criados, se ausentes:

- `idx_orders_customer_history_v1`
- `idx_order_items_order_history_v1`

## Contrato de leitura

### Histórico paginado

`get_customer_purchase_history_v1` retorna todos os pedidos do cliente, inclusive cancelados/devolvidos, com a flag `counts_as_purchase`.

Isso preserva a linha do tempo completa sem contaminar métricas comerciais.

### Última compra

`get_customer_last_purchase_v1` retorna somente a última compra comercial válida, incluindo seus itens e snapshots históricos.

### Detalhe

`get_customer_order_detail_v1` exige `customer_id + order_id`, evitando leitura de pedido de outro cliente.

### Resumo

`customer_purchase_summary_v1` consolida:

- quantidade de pedidos válidos;
- valor total comprado;
- ticket médio;
- primeira compra;
- última compra;
- quantidade de produtos distintos;
- último pedido;
- última cesta;
- última forma de pagamento.

## Segurança

As RPCs e a view foram bloqueadas para:

- `anon`;
- `authenticated`;
- `public`.

Acesso liberado somente para `service_role`.

## Verificação em produção

Após aplicar a migration:

- `delivered` = compra válida;
- `confirmed` = compra válida;
- `cancelled` = não conta;
- `returned` = não conta;
- pedido com `returned_at` = não conta;
- 504 linhas no resumo para 504 clientes;
- divergências entre resumo e pedidos: **0**;
- acesso anônimo ao histórico: **bloqueado**;
- acesso autenticado direto: **bloqueado**;
- acesso service role: **permitido**;
- teste real de última compra retornou pedido e itens corretamente.

## Próximo passo

**Etapa 2 — Resumo inteligente do cliente**

Implementar:

- cesta mais comprada;
- forma de pagamento mais usada;
- produtos mais recorrentes;
- categorias mais recorrentes;
- intervalo médio entre compras;
- dias desde a última compra;
- frequência estimada de recompra;
- RPC compacta para Admin e Chat Comprar.
