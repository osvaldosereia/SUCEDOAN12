# WhatsApp Flow Dona Antônia — Checkpoint RUN17

Data: 2026-09-11

## Objetivo

Avançar o bloco de upsell/cross-sell do Flow comercial único sem depender de nova interação física e sem ampliar rollout.

## Problema encontrado

O runtime histórico usa `get_cart_aware_recommendations(conversation_id, 6, 'upsell')`. Durante a homologação, porém, cesta e adicionais ainda podem existir somente no estado temporário da sessão do Flow, sem terem sido gravados no carrinho comercial. Isso permitia recomendações pouco conscientes da seleção corrente e criava risco de sugerir novamente item já pertencente à cesta ou já escolhido no Flow.

## V35 — recomendações conscientes da sessão

Criada `public.get_whatsapp_flow_session_recommendations_v1(session_id, conversation_id, limit)`.

Regras:

- parte do recomendador comercial existente para preservar histórico/perfil/ofertas;
- exclui todos os componentes da cesta selecionada;
- exclui `flow_pending_addons`;
- exclui `flow_pending_product`;
- usa categorias dos itens selecionados como reforço de relevância;
- máximo absoluto de 6 sugestões;
- somente produtos reais, ativos, WhatsApp ativos, com preço e estoque positivos;
- a IA não escolhe produto, preço, estoque ou score;
- nenhuma escrita comercial.

Criado também `handle_whatsapp_flow_commercial_exchange_v25`, que encadeia integralmente V24 e substitui apenas a lista da tela `UPSELL` pela lista session-aware.

## Readiness real no Supabase

`get_whatsapp_flow_v35_session_upsell_readiness_v1(session_id)` retornou:

- `ok=true`;
- `recommendation_count=6`;
- `invalid_product_count=0`;
- `selected_product_overlap_count=0`;
- `duplicate_count=0`;
- `max_recommendations=6`;
- `session_context_aware=true`;
- `ai_authoritative_for_products=false`;
- `optional_upsell=true`;
- `writes_executed=false`;
- `pii_returned=false`.

Permissões confirmadas:

- `anon`: sem EXECUTE;
- `authenticated`: sem EXECUTE;
- `service_role`: EXECUTE permitido;
- mesma política aplicada ao runtime V25.

## Gates preservados

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## GitHub / CI

Persistidos:

- `supabase/migrations/20260911051600_whatsapp_flow_v35_session_aware_upsell_v1.sql`;
- `scripts/test-whatsapp-flow-v35-session-upsell-contract.mjs`;
- workflow `Test WhatsApp Flow Live Audit` atualizado.

Run `34565473572`: `completed/success`.

## Make

Auditoria confirmou exatamente três cenários ativos autorizados e todos com `incompleteExecutions=0`:

1. `consultar no cpf`;
2. `Dona Antônia - WhatsApp Inbound Controlado v1`;
3. `Dona Antônia - WhatsApp Outbound Event-Driven v3`.

Nenhum cenário foi alterado.

## Estado de promoção

O runtime V25 já existe e foi validado diretamente no Supabase, mas o Edge `whatsapp-flow-data-exchange-v1` ainda aponta o candidato stable para V24. Nesta rodada ele não foi promovido antes da validação versionada. O contrato V35 agora está verde, então o próximo bloco pode promover `V24 -> V25` de forma controlada sem alterar os gates globais.

## Próximo bloco seguro

1. versionar a troca do Edge stable `V24 -> V25` com teste explícito;
2. implantar nova versão da Edge mantendo owner-only e todos os gates globais OFF;
3. reexecutar readiness owner;
4. quando houver interação física, validar a tela real `UPSELL` e seguir para revisão, cadastro/endereço, pagamento, finalização, `nfm_reply` e localização.
