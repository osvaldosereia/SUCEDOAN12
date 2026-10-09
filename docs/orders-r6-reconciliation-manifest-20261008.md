# Rodada 6 — Manifesto dos itens efetivamente separados e reconciliação (08/10/2026)

Plano de 14 rodadas: [issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964). PR draft [#973](https://github.com/osvaldosereia/SUCEDOAN12/pull/973), empilhado sobre R05 [#970](https://github.com/osvaldosereia/SUCEDOAN12/pull/970).

## Auditoria do runtime real (somente leitura)
- A RPC `ops2_prepare_order_separation_completion_v2` já soma `state='missing'` e deduz essa soma de `orders.total/subtotal/fiscal_subtotal`, gravando uma única `order_separation_completions_v1`.
- A RPC `ops2_apply_order_separation_stock_v2` já consome reserva dos itens `separated` e libera reservas para itens `missing`; mantém `physical_stock_changed=false` por delegar estoque ao Bling, fazendo replay idempotente pelo metadado `stock_applied`.
- **Lacuna:** `order_items` original continua contendo todas as linhas, mesmo as faltantes. Um integrador que enviar `order_items` sem consultar a separação corre risco de registrar/cobrar mercadoria não separada.
- **Lacuna:** com duas reservas `vitrine_stock_reservations` do mesmo produto para o mesmo pedido, o loop da RPC existente pode replicar a quantidade completa em cada reserva. O novo preflight interrompe essa situação; a correção definitiva do esquema de reservas deve ser coordenada com R07 e a política de estoque.
- **Lacuna:** se todos os itens estiverem faltando, o procedimento existente pode produzir um pedido `ready` sem itens entregáveis, inadequado para emissão automática.
- **Atenção:** o usuário pediu que a conclusão física não dependa de falha fiscal. R06 **não sincroniza ou emite notas fiscais**. Bloqueia apenas inconsistências na composição física/comercial do pedido; erro posterior da NF-e continua responsabilidade R07–R10 e não deve desfazer a separação.

## Implementação draft
### 1. `ops2_preview_order_reconciliation_v1(order_id)`
Consulta exclusivamente dados do próprio pedido, `order_separation_items_v1`, `order_items`, `vitrine_stock_reservations` e uma eventual conclusão preparada. Devolve lista por item:
- UUID da linha, produto, descrição, tipo `basket_component` ou item comum, cesta associada.
- Quantidade, preço e total; `state=separated/missing/pending`; `deliverable=true` somente para item realmente separado e faturável.
- `display_only=true` para cabeçalho visual da cesta quando há componentes correspondentes; esse cabeçalho **não** será faturado uma segunda vez.
- `preassembled_units` preservado como atributo, sem dar baixa em estoque neste RPC.
- Totais original/projetado, soma das faltas, desconto, outras despesas e acréscimo oculto.
- `ready=false` + `blockers` em falta total, pendência, valor negativo/inválido, item órfão, quantidade não positiva, cabeçalho de cesta cobrado em duplicidade ou mais de uma reserva ativa do mesmo produto.

### 2. `ops2_record_order_reconciliation_v1(order_id)`
Executa **após** a preparação financeira, **antes** de consumir/liberar reservas. Bloqueia a linha da conclusão com `FOR UPDATE`, recalcula e compara a fotografia fiscal com a conclusão preparada, registra somente uma vez em `metadata.r6_reconciliation` e retorna o mesmo conteúdo se reexecutado.

R07 deverá usar **apenas** `r6_reconciliation.lines` com `deliverable=true` ao montar os itens da venda Bling; a coluna `order_items` original não pode ser fonte de nota fiscal após a separação. Descontos e acréscimos são preservados nos campos do manifesto para manter consistência de totais.

### 3. Integração ao Admin
`orderSeparationComplete` consulta preflight antes de `ops2_prepare_order_separation_completion_v2` e grava o recibo antes de `ops2_apply_order_separation_stock_v2`, **somente quando a flag `ORDER_R6_RECONCILIATION_ENABLED` for explicitamente ativada**. Default `false`, sem alterar nenhum pedido atual.

Um erro gera bloqueio comercial legível e necessidade de revisão, nunca uma aprovação fiscal fictícia. Os RPCs novos são destinados exclusivamente a `service_role` e têm EXECUTE revogado de `anon/authenticated/PUBLIC`.

## Testes e limitações
O workflow `orders-r6-picked-manifest-ci.yml` usa PostgreSQL 17 efêmero, Node 22, sem nenhum token real, e executa as três funções **de preparação, estoque e conclusão exportadas do runtime canônico em R02**, com inicialização sintética.

Cenários: pedido R$230 → R$198 com falta R$32, cesta R$160 → R$140 preservando descontos, acréscimo e pré-montagem, duplicidade de reserva, falta de todos os itens, erro de composição da cesta, item com quantidade zero e replay sem nova baixa de estoque.

**Limitação:** isso não é homologação completa do Supabase, Bling nem da SEFAZ. Algumas dependências são dublês e o SQL está em `supabase/sql` como contrato draft (não migration). CI verde não habilita automaticamente o recurso, nem autoriza produção.

## Pré-requisitos antes de publicação
1. Concluir R02 (clone canônico) e validar todas as dependências/RLS.
2. Integrar as stacks R03 (número imutável), R04 (botão Meta aprovado) e R05 (bloqueios de separação).
3. Testar com documentação fiscal XML fictícia e condições reais de kits, inclusive casos de itens de mesmo produto em linhas distintas.
4. Garantir que o adaptador R07 envie exclusivamente o manifesto, apresente as diferenças de preço e não faça POST de NF-e repetido.
5. Criar migração com CLI, homologar rollback, testar canário autorizado e ativar a flag do Admin **somente após** isso.

**Produção:** nenhum merge, Edge deploy, migration, mensagem WhatsApp, NF-e, Bling, venda, pagamento ou estoque real foi executado nesta rodada.
