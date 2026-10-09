# R02/R03 — Disponibilidade canônica de cestas no checkout (09/10/2026)

**Plano oficial:** [issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964). **Branch:** `agent/orders-r2-real-basket-availability-20261009`, baseada no commit `1417e9600704e0242820dad434a92b62204a9ccb` do PR #996 (integração R02/R03).

## Objetivo

A homologação sintética do checkout real já cobria cestas, moldes e kits e a identidade pública R03, mas usava uma **view de disponibilidade simplificada**. Isso ocultava condições reais de venda: categoria ativa, kit ativo, lote montado, venda habilitada, composição saudável, status/quantidade do lote vinculado.

## Achados verificados no Supabase canônico (consulta somente leitura)

- `public.basket_lot_public_availability_v1` tem `security_invoker=true` e **não concede SELECT diretamente a anon ou authenticated**. Mantemos a mesma definição/atributo no laboratório, sem ampliar as permissões.
- A view canônica usa `basket_stock_lots`, `basket_stock_lot_items`, `basket_templates`, `basket_kit_templates`, `basket_categories`, `products` e `ops2_sellable_stock_v1`.
- Critérios `base_reason` reais: `assembling`, `draft`, `depleted`, `model_inactive`, `category_inactive`, `paused`, `component_out_of_stock` e `linked_lot_unavailable`; cálculo vinculado usa `LEAST(own_available, linked_available)`.
- **Limitação importante:** `ops2_sellable_stock_v1` ainda é uma *view mock* neste laboratório, alimentada apenas pelo estoque fictício do produto. Não equivale ao estoque/autoridade Bling, reservas e montagem do banco canônico.

## Trabalho publicado

1. `scripts/sql/orders-r2-canonical-basket-availability-view.sql`: exportação integral de `pg_get_viewdef` do Supabase (hash MD5 `c03e94673e3fb50b27db893e12a0159a`) como `CREATE VIEW ... WITH (security_invoker=true)`. **Arquivo exclusivamente para testes, não para deploy.**
2. `scripts/sql/orders-r2-canonical-basket-availability-fixture.sql`: completa o esquema fictício com categoria, ativação de templates, montagem, controle de venda, snapshots e campos usados pela view real. Substitui a view simplificada existente **apenas no oitavo banco descartável**.
3. `scripts/sql/orders-r2-canonical-basket-availability-assertions.sql`: valida lotes alimentares e de higiene vinculados, cesta legada, categoria/modelo inativo, venda pausada, lote montando, componente desativado ou sem estoque, lote vinculado esgotado, referência circular e restauração do estoque disponível.
4. `scripts/sql/orders-r2-canonical-basket-checkout-gate-assertions.sql`: exercita o **checkout real v3** com a view real e exige recusa para categoria inativa, kit vinculado pausado e montagem incompleta; confirma ausência de pedidos, alocações e reservas órfãs.
5. `.github/workflows/orders-r2-isolated-hml-ci.yml`: acrescenta **oitavo banco PostgreSQL 17 efêmero** às sete bases existentes. Depois dos testes de disponibilidade, executa as correções de mínimo R$75 e independência dos kits apenas na fixture, a matriz real de cestas/moldes e conferência de totais.

## Não resolvido por esta rodada

- Nenhuma alteração na view ou estoques de produção. O read-only live source não prova que o catálogo real tenha disponibilidade correta.
- View subjacente de estoque `ops2_sellable_stock_v1`, gates de reserva no Bling, políticas RLS, gatilhos completos, fila Meta e emissão fiscal R08–R10 ainda exigem sandbox canônico e E2E.
- As correções de checkout continuam SQLs em revisão, não migrations aplicadas.
- Não acrescentar `GRANT SELECT` à view de produção, pois isso altera o modelo de segurança auditado.
- Não fazer merge em main enquanto R02/R03/R04–R10 estiverem em PRs divergentes ou faltarem aprovações fiscais.

**Resultado verificado:** [CI push #37935632416 — SUCCESS](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37935632416), PostgreSQL 17 efêmero, oito bancos, todos os passos aprovados. O primeiro teste ampliado falhou porque o checkout real retornou corretamente `basket_kit_lot_unavailable`, enquanto a asserção admitia apenas dois códigos; teste corrigido sem alterar a função comercial. [PR draft #998](https://github.com/osvaldosereia/SUCEDOAN12/pull/998) empilhada sobre [#996](https://github.com/osvaldosereia/SUCEDOAN12/pull/996). Ainda não houve teste de Bling/SEFAZ/Meta reais, migração ou merge. Nenhum pedido, estoque ou cliente produtivo foi modificado.
