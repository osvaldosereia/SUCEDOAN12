# R02 — Estoque Bling canônico, depósito selecionado e reserva de kits (09/10/2026)

**Dona Antônia / SUCEDOAN12** · Continuação do [plano #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · Base de desenvolvimento: [PR #998](https://github.com/osvaldosereia/SUCEDOAN12/pull/998) (R02/R03 com a view real de disponibilidade).

## O que foi auditado no Supabase canônico (somente SELECT)

A consulta `ops2_sellable_stock_v1`, atual MD5 de `pg_get_viewdef` **`73e422fef6282a885e56491bfc6cbcde`**, usa:

1. Configuração em `bling_hub_runtime_v2.metadata`: `ops2_stock_authority` e `selected_deposit_id`.
2. Link dos produtos `bling_hub_entity_links_v2` com `status=matched`.
3. `bling_stock_mirror_v2.deposit_balances[selected_deposit_id].virtual`: quando `ops2_stock_authority='bling'`, este é o saldo vendável, com piso 0. Falhas de vínculo, espelho e depósito retornam **0**.
4. `products.stock` é usado apenas no modo explícito `legacy_shadow` (não deve ser tratado como saldo oficial de venda quando autoridade Bling).
5. `basket_locked_component_stock_v1`, MD5 **`490f7495fdcf39652a8626fbde23453f`**: soma componentes reservados em montagem, disponíveis em kits prontos e alocados aos pedidos. O checkout avulso usa a view `ops2_loose_sellable_stock_v1`, MD5 **`8774bfe6396c2f73e4f8fa61f718ff04`**, que subtrai essa quantidade do saldo vendável.
6. As três views são `security_invoker=true`. A autenticação via SELECT direto de papéis `anon/authenticated` não está autorizada nessas views, embora a view original de estoque possua grants históricos de `TRUNCATE/TRIGGER/REFERENCES` que precisam revisão na frente de segurança. **Esta rodada não acrescentou permissões públicas.**

### Falha de cobertura anterior e correção dos testes

O [PR #998](https://github.com/osvaldosereia/SUCEDOAN12/pull/998) já valida a view canônica `basket_lot_public_availability_v1`, mas a sua dependência `ops2_sellable_stock_v1` ainda era simulada como `products.stock`. Isso não reproduzia o comportamento do depósito Bling selecionado. A R02 agora substitui essa simulação por **três definições de views canônicas capturadas do banco real**, mantendo produtos e eventos sintéticos.

A regressão de cestas legada zera `products.stock` para simular ruptura; isso não derruba o saldo vendável com autoridade Bling. Por isso existe `orders-r2-basket-availability-bling-assertions.sql`, que zera o **saldo virtual no espelho do depósito** e o restaura. O teste original de legado continua intacto nos bancos anteriores.

## Implementação

- `scripts/sql/orders-r2-canonical-bling-stock-views.sql`: exportação **read-only** das três definições canônicas, sem registros privados. Aplicada somente em PG17 descartável.
- `scripts/sql/orders-r2-canonical-bling-stock-fixture.sql`: subset sintético de vínculo de produto, evento do Bling, depósitos e saldos; preserva contratos de cestas/moldes previamente simulados.
- `scripts/sql/orders-r2-canonical-bling-stock-assertions.sql`: testa autoridade Bling, depósito correto/errado, estado `unlinked`, espelho ausente, saldo virtual zero apesar de saldo físico positivo, bloqueio da cesta e separação entre estoque preso em kits e avulso, inclusive lotes em montagem e alocações. Confere `security_invoker` e ausência de SELECT direto público.
- `scripts/sql/orders-r2-basket-availability-bling-assertions.sql`: replica o teste da disponibilidade canônica, mas altera saldos do Bling (fonte correta), não os campos legados.
- `.github/workflows/orders-r2-isolated-hml-ci.yml`: **nono banco PostgreSQL17 descartável** que combina as três views canônicas com `basket_lot_public_availability_v1` original, as funções reais de checkout e reserva e a matriz de cestas.
- Todas as gravações de dados de teste ocorrem apenas em PostgreSQL temporário da CI. **Nenhum SQL aplicado ao Supabase real, nenhuma venda ou estoque real modificado.**


## Teste concorrente de estoque avulso (décima base)
No 10º PostgreSQL 17 efêmero, a função **real** `create_vitrine_cart_order_v3` + `reserve_vitrine_order_stock_v1` vê saldo **virtual Bling = 20 unidades**, das quais **6 estão presas em kits de alimentos**. Dois compradores simulados tentam comprar **8 unidades avulsas cada**, simultaneamente. Apenas uma transação pode ser aceita; a reserva avulsa fica em 8, a quantidade presa em kits permanece 6 e a operação rejeitada não cria segundo pedido.

**[CI #37937542312 — SUCCESS](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37937542312)** confirmou as dez bases depois da correção do YAML. O experimento não acessa o Bling externo e não prova frescor real de espelho ou sincronização de webhook.

## Limites conhecidos

**Isto não conclui a homologação R02**: `bling_stock_mirror_v2` está populado com saldos sintéticos. Não executa webhook/atualização reais do Bling, RLS completa e todos os triggers, nem verifica consistência histórica dos lotes. A view real permite saldo `virtual>0` mesmo se `observed_at` não for recente; a **política de frescor** precisa ser decidida antes do canário (não inventar uma validade sem regra aprovada). Eventuais pedidos e links de clientes também não são reproduzidos.

R04/R05 (templates CONFIRMADO e gate de separação), R06/R07 (falta/sync Bling), R08–R10 (tributação, nota e SEFAZ) continuam em PRs de desenvolvimento **sem merge**; nunca publicar as demais flags até E2E completo. R03 já foi combinada em testes no PR #996, não em produção.

## Próximas verificações

1. Confirmar CI no commit final desta branch; corrigir falhas de fixture sem adulterar a fonte de autoridade Bling.
2. Capturar e revisar source pipeline de atualização do espelho Bling, horários e semântica de falhas.
3. Verificar gatilhos, RLS e assinatura dos webhooks reais em sandbox do Supabase; integrar R04–R05 numa branch de homologação compatível com R02/R03.
4. Prosseguir com R06–R10 somente após validação do checkout/estoque, preservando travas de autorização SEFAZ.

**Status:** homologação técnica incremental e **não deploy**; nenhum cliente, NF-e, WhatsApp, estoque ou pedido real foi alterado.
