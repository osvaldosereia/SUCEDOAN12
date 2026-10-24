# ERD — schema privado `da_next`

Diagrama lógico da cadeia R02; representa chaves e fronteiras, não implica conexão a um banco remoto. Tipos auxiliares e índices estão no SQL versionado.

## Catálogo e composição de cestas

```mermaid
erDiagram
  PRODUCTS ||--o{ PRODUCT_TYPE_PRODUCTS : elegivel
  PRODUCT_TYPES ||--o{ PRODUCT_TYPE_PRODUCTS : agrupa
  BASKET_SIZES ||--o{ BASKET_SIZE_TYPES : configura
  PRODUCT_TYPES ||--o{ BASKET_SIZE_TYPES : compoe
```

`products` representa um SKU por apresentação/sabor. `product_types` são grupos de alternativas; não são categorias comerciais. `basket_sizes` mantém um ajuste privado em centavos, sem expor esse detalhe na vitrine.

## Pedido e snapshots

```mermaid
erDiagram
  CUSTOMERS o|--o{ ORDERS : realiza
  ORDERS ||--o{ ORDER_BASKET_SNAPSHOTS : preserva
  BASKET_SIZES ||--o{ ORDER_BASKET_SNAPSHOTS : identifica
  ORDER_BASKET_SNAPSHOTS ||--o{ ORDER_BASKET_SNAPSHOT_TYPES : registra
  ORDERS ||--o{ ORDER_ITEMS : contem
```

Endereço, nome, telefone, preço, composição, nome do SKU e tipo são preservados no pedido. `order_items` associa componente a snapshot e tipo por chaves compostas. Componente da cesta não possui preço unitário/linha; extra possui ambos.

## Estoque e comandos

```mermaid
erDiagram
  ORDERS ||--o{ INVENTORY_RESERVATIONS : reserva
  PRODUCTS ||--o{ INVENTORY_RESERVATIONS : sku
  PRODUCTS ||--o{ PRODUCT_STOCK_MOVEMENTS : movimenta
  ORDERS ||--o{ ORDER_EVENTS : historico
  ORDERS ||--o{ ORDER_COMMANDS : deduplica
```

Reservas são consolidadas por produto e pedido. Movimentos e comandos têm chaves de idempotência; eventos têm versão e tipo. As constraints do banco não executam por si sós a lógica transacional do adaptador futuro.

## Atendimento, fiscal e integração

```mermaid
erDiagram
  CUSTOMERS o|--o{ CONVERSATIONS : conversa
  ORDERS o|--o{ CONVERSATIONS : contexto
  CONVERSATIONS ||--o{ CONVERSATION_MESSAGES : recebe
  PRODUCTS ||--o| BLING_PRODUCT_PROFILES : dados_privados
  ORDERS ||--o{ FISCAL_DOCUMENTS : fiscal
```

`audit_log` registra metadados de alteração; `integration_outbox` guarda eventos para consumidores futuros. Nenhuma integração, worker ou mensagem é acionada pelas migrações.
