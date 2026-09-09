# WhatsApp Flow Dona Antônia — V4 / V27 homologação

Data: 2026-09-09

## Estado

- Flow Meta de homologação: `Dona Antônia - Cestas Comercial V4 Homologação`.
- Meta Flow ID: `1083743527697237`.
- Status Meta: `DRAFT`.
- JSON: `whatsapp/flows/flow-cestas-comercial-v27.json`.
- Meta Graph API v26: `success=true`, `validation_errors=[]`.
- `json_version=7.3`, `data_api_version=3.0`.
- Meta health: `can_send_message=AVAILABLE`.
- V4 no Supabase: `draft`, `candidate_not_live=true`, `default_for_new_sessions=false`.
- V3 permanece `active` e default, handler V12.
- V4 usa handler V15.
- Edge `whatsapp-flow-data-exchange-v1`: versão 23, com roteamento V4 -> V15.
- Bling order sync permanece desabilitado.

## UX V27 validada estruturalmente

- 9 cestas reais na primeira tela.
- Personalização da cesta em uma única etapa, sem preço individual dos componentes.
- Após a cesta, finalização é uma opção direta; adicionar extras não é obrigatório.
- Categorias usam navegação rápida.
- Lista comercial aceita até 20 produtos por página, com mídia compacta e multi-seleção.
- Quantidades aparecem apenas para os produtos selecionados.
- Busca e categorias consultam somente produtos ativos, fisicamente verificados, habilitados no WhatsApp, com preço e estoque.
- O catálogo completo nunca é carregado no Flow.

## Smoke tests reais em transação com rollback

Caminho validado:

`INIT -> CESTAS -> PERSONALIZAR_A -> SECOES_A -> PRODUTOS_A -> QUANTIDADES_A -> SECOES_B -> REVISAO -> CLIENTE_EXISTENTE -> FINALIZAR`

Resultados observados:

- INIT retornou 9 cestas.
- Grande Koblenz retornou total inicial de R$ 420,00.
- Higiene retornou 20 produtos na primeira página.
- Seleção de 3 produtos e quantidades 2/1/1 recalculou para R$ 524,60.
- Revisão retornou `Total do pedido: R$ 524,60`.
- Cliente existente reaproveitou nome/endereço e apresentou 4 formas de pagamento.

## Correção crítica de finalização

Foi detectado que o pedido era persistido corretamente com `orders.total=420.00`, porém um handler anterior podia devolver `final_total=R$ 0,00` na tela terminal.

O V15 corrige isso de forma fail-closed:

1. lê exclusivamente `experience_sessions.context.flow_order_id`;
2. exige que o pedido pertença à mesma conversa;
3. exige `status=confirmed`, `confirmed_at IS NOT NULL` e `total > 0`;
4. se qualquer condição falhar, retorna `FALHA_FINALIZACAO` em vez de sucesso;
5. o total terminal é reconstruído diretamente de `orders.total`.

Teste transacional após a correção:

- pedido vinculado à sessão: confirmado;
- `orders.total=420.00`;
- tela: `FINALIZAR`;
- `final_total=R$ 420,00`;
- `final_total_label=Total: R$ 420,00`;
- número de pedido exibido;
- instrução para retornar ao WhatsApp e enviar localização.

## nfm_reply e localização

`process_whatsapp_flow_nfm_reply_v1` foi endurecido para V1/V2/V3/V4.

- O token é validado pelo hash da sessão para permitir o retorno terminal mesmo depois de a sessão estar `completed`.
- Data Exchange continua impedindo novas interações em sessão concluída.
- A localização só é solicitada quando `flow_order_id` aponta para pedido confirmado, da mesma conversa, com total positivo.
- Entrega duplicada do mesmo `message_id` é idempotente: a segunda execução retorna `duplicate=true` e `location_required=false`.

Teste real em rollback:

- V4 reconhecida no `nfm_reply`;
- primeira entrega: `location_required=true`, `duplicate=false`;
- repetição do mesmo `message_id`: `location_required=false`, `duplicate=true` e sem nova mensagem de localização.

## Segurança de mídia

A Edge hidrata até 20 imagens de produtos por página. Cada imagem compacta passa por limite de payload; quando ultrapassa o orçamento individual, a imagem é omitida em vez de comprometer o Data Channel inteiro.

## Próximo bloco

1. inspeção visual no Preview Meta em celular pequeno;
2. testar paginação `Ver mais`, busca direta, nenhuma seleção e múltiplas categorias;
3. testar caminho de cliente novo e validação de endereço;
4. validar o handoff real de localização no número autorizado;
5. somente depois decidir se V4 substitui V3.

Nenhuma publicação da V4 foi feita nesta rodada.
