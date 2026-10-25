# Dona Antônia · Flow de cestas ligado ao Vitrine Admin

**Estado verificado em 25/10/2026:** o Flow Dynamic V2 (`1817973829344642`) permanece em `DRAFT`; o Dynamic V1 (`3300494700136506`) permanece publicado. Esta branch integra o contrato novo do atendimento com a configuração do Vitrine Admin. A alteração de runtime ainda precisa ser implantada e homologada; nesta continuação não houve envio de mensagem nem publicação do Flow.

## Experiência planejada

1. A pessoa escolhe o tamanho vendo o preço inicial da combinação disponível mais barata.
2. O Flow abre diretamente o primeiro tipo de produto habilitado no Admin, na ordem definida por `flow_sort_order`.
3. Cada etapa mostra alternativas com foto, nome, marca, preço unitário e controle de quantidade próprio.
4. O tipo de seleção define se a pessoa pode escolher uma opção ou várias opções, respeitando o limite configurado por opção.
5. O total acompanha as alterações usando preços e estoque atuais. O resumo final mostra itens, quantidades, preços unitários e total.
6. Concluir registra uma solicitação para conferência humana. Não cria pedido nem reserva estoque.

## Contrato do runtime nesta branch

- `basket_flow_shell` fornece tamanhos habilitados e o preço inicial das combinações disponíveis.
- `basket_flow_configuration` devolve configurações do Admin, posições dos moldes, quantidades por tamanho, opções ativas com preço, foto e estoque atuais, além do motivo para posições que permaneçam fixas.
- `basket_flow_quote` valida produtos e quantidades conforme o modo e o limite do tipo, agrega o estoque por SKU e calcula a cotação sem escrever em cesta, pedido ou estoque.
- O mapeamento prioriza `metadata.flow_v1.position_labels` e depois considera os rótulos legados. Uma posição só pode ser editada quando o tipo está habilitado, a quantidade administrativa corresponde à composição e a opção-base está configurada.
- O cálculo mantém os ajustes comerciais do molde e recalcula os produtos com valores atuais.
- As imagens continuam limitadas a hosts e caminhos permitidos, com redimensionamento e validação do conteúdo.

## Ajustes de configuração

- `Miojo` foi associado ao rótulo da posição de lámen por metadado exclusivo do Flow.
- `Macarrão` foi habilitado para a posição de espaguete, separando a quantidade da posição de lámen.
- As quantidades Flow de `Miojo`, `Macarrão` e `Desinfetante` foram alinhadas às posições existentes nos tamanhos ativos.
- Os ajustes alteram somente metadados e a matriz do Vitrine Admin. Não mudam moldes públicos, preços de produtos, estoque ou pedidos.
- A migration `20261025180000_basket_admin_flow_product_group_alignment_v1.sql` registra os mesmos ajustes de forma reprodutível.

## Homologação pendente

- Revisar e integrar esta branch à `main`.
- Implantar as Edge Functions e a migration depois da revisão.
- Validar a estrutura JSON e as telas no Flow Builder oficial da Meta.
- Homologar o atendimento no aparelho interno pelo procedimento existente, restrito ao remetente 1018 e ao destinatário interno 8360.
- Manter o Flow V2 em rascunho até a conferência visual e comercial. Qualquer solicitação recebida exige confirmação humana de preço e disponibilidade.
