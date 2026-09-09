# WhatsApp Flow Comercial V6 — Dona Antônia

Atualizado em 2026-09-09.

## Estado homologado nesta rodada

- Flow comercial único e dinâmico continua em `DRAFT`; não publicado para clientes.
- JSON `whatsapp/flows/flow-cestas-comercial-v6.json` gerado deterministicamente a partir da V5 e validado pela API oficial da Meta com `validation_errors=[]`.
- IDs das telas usam somente letras/underscore, conforme exigência observada no validador oficial da Meta.
- Primeira tela usa `RadioButtonsGroup` com mídia grande para as cestas.
- Personalização usa foto da cesta, composição sem preço individual e seleção visual do item; a alteração de quantidade ocorre em uma tela curta imediatamente seguinte.
- Até três alterações de componentes são desenroladas em telas forward-only A/B/C, evitando ciclos incompatíveis.
- Produtos extras usam seleção de até três categorias, termos/subseções de busca e busca direta. O catálogo completo nunca é carregado no Flow.
- Resultados de produtos e upsell usam opções visuais com mídia; detalhes do produto mostram foto, preço e seletor de quantidade.
- Upsell/cross-sell permanece opcional.
- Checkout foi separado em `CLIENTE_EXISTENTE` e `CLIENTE_NOVO`: cliente já identificado não redigita endereço; cliente novo recebe somente os campos necessários.
- A Edge Function `whatsapp-flow-data-exchange-v1` foi atualizada para o adapter comercial V7 e hidratação de mídia nas telas A/B/C.
- Handler V7 traduz IDs alfabéticos da Meta para as rodadas internas 1/2/3 sem alterar a máquina comercial já testada.

## Segurança preservada

Após a implantação e a validação:

- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

O handler V7 e o handler visual V6 não são executáveis por `anon`/`authenticated`; somente `service_role` possui execução.

## Arquivos principais

- `whatsapp/flows/flow-cestas-comercial-v6.json`
- `scripts/build-flow-v6.py`
- `scripts/fix-flow-v6-meta.py`
- `.github/workflows/build-flow-v6.yml`
- `supabase/migrations/20260909151900_whatsapp_flow_commercial_visual_v6.sql`
- `supabase/migrations/20260909153200_whatsapp_flow_commercial_meta_screen_ids_v7.sql`
- `supabase/functions/whatsapp-flow-data-exchange-v1/index.ts`
- `supabase/functions/whatsapp-flow-data-exchange-v1/image.ts`

## Próximo bloco seguro

1. testar Data Exchange ponta a ponta com sessão sintética/homologação sem liberar o gate geral;
2. validar que as nove cestas reais possuem mídia utilizável e medir payload das imagens;
3. executar casos de regressão para personalização A/B/C, busca segmentada, produto extra, upsell e checkout conhecido/novo;
4. gerar novo preview da Meta da V6 e revisar visualmente em aparelho;
5. somente após homologação completa preparar envio `interactive.type=flow` para o número de teste autorizado, sem alterar canary nem Bling.
