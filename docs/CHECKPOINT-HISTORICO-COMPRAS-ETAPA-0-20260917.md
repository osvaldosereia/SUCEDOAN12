# Checkpoint — Histórico de Compras — Etapa 0

Data: 17/09/2026  
Status: **CONCLUÍDA**

## Resultado da auditoria

### Base atual

- Pedidos locais: **17**
- Itens de pedidos: **423**
- Clientes: **504**
- Clientes com histórico/resumo de compras: **10**
- Linhas em `customer_product_stats`: **305**
- Clientes representados em `customer_product_stats`: **10**

### Integridade

- Pedidos sem itens: **0**
- Itens órfãos: **0**
- IDs do Bling duplicados: **0**
- Números de pedido duplicados: **0**
- Chaves de idempotência duplicadas: **0**
- Itens sem `product_id`: **0**
- Itens sem `name_snapshot`: **0**
- Quantidades inválidas/não positivas: **0**
- Totais negativos em itens: **0**

### Vínculo de cliente

- 16/17 pedidos têm `customer_id`.
- Existe 1 pedido antigo `storefront_v2` sem `customer_id`.
- Esse pedido não possui correspondência exata por telefone na tabela atual de clientes.
- Decisão: **não vincular automaticamente**. Fica para fila de reconciliação futura.

### Status atuais

- 14 pedidos em `confirmed`.
- 3 pedidos antigos em `storefront_received`.
- 0 cancelados.
- 0 devolvidos.

Estados previstos pelo banco/admin:
`storefront_received`, `confirmed`, `sent_to_bling`, `processing`, `ready`, `out_for_delivery`, `delivered`, `cancelled`, `returned`.

### Qualidade dos snapshots

- Todos os 17 pedidos possuem `customer_snapshot`.
- 4 pedidos antigos não possuem `checkout_snapshot`.
- 1 pedido não possui telefone normalizado no pedido.
- 5 pedidos não possuem forma de pagamento gravada.
- Todos os 17 pedidos possuem `basket_id`.
- 13 pedidos possuem `catalog_session_id`.

Essas ausências históricas não impedem o projeto. Para novos pedidos, o contrato deve preservar os campos completos disponíveis.

## Descoberta importante

O projeto já possui uma fundação útil criada anteriormente:

- `customer_product_stats`;
- `refresh_customer_purchase_profile(uuid)`;
- trigger em `orders`;
- trigger em `order_items`;
- `get_customer_recommendations(...)`;
- campos em `customers`: `order_count`, `lifetime_value`, `last_order_at`.

Portanto a Etapa 1 não deve recriar essa estrutura; deve **corrigir, consolidar e expor uma camada canônica de histórico**.

## Lacuna encontrada

A função atual `refresh_customer_purchase_profile` considera todo pedido cujo status seja diferente de `cancelled`.

Isso significa que um pedido futuro com status `returned` continuaria contando em:

- `order_count`;
- `lifetime_value`;
- `customer_product_stats`.

Hoje isso não causou divergência porque não existem pedidos devolvidos, mas deve ser corrigido antes de usarmos o histórico para recompra e segmentação.

## Contrato definido para a próxima etapa

### Compra comercial válida

Para histórico de consumo e recompra, considerar:
- `storefront_received`;
- `confirmed`;
- `sent_to_bling`;
- `processing`;
- `ready`;
- `out_for_delivery`;
- `delivered`.

Excluir:
- `cancelled`;
- `returned`.

### Regras

1. `orders + order_items` são a fonte de verdade.
2. Snapshots históricos nunca são substituídos por nomes/preços atuais.
3. Recompra usa apenas IDs históricos como referência e recalcula catálogo, preço, estoque e oferta atuais.
4. Pedido sem cliente não é ligado automaticamente por aproximação.
5. Métricas agregadas devem ser reconstruíveis a partir dos pedidos.

## Próximo passo

**Etapa 1 — Camada canônica de histórico**

Implementar:
- correção do perfil de compra para excluir devoluções;
- RPC de histórico paginado por cliente;
- RPC de última compra;
- RPC de detalhe do pedido;
- visão/resumo canônico reutilizável pelo Admin e pelo Comprar;
- testes de regressão antes de qualquer mudança visual.
