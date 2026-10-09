# Rodada 7 — Pedido Bling fiel à separação, sem duplicidades

**Projeto:** Dona Antônia. **Plano:** [issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964). **PR draft:** [#975](https://github.com/osvaldosereia/SUCEDOAN12/pull/975), sobre R06 [#973](https://github.com/osvaldosereia/SUCEDOAN12/pull/973).

## Achados na auditoria do Supabase e do GitHub (somente leitura)
- `build_bling_order_draft(order_id)` no canônico ainda agrega todos os `order_items`, sem filtrar itens marcados `missing`.
- O Admin `buildSnapshot(order_id)` já considera `deliverable_order_item_ids` após conclusão, mas forma as quantidades e preços a partir de `order_items` originais, não da contagem final em `order_separation_items_v1`. Isso pode gerar **diferença na quantidade emitida**.
- O hub `admin-service-intelligence-v1` já tem processo idempotente **parcial**: consulta a venda pelo identificador externo estável `VITRINE-{uuid}`, cria apenas se ausente, compara os campos, faz `PUT` apenas quando necessário e lê novamente para verificar o estado. Reutilizar esse código é preferível a implementar um segundo cliente Bling.
- A API existente verifica `minimum_order_not_met` para total inferior a R$75. Isso deverá ser revisto **sem remover a regra de pedido mínimo do checkout** quando faltas legítimas reduzirem o total já confirmado abaixo do mínimo. Não desabilitar o gate fiscal para contornar esse erro.
- O registro de conclusão da R06 já guarda `metadata.r6_reconciliation`, com totais, linhas `separated/missing`, cesta visual e marcadores `deliverable`.

## Implementado na R07
1. **Adaptador puro:** `supabase/functions/_shared/order-bling-r7-manifest-v1.mjs`.
   - Lê **somente** as linhas `deliverable=true` e `state=separated` da fotografia final R06. Faltantes, itens pendentes e cabeçalhos visuais não são faturados.
   - Usa as **quantidades e valores separados**, não `order_items.quantity`; agrupa pelo mesmo `product_id + preço + natureza`.
   - Valida pedido, identificadores, `line_total=quantity*unit_price`, duplicatas, valores e exatidão em centavos.
   - Preserva `order_number`, todos os campos comerciais originais e `commercial_delta_cents=total - soma dos produtos`. Desconto, outras despesas e valor oculto permanecem em campos de conferência, **sem somá-los novamente**.
   - Assinatura SHA-256 determinística do snapshot para evitar trocar a composição numa mesma tentativa.
2. **Intent durável** SQL *draft* `supabase/sql/orders-r7-bling-manifest-sync-contract-v1.sql`: tabela privada `order_bling_r7_sync_intents_v1` com `PRIMARY KEY(order_id)`, manifesto fixo, fingerprint, estado, token e número Bling. `ops2_claim_bling_r7_sync_v1` só permite uma tentativa com manifesto e conclusão válidos; `ops2_finish_bling_r7_sync_v1` exige token e número Bling positivo para o estado `verified`. Resultado `uncertain` e `review_required` **bloqueiam automaticamente nova escrita** até reconciliação. RPCs expostas somente a `service_role`, tabela com RLS e revogação de permissões públicas.
3. **Integração Admin** em `admin-products-live-v1`: `buildSnapshot` passa a usar o manifesto somente no estágio pós-separação, e `runSeparationPostCompletionIntegrations` faz claim, compara R06 congelado com o valor do banco, chama a integração Bling existente, registra `verified` ou `uncertain`, e mantém as pendências operacionais já existentes. **Flag `ORDER_R7_BLING_MANIFEST_ENABLED=false` por padrão.**
4. **Limite fiscal:** com R07 ativado futuramente, `autoIssueFiscalAfterSeparation` **não roda** por esse caminho; retorna `awaiting_r08_fiscal_preflight`. R08–R10 cuidam de elegibilidade, fila fiscal e autorização SEFAZ.

## Testes e evidência
[**CI R07 GitHub Actions #37878065190 — SUCCESS**](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37878065190). Testes em Node 22 e PostgreSQL 17 efêmero, sem segredos ou conexões reais. Roda as RPCs de separação capturadas do ambiente canônico na R02, o manifesto R06, e então valida o intent R07, inclusive **dois workers concorrentes**. Testa replay seguro, erro incerto, alteração do manifesto, ID Bling obrigatório, cesta e faltantes excluídos, descontos e preço em centavos.

### Limites da evidência
- Não demonstra execução do Bling real nem prova que o pedido remoto tenha sido alterado; a Edge do hub não foi chamada no CI.
- O SQL está em `supabase/sql`, não em migration; nenhum objeto foi criado no Supabase canônico.
- R02 permanece pendente de homologação canônica completa. R03/R04/R05/R06 seguem em PRs empilhados; os modelos Meta com botão ainda precisam de comprovação e ativação.
- A consulta remota após timeout deverá receber reconciliação automatizada **somente leitura** na R08/R09, jamais repetição cega de `POST` ou `PUT`.
- Revisar casos de venda sem documento fiscal, produtos com mesmo código, preços promocionais e descontos fiscais para evitar divergência com o XML.

## Próximos passos
- R08: preflight fiscal completo com conferência de estoque, totais, NCM/CEST, pagamento na entrega e número Bling confirmado.
- R09: outbox/worker com leasing, dedupe e conciliação de estado incerto.
- R10: envio fiscal somente após preflight, retorno Bling e autorização SEFAZ verificável. Impedir expedição antes da autorização.
- Fazer clone canônico e rollout com aprovação explícita, canário e rollback.

**Ambiente produtivo intocado:** nenhum merge, deployment, migration, mensagem Meta, nota fiscal, alteração de estoque, pedido de venda Bling ou movimentação financeira foi realizada.
