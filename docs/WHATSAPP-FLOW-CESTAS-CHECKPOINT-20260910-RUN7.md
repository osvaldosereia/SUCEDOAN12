# WhatsApp Flow Cestas Dona Antônia — checkpoint RUN7

Data: 2026-09-10

## Estado relido

- Candidato principal: `flow-cestas-comercial-v8-stable`.
- Meta Flow: `2579927222524475`, `DRAFT`, isolado de clientes.
- Runtime comercial: `handle_whatsapp_flow_commercial_exchange_v23`.
- Sessão owner-only: `caf9452b-8df9-43f1-9487-cee2e9aff02a`, ainda `offered`, sem INIT/Data Exchange.
- Conversa owner-only segue em `mode=human` com handoff ativo; precedência humana preservada.
- Make sem drift: inbound controlado, outbound event-driven e consulta CPF ativos, todos sem execuções incompletas.

## Implementação desta rodada

Foi criado `get_whatsapp_flow_v31_transactional_readonly_readiness_v1()` para exercitar regras transacionais usando dados reais sem persistir qualquer alteração.

Cobertura real:

- 3 cestas reais amostradas;
- seleção padrão A validada para 3/3;
- redução de quantidade B validada para 3/3;
- aumento/limites C validados para 3/3;
- alteração real de personalização exercitada;
- preço individual de componentes continua oculto;
- 319 produtos reais elegíveis a extras no snapshot atual;
- limite do cliente de até 6 unidades protegido;
- upsell real limitado a 6 sugestões;
- upsell não duplica produto já presente no carrinho draft;
- quatro gates de escrita comercial exigidos no write path;
- idempotência da operação Flow protegida;
- fórmula de total comercial/fiscal e outras despesas/desconto protegida;
- finalização fail-closed, exigindo cadastro e confirmação determinística;
- confirmação de pedido idempotente;
- formas de pagamento determinísticas.

Resultado real: **16/16 checks verdes**.

A função declara e comprova no resultado: `writes_executed=false`, `orders_created=false`, `pii_returned=false`.

## Gate unificado V2

Criado `get_whatsapp_flow_v31_full_release_readiness_v2(uuid)`, incorporando a regressão transacional read-only ao gate principal.

Estado observado após a integração:

- total: 17 checks;
- positivos: 15/17;
- `transactional_readonly_regression=true`;
- `healthy=true`;
- `homologation_ready=false`;
- únicos negativos: `owner_conversation_ai=false` e `owner_handoff_clear=false`.

Portanto a saúde técnica permanece verde, mas a homologação continua deliberadamente bloqueada pela precedência do atendimento humano.

## Persistência/CI

Migrations reproduzíveis:

- `supabase/migrations/20260910192156_whatsapp_flow_v31_transactional_readonly_regression_v3.sql`
- `supabase/migrations/20260910192340_whatsapp_flow_v31_full_release_readiness_v2.sql`

Contrato:

- `scripts/test-whatsapp-flow-v31-transactional-readonly-contract.mjs`

Workflow `Test WhatsApp Flow V31 Runtime` atualizado para executar o novo contrato e observar ambas as migrations.

## Gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum cliente foi exposto, nenhum rollout foi aumentado, nenhum handoff foi alterado, nenhum pedido foi criado e nenhuma escrita de carrinho/sessão foi executada pela regressão.

## Próximo ponto

1. expandir a regressão A/B/C para cobrir mais variações de itens removíveis/não removíveis e estoque baixo;
2. validar preview de total após personalização + extra + upsell com cálculo determinístico read-only;
3. validar contrato completo `FINALIZAR -> nfm_reply -> localização` com idempotência cruzada;
4. assim que o preflight owner-only ficar naturalmente verde, executar homologação visual completa no aparelho autorizado.

## Ação manual

Nenhuma ação manual indispensável neste momento.
