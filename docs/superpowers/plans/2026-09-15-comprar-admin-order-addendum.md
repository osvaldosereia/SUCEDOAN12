# Addendum — Persistência integral de pedido e Admin oficial

Este addendum é requisito aprovado posteriormente pelo usuário e **substitui** a restrição do plano principal que dizia para não alterar o Admin V3.

## Objetivo adicional

Antes de abrir o WhatsApp, o Comprar deve persistir um pedido completo e idempotente. O mesmo pedido precisa ser consultável no Admin mais novo. Ao final, `/admin/` deve ser o endereço oficial da versão administrativa mais nova; `/admin-v3/` fica como compatibilidade durante a transição.

## Dados obrigatórios do pedido

Persistir na fonte de verdade (`orders`, `order_items` e snapshots relacionados):

- ID interno e `order_number`;
- origem `shopping_room`;
- customer_id, nome, telefone, CPF/CNPJ quando houver e customer snapshot;
- endereço completo confirmado e locator quando houver;
- `payment_method`;
- basket_id/nome quando houver;
- itens com product_id, SKU/name snapshot, quantidade, unit_price, line_total e source;
- fiscal_subtotal/subtotal, other_expenses, discount e total;
- cart_id, conversation_id e catalog_session_id quando disponíveis;
- status e sync_status;
- metadados suficientes para diferenciar itens da cesta, alterações e extras.

Falha de persistência bloqueia a abertura do WhatsApp. Reabrir o WhatsApp/fallback nunca recria o pedido.

## Task A: contrato de persistência/Admin

**Files:**
- Create: `scripts/test-comprar-order-admin-v1.mjs`
- Modify: `.github/workflows/test-shopping-room.yml`

Teste deve exigir: `order_number`, `source='shopping_room'`, payment_method, snapshots/itens, detalhe no Admin e rota Pedidos no Admin oficial.

## Task B: finalizar snapshot completo do pedido

**Files:**
- Create: `supabase/migrations/20260915020000_shopping_room_order_admin_v1.sql`
- Modify: `supabase/functions/shopping-chat-v1/index.ts`
- Modify: `supabase/functions/shopping-room-v1/index.ts` somente se necessário para paridade.

Criar/atualizar a confirmação para que o pedido receba `order_number`, `source='shopping_room'`, `phone_e164`, `payment_method`, locator e identificadores da sessão, preservando `orders` + `order_items` como fonte de verdade. A confirmação deve ser idempotente por cart/session.

## Task C: Admin listar e abrir pedidos do Comprar

**Files:**
- Modify: `supabase/functions/admin-v3-api/index.ts`
- Modify: `admin-v3/app.js`
- Modify: `admin-v3/styles.css` se necessário.

A lista de Pedidos deve incluir `storefront_v2` e `shopping_room`, com número, data, cliente/telefone, total, pagamento, origem e status. O detalhe deve carregar cliente, endereço, pagamento, cesta, itens, source de cada item, valores e IDs operacionais.

## Task D: promover Admin V3 para `/admin/`

**Files:**
- `admin/**`
- `admin-v3/**` apenas para compatibilidade/redirect quando necessário.

Depois que os contratos do Admin V3 estiverem verdes, tornar a versão nova a implementação oficial de `/admin/`. Não manter duas implementações divergentes. `/admin-v3/` deve redirecionar ou encaminhar para `/admin/` após a promoção.

## Verificação

- Um pedido criado no Comprar deve existir em `orders` e `order_items` antes do deep link do WhatsApp.
- Deve aparecer em `/admin/#orders` sem depender de Bling.
- Abrir o pedido no Admin deve mostrar os mesmos endereço, pagamento, itens e total enviados ao WhatsApp.
- Fallback de WhatsApp não pode criar segundo pedido.
