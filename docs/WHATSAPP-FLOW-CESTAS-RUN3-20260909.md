# Dona Antônia — WhatsApp Flow Cestas — Run 3

Data: 09/09/2026

## Entregue nesta rodada

1. Criado `whatsapp_flow_commercial_write_enabled`, sempre `false` por padrão e mantido `false` em produção.
2. Criada `whatsapp_flow_write_operations` para idempotência de operações comerciais do Flow sem armazenar payload sensível em texto aberto; guarda chave da operação, fingerprint SHA-256, metadados mínimos e resultado.
3. Criada RPC service-role `apply_whatsapp_flow_commercial_write_v1` com fail-closed e quatro operações homologáveis:
   - `start_basket` → reutiliza `start_basket_cart`;
   - `apply_basket_selection` → valida snapshot completo com `validate_basket_flow_selection_v1` e aplica quantidades via `set_basket_cart_item_quantity`;
   - `set_addon` → usa `set_cart_addon_quantity` com preço/estoque reais;
   - `set_upsell` → mesma escrita idempotente de addon, mantendo a recomendação separada da decisão comercial.
4. A escrita exige simultaneamente write gate + Orchestrator + Data Exchange + Flow send e recusa takeover humano, sessão expirada, versão de estado stale e conflito de idempotência.
5. O Make inbound `Dona Antônia - WhatsApp Inbound Controlado v1` passou a mapear `interactive.nfm_reply.response_json` e `nfm_reply.body` para o bridge.
6. `whatsapp-ingest-make-v1` foi atualizado/deployado para preservar `interactive_response_json` até o ingest principal.

## Segurança confirmada após deploy

```text
whatsapp_release_mode=live
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Teste explícito confirmou que `apply_whatsapp_flow_commercial_write_v1` falha com `whatsapp_flow_commercial_write_disabled` enquanto o gate está OFF. Nenhuma operação comercial foi gravada (`whatsapp_flow_write_operations=0`).

## Estado funcional

A base agora possui escrita idempotente pronta para cesta, personalização e adicionais/upsell, mas deliberadamente inacessível até homologação. Não há ativação para cliente.

## Próximo bloco

1. integrar o handler Data Exchange comercial à RPC de escrita somente quando o novo write gate estiver homologado;
2. substituir `TextArea` de personalização do Flow JSON por contrato estruturado de quantidades/remoção, sem preço individual dos componentes;
3. completar parse de `nfm_reply.response_json` no `whatsapp-ingest` principal e criar roteamento determinístico do retorno;
4. gerar resumo real do carrinho após cada escrita;
5. implementar confirmação de cadastro/endereço e forma de pagamento;
6. implementar finalização idempotente do pedido sem Bling;
7. somente depois registrar/publicar o Flow real na Meta e testar allowlisted.

## Observação de advisors

A nova tabela usa RLS sem policy e grants apenas para `service_role`, seguindo o padrão fail-closed já usado pelo projeto. O advisor classifica isso como informativo (`RLS enabled no policy`), não como exposição. O advisor também continua apontando globalmente proteção de senhas vazadas do Supabase Auth como desativada; isso é anterior e fora do escopo deste Flow.
