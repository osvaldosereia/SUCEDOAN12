# WhatsApp Flow Cestas — checkpoint RUN53 / V71

V71 reforça a busca direta inferida pela IA e a taxonomia curada com uma auditoria de integridade contra o catálogo real. O objetivo é provar, antes da homologação física, que a IA fornece apenas a intenção textual e que IDs, nome, preço, disponibilidade e imagem continuam vindo do backend determinístico.

## Estado relido antes da alteração

- RUN52 / V70 presente no `main`.
- runtime comercial `handle_whatsapp_flow_commercial_exchange_v26` / Edge 49.
- `get_whatsapp_flow_v70_homologation_control_plane_v1().ok=true`.
- `physical_next_required=UPSELL`.
- `eligible_owner_conversations=0`.
- `safe_to_launch_owner_v14=false`.
- Make: `consultar no cpf` ativo e sem execuções incompletas; `Dona Antônia - WhatsApp Outbound Event-Driven v3` inativo. O inbound controlado está ativo, mas os gates do Flow continuam desligados.

## Implementado

- `get_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness_v1()` percorre os 23 termos visíveis e também a busca direta `leite`;
- cada produto retornado é reconciliado por ID contra `public.products`;
- exige produto fisicamente verificado, ativo, habilitado para WhatsApp, estoque positivo, preço positivo e imagem HTTPS;
- confere que nome, preço e imagem retornados são os mesmos da tabela oficial;
- estoque é validado no backend e não é exposto como campo no card do Flow;
- `get_whatsapp_flow_ai_intent_entry_v1()` continua apenas como ponte de intenção: `ai_role=intent_text_only`, `commercial_truth=backend_deterministic` e `ai_authoritative_for_catalog=false`;
- máximo de 20 produtos por consulta permanece obrigatório;
- novo preflight `get_whatsapp_flow_owner_homologation_preflight_v12(uuid)` passa a exigir a integridade V71;
- novo launcher owner-only `queue_and_dispatch_whatsapp_flow_owner_homologation_v15(...)` substitui V14;
- `service_role` perdeu acesso direto ao V14;
- novo control plane `get_whatsapp_flow_v71_homologation_control_plane_v1()` consolida o estado.

## Correção durante a rodada

A primeira versão da auditoria tentou comparar `stock` dentro do payload de produtos. O payload do Flow não expõe estoque, embora o backend use estoque para decidir se o produto é vendável. A auditoria foi corrigida para validar estoque positivo diretamente em `public.products`, sem exigir nem expor `stock` no card. A correção foi aplicada antes de tornar o gate verde.

## Verificação viva

```text
integrity.ok=true
visible_terms_checked=23
intent_checks=23
ai_entry_checks=23
products_checked=222
catalog_mismatches=0
ai_option_mismatches=0
structural_failures=0
direct_search_failures=0
direct_search_probe=leite
direct_search_product_count=20
max_products_per_query=20
stock_verified_in_backend=true
stock_exposed_to_flow=false
full_catalog_loaded=false
ai_role=intent_text_only
ai_authoritative_for_catalog=false
commercial_truth=backend_deterministic
```

Control plane:

```text
control_plane.ok=true
runtime_handler=v26
edge_version=49
ai_intent_catalog_integrity_ready=true
ai_intent_products_checked=222
ai_intent_catalog_mismatches=0
direct_search_failures=0
physical_next_required=UPSELL
eligible_owner_conversations=0
active_owner_homologation_sessions=0
safe_to_launch_owner_v15=false
direct_v14_service_role_disabled=true
next_action=wait_for_owner_service_window
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

Nenhum gate foi aberto e a V71 é somente leitura/auditoria, com `writes_performed=false`.

## Segurança

As novas funções não são executáveis por `anon` nem `authenticated`; somente `service_role` mantém acesso ao preflight/control plane/launcher atual. O Security Advisor não apontou função V71 nova entre os alertas de `SECURITY DEFINER`. Permanecem avisos anteriores fora deste bloco, principalmente tabelas com RLS sem policies e três funções administrativas de workflow já existentes.

Referência de remediação do advisor para funções privilegiadas: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Persistidos

- `supabase/migrations/20260912171731_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness.sql`
- `supabase/migrations/20260912171823_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness_fix.sql`
- `scripts/test-whatsapp-flow-v71-ai-intent-catalog-integrity-contract.mjs`
- este checkpoint RUN53.

## Próximo bloqueio real

A prova física terminal permanece:

`UPSELL → REVISAO → CLIENTE/ENDERECO → FINALIZAR_NO_ORDER → nfm_reply_no_order → localização`

Enquanto não existir exatamente uma conversa owner autorizada dentro da janela válida de atendimento, `safe_to_launch_owner_v15=false` e nenhum Flow é enviado a clientes.
