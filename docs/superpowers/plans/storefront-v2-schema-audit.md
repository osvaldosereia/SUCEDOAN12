# Storefront V2 — auditoria do schema real

Data: 2026-09-11

## Reutilização

A Vitrine V2 não precisa duplicar as principais estruturas.

- `products`: reutilizar como fonte oficial de produto, preço, estoque, seção/categoria e disponibilidade.
- `basket_templates`: reutilizar para nome, foto, preço-base, ativação e ordenação de cestas.
- `basket_template_items`: reutilizar para composição, quantidade padrão, remoção/edição e deltas comerciais.
- `customers`: reutilizar; `primary_whatsapp_e164` já é único e existe índice por telefone normalizado.
- `orders`: reutilizar, com ajustes aditivos descritos abaixo.
- `order_items`: reutilizar; já contém `name_snapshot`, `quantity`, `unit_price`, `line_total`, `metadata` e FK para `orders`.

## Ajustes necessários em `orders`

O schema atual ainda exige `whatsapp_account_id NOT NULL`, o que acopla qualquer pedido a uma conta Meta. A Vitrine V2 não usa Meta API, portanto a coluna será preservada para compatibilidade histórica, mas passará a aceitar `NULL`.

Adicionar:

- `phone_e164 text` — referência canônica do telefone digitado no checkout;
- `source text` — origem do pedido, usando `storefront_v2` nos novos pedidos;
- `subtotal numeric(12,2)` — subtotal comercial antes de ajustes futuros;
- `order_number text` — número legível do pedido.

Criar índice parcial de pedidos sem cliente por telefone.

## Status inicial

O trigger atual `queue_order_for_bling()` cria job de Bling quando um pedido é inserido com status `confirmed`. Como a Vitrine V2 pede somente telefone e abre o WhatsApp/PapoAI depois da persistência, o novo pedido não pode entrar no Bling imediatamente.

Será acrescentado o status `storefront_received`. Ele significa: pedido capturado e persistido pela vitrine, aguardando continuação operacional. Esse status não dispara o trigger atual do Bling.

## Preço da cesta

A fórmula comercial existente é válida, mas as funções atuais estão acopladas a conversa/WhatsApp. A Vitrine V2 implementará a mesma regra dentro do novo RPC, sem chamar essas funções legadas:

1. começar no `basket_templates.base_price`;
2. para cada componente, validar quantidade final contra regras da cesta e estoque;
3. diminuição usa `remove_unit_delta`, ou `-products.price` quando o delta não estiver configurado;
4. aumento usa `add_unit_delta`, ou `products.price` quando o delta não estiver configurado;
5. produtos extras somam `products.price * quantidade`;
6. preço enviado pelo navegador é ignorado.

`order_items` continuará registrando o snapshot fiscal/comercial do produto e `orders.other_expenses` / `orders.discount` poderão representar a diferença entre a soma dos itens e o preço comercial da cesta.

## Vínculo por telefone

Criar `normalize_storefront_phone_v2(text)` e `link_unclaimed_orders_to_customer_v2(uuid)`.

A vinculação automática só atualizará pedidos com:

- `customer_id IS NULL`;
- `phone_e164` igual ao telefone normalizado do cliente.

Um pedido já vinculado nunca será transferido automaticamente para outro cliente.

## Segurança observada

RLS está habilitado em `products`, `basket_templates`, `basket_template_items`, `customers`, `orders` e `order_items`. Não existem policies públicas nessas tabelas; a Vitrine V2 acessará dados somente pela Edge Function server-side usando a credencial privilegiada mantida fora do navegador.

## Observação operacional

O trigger de atribuição de canal já retorna sem efeito quando `conversation_id` é nulo. Assim, pedidos da Vitrine V2 podem permanecer sem conversa e sem conta Meta.
