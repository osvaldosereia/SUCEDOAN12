# Dona Antônia — WhatsApp Flow em produção

Data: 2026-09-09

## Estado final

- Meta Flow ID: `1538860004926321`
- Nome: `Dona Antônia - Cestas Comercial`
- Meta: `PUBLISHED`
- Health: `AVAILABLE`
- Validation errors: `0`
- JSON version: `7.3`
- Data API version: `3.0`
- Supabase/Admin novo é a fonte oficial de cestas, composição, produtos, estoque, imagens, clientes, carrinhos e pedidos.
- 9/9 cestas estão prontas para gravação comercial.
- 319 produtos avulsos estão vendáveis no WhatsApp pelas regras atuais de ativo + verificado + preço + estoque.
- Flow Data Exchange Edge: `whatsapp-flow-data-exchange-v1` versão 10, ACTIVE.

## Produção

- `whatsapp_live_canary_percent = 100`
- `experience_orchestrator_enabled = true`
- `whatsapp_flow_data_exchange_enabled = true`
- `whatsapp_flow_send_enabled = true`
- `whatsapp_flow_commercial_write_enabled = true`
- `bling_order_sync_enabled = false`

O Bling permanece fora desta liberação. O pedido confirmado é persistido primeiro no Supabase.

## Jornada validada

Foram validados em transações com rollback, sem persistir dados fictícios:

1. cliente já cadastrado;
2. cliente novo sem cadastro;
3. criação automática de cliente e endereço em Cuiabá;
4. seleção de cesta;
5. personalização com alteração de quantidade;
6. gravação idempotente das operações do Flow;
7. produtos adicionais;
8. revisão;
9. pagamento na entrega;
10. confirmação do pedido;
11. sessão concluída;
12. próximo passo de localização no chat.

Smoke final de cliente novo retornou:

- `customer_registered = true`
- `session_status = completed`
- `orders_created = 1`
- `order_status = confirmed`
- `idempotent_operations = 3`
- `addresses_created = 1`

Após `ROLLBACK`, foram confirmados `0` registros fictícios remanescentes em conversations, sessions, customers e orders.

## Personalização

- Até três rodadas consecutivas antes dos adicionais.
- Produto componente com preço configurado pode aumentar/diminuir/remover dentro da política.
- Produto sem preço individual configurado permanece em quantidade fixa para impedir preço inventado ou produto grátis.
- Preço individual dos componentes não é exibido ao cliente.
- A cesta preserva preço comercial próprio e aplica somente deltas permitidos.

## Catálogo adicional

- Nunca carrega o catálogo completo no Flow.
- Categorias/termos/busca consultam o Supabase sob demanda.
- Busca e gravação usam a mesma política de produto vendável.
- Imagens WebP/AVIF são convertidas no backend para formato compatível com o Flow quando necessário.

## Correções finais

- Constraint de idempotência passou a aceitar `set_customer_checkout`.
- A migração legada `whatsapp_flow_homologation_gates_restore_v16`, que restaurava gates de homologação, foi superseded pela autorização explícita de produção em 100% (`authorized_production_100_v17`).
- Cenários temporários do Make usados para validação/publicação foram desativados.

## Estado esperado permanente

O Flow está autorizado para clientes em 100%. Não retornar para canary de homologação sem uma nova decisão explícita. Bling continua OFF até uma liberação separada.
