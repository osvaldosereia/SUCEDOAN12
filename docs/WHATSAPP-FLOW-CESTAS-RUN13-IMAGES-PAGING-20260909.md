# WhatsApp Flow Dona Antônia — Run 13 — imagens, quantidade e paginação

Data: 2026-09-09

## Escopo desta rodada

Evolução segura do Flow comercial de cestas sem exposição a clientes: quantidade máxima, simplificação da personalização, mídia pré-comprimida, produtos extras em páginas de três e upsell curto.

## Gates finais preservados

Estado confirmado no `automation_config` ao final da rodada:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum candidato V26/V11 foi ativado para clientes.

## Personalização da cesta

O runtime do personalizador ficou alinhado com a decisão comercial mais recente:

- todos os componentes possíveis permanecem na mesma tela via Dropdown;
- quantidade original vem pré-selecionada;
- labels são `1 unidade`, `2 unidades` etc.; não usar `atual`;
- `0 · Retirar` continua quando permitido;
- cliente pode selecionar no máximo 6 unidades por produto;
- aumentos também respeitam o estoque disponível;
- estoque legado baixo não altera silenciosamente uma quantidade que já pertence à composição oficial da cesta;
- preços individuais dos componentes continuam ocultos;
- uma única atualização recalcula a cesta.

Migrations relacionadas nesta rodada: V33.

## Imagens — correção estrutural

Foi substituída a estratégia de depender somente de transcodificação WebP/AVIF durante a sessão.

Criado o bucket público controlado `whatsapp-flow-assets`, exclusivo para JPEG leve do Flow. O GitHub Action `Sync WhatsApp Flow Images` executa `scripts/sync-whatsapp-flow-assets.py` e:

1. pré-comprime as 9 imagens canônicas de cesta;
2. consulta somente produtos realmente vendáveis no canal WhatsApp;
3. pré-comprime as imagens desses produtos;
4. envia os JPEGs ao bucket usando a Service Role disponível somente no GitHub Secret;
5. mantém a imagem original apenas como fallback de runtime.

Resultado observado nesta rodada:

```text
baskets: 9 imagens, 15.001–19.025 bytes
products: 223 imagens, 4.164–18.994 bytes
mime: image/jpeg
```

A Edge `whatsapp-flow-data-exchange-v1` foi implantada na versão 14 e agora prefere:

```text
baskets/<stem-da-imagem>.jpg
products/<product_uuid>.jpg
```

Somente se o JPEG pronto não existir ela tenta a URL original/transcodificação. O fallback visual foi trocado de pixel verde para branco neutro. Uma futura V26 esconde o componente `Image` quando `has_*_image=false`, eliminando também o quadrado vazio em falha total.

## Produtos extras — candidato de 3 por vez

Foram criadas as funções candidatas V35/V36, ainda não roteadas pela Edge publicada:

- `get_whatsapp_flow_product_results_page_v1`: pagina uma busca real em blocos máximos de 3;
- `get_whatsapp_flow_product_page_options_v1`: formata 3 produtos visuais e, abaixo, opções simples `Ver mais produtos`, `Outras categorias`, `Concluir pedido`;
- `handle_whatsapp_flow_commercial_exchange_v10`: navegação da paginação, retorno para categorias, conclusão para upsell e guarda server-side de quantidade;
- `handle_whatsapp_flow_commercial_exchange_v11`: limita o upsell a no máximo 3 sugestões opcionais.

Teste determinístico com busca `sabonete` retornou 10 produtos reais no conjunto total, porém apenas 3 produtos por página. Página 1 e página 2 foram verificadas sem carregar catálogo completo.

A validação server-side do candidato rejeita quantidade de adicional maior que `min(6, estoque)`, mesmo que um cliente tente forjar o payload do Flow.

## UX V26 em preparação

Criados:

```text
scripts/build-flow-v26-simple-products.py
.github/workflows/build-flow-v26.yml
```

A V26 candidata parte da V25 e prepara:

- remoção de `atual` também dos exemplos estáticos;
- total atual em `TextSubheading` no início da etapa de adicionais;
- textos mais curtos e sem `opcional` no campo de busca;
- Dropdown de quantidade para produto extra;
- componente de imagem condicionado a `has_basket_image` / `has_product_image`;
- navegação simples dos resultados em blocos de três.

O candidato não deve substituir V25 nem virar default até passar pelo validador oficial da Meta. Se a Meta não aceitar paginação retornando à mesma tela, a V26 deve ser ajustada para páginas forward-only explícitas sem alterar o backend determinístico.

## Make auditado

Mantidos ativos os cenários operacionais existentes de inbound e outbound. O outbound contém rota `interactive.type=flow`; o inbound transporta `interactive.nfm_reply.body` e `interactive.nfm_reply.response_json` para o Supabase. Cenários temporários de criação/validação/publicação de Flow encontrados nesta rodada estavam inativos e permaneceram assim.

## Próxima rodada

1. confirmar geração automática do JSON V26;
2. criar Flow Meta de homologação separado e validar V26 sem publicar;
3. se a Meta aceitar a navegação de mesma tela, conectar V26 ao handler V11 apenas no clone de homologação;
4. executar Data Exchange criptografado com as novas imagens pré-comprimidas;
5. validar visualmente 9 cestas e amostras de produtos extras;
6. validar `Ver mais`, `Outras categorias`, `Concluir`, upsell máximo 3, cadastro conhecido/novo, revisão, finalização e `nfm_reply`;
7. manter os gates OFF/1 até autorização explícita do proprietário.
