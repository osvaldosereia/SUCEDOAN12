# Dona Antônia · Flow de cestas ligado ao Vitrine Admin

**Data:** 25/10/2026  
**Flow de homologação:** Dona Antônia Cestas Básicas Dynamic V2 · ID `1817973829344642` · `DRAFT`  
**Flow publicado:** V1 · ID `3300494700136506`  
**Canal de homologação existente:** remetente 1018 → destinatário interno 8360

## Experiência prevista

1. A pessoa escolhe o tamanho vendo o preço inicial da combinação disponível mais barata.
2. O Flow abre diretamente o primeiro tipo de produto habilitado no Admin, na ordem definida por `flow_sort_order`.
3. Cada etapa lista os produtos configurados no Admin com foto, nome, marca, preço unitário e quantidade atual. Cada opção abre um controle de quantidade próprio.
4. Tipos em modo `multiple` permitem quantidades independentes para várias opções. Tipos em modo `single` mantêm uma opção por posição do molde.
5. O total é recalculado a cada alteração com preços e estoque atuais. O resumo mostra itens, quantidades, preços unitários e total.
6. Concluir o Flow registra somente uma solicitação para conferência humana. Não cria pedido nem reserva estoque.

## Contrato implementado nesta branch

- `basket_flow_shell` carrega tamanhos Flow ativos e calcula o preço inicial a partir das combinações públicas disponíveis.
- `basket_flow_configuration` devolve configurações Flow do Admin, posições dos moldes, quantidades por tamanho, opções ativas com estoque/preço atuais e razões para posições que permanecem fixas.
- `basket_flow_quote` valida as opções e quantidades, agrega o estoque por SKU e calcula a cotação sem escrever em cesta, pedido ou estoque.
- A correspondência prioriza `metadata.flow_v1.position_labels`; depois usa os rótulos legados. Uma posição só pode ser editada se o tipo estiver habilitado, a quantidade do Admin corresponder à composição e o produto inicial estiver cadastrado entre as opções.
- O cálculo da solicitação mantém os ajustes comerciais do molde escolhido e recalcula os produtos com os valores atuais.
- Imagens continuam limitadas aos hosts e caminhos permitidos, com redimensionamento e validação de bytes.

## Ajustes de configuração feitos

- O tipo `Miojo` foi ligado ao rótulo de posição do lámen por metadado exclusivo do Flow.
- O tipo `Macarrão` ficou habilitado no Flow para a posição de espaguete; a quantidade foi separada da posição de lámen.
- As quantidades Flow de `Miojo`, `Macarrão` e `Desinfetante` foram alinhadas às posições existentes nos tamanhos ativos.
- Esses ajustes alteram somente metadados e a matriz do Vitrine Admin. Não mudam moldes públicos, preços de produtos, estoque ou pedidos.

A migração `20261025180000_basket_admin_flow_product_group_alignment_v1.sql` registra os mesmos ajustes de forma reprodutível.

## Estado desta entrega

O código de integração e o novo JSON estão na branch do PR #1410. A Edge Function atualmente ativa continua na versão anterior; o novo contrato ainda não foi implantado. O JSON atualizado ainda não foi enviado à Meta, e o Flow V2 continua em DRAFT. Nesta continuação, não houve envio de mensagem de teste nem publicação.

## Próximas verificações operacionais

- Conferir a integração completa do PR e resolver a diferença com a base atual.
- Validar o JSON revisado no Flow Builder oficial da Meta.
- Implantar as Edge Functions somente depois da revisão do código e da migração.
- Homologar visualmente o rascunho pelo procedimento interno já configurado. A mensagem de canário permanece restrita a 1018 → 8360.
- Não publicar para clientes antes da aprovação visual e comercial; qualquer solicitação recebida exige confirmação humana de preço e disponibilidade.

