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
- Handler V7 traduz IDs alfabéticos da Meta para as rodadas internas 1/2/3.

## Rodada de endurecimento — termos de busca viáveis (V15 / handler V8)

Auditoria real do Supabase confirmou:

- 9/9 cestas oficiais com composição resolvida e `cart_write_ready=true`;
- 9/9 cestas com URL de imagem cadastrada;
- catálogo de adicionais continua consultado sob demanda, com limite de 12 resultados por busca;
- existem termos configurados que hoje retornam zero produto vendável (por exemplo `creme dental`, `desodorante`, `absorvente`, `esponja`, `saco lixo`, `papel toalha`, `guardanapo` e `refrigerante`).

Para impedir caminhos mortos no Flow foi implantada no Supabase a migration `whatsapp_flow_viable_search_terms_v15`:

- `filter_whatsapp_flow_viable_terms_v1(jsonb)` valida cada termo contra `get_whatsapp_flow_product_results_v1(...,1)`;
- termos sem produto real vendável são ocultados naquele momento;
- se uma seleção de categorias ficar sem nenhum termo viável, o cliente volta para a tela de seções com orientação para escolher outra seção ou usar busca direta;
- nenhuma IA decide disponibilidade, produto, preço ou estoque;
- `handle_whatsapp_flow_commercial_exchange_v8` encapsula o V7 e aplica o filtro somente na resposta visual de `TERMOS_A/B/C`;
- permissões permanecem `service_role` apenas para os novos RPCs.

Teste direto do filtro confirmou que `higiene::sabonete` e `limpeza::detergente` permanecem, enquanto `higiene::creme_dental` é removido quando não há produto vendável correspondente.

O repositório foi atualizado para que `supabase/functions/whatsapp-flow-data-exchange-v1/index.ts` use `handle_whatsapp_flow_commercial_exchange_v8`. O deploy da Edge Function deve acompanhar essa versão antes do próximo teste Data Exchange real.

## Segurança preservada

Auditoria posterior à migration confirmou como baseline obrigatório:

- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

O handler V8 e o filtro de termos não são executáveis por `anon`/`authenticated`; somente `service_role` possui execução.

## Make — observação da auditoria

Foram encontrados ativos os cenários autorizados de WhatsApp Inbound, WhatsApp Outbound e `consultar no cpf`. Também existem cenários ativos adicionais (`Cadastro 1 Foto...` e `Dona Antônia - CTA URL Cesta (configurável)`). Nenhum cenário adicional foi ativado nesta rodada e nenhum deles foi alterado automaticamente, porque não são necessários para o novo Data Exchange e podem pertencer a outros fluxos operacionais do Admin.

## Arquivos principais

- `whatsapp/flows/flow-cestas-comercial-v6.json`
- `scripts/build-flow-v6.py`
- `scripts/fix-flow-v6-meta.py`
- `.github/workflows/build-flow-v6.yml`
- `supabase/migrations/20260909151900_whatsapp_flow_commercial_visual_v6.sql`
- `supabase/migrations/20260909153200_whatsapp_flow_commercial_meta_screen_ids_v7.sql`
- `supabase/migrations/20260909162146_whatsapp_flow_viable_search_terms_v15.sql`
- `supabase/functions/whatsapp-flow-data-exchange-v1/index.ts`
- `supabase/functions/whatsapp-flow-data-exchange-v1/image.ts`

## Próximo bloco seguro

1. implantar a Edge Function `whatsapp-flow-data-exchange-v1` com o handler V8 já versionado no GitHub;
2. executar Data Exchange ponta a ponta com sessão sintética/homologação sem liberar o gate geral;
3. medir/homologar a conversão real das 9 imagens de cesta e imagens de produtos para os limites do Flow;
4. executar regressão completa de personalização A/B/C, busca segmentada, busca direta, produto extra, upsell e checkout conhecido/novo;
5. gerar novo preview visual da Meta e revisar em aparelho;
6. somente depois preparar `interactive.type=flow` para o número de homologação autorizado, mantendo canary 1% e Bling OFF.
