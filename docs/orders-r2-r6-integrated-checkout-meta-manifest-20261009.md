# Integração R02–R06 — checkout, Meta CONFIRMADO, separação, faltas e estoque

**Data:** 09/10/2026 · **Projeto:** Dona Antônia · [Issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · Base [PR R02–R05 #1003](https://github.com/osvaldosereia/SUCEDOAN12/pull/1003).

## Estado e evidências

[**CI integrada R02–R06 — SUCCESS #37941479261**](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37941479261). PostgreSQL 17 descartável, com o **checkout real** capturado em R02, numeração pública da migration R03 original, contratos Meta R04/R05 originais e **RPCs canônicas R06** `ops2_init_order_separation_v2`, `ops2_prepare_order_separation_completion_v2`, `ops2_apply_order_separation_stock_v2`, `ops2_mark_order_separation_completion_v2` e `ops2_preview_order_reconciliation_v1`/`ops2_record_order_reconciliation_v1`.

As fontes R03, R04/R05 e R06 foram importadas para o runner por **commits fixos**. Não foram duplicadas como migrations nem mescladas em main. Não há conexão à API real de Meta, Bling ou SEFAZ.

## Descoberta importante: bypass de inicialização antes da confirmação

A R05 até esta integração protege `INSERT` ou `UPDATE` de `order_separation_items_v1` **somente quando `NEW.state` é `separated` ou `missing`**. A verdadeira `ops2_init_order_separation_v2`, entretanto, insere linhas **`pending`**. Assim um pedido ainda **não confirmado no WhatsApp** podia ganhar linhas de separação. Este fato foi reproduzido pela primeira execução de CI [#37941100140](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37941100140): `unconfirmed_mold_created_picking_rows`.

Foi criado `supabase/sql/orders-r5-r6-init-meta-confirmation-guard-review-v1.sql` (**DRAFT, NÃO APLICADO**). Ele mantém a função `ops2_guard_order_meta_separation_v1` e o opt-in R04, mas substitui o trigger de picking por **BEFORE INSERT OR UPDATE sem isenção para `pending`**. Asserção específica confirma que tanto inserção direta de `pending` quanto o inicializador real são bloqueados quando falta confirmação. Após botão validado pela fixture, o inicializador atua normalmente. A correção não depende de cookies, parâmetros enviados pelo cliente, nem de números de pedido recriados.

## Teste da cadeia inteira, somente PostgreSQL 17 sintético

1. **Checkout real R02:** três pedidos, avulso R$ 100, cesta de alimentação/higiene R$ 160 com dois kits montados, e cesta molde R$ 105 com ajuste oculto. R03 atribui um número semanal `DD|MM|YYYY - NNN` que permanece imutável.
2. **Meta original R04/R05:** conta 0975 e 1018, outbox com `wamid` fictício e botões sintéticos. A dupla atribuição/alteração continua bloqueada sem confirmação. Texto simples, conta errada e replay não aprovam pedido.
3. **Cesta R06:** cliente confirmou pelo 1018; separador marca higiene de R$ 20 como `FALTOU` e alimentação R$ 50 como `SEPARADO`. Resultado: **R$ 160 → R$ 140**, subtotal fiscal **R$ 70 → R$ 50**, outras despesas comerciais **R$ 90** preservadas, sem incluir cartão visual da cesta como terceiro item. O snapshot R06 é gravado uma só vez. O estoque pré-montado não é contado novamente como avulso. O número original não muda.
4. **Molde R06:** antes da confirmação, sequer pode iniciar separação; depois do botão 0975, falta produto de R$ 30. Resultado: **R$ 105 → R$ 75**, outras despesas **R$ 15** preservadas, reserva de produto faltante liberada e a do item separado consumida. Não muda o código R03.
5. **Replay:** o registro imutável devolve `idempotent`; aplicar estoque novamente devolve `already_applied`, sem efeito em dobro. Concluir a separação marca a fase `completed` sem chamar Bling nem emitir NF-e.

## Arquivos
- `scripts/sql/orders-r2-r6-manifest-chain-fixture.sql`: adapta somente o **laboratório** para a estrutura de recebimentos da R06 real.
- `scripts/sql/orders-r2-r6-manifest-chain-assertions.sql`: valida os pedidos e transições na mesma base descartável.
- `supabase/sql/orders-r5-r6-init-meta-confirmation-guard-review-v1.sql`: correção proposta para a falha `pending` (arquivo de revisão, não migration).
- `.github/workflows/orders-r2-r6-meta-manifest-ci.yml`: execução conjunta em PostgreSQL 17, sem transporte externo.

## Limites que continuam impedindo produção

- R04 assinatura do webhook e templates Meta **não foram testados contra servidores reais**; o atestado `signature_verified` foi simulado e só entra no banco fictício.
- Ainda faltam RLS completas, demais gatilhos e todo o esquema operacional canônico em clone com identidade/ACL equivalentes. O `manual_pick_queue_feed_v1` do laboratório continua um shim.
- As cestas e quantidades do teste são fictícias. O estoque Bling é um espelho simulado, sem prova de atualização recente; verificar sincronização para não vender valores antigos.
- R07 deve usar exclusivamente o **manifesto R06 congelado**, nunca `order_items` antes da separação; não chamar API Bling real antes de idempotência/endereço/tributação homologados.
- R08–R10 têm bloqueios fiscais explícitos: CFOP/CST/CSOSN de saída aprovada e autorização SEFAZ verificável. Não inventar dados tributários para liberar emissão.
- **Produção intocada:** não houve merge, migração, deploy, webhook Meta, pedido real, saldo de estoque, mensagem WhatsApp, venda no Bling, nota fiscal ou SEFAZ.

## Próximo passo

R07: incorporar **o intent de venda única** e a projeção Bling construída a partir dos itens realmente separados R06, com testes dos números públicos, valor final e cabeçalho visual; primeiro somente offline. Depois R08–R10 e revisão de segurança/canário.

**Resultado:** R02–R06 integrados em laboratório, **não homologados integralmente no ambiente produtivo**.
