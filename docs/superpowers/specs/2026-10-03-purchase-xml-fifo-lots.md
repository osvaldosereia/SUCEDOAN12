# XML de compras — múltiplos EANs, lotes internos e FIFO

## Objetivo

No fluxo de produtos vindos de XML de compras da Vitrine/Admin:

1. manter o Bling como autoridade do estoque físico/total, sem somar a mesma entrada duas vezes;
2. permitir vincular um item da nota a um produto já existente mesmo quando o EAN mudou;
3. manter o EAN antigo e o novo associados ao mesmo produto;
4. representar cada item recebido de cada XML como uma entrada/lote interno separado, sem exigir número de lote comercial;
5. permitir validade opcional por entrada/lote;
6. considerar a soma dos lotes para fins operacionais e consumir primeiro a entrada mais antiga (FIFO), passando à seguinte quando a anterior acabar;
7. não bloquear venda porque o controle interno de lotes ficou momentaneamente atrás do estoque canônico do Bling.

## Regras de identidade

- A busca manual já existente por nome/EAN/SKU continua sendo a interface canônica para encontrar o produto equivalente.
- Ao confirmar vínculo com produto existente, o `products.gtin` canônico não deve ser sobrescrito só porque a nota trouxe outro EAN.
- O novo EAN deve ser persistido em `product_identifiers` como identificador confirmado do mesmo `product_id`, preservando identificadores anteriores.

## Regras de entrada de estoque

- Salvar/vincular o cadastro do produto não deve incrementar `products.stock` local quando a autoridade for Bling.
- O XML deve criar imediatamente uma entrada interna em quarentena para o item identificado, com `quantity_on_hand=0` e quantidade esperada nos metadados.
- Quando o recebimento da nota for verificado no Bling (`purchase_stock_receipt_plans_v1.status='verified'` ou recibo aplicado), a entrada interna correspondente é ativada com a `converted_quantity` do item.
- A entrada deve ser idempotente por `purchase_xml_items.id`.
- `lot_code` pode permanecer nulo. `source_ref` é a identidade técnica da entrada.

## Validade

- `product_inventory_lots.expiration_date` passa a aceitar `NULL`.
- `purchase_xml_items.lot_expiration_date` guarda a validade opcional digitada no Admin.
- A ausência de validade não é motivo de bloqueio/revisão do recebimento.
- Quando o XML trouxer `rastro/dVal`, ele pode preencher a validade automaticamente; o operador continua podendo corrigir/limpar a validade antes do recebimento.

## FIFO e estoque atual

- Na migração inicial, o estoque avulso atual do Bling vira um lote-base `legacy`, antigo, por produto. Esse lote não inventa data de validade e usa uma data operacional antiga para ordenar antes das novas entradas.
- Reservas abertas existentes são alocadas sobre o lote-base; reservas já consumidas não são debitadas de novo.
- Novas reservas são alocadas em lotes ativos por `received_at`, depois `created_at`, ambos crescentes.
- Ao consumir uma reserva, a quantidade é baixada dos lotes alocados; ao liberar uma reserva ainda não consumida, apenas a reserva do lote é liberada.
- Se o Bling permitir uma reserva mas os lotes internos estiverem insuficientes por defasagem/reconciliação, o sistema cria uma entrada técnica de reconciliação `bling` para a diferença, sem bloquear o cliente.

## Admin

Em cada item da fila XML, junto da identificação já existente:
- manter “Buscar produto existente” e vínculo manual;
- mostrar “Validade desta entrada (opcional)” com salvar/limpar;
- mostrar estado do lote interno (aguardando recebimento, ativo, esgotado etc.).

## Segurança

- As novas operações de leitura/edição de validade seguem a autenticação já existente do `purchase-xml-v1`; nenhuma RPC administrativa nova é exposta diretamente a `anon`.
- Tabelas novas ficam com RLS habilitado e sem acesso direto do cliente; a Edge Function usa service role após autenticar o admin.
