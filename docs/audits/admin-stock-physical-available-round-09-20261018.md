# Rodada 09/20 — Estoque físico e disponível

Branch: refactor/admin-print-queue-panel-20261018. PR #1121.

## Modelo encontrado

- stockAuthority lê bling_hub_runtime_v2.metadata.ops2_stock_authority, com fallback legacy_shadow.
- stockBreakdownMap consulta ops2_loose_sellable_stock_v1 em lotes de até 80 produtos.
- Os campos são sellable_physical, effective_sellable_stock, basket_locked_quantity, loose_sellable_stock e bling_stock_ready.
- A view basket_locked_component_stock_v1 agrega reservas explícitas em montagem, componentes de lotes montados disponíveis e alocações ativas.
- A view ops2_loose_sellable_stock_v1 calcula greatest(0, effective_sellable_stock - basket_locked_quantity).
- mappedProduct entrega effective_stock como stock e expõe breakdown adicional. Portanto stock no objeto do produto não equivale necessariamente a loose_stock.

## Riscos

1. O Admin pode apresentar effective_stock em um contexto e loose_stock em outro; distinguir saldo efetivo e disponibilidade avulsa nos fluxos de venda.
2. A autoridade pode mudar em tempo de execução. Conferir reconciliação de reservas antigas e consistência de cache.
3. A view SQL depende de montagem e alocações corretas. Concorrência de montagem requer testes de transação.
4. Os campos são protegidos por greatest(0, ...), o que evita números negativos na apresentação, mas não prova integridade dos movimentos subjacentes.

## Trabalho

Teste estático scripts/test-admin-stock-physical-available-contract.mjs adicionado ao workflow. Sem mudança em saldo, Bling ou banco. Testes com dados reais não executados.
