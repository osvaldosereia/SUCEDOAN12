# WhatsApp Flow Comercial V6 — Dona Antônia

Atualizado em 2026-09-09.

## Estado homologado / implementado

- Flow comercial único e dinâmico continua sem exposição para clientes nesta linha de homologação.
- JSON `whatsapp/flows/flow-cestas-comercial-v6.json` foi gerado deterministicamente e validado pela API oficial da Meta com `validation_errors=[]`.
- IDs das telas usam somente letras/underscore.
- Primeira tela usa `RadioButtonsGroup` com mídia grande para as 9 cestas.
- Personalização usa foto da cesta, composição sem preço individual e alteração de quantidade em tela curta imediatamente seguinte.
- Até três alterações de componentes são desenroladas em telas forward-only A/B/C.
- Produtos extras usam seleção de categorias, termos/subseções e busca direta; o catálogo completo nunca é carregado.
- Resultados de produtos e upsell usam opções visuais com mídia, preço e quantidade.
- Upsell/cross-sell permanece opcional.
- Checkout separado em `CLIENTE_EXISTENTE` e `CLIENTE_NOVO`, preservando cadastro/endereço já conhecido.
- Handler V8 encapsula a navegação alfabética A/B/C e filtra termos sem produto vendável.

## Rodada atual — Edge V11 + regressão V8

A Edge Function `whatsapp-flow-data-exchange-v1` foi implantada no Supabase como **versão 11** e o código em execução foi conferido após o deploy. O endpoint comercial agora chama `handle_whatsapp_flow_commercial_exchange_v8`.

Foram executados smokes transacionais com fixtures sintéticas e rollback, sem deixar cliente, conversa, carrinho ou pedido de teste persistido:

- `INIT -> CESTAS`: 9 cestas reais retornadas;
- `CESTAS -> PERSONALIZAR_A`: composição real carregada;
- `PERSONALIZAR_A -> SECOES_A`: categorias retornadas sem carregar catálogo completo;
- `SECOES_A -> TERMOS_A`: somente termos com resultado vendável permanecem;
- `TERMOS_A -> PRODUTOS_A`: subconjunto entre 1 e 12 produtos;
- `PRODUTOS_A -> PRODUTO_A`: detalhe real com preço comercial do adicional;
- caminho `SECOES_A -> UPSELL -> REVISAO -> CLIENTE_EXISTENTE` validado com escrita comercial temporariamente habilitada apenas dentro de subtransação revertida integralmente ao final.

A regressão encontrou um defeito real antes da homologação: `basket_template_items.quantity` é `numeric` e o JSON do editor preserva escala (`1.000`). O validador aceitava somente texto `1`, portanto a seleção oficial de uma cesta era recusada como `basket_selection_invalid` quando a escrita comercial estava ligada.

A migration `20260909171800_whatsapp_flow_integral_quantity_validation_v22.sql` corrige o contrato para aceitar representações numéricas integrais (`1`, `1.0`, `1.000`) e continuar rejeitando frações. Após a correção:

- a seleção padrão da cesta passou de `valid=false` com vários `invalid_quantity` para `valid=true` e `issues=[]`;
- o smoke com escrita percorreu cesta, revisão e cliente conhecido com total preenchido;
- os gates foram verificados novamente após o rollback.

O contrato foi acrescentado ao teste `scripts/test-whatsapp-new-order-flow-v1.mjs`, incluindo as garantias de quantidade integral, canary 1%, Data Exchange OFF, Flow Send OFF e Bling OFF.

## Segurança preservada

Durante a auditoria desta rodada foi detectado que uma alteração concorrente havia deixado os gates comerciais ligados. Eles foram imediatamente restaurados e confirmados novamente após todos os smokes:

- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

A habilitação usada no smoke de checkout ocorreu somente dentro de uma subtransação deliberadamente revertida; o estado persistente permaneceu fechado.

## Catálogo e busca

- 9/9 cestas oficiais têm composição resolvida e `cart_write_ready=true`;
- 9/9 cestas têm URL de imagem cadastrada;
- adicionais continuam consultados sob demanda, com limite de 12 resultados por busca;
- `filter_whatsapp_flow_viable_terms_v1(jsonb)` consulta `get_whatsapp_flow_product_results_v1(...,1)` e remove caminhos sem produto vendável;
- nenhuma IA decide disponibilidade, produto, preço ou estoque.

## Make — observação da auditoria

Foram relidos os cenários do time. Continuam ativos os cenários operacionais já existentes de WhatsApp Inbound/Outbound e outros cenários previamente ativos; os cenários temporários de publicação/validação/preview de Flow permanecem inativos. Nenhum cenário foi ativado ou alterado nesta rodada.

## Arquivos principais

- `whatsapp/flows/flow-cestas-comercial-v6.json`
- `scripts/build-flow-v6.py`
- `scripts/fix-flow-v6-meta.py`
- `scripts/test-whatsapp-new-order-flow-v1.mjs`
- `.github/workflows/build-flow-v6.yml`
- `supabase/migrations/20260909151900_whatsapp_flow_commercial_visual_v6.sql`
- `supabase/migrations/20260909153200_whatsapp_flow_commercial_meta_screen_ids_v7.sql`
- `supabase/migrations/20260909162146_whatsapp_flow_viable_search_terms_v15.sql`
- `supabase/migrations/20260909171800_whatsapp_flow_integral_quantity_validation_v22.sql`
- `supabase/functions/whatsapp-flow-data-exchange-v1/index.ts`
- `supabase/functions/whatsapp-flow-data-exchange-v1/image.ts`

## Próximo bloco seguro

1. executar regressão da alteração A/B/C de quantidade, incluindo retirar/aumentar/diminuir conforme política;
2. testar busca direta e adição real de adicional em subtransação com rollback;
3. testar upsell com produto escolhido e checkout de cliente novo;
4. validar finalização completa e retorno `nfm_reply`/`send_location_in_chat` sem Bling;
5. medir as 9 imagens de cesta e imagens de produto através da hidratação real da Edge;
6. gerar novo preview visual da Meta e revisar em aparelho;
7. somente depois preparar teste no número de homologação autorizado, sem aumentar canary nem expor clientes.
