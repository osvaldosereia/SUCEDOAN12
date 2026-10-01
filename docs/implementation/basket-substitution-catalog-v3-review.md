# Verificação

- RED: teste SQL falhou por ausência de `basket_lot_substitution_products`.
- GREEN: `BASKET_SUBSTITUTION_CATALOG_V3_OK`.
- RPC administrativa em transação: `BASKET_SUBSTITUTION_ADMIN_RPC_V3_OK`.
- Regressão geração automática: `BASKET_AUTO_SUGGESTIONS_REGRESSION_OK`.
- Regressão aprovação de lote: `BASKET_ADMIN_APPROVAL_REGRESSION_OK`.
- Regressão editor completo: `BASKET_SUGGESTION_EDITOR_V2_OK`.
- Checkout equivalente ao contrato atual de lote ativo: `CHECKOUT_ORDER_FLOWS_REGRESSION_OK`.
- Interface: contrato v3, sintaxe JavaScript e `git diff --check` aprovados no patch one-shot.
