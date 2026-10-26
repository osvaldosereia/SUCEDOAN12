# Pesquisa técnica — montagem e preço de cestas no WhatsApp

Projeto: WhatsApp Atendimento GitHub — SUCEDOAN12  
Data: 25/10/2026  
Branch: project/whatsapp-atendimento-github-20261025  
Estado: pesquisa e recomendação; nenhuma tela foi implementada nem operação Meta executada.

> **Fonte de dados vigente por decisão do usuário (26/10/2026):** cesta/composição e rascunhos Flow ficam no GitHub. Produtos, estoque e imagens são lidos do Supabase, somente para os produtos que compõem as cestas; disponibilidade usa a view operacional Supabase mais reservas idempotentes dos pedidos do projeto. Esta regra substitui as sugestões históricas abaixo que pressupõem um catálogo GitHub.

## Resposta executiva

A cesta descrita não é um carrinho livre. É uma composição comercial com 10 posições, quantidades padrão, alternativas de marca, remoção opcional e um preço inicial próprio. A ferramenta precisa recalcular o preço da cesta pelas regras do negócio, não apenas somar produtos do catálogo.

Recomendação para a cesta SUCEDOAN12: Flow dinâmico da Meta, ligado a um endpoint HTTPS privado de cálculo e validação. Para cada produto, o Flow mostra a imagem, as marcas permitidas, o preço da opção, uma seleção de quantidade e a opção de retirar o item. O cliente pode selecionar uma quantidade em uma lista, mas não existe na lista de componentes oficiais consultada um controle nativo de carrinho com botões +/− dentro do Flow.

A mensagem de catálogo e o carrinho nativo continuam sendo a melhor experiência visual de quantidade. Como o carrinho trabalha com os preços dos produtos do catálogo e não conhece o preço-base próprio nem o adicional interno da cesta, ele não deve ser a autoridade do preço final. Pode ser usado se a empresa aceitar validar e informar o valor correto depois que o cliente enviar o carrinho.

## Regras da cesta que o sistema precisa representar

- Cada tamanho de cesta tem 10 produtos base distintos e uma quantidade inicial por produto.
- Um produto pode ter até seis marcas/SKUs alternativos.
- Cada alternativa tem identificador estável e preço unitário próprio.
- A quantidade pode mudar e zero representa retirar aquele produto.
- O tamanho da cesta tem um preço inicial comercial próprio, que pode diferir da soma das quantidades padrão.
- O valor interno adicional não deve aparecer como linha separada; o cliente deve ver o preço final correto antes de confirmar.

Uma fórmula inicial, a validar com a regra comercial real:

Preço final da cesta = ajuste interno daquele tamanho + soma(preço unitário da marca escolhida × quantidade escolhida).

O ajuste interno é calculado de modo que a composição padrão reproduza exatamente o preço inicial da cesta. A composição, os produtos e as quantidades podem continuar versionados no GitHub. Como o repositório SUCEDOAN12 é público, um valor comercial confidencial não deve ser gravado no JSON público: guardar esse ajuste em configuração privada do endpoint. Isso não exige Supabase.

## Comparação das ferramentas oficiais da Meta

| Ferramenta | Marca, quantidade e remoção | Preço da cesta | Adequação |
| --- | --- | --- | --- |
| Catálogo + mensagem multiproduto + carrinho | Mostra produtos do catálogo; o cliente adiciona, altera quantidades e remove itens no carrinho. Uma mensagem multiproduto mostra até 30 produtos. O pedido retorna pelo webhook. | O carrinho apresenta um total estimado a partir dos itens e preços do catálogo. Não calcula sozinho o preço-base da cesta nem o adicional interno por tamanho. | Boa experiência de compra livre e controle de quantidade; inadequado como fonte final de preço para esta cesta personalizada. |
| Flow estático | Pode organizar telas e campos de seleção. É adequado a opções fixas, mas não consulta preço atual nem aplica sozinho uma regra comercial privada. | Não é autoridade para cálculo comercial dinâmico. | Não usar sozinho para fechar preço e composição. |
| Flow dinâmico + endpoint | Pode oferecer seleção de marca e quantidade por tela e validar cada avanço no servidor. O endpoint fornece os dados da tela seguinte. Quantidade zero pode representar remoção, com validação do servidor. | O endpoint calcula o preço final com o ajuste interno incluído no total, sem expor esse ajuste como uma linha separada. | Melhor encaixe para cesta com preço próprio e regras por produto. |
| Listas e botões de conversa | Servem para escolhas curtas, mas multiplicariam as perguntas para marcas e quantidades dos 10 itens. | O servidor ainda teria de manter estado e recalcular a cesta. | Úteis para iniciar e confirmar; não recomendados como editor inteiro. |

A documentação Meta descreve Data Exchange quando uma tela é enviada, permitindo ao endpoint devolver dados dinâmicos e controlar a próxima tela. A documentação também exige a comunicação criptografada do endpoint. Portanto, o total pode ser recalculado no servidor após cada etapa “Continuar” e aparecer atualizado na tela seguinte. Atualização instantânea a cada toque, sem avançar, não será prometida até um protótipo provar o comportamento exato dos componentes e ações da versão vigente.

### Experiência proposta no Flow

1. O atendimento pergunta o tamanho da cesta em uma lista/botões.
2. O Flow abre com a composição correspondente congelada numa revisão do GitHub.
3. Em cada etapa, o cliente vê um produto e escolhe uma marca. A tela mostra opções e preços aplicáveis.
4. A quantidade vem pré-preenchida com a quantidade padrão e pode ser escolhida em uma lista de valores permitidos; zero significa retirar o produto.
5. Ao tocar em “Continuar”, o endpoint valida a marca e a quantidade, recalcula o total e devolve a etapa seguinte com o total atualizado.
6. No fim, o Flow é concluído; o webhook recebe a resposta. O servidor recalcula novamente, valida a versão dos dados e envia um resumo com o total final para o cliente confirmar.
7. Se os dados não forem válidos, o atendimento pede correção ou transfere para uma pessoa.

A lista de marcas deve respeitar as recomendações de interface da Meta para quantidade de opções. A prévia do Flow Builder não comprova o cálculo do endpoint; a jornada precisa ser testada em aparelho/número controlado. Se a regra permitir selecionar duas marcas ao mesmo tempo dentro de uma mesma posição, isso precisa ser prototipado como requisito adicional; a proposta inicial assume uma marca por posição e quantidade ajustável.

## Por que o carrinho nativo não é a solução principal

O carrinho Meta resolve a necessidade visual de somar, adicionar, alterar quantidade e remover produtos. A central de ajuda documenta o ajuste de quantidade no carrinho e a Meta documenta o webhook do pedido. Contudo, o carrinho recebe produtos com preços do catálogo e apresenta um total estimado desses itens. Ele não recebe automaticamente o tamanho da cesta nem a regra de preço inicial + ajuste interno.

Há um caminho híbrido: o cliente monta o carrinho e o envia; o servidor valida a composição, calcula o preço comercial final e responde com o valor final antes da confirmação. A Meta também documenta, no Brasil, uma mensagem de detalhes de pedido simplificada que pode apresentar somente o total para cobrança. Isso não atualiza o total durante a edição e pode fazer o cliente ver primeiro a soma provisória do carrinho; precisa ser avaliado como uma jornada separada, não tratado como equivalente ao Flow dinâmico.

## Práticas observadas em plataformas de atendimento

| Plataforma | Prática documentada | O que ensina para este projeto |
| --- | --- | --- |
| respond.io | Liga catálogo Meta à WABA, permite habilitar “Add to Cart”, mostra o pedido no Inbox e automatiza Workflows. | Catálogo, inbox e workflow cuidam da operação; o comportamento de preço continua vindo dos produtos e do carrinho Meta. |
| Infobip | Elemento multiproduto no chatbot; até 30 produtos; ações para adicionar, ver estimativa, remover e enviar pedido. | A plataforma automatiza o uso do carrinho Meta, sem transformar o carrinho em uma composição de cesta com preço proprietário. |
| WATI | Painel de pedidos de catálogo mostra itens e valor do carrinho; tem respostas automáticas e captura posterior de endereço/pagamento. A documentação consultada informa que o checkout automático com pagamento está em beta para a Índia. | A gestão de pedidos e captura de dados podem ser automatizadas, mas a disponibilidade precisa ser conferida para o Brasil e não substitui a regra de preço da cesta. |
| Blip | Cria e envia Flows definidos por Flow JSON e documenta endpoint/chave pública para comunicação protegida. | Para preço e regra próprios, a camada de dados do Flow continua necessária, mesmo usando um construtor de plataforma. |

O padrão comum observado é usar as primitivas da Meta — Flow, catálogo, carrinho, webhooks — e acrescentar automação, inbox e integrações do fornecedor. Nenhuma documentação consultada demonstra que essas plataformas resolvam automaticamente o preço específico da cesta SUCEDOAN12.

## Preço, transparência e privacidade

O ajuste interno pode ficar incorporado ao preço da cesta sem ser exibido como uma linha separada. O total cobrado, porém, deve aparecer claramente antes da confirmação do cliente. O Código de Defesa do Consumidor exige informação correta, clara, precisa e ostensiva sobre preço, quantidade e composição. Esta orientação é de desenho do sistema; não substitui análise jurídica específica.

Não enviar o ajuste interno no Flow JSON, no navegador ou em arquivos públicos do GitHub. O endpoint deve calcular o total com dados próprios e retornar apenas os valores necessários para exibição. O servidor também deve revalidar preços e composição no fechamento, manter idempotência no webhook e identificar qual número/canal iniciou a jornada.

## Decisão recomendada e limites

1. Basear o editor de cesta em Flow dinâmico e cálculo server-side, não no carrinho nativo como autoridade do valor final.
2. Usar seleção de marca e lista de quantidades, com zero para exclusão; não desenhar um controle +/− fictício no Flow.
3. Recalcular o total ao avançar cada etapa. Validar qualquer ação de atualização imediata separadamente.
4. Manter GitHub como fonte versionada de produtos e composição; manter ajuste confidencial em configuração privada do endpoint.
5. Usar lista/botões para abrir a jornada e, futuramente, considerar carrinho Meta para compras livres ou itens adicionais.
6. Antes da implementação final, provar: preço padrão reproduz a cesta atual; mudança de marca recalcula corretamente; aumento/diminuição de quantidade altera total; quantidade zero remove; preço final fica visível antes da confirmação; e a resposta é processada em ambos os números.
7. Nenhum código, endpoint, catálogo ou Flow foi criado nesta rodada de pesquisa.

## Fontes

### Meta e WhatsApp

- [Meta — implementar endpoint para Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint)
- [Meta — componentes de Flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components)
- [Meta — melhores práticas de Flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/bestpractices)
- [Meta — changelog de Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/changelogs)
- [Meta — mensagens multiproduto](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/multi-product-messages/)
- [Meta — webhook de pedido](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/order)
- [WhatsApp Help Center — pedido pelo carrinho](https://faq.whatsapp.com/5495780857144067/?cms_platform=iphone&locale=pt_BR)
- [Meta — pedidos e pagamentos no Brasil](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orders)
- [Código de Defesa do Consumidor, art. 31](https://www.consumidor.gov.br/pages/conteudo/publico/102)

### Plataformas

- [respond.io — catálogo de produtos Meta](https://respond.io/help/whatsapp/meta-product-catalog)
- [Infobip — elementos de canal para chatbot](https://www.infobip.com/docs/answers/chatbot-elements/channels)
- [WATI — gerenciar pedidos do catálogo](https://support.wati.io/en/articles/11463058-viewing-and-managing-catalog-orders)
- [WATI — checkout automático e pagamentos](https://support.wati.io/en/articles/11463061-how-to-enable-auto-checkout-and-collect-payment-for-my-catalog-orders)
- [Blip — WhatsApp Flows](https://help.blip.ai/hc/en-us/articles/19143153044375-What-is-WhatsApp-Flows)

Pesquisa consultada em 25/10/2026. Prevalecem os schemas, limites e estados que a Meta devolver no Flow Builder/API durante a prova controlada.


## Atualização — fechamento do pedido com cadastro de cliente — 25/10/2026

A proposta detalhada para concluir o Flow está em [ORDER-FLOW-CHECKOUT-DESIGN.md](ORDER-FLOW-CHECKOUT-DESIGN.md). O Flow não deve solicitar o próprio telefone: o backend associa a sessão ao remetente/canal por flow_token e usa o evento de conclusão para confirmar o número. O cadastro e endereços são consultados pelo backend Supabase; produto e cesta continuam no GitHub. Depois de concluir o Flow, o sistema envia na conversa o resumo sem preços unitários, com total final, pagamento, nome/endereço e botões Confirmar pedido, Editar pedido e Cancelar. Só a ação explícita Confirmar pedido cria o pedido, por serviço canônico após auditoria. Nesta etapa não houve programação nem escrita no Supabase.
