# WhatsApp Flow Cestas — checkpoint RUN54 / V72

V72 transforma a integridade da personalização das cestas em gate obrigatório da homologação owner-only. O objetivo é provar, antes do teste físico, que as cestas oficiais, seus componentes, quantidades editáveis e opções de ajuste continuam consistentes com o backend, sem expor preços individuais dos componentes.

## Estado relido antes da alteração

- RUN53 / V71 presente no `main`.
- runtime comercial `handle_whatsapp_flow_commercial_exchange_v26` / Edge 49.
- `get_whatsapp_flow_v71_homologation_control_plane_v1().ok=true`.
- `physical_next_required=UPSELL`.
- `eligible_owner_conversations=0`.
- `safe_to_launch_owner_v15=false`.
- Make: `consultar no cpf` ativo e sem execuções incompletas; `Dona Antônia - WhatsApp Outbound Event-Driven v3` inativo.

## Implementado

- `get_whatsapp_flow_v72_basket_personalization_integrity_readiness_v1()` audita todas as cestas ativas do WhatsApp e sua composição real;
- confere resolução dos produtos, nomes, quantidades-base positivas e intervalos min/max coerentes;
- monta a seleção padrão de cada cesta e a valida no backend determinístico;
- confere o contrato atual `basket_personalization_v3`;
- exige `stock_limits_increases=true` e validação backend;
- percorre o payload normalizado e bloqueia qualquer campo de preço/delta individual de componente;
- percorre as opções de ajuste de cada componente e bloqueia preço/delta nas opções;
- confere que toda opção de ajuste tem pelo menos uma quantidade válida e que a quantidade atual coincide com a composição oficial;
- novo preflight `get_whatsapp_flow_owner_homologation_preflight_v13(uuid)` passa a exigir V72;
- novo launcher `queue_and_dispatch_whatsapp_flow_owner_homologation_v16(...)` substitui V15;
- `service_role` perdeu acesso direto ao V15;
- novo control plane `get_whatsapp_flow_v72_homologation_control_plane_v1()` consolida o estado.

## Red/Green observado

Antes da implementação, `to_regprocedure('public.get_whatsapp_flow_v72_basket_personalization_integrity_readiness_v1()')` retornou falso.

A primeira execução do novo readiness ficou vermelha com `default_selection_failures=9`. A causa foi uma divergência real de versão do contrato: o runtime atual já usa `basket_personalization_v3`, enquanto a primeira auditoria esperava `v2`. A correção foi aplicada em migration separada, adicionando também a exigência `stock_limits_increases=true`.

## Verificação viva final

```text
personalization.ok=true
readiness_version=v72-basket-personalization-integrity-v2
baskets_checked=9
components_checked=222
component_readiness_ok=true
component_readiness_ready=9
component_readiness_total=9
invalid_compositions=0
default_selection_failures=0
normalized_count_mismatches=0
component_price_leaks=0
adjustment_failures=0
adjustment_price_leaks=0
empty_quantity_options=0
quantity_mismatches=0
component_prices_visible=false
basket_personalization_contract=basket_personalization_v3
stock_limits_increases=true
backend_validation_required=true
writes_performed=false
```

Control plane:

```text
control_plane.ok=true
runtime_handler=v26
edge_version=49
basket_personalization_integrity_ready=true
basket_personalization_baskets_checked=9
basket_personalization_components_checked=222
basket_component_price_leaks=0
basket_adjustment_price_leaks=0
physical_next_required=UPSELL
eligible_owner_conversations=0
active_owner_homologation_sessions=0
safe_to_launch_owner_v16=false
direct_v15_service_role_disabled=true
next_action=wait_for_owner_service_window
```

Privilégios conferidos:

```text
anon readiness EXECUTE=false
authenticated readiness EXECUTE=false
service_role launcher V15 EXECUTE=false
service_role launcher V16 EXECUTE=true
```

## Gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum gate foi aberto. O readiness é somente leitura e informa `writes_performed=false`.

## Make

- `consultar no cpf`: ativo, `incompleteExecutions=0`.
- `Dona Antônia - WhatsApp Outbound Event-Driven v3`: inativo, `incompleteExecutions=0`.
- nenhum cenário foi ativado ou editado nesta rodada.

## Segurança

O Security Advisor não apontou a nova função V72 como `SECURITY DEFINER` executável por usuário autenticado. Permanecem 3 avisos anteriores desse tipo em funções administrativas `agent_workflow_*`, além de avisos de RLS sem policies e proteção de senha vazada desabilitada; nada disso foi ampliado pela V72.

Referências de remediação do Supabase:

- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Persistidos

- `supabase/migrations/20260912182226_whatsapp_flow_v72_basket_personalization_integrity_readiness.sql`
- `supabase/migrations/20260912182309_whatsapp_flow_v72_basket_personalization_integrity_readiness_fix.sql`
- `scripts/test-whatsapp-flow-v72-basket-personalization-integrity-contract.mjs`
- este checkpoint RUN54.

## Próximo bloqueio real

A prova física terminal permanece:

`UPSELL → REVISAO → CLIENTE/ENDERECO → FINALIZAR_NO_ORDER → nfm_reply_no_order → localização`

Enquanto não existir exatamente uma conversa owner autorizada dentro da janela válida de atendimento, `safe_to_launch_owner_v16=false` e nenhum Flow é enviado a clientes.
