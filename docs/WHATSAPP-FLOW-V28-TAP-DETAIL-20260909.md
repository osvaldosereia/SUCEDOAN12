# WhatsApp Flow V28 — tap no produto → detalhe → quantidade → adicionar

Checkpoint: 2026-09-09.

## UX aprovada pelo proprietário

A lista de produtos não usa checkbox. A experiência candidata V28 segue:

1. lista compacta com até 20 produtos por página;
2. cada linha tem foto pequena, nome, informações curtas e preço;
3. tocar na linha abre o detalhe do produto;
4. detalhe usa foto maior, nome, preço, marca/embalagem e quantidade;
5. `Adicionar ao pedido` grava o item após nova validação de estoque/preço;
6. depois de adicionar, o Flow volta à lista da mesma busca/categoria em uma cópia forward-only;
7. `Finalizar pedido`, `Outra categoria ou busca` e `Ver mais produtos` são ações diretas;
8. catálogo completo nunca é carregado de uma vez.

## Implementação

- JSON: `whatsapp/flows/flow-cestas-comercial-v28.json`.
- Gerador: `scripts/build-flow-v28-product-detail.py`.
- CI: `.github/workflows/build-flow-v28.yml`.
- Definition: `flow-cestas-comercial-v5`.
- Handler: `handle_whatsapp_flow_commercial_exchange_v16`.
- Meta Flow ID: `1562977688342506`.
- Edge `whatsapp-flow-data-exchange-v1`: versão 25 no checkpoint.
- V5 permanece `candidate_not_live=true` e `default_for_new_sessions=false`.
- V3 continua a definição live/default.
- Bling continua desligado.

## Validações concluídas

- CI gerou 55 telas e validou a estrutura estática.
- Smoke transacional com rollback: INIT → cesta → personalização → menu → Higiene → 20 produtos → detalhe → quantidade 2 → retorno com 20 produtos.
- Meta Graph API v26.0 aceitou o V28 com `success=true` e `validation_errors=[]`.
- Meta reportou JSON `7.3`, Data API `3.0`, status `PUBLISHED` e `health_status.can_send_message=AVAILABLE`.
- `process_whatsapp_flow_nfm_reply_v1` foi estendido para V5 mantendo idempotência e exigência de pedido confirmado.
- Imagens pequenas da NavigationList usam o contrato `start.image`; imagem grande é hidratada no detalhe e campos server-only são removidos antes da resposta ao cliente.

## Limite de navegação

O Flow padrão não permite voltar ciclicamente à mesma tela via routing_model. A V28 resolve isso com telas A–L unrolled, permitindo até 12 ciclos de abertura/adição de produto antes da revisão. Isso mantém o routing forward-only aceito pela Meta.

## Estado operacional no fim desta rodada

Os gates globais `experience_orchestrator_enabled`, `whatsapp_flow_data_exchange_enabled` e `whatsapp_flow_send_enabled` foram encontrados como `false`, com `automation_config.updated_at=2026-09-09 22:16:43+00`. Eles haviam sido alterados fora desta rodada enquanto havia trabalho concorrente. Esta rodada não os reativou para evitar conflito com outra tarefa. `whatsapp_flow_commercial_write_enabled=true` e `bling_order_sync_enabled=false`.

Para novo teste real no WhatsApp do proprietário, confirmar o estado/intenções desses gates antes de reativar e enviar a V5 especificamente ao número de homologação.
