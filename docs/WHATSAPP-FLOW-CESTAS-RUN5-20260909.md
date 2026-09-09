# Dona Antônia — WhatsApp Flow Cestas — Run 5

Data: 09/09/2026

## Objetivo desta rodada

Retomar pelo bloqueio crítico identificado na rodada anterior: reconciliar, sem adivinhação, os componentes das 9 cestas ativas com a base atual de produtos antes de qualquer homologação real do Flow comercial.

## Auditoria executada

Foi revalidado o readiness atual das cestas. O estado permanece:

- 9 cestas ativas no WhatsApp;
- 0/9 aptas à escrita rígida do carrinho;
- os componentes antigos apontam para produtos inativos/não verificados;
- `start_basket_cart` continua corretamente fail-closed.

Foram testadas correspondências entre os produtos legados das cestas e os produtos atuais usando somente identificadores confiáveis:

- GTIN exato;
- SKU exato;
- `bling_product_id` exato;
- nome normalizado exato;
- nome + marca + embalagem normalizados.

Resultado: **nenhuma correspondência segura encontrada** na base atualmente verificada.

Também foi ampliada a auditoria para todos os demais registros atuais do catálogo, e não apenas os fisicamente verificados. Entre os 27 produtos legados distintos usados pelas cestas, não existe hoje outro registro com GTIN/SKU/Bling ID igual nem nome normalizado exatamente igual.

Conclusão: qualquer remapeamento automático nesta etapa exigiria aproximação sem identificador estável, o que poderia alterar a composição comercial real das cestas. Isso não foi feito.

## Nova camada implementada

Migration:

`20260909061900_whatsapp_flow_basket_reconciliation_candidates_v1.sql`

Foram criadas:

### `normalize_product_identity_v1(text)`

Normalização determinística server-side usada apenas para auditoria de identidade de produto.

### `get_whatsapp_basket_reconciliation_candidates_v1(basket_id, limit)`

Read model server-only que:

- lê componentes legados das cestas;
- compara apenas contra produtos ativos e fisicamente verificados;
- atribui razões e níveis determinísticos de confiança;
- nunca grava em `basket_template_items`;
- marca todo candidato com `auto_apply_allowed=false`;
- exige identificador estável para qualquer futura reconciliação automática;
- trata correspondência por nome normalizado somente como candidato para revisão.

Permissões confirmadas:

```text
anon: sem EXECUTE
authenticated: sem EXECUTE
service_role: EXECUTE
```

## Resultado real do novo read model

```text
legacy basket item rows = 195
items_with_candidates = 0
items_without_candidates = 195
unique_high_confidence_candidates = 0
```

Esses 195 registros correspondem às ocorrências dos 27 produtos legados distintos distribuídos entre as 9 cestas.

A ausência de candidatos é um resultado útil: confirma que o problema não é apenas UUID antigo duplicado. A fonte atual não contém uma identidade determinística equivalente que possa ser aplicada automaticamente com segurança.

## Decisão preservada

Nenhuma cesta foi alterada.

Nenhum produto foi substituído por similaridade de nome.

Nenhum gate foi ligado.

Estado pós-rodada confirmado:

```text
whatsapp_release_mode=live
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

## Próximo caminho seguro

A reconciliação automática só deve avançar quando uma fonte oficial trouxer identidade de produto suficiente, preferencialmente:

1. composição atual das cestas com SKU/GTIN/Bling ID oficial; ou
2. reconstrução explícita das composições a partir do catálogo atual, com validação administrativa.

Enquanto isso, o desenvolvimento do Flow pode continuar nas partes independentes da escrita real da cesta:

- validação do Flow JSON;
- transporte Meta;
- imagem compatível;
- busca dinâmica de produtos extras;
- upsell;
- checkout/read models;
- `nfm_reply`;
- instrumentação e observabilidade.

O readiness continuará bloqueando homologação transacional de cesta até a composição ser reconciliada.

## Ação manual do proprietário

Nenhuma ação manual necessária nesta rodada. O sistema permanece seguro e não foi feito remapeamento incerto.
