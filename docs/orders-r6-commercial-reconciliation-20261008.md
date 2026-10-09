# R06 — Reconciliação comercial após separação (08/10/2026)

**Plano:** [issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · **PR draft empilhado:** [#972](https://github.com/osvaldosereia/SUCEDOAN12/pull/972) sobre R05 [#970](https://github.com/osvaldosereia/SUCEDOAN12/pull/970). Nenhuma implementação desta branch está em produção.

## Diagnóstico comprovado pelo código existente

No runtime canônico capturado na R02, `ops2_prepare_order_separation_completion_v2` subtrai `missing_subtotal` dos campos `orders.total`, `orders.subtotal` e `orders.fiscal_subtotal`, preservando em `order_separation_completions_v1` a lista de itens separados (`deliverable_order_item_ids`) e faltantes. `ops2_apply_order_separation_stock_v2` consome as reservas avulsas separadas, libera as faltantes e trata `preassembled_units` de `basket_component`.

Porém `buildSnapshot` no `admin-products-live-v1` reconstrói o pedido externo a partir dos `order_items` originais, filtrando a lista de itens. O valor de produtos é obtido multiplicando quantidade cadastrada por preço unitário, enquanto a diferença do pedido aparece somente como `commercial_delta_cents`. Isso **não prova** que desconto, acréscimo fixo, valor oculto condicional ou diferença de preço de cesta foi corretamente atribuído. Um erro pode deixar a separação aparentemente concluída e criar venda/NF-e comercialmente divergente.

## Código criado nesta rodada

- `supabase/functions/_shared/order-commercial-reconciliation-v1.mjs`: função pura `reconcileSeparatedCommercialOrder`. Não faz chamadas externas nem grava no banco. Confere:
  - Pedido `ready`, conclusão persistida e `stock_applied=true`.
  - Identidade dos itens, unicidade, estados completos e correspondência exata dos IDs entregáveis.
  - Quantidades inteiras ou fracionárias de até três casas; por enquanto **não aceita separação parcial de uma linha** com quantidade diferente do pedido, até criação do contrato parcial com preço e estoque próprios.
  - `original_total - missing_subtotal = final_total = orders.total`, com valores em centavos.
  - Soma das linhas faltantes e dos produtos separados; cabeçalho de cesta como item de apresentação, **não** como segundo produto faturável.
  - Delta comercial classificado por `other_expenses`, `basket_hidden_adjustment` e `discount`. Se delta é desconhecido ou o valor oculto continua após faltar produto, **exige revisão humana**.
  - Reservas consumidas, liberadas e quantidade avulsa (subtraindo `preassembled_units`) para componentes de cestas e de moldes de kits; nenhum ajuste físico de estoque é feito pela função.
  - Zero de produtos faturáveis bloqueia o prosseguimento fiscal.

- `supabase/functions/admin-products-live-v1/index.ts`: importa a função acima e somente sob `ORDER_R6_FINAL_SNAPSHOT_GUARD_ENABLED=true` audita um snapshot de pedido **já concluído** antes de devolvê-lo ao fluxo de sincronização Bling/expedição. Consulta `order_items`, `order_separation_items_v1`, `order_separation_completions_v1`, `vitrine_stock_reservations` e compara também os centavos agrupados pelo adapter externo. Divergência gera `commercial_reconciliation_blocked:<códigos>` para a rota de atenção existente, sem tentar corrigir preço ou estoque automaticamente.
- `.github/workflows/orders-r6-commercial-ci.yml`: testes offline no GitHub Actions, flag e transportes Meta/Bling/SEFAZ OFF.
- `scripts/test-orders-r6-commercial-reconciliation-v1.mjs`: suíte de cenários positivos e negativos, incluindo pedido sintético de R$230→R$198 e kits de limpeza pré-montados.

## Testes e evidência
[GitHub Actions #37876342353 — **SUCCESS, 25 testes aprovados e 0 falhas**](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37876342353) depois de cobrir o caso de desconto em pedido parcialmente faltante, `basket_mold_component` e regressões. Não há uso de clientes reais, tokens Bling ou documentos fiscais nos testes.

## Limitações e gates restantes
**R06 PARCIAL, não marcar a rodada concluída no checklist #964.** Para uma reconciliação completa:
1. Modelar atribuição exata de valores ocultos **condicionais por produto** e fixos por cesta/lote; sem essa regra, casos com faltas e acréscimos ocultos vão para revisão, não se ajustam automaticamente.
2. Garantir a compatibilidade de cestas/kit `history_kind`, `basket_mold_component`, `basket_id`, estoques avulsos e pré-montados com o subconjunto canônico completo R02, não apenas fixtures JS.
3. Definir quantidade parcialmente atendida por linha, sem alterar o modelo de `SEPARADO/FALTOU` prematuramente; aplicar desconto/estoque proporcionais somente após regra aprovada e testada.
4. Persistir snapshot final **imutável e versão/hash** de conciliação de forma transacional antes da fila R09 e comparar o que foi enviado ao Bling (R07); os reads atuais são separados e podem enxergar updates concorrentes.
5. Garantir que nenhum caminho legado de Bling/NF-e bypassa o adapter `buildSnapshot` com `options.include_all_items=true` ou sem `completion.completed_at`.
6. Não ligar `ORDER_R6_FINAL_SNAPSHOT_GUARD_ENABLED` em produção até validar esses casos com fonte real, ambiente isolado e estratégias de recovery sem emitir documentos duplicados.

## Princípio de operação
Separação física concluída **não** se desfaz por pendência fiscal. Se valor/itens/estoque não são reconciláveis, pedido fica separado com uma pendência acionável e **não** é liberado à emissão NF-e/expedição. A autorização SEFAZ, quando obtida, libera expedição documental, mas a saída física permanece evento humano/motorista. Os estados fiscais e workers serão separados em R07–R11.

**Controle de segurança:** nenhum merge na `main`, migration em Supabase produtivo, mensagem de WhatsApp, estoque real, venda Bling, NF-e ou expedição foi alterado na R06.


## Endurecimento pós-validação (R06)
O snapshot final exige `order_separation_completions_v1.completed_at` e rejeita `options.include_all_items=true` quando o pedido já está `ready` e a flag está ligada. Após validar itens e somas, o adapter lê novamente a versão `updated_at` do pedido e da conclusão, o valor final e o carimbo de término; se algum divergir da primeira leitura, aborta com `snapshot_version_changed`, antes de transmitir ao Bling. Essa comparação **reduz** (não elimina) condições de corrida: não substitui um snapshot transacional imutável que será concluído em R09.
