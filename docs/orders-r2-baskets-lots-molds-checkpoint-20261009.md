# Rodada R02 — Homologação de cestas, lotes divididos e moldes

**Data:** 09/10/2026 · Repositório `osvaldosereia/SUCEDOAN12` · plano oficial [#964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964). Continuação isolada sobre a [PR #991](https://github.com/osvaldosereia/SUCEDOAN12/pull/991) (checkout real com mínimo R$ 75).

## Achado na função canônica

O corpo **real** `create_vitrine_cart_order_v3_base` obtido por leitura do Supabase possui, após `basket_group_preserves_original_lot_v1`, um bloco que faz:

```sql
if v_food_changed or v_hygiene_changed then
  v_food_changed:=true;
  if v_basket.uses_hygiene_kit then v_hygiene_changed:=true; end if;
end if;
```

Isso transforma **ambos os grupos em avulsos quando somente um foi modificado**, causando desmonte indevido do kit intacto e inconsistente com a regra operacional de preservar o outro lote. O defeito foi reproduzido num checkout real em PostgreSQL 17 descartável, e a transação de reprodução executa `ROLLBACK`.

### Correção candidata: separação independente de grupos

`supabase/sql/orders-r2-basket-independent-groups-review-v1.sql` remove só o bloco que vincula os dois estados, preservando os flags individuais calculados pela função canônica `basket_group_preserves_original_lot_v1`.

- **Somente alimentos modificados:** alimentos avulsos, higiene continua kit com `basket_stock_allocations`.
- **Somente higiene modificada:** higiene avulsa, alimentos continuam kit.
- **Itens acrescentados sem remover a composição:** lote original continua montado, somente unidades extras demandam estoque avulso.
- **Sem alterações:** os dois kits continuam alocados sem duplicar a reserva de produtos avulsos.
- **Valores ocultos:** `orders.fiscal_subtotal + orders.other_expenses - orders.discount = orders.total`, preservando o preço comercial da cesta sem cobrar o cabeçalho visual como item fiscal.
- **Lotes legados:** continuam disponíveis no checkout transacional.
- **Moldes:** opções autorizadas, quantidade por posição, ajuste oculto fixo e condicional e ausência do ajuste quando produto condicional é removido.
- **Concorrência:** duas compras de 2 cestas quando só restam 3 unidades de cada kit; apenas um pedido pode comprometer 2 kits, restando 1 de cada. Não deve criar reserva avulsa para mercadoria integralmente pré-montada.

O patch é preso ao MD5 esperado da função original **após** o hotfix do mínimo R$ 75 da rodada anterior: `466896a1e78c4a2ccd102e479987b8d6`. Qualquer divergência gera erro, exigindo revisão. **NÃO é uma migration, NÃO foi executado no Supabase de produção.**

## Infraestrutura de homologação

- `scripts/sql/orders-r2-canonical-basket-helpers.sql`: três funções auxiliares canônicas copiadas por `pg_get_functiondef`, somente leitura.
- `scripts/sql/orders-r2-baskets-kit-mold-fixture.sql`: catálogo inteiramente sintético de alimentos, higiene, lotes divididos, kits vinculados, cesta legada e molde com posições.
- `scripts/sql/orders-r2-baskets-bug-baseline.sql`: reprodução determinística do desmonte indevido com rollback.
- `scripts/sql/orders-r2-baskets-kit-mold-assertions.sql`: integra checkout base real, wrapper real, reserva real e auxiliares reais; verifica estado, valores, hidden, alocação e quantidades.
- `scripts/sql/orders-r2-baskets-concurrent-buy.sql`: duas sessões de checkout simultâneas com lotes limitados.
- `.github/workflows/orders-r2-isolated-hml-ci.yml`: **cinco bancos PostgreSQL 17 efêmeros**, com testes anteriores de separação, checkout avulso, concorrência, privilégios e o novo checkout de cestas. Todos os provedores reais ficam desativados.

## Restrições e pendências

1. `basket_lot_public_availability_v1` é uma view bastante extensa na produção, envolvendo categorias, status de montagem e efetividade do estoque Bling. A fixture desta rodada **usa uma view reduzida** que reproduz disponibilidade de lotes vinculados, mas **não** o esquema canônico integral. Não declarar homologação de toda a regra de disponibilidade real.
2. O enriquecimento de cadastro/WhatsApp é simulado. As validações com Bling, Meta e SEFAZ reais e a RLS/autorização final ainda não foram exercitadas neste laboratório.
3. Os patches do mínimo e de grupos são *drafts*, sobre funções canônicas capturadas por hash, mas não migrations. Necessitam verificação de schema/owners, staging, rollback e aprovação antes de implantar.
4. R03 numeração semanal, R04 confirmação Meta, R05–R10 fiscal e estoque seguem em PRs empilhadas, não integradas em `main`.
5. A próxima rodada deverá substituir a view reduzida de disponibilidade por dependências canônicas onde possível, testar as permissões e a cadeia de stock authoritative, e consolidar PRs na ordem documentada no plano #964.

**Status operacional:** sem merge, deploy, alteração de banco de produção, pedido, estoque, WhatsApp, cliente, entrega ou NF-e. Testes de CI e seus IDs são registrados no PR correspondente e na issue #964.
