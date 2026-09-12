# WhatsApp Flow Cestas — checkpoint RUN52 / V70

V70 fecha a prontidão da taxonomia visível do catálogo segmentado. O objetivo é garantir que o cliente nunca veja uma seção/termo que leve a uma lista vazia e que o Flow continue trabalhando somente com subconjuntos pequenos do catálogo real.

## Estado relido antes da alteração

- RUN51 / V69 presente no `main`.
- runtime comercial `handle_whatsapp_flow_commercial_exchange_v26` / Edge 49.
- `get_whatsapp_flow_v69_homologation_control_plane_v1()` estava `ok=true`.
- `physical_next_required=UPSELL`.
- `eligible_owner_conversations=0`.
- `safe_to_launch_owner_v13=false`.
- Make: `consultar no cpf` ativo e sem execuções incompletas; outbound WhatsApp/Flow inativo.

## Auditoria da taxonomia real

A tabela de termos possui 32 termos curados habilitados. No estado atual do catálogo:

- 23 termos resolvem para pelo menos um produto vendável;
- 9 termos não possuem resultado vendável no momento;
- esses 9 termos já são filtrados por `get_whatsapp_flow_search_terms_v1()` e não aparecem ao cliente;
- 5 seções macro permanecem visíveis: Higiene e beleza, Limpeza, Mercearia, Bebidas e Casa e Pet;
- maior seção visível possui 8 termos;
- nenhuma seção visível está vazia.

## Implementado

- `get_whatsapp_flow_v70_visible_taxonomy_readiness_v1()` valida a superfície que realmente chega ao cliente;
- falha se algum termo visível retornar zero produtos;
- falha se alguma seção visível estiver vazia;
- limita a superfície de termos a no máximo 10 por seção;
- preserva máximo de 20 produtos por consulta;
- explicita `full_catalog_loaded=false` e `ai_authoritative_for_catalog=false`;
- novo preflight owner-only `get_whatsapp_flow_owner_homologation_preflight_v11(uuid)` passa a exigir V70;
- novo launcher `queue_and_dispatch_whatsapp_flow_owner_homologation_v14(...)` substitui V13;
- `service_role` perdeu acesso direto ao V13;
- novo control plane `get_whatsapp_flow_v70_homologation_control_plane_v1()` publica o estado consolidado.

## Verificação viva

```text
taxonomy.ok=true
visible_sections=5
visible_terms=23
hidden_zero_result_terms=9
empty_visible_terms=0
empty_visible_sections=0
sections_over_10_terms=0
max_visible_terms_in_section=8
zero_result_terms_hidden=true
full_catalog_loaded=false
max_products_per_query=20
ai_authoritative_for_catalog=false
```

Control plane:

```text
control_plane.ok=true
runtime_handler=v26
edge_version=49
visible_taxonomy_ready=true
visual_product_card_ready=true
terminal_commercial_ready=true
payment_rules_ready=true
atomic_terminal_handoff_ready=true
physical_next_required=UPSELL
eligible_owner_conversations=0
active_owner_homologation_sessions=0
safe_to_launch_owner_v14=false
direct_v13_service_role_disabled=true
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

Nenhum pedido, carrinho ou cliente foi escrito por V70; `writes_performed=false`.

## Make

`consultar no cpf` permanece ativo, com `incompleteExecutions=0`. Os cenários `Dona Antônia - WhatsApp Outbound Event-Driven v3` e `LEGACY - NÃO USAR - WhatsApp Outbound HTTP v1` permanecem inativos.

## Security Advisor

Executado após o DDL. Nenhuma função V70 apareceu nos alertas de `SECURITY DEFINER` expostos a `anon`/`authenticated`. Permanecem avisos antigos fora deste bloco (RLS sem policy em várias tabelas e funções administrativas/imagem já existentes).

## Persistidos

- `supabase/migrations/20260912162018_whatsapp_flow_v70_visible_taxonomy_readiness.sql`
- `scripts/test-whatsapp-flow-v70-visible-taxonomy-readiness-contract.mjs`
- este checkpoint RUN52.

## Próximo bloqueio real

A prova física terminal permanece:

`UPSELL → REVISAO → CLIENTE/ENDERECO → FINALIZAR_NO_ORDER → nfm_reply_no_order → localização`

Enquanto não existir exatamente uma conversa owner autorizada dentro da janela válida de atendimento, `safe_to_launch_owner_v14=false` e nenhum Flow é enviado a clientes.
