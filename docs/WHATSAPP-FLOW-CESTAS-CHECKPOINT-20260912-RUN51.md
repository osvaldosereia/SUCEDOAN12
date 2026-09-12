# WhatsApp Flow Cestas — checkpoint RUN51 / V69

V69 adiciona uma barreira de qualidade visual/comercial para os produtos extras carregados dinamicamente no Flow. O objetivo é impedir homologação física se qualquer card retornado pelas buscas curadas estiver sem id, nome, preço válido, foto HTTPS ou ultrapassar o limite de 20 produtos por consulta.

## Implementado

- `get_whatsapp_flow_v69_visual_product_card_readiness_v1()` percorre os 32 termos curados habilitados e valida os produtos reais retornados pelo backend determinístico.
- O readiness exige foto HTTPS, preço > 0, id e nome em todos os cards expostos.
- O readiness falha se qualquer consulta ultrapassar 20 produtos e publica explicitamente `full_catalog_loaded=false`, `extras_price_visible=true` e `component_prices_visible=false`.
- `get_whatsapp_flow_owner_homologation_preflight_v10(uuid)` passa a exigir V69 além do preflight V9/V68.
- `queue_and_dispatch_whatsapp_flow_owner_homologation_v13(uuid,text,text)` substitui V12 como único launcher direto de homologação para `service_role`.
- `service_role` perdeu `EXECUTE` direto no V12.
- `get_whatsapp_flow_v69_homologation_control_plane_v1()` publica o novo estado de prontidão e mantém V8–V12 indisponíveis para lançamento direto.

## Verificação viva

Supabase retornou:

```text
visual.ok=true
terms_checked=32
terms_with_products=23
product_cards_checked=202
missing_id_count=0
missing_name_count=0
missing_or_zero_price_count=0
missing_image_count=0
non_https_image_count=0
terms_over_20_products_count=0
max_results_seen=20
full_catalog_loaded=false
extras_price_visible=true
component_prices_visible=false
```

Control plane:

```text
runtime_handler=v26
edge_version=49
visual_product_card_ready=true
terminal_commercial_ready=true
payment_rules_ready=true
atomic_terminal_handoff_ready=true
physical_next_required=UPSELL
eligible_owner_conversations=0
active_owner_homologation_sessions=0
safe_to_launch_owner_v13=false
direct_v12_service_role_disabled=true
next_action=wait_for_owner_service_window
```

Gates preservados:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

No Make, `consultar no cpf` permanece ativo, com `incompleteExecutions=0`. Nenhum cenário do Flow foi ativado.

Security Advisor foi executado após o DDL. V69 não apareceu entre os avisos. Permanecem alertas antigos fora deste bloco, principalmente tabelas com RLS sem policy e três funções `agent_workflow_*` SECURITY DEFINER executáveis por `authenticated`.

Persistidos:

- `supabase/migrations/20260912151812_whatsapp_flow_v69_visual_product_card_readiness.sql`
- `scripts/test-whatsapp-flow-v69-visual-product-card-readiness-contract.mjs`
- este checkpoint RUN51.

## Próximo bloqueio real

A prova física terminal continua:

`UPSELL → REVISAO → CLIENTE/ENDERECO → FINALIZAR_NO_ORDER → nfm_reply_no_order → localização`

Enquanto não existir exatamente uma conversa owner autorizada dentro da janela válida de atendimento, `safe_to_launch_owner_v13=false` e nenhum Flow é enviado a clientes.
