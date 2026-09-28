# Operations 2.0 — R2 Canary Progress

Data: 2026-09-28

## Estado observado

Primeiro pedido real pós-corte:
- pedido local: `DA-260928-D6432EB3`
- pedido Bling: `26983249693`
- criado após `ops2_live_cutover_at`
- confirmação humana realizada
- `sync_status=sent_to_bling`
- vínculo Bling: `matched`
- estado Bling confirmado: `Aprovado / Separar` (id 915902)

Validação de estoque:
- 30 linhas de produto
- 33 unidades
- pré-check Bling: 30/30
- pós-check Bling: 30/30
- faltas: 0
- saldo virtual negativo: 0

Separação:
- lista de separação enfileirada
- diálogo de impressão apresentado
- conferência EAN ainda não iniciada pelo operador

Pré-flight EAN:
- 30 produtos
- GTIN ausente: 0
- GTIN com tamanho inesperado: 0
- GTIN duplicado dentro do pedido: 0

## Recuperação automática

O primeiro canário encontrou `required_transition_missing` no primeiro salto para `Aprovado / Separar`.

A recuperação por `sync_order_status` confirmou o estado alvo sem duplicar pedido.

Ajustes consolidados:
- Admin usa retry explícito com `target_key=approved_separation`;
- falha pós-conferência EAN grava `review_bling`;
- ciclo de 2 minutos também tenta recuperar `ready + review_bling` com sessão EAN verificada;
- alerta operacional só deve ser resolvido depois que o estado alvo do Bling for efetivamente confirmado.

## Runtime

- `admin-service-intelligence-v1`: v199 ACTIVE
- `admin-products-live-v1`: v53 ACTIVE
- cron `bling-hub-v2-cycle`: ativo a cada 2 minutos
- política histórica: `future_only`
- pedidos pré-corte continuam fora do fluxo novo

## Próximo gate real

Aguardar ação humana normal no pedido:

`confirmed -> processing -> conferência EAN -> ready / Bling Verificado`

Depois observar:
- sincronização automática para `Verificado`;
- gate fiscal;
- expedição;
- baixa física Bling;
- captura real do pagamento;
- entrega.

Nenhuma dessas etapas deve ser forçada artificialmente no canário real.
