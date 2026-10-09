# R02 — Cestas pré-montadas, kits independentes e moldes (09/10/2026)

Plano-mestre: [issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964). Continuação da [R02 checkout real #991](https://github.com/osvaldosereia/SUCEDOAN12/pull/991). Alterações exclusivas em branch **`agent/orders-r2-baskets-molds-20261009`**; nenhum dado real escrito.

## Auditoria read-only das regras atuais

O checkout principal do Supabase canônico `create_vitrine_cart_order_v3_base` (captura MD5 `b765301f2dfb833341bf01762749c7e8`) possui dois grupos em cada cesta: `food` e `hygiene`. A rotina determina inicialmente `v_food_changed` e `v_hygiene_changed` separadamente, mas depois contém:

```sql
if v_food_changed or v_hygiene_changed then
  v_food_changed:=true;
  if v_basket.uses_hygiene_kit then v_hygiene_changed:=true; end if;
end if;
```

**Efeito concreto:** retirar ou alterar um produto do grupo alimentos pode tratar também o kit de higiene intacto como avulso; a alteração somente na higiene pode fazer o mesmo com alimentos. Isso contraria a regra operacional de preservar o kit não modificado e afeta alocação física e apresentação da separação.

## Alterações em branch para homologação

- `scripts/sql/orders-r2-canonical-basket-helpers.sql`: três funções reais recuperadas via consultas de leitura no Supabase — `basket_group_preserves_original_lot_v1`, `basket_lot_commercial_price_v1` e `basket_mold_cutover_ready_v1`. Nenhum dado de clientes.
- `scripts/sql/orders-r2-baskets-kit-mold-fixture.sql`: amplia o quinto banco PostgreSQL 17 descartável com modelos/lotes de alimentos, higiene, lotes legados, componentes, opções de molde e valores ocultos. **A view complexa de disponibilidade do Bling é representada por shim sintético**, não por cópia integral.
- `scripts/sql/orders-r2-baskets-bug-baseline.sql`: reproduz o bug original, comprovando que a alteração somente de alimentos também marca higiene como avulso. Executa numa transação revertida.
- `supabase/sql/orders-r2-basket-independent-groups-review-v1.sql`: SQL de **revisão, NÃO migration**, remove a atribuição forçada dos dois `*_changed`. Restringe a aplicação a corpo de checkout com hash esperado `466896a1e78c4a2ccd102e479987b8d6` após a correção proposta do mínimo R$75. Sua execução em produção não foi autorizada e não aconteceu.
- `scripts/sql/orders-r2-baskets-kit-mold-assertions.sql`: testa a função de checkout REAL com kits intactos, alimento alterado/higiene intacta, higiene alterada/alimento intacto, acréscimo avulso e pré-montagem preservada, cesta legada, escolha de posições de molde, opção inválida, valor fixo e valor oculto condicional. Confere reserva física, `basket_stock_allocations`, `order_items`, `orders.total`, `fiscal_subtotal` e `other_expenses`.
- `.github/workflows/orders-r2-isolated-hml-ci.yml`: quinta base descartável com testes de cestas; inclui agora uma disputa entre **dois checkouts concorrentes pelo último lote integrado** (food + hygiene), exigindo uma única compra bem-sucedida.

## Valores sintéticos esperados (R$)

| Cenário | Total comercial | Produtos fiscais | Outras despesas | Lotes pré-montados |
|---|---:|---:|---:|---|
| Alimentos + higiene intactos | 160 | 70 | 90 | 2 |
| Alimentos removidos; higiene intacta | 110 | 20 | 90 | 1, higiene |
| Higiene removida; alimentos intactos | 140 | 50 | 90 | 1, alimentos |
| Acréscimo de 1 alimento avulso | 210 | 120 | 90 | 2 + reserva de 1 |
| Molde com os dois itens | 105 | 90 | 15 | 0 (avulsos) |
| Molde sem produto da condição | 100 | 90 | 10 | 0 (avulsos) |
| Lote legado de cesta | 120 | 40 | 80 | 1 |

**Importante:** os valores são cenários artificiais de verificação de cálculo e separação; não são preços reais da loja.

## Limites para homologação e publicação

1. Os testes executam corpos reais das funções principais do checkout, reserva de estoque e três auxiliares, mas não o esquema Supabase completo.
2. A view `basket_lot_public_availability_v1` real agrega categoria, estoque de componentes, linked lot, ativação, assemble status e espelho Bling. O laboratório possui um shim mínimo. Validar esta view real e seus gatilhos em ambiente staging.
3. Não há Meta, Bling, SEFAZ, RLS completo, histórico de pagamentos ou consumidores reais na CI.
4. O checkout ainda retorna inicialmente número `DA-...` no corpo base capturado; R03 substitui o número semanal imutável, e não deve entrar em conflito com este patch.
5. A regra de grupo que permanece como kit tem que corresponder aos controles no /montar e à R06/R07 de faltas/valores. Subsequente teste E2E obrigatório.
6. Antes de usar no negócio, revisar merge ordenado das PRs e transformar os SQL drafts em migrations revisadas com homologação, plano de rollback e autorização.

**Produção não alterada:** não houve deploy, migração, gravação de estoque, venda real, NF-e, mensagem WhatsApp ou mudança no pedido de clientes.
