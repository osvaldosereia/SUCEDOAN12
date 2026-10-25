# Pesquisa técnica — Configurador de WhatsApp Flows

Projeto: WhatsApp Atendimento GitHub — SUCEDOAN12  
Data da pesquisa: 25/10/2026  
Branch: `project/whatsapp-atendimento-github-20261025`  
Status: pesquisa técnica registrada; nenhum código de integração ou operação Meta foi executado.

## 1. Resumo executivo

WhatsApp Flows permite conduzir jornadas estruturadas com telas, campos e navegação dentro da conversa. A documentação da Meta separa os Flows sem endpoint, usados para formulários mais estáticos, dos Flows dinâmicos, que trocam dados com um endpoint HTTPS. Uma cesta com catálogo, preço, quantidades e total calculado com segurança precisa de backend: a interface do Flow não pode ser a autoridade para preço nem disponibilidade.

A recomendação para este projeto é construir o configurador em duas camadas:

1. Um editor guiado que lê as cestas e produtos versionados no GitHub, gera Flow JSON compatível e oferece revisão, validação e exportação. As telas e mensagens ficam organizadas por cada um dos dois números.
2. Quando o fluxo de cesta estiver fechado, conectar um runtime HTTPS fora do Supabase para Data Exchange, cálculo e validação do pedido. O runtime manterá tokens e chave privada fora do repositório e do navegador.

O admin pode começar sem uma senha própria, mas isso não torna segura a escrita anônima no repositório. Até existir um caminho de escrita autenticado pelo GitHub ou uma gravação no servidor, o MVP deve permitir leitura, edição em preview e exportação; não deve expor token de escrita no navegador.

## 2. O que a Meta documenta

### 2.1 Flow estático e dinâmico

- Flow estático: telas e opções definidas no JSON. Serve para coletar respostas conhecidas. Não deve ser apresentado como se atualizasse estoque, consultasse preço atual ou calculasse um total confiável ao vivo.
- Flow dinâmico: conversa com um endpoint de dados HTTPS para inicializar telas, fornecer dados e responder a transições. É necessário para consultar dados do servidor e validar preços/regras durante a jornada.
- A Meta também oferece a ação `update_data` para atualizar dados da tela após interações, sem navegar nem chamar o endpoint. Ela pode reduzir chamadas para atualizações de interface; precisa ser provada para o cálculo da cesta.
- Para este projeto, o endpoint continua necessário para conferir o total final e validar produto, quantidade, preço e versão da cesta no servidor. Ainda não está decidido se cada interação chamará o endpoint ou se a tela usará `update_data` para feedback imediato e o servidor fará a conferência no avanço/confirmação.

### 2.2 Protocolo e segurança do endpoint

O endpoint de Flow processa payloads criptografados e responde no formato criptografado definido pela Meta. Os exemplos oficiais mostram o uso de criptografia assimétrica para proteger a chave AES da sessão e AES-GCM para os dados do Flow. A implementação deve verificar os contratos atuais da Meta, distinguir erros de autenticação/assinatura de erros de descriptografia e validar o token de sessão antes de usar qualquer dado recebido.

O endpoint deve tratar, no mínimo:

- `ping`: verificação de disponibilidade do endpoint;
- `INIT`: abertura e carregamento da primeira tela;
- `data_exchange`: mudança de tela que precisa de dados ou validação do servidor;
- conclusão do Flow: retorno separado pelo webhook da Cloud API, normalmente em uma mensagem interativa com o resultado do Flow.

A conclusão do formulário não é o mesmo evento que a chamada de Data Exchange. O webhook precisa correlacionar a sessão pelo `flow_token`, processar submissões de forma idempotente e encaminhar a confirmação ao atendimento. Não confirmar pedido nem aceitar preço sem revalidar produto, quantidade, preço e versão da cesta no servidor.

As chaves privadas e tokens Meta devem existir apenas em um runtime de servidor/gerenciador de segredos. Não salvar segredos em JSON, no histórico Git, no Flow JSON, nos logs ou no bundle do navegador. Não registrar o conteúdo descriptografado da submissão em logs comuns.

### 2.3 Componentes e limites de interface

O catálogo oficial da Meta tem componentes de entrada e exibição, incluindo campos de texto, seleção única, seleção múltipla e imagem. O changelog oficial documenta `TextInput` numérico, imagens em opções de listas e, a partir do Flow JSON v6.0, `update_data` para atualizar dados da tela após interações. Isso dá base para prototipar imagens e atualizações na própria etapa; não autoriza inventar cartões nem controles +/- personalizados.

Para a cesta, a interface deve testar a composição real destes elementos:

- uma categoria/tipo de produto por etapa, conforme a preferência já registrada;
- seleção única quando a regra permitir apenas um produto;
- seleção múltipla quando a cesta permitir mais de um item daquele tipo;
- imagem associada a cada opção de produto em componente de lista suportado, respeitando o limite Meta de 100 KB por imagem de opção;
- campo numérico ou seletor de quantidade, limitado e validado pelo servidor;
- `update_data` para testar a atualização imediata da tela quando uma opção for marcada/desmarcada;
- resumo e total recalculados no servidor antes da confirmação.

Há uma diferença entre atualizar a tela por uma seleção e recalcular a cesta a cada tecla digitada num campo numérico. A documentação consultada confirma `update_data` para interações, mas ainda não comprova a experiência exata de cálculo de total para este caso. O protótipo precisa validar se o Flow consegue compor a expressão necessária; se não, o endpoint deve recalcular quando o cliente avançar/confirmar. Em qualquer caminho, o total final confiável é validado pelo servidor.

Não presumir que `init-values` preseleciona o item mais barato da forma desejada até validar o campo no schema atual e no Flow Builder. Essa necessidade comercial continua registrada. Não modelar um “card de produto” proprietário como componente Meta.

### 2.4 Ciclo de vida e publicação

Um Flow nasce em Draft e só pode ser enviado após publicação. A edição de JSON ou metadados de um Flow publicado o devolve para Draft e exige nova publicação. Plataformas maduras tratam publicação como etapa explícita, com teste e validação anteriores; o configurador seguirá o mesmo padrão.

Estados que devem aparecer no admin:

- Draft: editável, ainda não liberado para envio;
- Validado: JSON, vínculo da cesta e endpoint passaram as verificações da aplicação;
- Testado: jornada conferida em número de teste;
- Published: estado lido da Meta, por canal;
- Deprecated, Throttled ou Blocked: exibir o estado devolvido pela Meta sem substituí-lo por uma interpretação local.

O botão de publicar não deve ser automático. Edições devem gerar nova revisão, registrar a versão de dados associada e requerer nova validação e decisão explícita.

### 2.5 API, prévia e retorno do cliente

O Flow JSON define telas, componentes, dados e navegação. A API de Flows administra criação, atualização, upload do JSON, validação/publicação e consulta dos Flows. As chamadas que escrevem na Meta exigem autorização e identificadores oficiais da conta/canal.

A prévia local serve para revisar estrutura e conteúdo, mas a referência final é o Flow Builder/Playground da Meta e um teste em uma conversa real controlada. O resultado enviado pelo cliente volta pelo webhook; não é uma transação de banco no GitHub.

## 3. Padrões observados em plataformas de mercado

| Sistema | Práticas documentadas | O que aplicar no novo admin |
| --- | --- | --- |
| Meta WhatsApp Manager / Flows API | Flow Builder e Playground, JSON, API, Draft/Published e endpoint de dados | Meta permanece a fonte de verdade para schema, erros, IDs e status. Prévia local não será apresentada como validação oficial. |
| Blip | Criar do zero, editor JSON, validação em edição, pré-visualização, teste pelo WhatsApp, configuração de endpoint e estados do Flow | Wizard simples com mensagens de erro por tela/campo, botão “Testar no WhatsApp” e seção técnica para JSON/endpoint. |
| Infobip | Lista por canal e remetente; mostra WABA, Flow ID, primeira tela e estado; API de ciclo de vida; observa estados de saúde do endpoint | Separar os dois números e mostrar estado, último teste, Flow ID, primeira tela e saúde do endpoint em cada canal. |
| WATI | Templates iniciais, criação do zero, duplicação, rascunho/publicação, várias telas reordenáveis; retorno da submissão em JSON completo e atributos por campo | Oferecer modelo “Cesta básica”, duplicação de Flow e organização de cada resposta em campos estáveis além do JSON bruto. |
| Twilio | Distingue `whatsapp/flows` nativo da Meta do `twilio/flows` próprio; documenta envio por template, suporte a endpoint e `flow_token` por sessão | Gerar e administrar o Flow nativo Meta; usar identificador opaco por sessão e não confundir Flow JSON com construtor proprietário do BSP. |
| Gupshup | Configuração de mensagem associa objeto, canal e número antes de enviar | No configurador, pedir o canal/número explicitamente e mostrar para qual remetente uma revisão será usada. |

As plataformas não são uma especificação única. Suas telas servem como referências de operação; componentes, regras e payloads precisam continuar obedecendo à documentação e às respostas atuais da Meta.

## 4. Decisões de produto recomendadas

### 4.1 Navegação do admin

1. **Visão geral:** estado separado dos canais 0975 e 1018, versões de catálogo/cestas, estado do Flow, último teste e alertas.
2. **Produtos:** cadastro simples dos produtos usados nas cestas, identificador estável, nome, marca, preço em centavos, imagem e estado ativo/inativo.
3. **Cestas:** tamanhos Mini, Econômica, Pequena, Média e Grande; tipos de produto; produtos permitidos; quantidades e ordem; menor preço e “A partir de”.
4. **Flows:** seleção de canal, nome/categoria, telas e ligação com uma versão da cesta; wizard em primeiro plano e editor JSON avançado opcional.
5. **Revisão e operação:** diferenças da revisão, erros de validação, prévia, teste, versão associada, estado da Meta e publicação manual.

### 4.2 Experiência recomendada para a cesta

- Começar pelo tamanho da cesta, mostrando o menor valor calculável e texto “A partir de”.
- Avançar por um tipo de produto por tela/etapa, sem despejar a lista inteira de uma vez.
- Mostrar nome e preço unitário. Usar foto apenas quando a integração com o componente oficial estiver validada.
- Oferecer primeiro o produto de menor preço somente quando isso refletir a regra comercial configurada; deixar a escolha clara para o cliente.
- Permitir quantidades/opções conforme a composição cadastrada, com limites explícitos.
- Mostrar resumo e total conferidos pelo servidor antes de enviar a resposta ao atendimento.
- Ao receber submissão, validar novamente a versão do catálogo; se o preço ou composição mudou, retornar para correção/confirmação humana sem aceitar valor antigo silenciosamente.

A primeira prova de conceito deve responder três perguntas antes de fechar a interface: se múltiplas opções do mesmo tipo com quantidades independentes cabem numa tela simples; se as imagens de opção carregam dentro do limite Meta; e se `update_data` consegue exibir o total após seleção e alteração de quantidade sem exigir uma navegação confusa. Se alguma parte não funcionar bem, simplificar a etapa para uma escolha por tipo/quantidade e encaminhar exceções pelo atendimento conversacional.

### 4.3 Edição guiada e modo técnico

A tela principal deve usar blocos suportados e campos de negócio, em vez de oferecer um canvas genérico de arrastar qualquer coisa. Cada campo deve indicar seu componente Meta correspondente. Um modo JSON pode ajudar a revisar/importar/exportar e resolver detalhes avançados, com validação imediata e erros apontando caminho, tela e componente.

### 4.4 Governança por canal

- Tratar final 0975 e final 1018 como canais isolados. Não inferir IDs de Meta pelo número final.
- Associar WABA ID, phone number ID, Flow ID, primeira tela, versão Graph API e chave pública explicitamente a cada canal.
- Exigir um teste de ponta a ponta para cada número, pois uma configuração válida em um canal não comprova o outro.
- Mostrar o identificador e estado oficiais retornados pela Meta; gravar histórico de versões no GitHub, mas não assumir que o estado local equivale ao estado publicado da Meta.

## 5. Arquitetura recomendada para as restrições atuais

### GitHub

GitHub continua como fonte de verdade versionada para produtos, cestas, modelos e Flow JSON. Os arquivos devem incluir `schema_version`, IDs estáveis, preços em centavos e uma referência explícita à revisão aprovada da cesta. Catálogo publicado para o runtime deve ser uma versão identificável e imutável, para que uma sessão não misture preços de commits diferentes.

Como o repositório atual é público, só devem entrar nele dados de produto e configuração comercial que podem ser públicos. Não guardar conversa, contato, pedido, consentimento ou evento de cliente em arquivos versionados.

### Admin sem senha própria

Não criar senha própria atende à preferência atual. Mesmo assim, escrita GitHub requer autorização. Um site estático aberto pode ler e montar alterações, mas não deve escrever por meio de token incorporado no navegador. Até a estratégia de escrita ser aprovada, permitir preview e exportação; a persistência deve passar pela identidade GitHub ou por um servidor que assine a gravação.

### Runtime de Flow fora do Supabase

GitHub Pages pode servir o admin estático, mas não executa o endpoint criptografado da Meta. A cesta ao vivo precisa de um runtime HTTPS fora do Supabase, ainda a selecionar, que:

- implemente o contrato criptográfico oficial e validação das requisições;
- carregue apenas a versão publicada do catálogo/cesta;
- responda a `ping`, `INIT` e `data_exchange`;
- calcule total no servidor e não confie em valores do cliente;
- receba o webhook de conclusão, valide o evento e o correlacione com `flow_token`;
- mantenha chave privada e token Meta num cofre de segredos/variáveis protegidas;
- produza métricas de disponibilidade e latência sem guardar payload pessoal em log.

Não foi escolhido fornecedor de hospedagem nem criada infraestrutura nesta pesquisa. Essa decisão deve considerar custo, operação, disponibilidade e controle de segredos, sem adicionar Supabase.

## 6. Fluxo operacional proposto

1. Editar produtos e cestas em preview.
2. Validar IDs, campos, preços, limites, imagens e regras de cada cesta.
3. Congelar uma revisão de catálogo/cesta para o Flow.
4. Gerar Flow JSON e validar com a versão/schema Meta em uso.
5. Executar verificação do endpoint e da chave pública do número selecionado.
6. Pré-visualizar e enviar para telefone de teste controlado.
7. Conferir abertura, seleção, quantidades, total, submissão e retorno no webhook.
8. Revisar a mudança e só então publicar manualmente o Flow do canal correspondente.
9. Conferir estado publicado e registrar o ID/versão final no GitHub.

Qualquer mudança de cesta ou JSON depois da publicação abre uma nova revisão e exige validação e publicação novamente.

## 7. Não copiar os exemplos oficiais literalmente

O repositório oficial `WhatsApp/WhatsApp-Flows-Tools` é a principal referência de implementação. Seus READMEs alertam que alguns exemplos de endpoint/webhook são apenas para prototipagem e não estão prontos para produção. Usar os exemplos para entender o protocolo e as formas dos eventos, substituindo em produção por tratamento de erros, validação, proteção de segredos, logs redigidos, idempotência, observabilidade e limites de dados adequados.

O exemplo de webhook demonstra também que o Flow é enviado pela API e que a resposta concluída é tratada no webhook; isso reforça a separação entre endpoint dinâmico e o processamento final pelo atendimento.

## 8. Pendências antes da implementação do configurador

1. Exportar do Vitrine Admin a composição completa das cestas. A exportação CSV encontrada no laboratório de catálogo não contém os vínculos e quantidades necessários; a migração continua bloqueada até receber CSV/JSON apropriado.
2. Definir escrita GitHub sem senha própria e sem token no navegador.
3. Escolher runtime HTTPS fora do Supabase para endpoint e webhook.
4. Confirmar WABA ID e phone number ID dos dois números, sem realizar chamada Meta nesta etapa.
5. Validar no Flow JSON atual o comportamento de imagem dinâmica e seleção múltipla com quantidade por produto.
6. Depois dessas dependências, converter esta pesquisa em design e plano de execução antes de iniciar integração Meta.

## Alternativa Meta ao Flow para seleção de produtos e quantidades

### Conclusão da pesquisa

Para selecionar produtos e quantidades, a alternativa nativa mais adequada é o catálogo do WhatsApp com mensagens de produto/catálogo da Cloud API e o carrinho do WhatsApp. A documentação da Meta descreve mensagens multiproduto com até 30 itens do catálogo, agrupados em seções; o cliente pode navegar, ver detalhes, adicionar produtos ao carrinho e enviar um pedido. A Meta também documenta o webhook de pedido. A central de ajuda do WhatsApp descreve a alteração da quantidade de cada item no carrinho.

Isso atende melhor ao requisito de controle de quantidade por item que um campo numérico em Flow: o cliente seleciona os produtos e ajusta as quantidades na interface nativa de carrinho. A conclusão combina duas fontes oficiais — o comportamento do carrinho descrito pelo WhatsApp e a mensagem multiproduto/webhook descritos pela Meta para a plataforma. A interface e disponibilidade precisam ser confirmadas num teste de ponta a ponta para cada número e versão de conta antes de prometer esse comportamento em produção.

O webhook de pedido inclui identificador do catálogo e itens com identificador estável do produto, quantidade, preço do item e moeda. Assim, o backend pode localizar os produtos do GitHub pelo identificador e validar o pedido recebido.

### Comparação das ferramentas Meta

| Ferramenta | O que o cliente consegue fazer | Uso recomendado neste projeto |
| --- | --- | --- |
| Flow | Preencher uma jornada estruturada com campos e telas; usar TextInput numérico para digitar valores; consultar endpoint dinâmico. Não há um componente nativo de carrinho com controle +/- documentado para montar uma cesta. | Dados estruturados complementares, como endereço ou preferências, se o teste comprovar boa experiência. Não depender dele para resolver sozinho a seleção e quantidade por produto. |
| Mensagens de catálogo/produtos + carrinho | Ver produtos do catálogo, adicionar mais de um item e ajustar o pedido no carrinho; a submissão retorna como evento de pedido no webhook. | Caminho recomendado para seleção de produtos e quantidade dentro do WhatsApp. |
| Lista interativa | Escolher uma opção em menu; a API documenta até 10 linhas no total. Não adiciona produto nem controla quantidade no carrinho. | Escolher tamanho da cesta, etapa ou intenção antes de abrir a seleção de produtos. |
| Botões de resposta | Escolher entre até três respostas predefinidas. Não adiciona produto nem controla quantidade no carrinho. | Confirmações curtas: continuar, voltar, falar com atendente. |

A visão geral dos catálogos da Meta informa que mensagens enviadas pela Cloud API não exibem um ícone de carrinho persistente no cabeçalho da conversa. A jornada precisa abrir o catálogo por uma mensagem de catálogo/produto apropriada. Isso não elimina a mensagem de pedido que retorna do carrinho iniciado pela experiência de catálogo; precisa ser conferido no teste do número real.

### Jornada recomendada para as cestas

1. O bot pergunta o tamanho da cesta com lista ou botões.
2. O sistema explica as quantidades esperadas para aquele tamanho e envia a seleção de produtos elegíveis em mensagens multiproduto do catálogo, agrupadas por tipo quando isso couber nos limites do formato.
3. O cliente adiciona os itens e ajusta suas quantidades no carrinho nativo.
4. Ao receber o evento de pedido, o servidor associa product_retailer_id aos registros versionados no GitHub e confere quantidades por tipo, produtos permitidos, preço atual e versão da composição.
5. Se o pedido não respeitar a composição da cesta, o atendimento pede o ajuste ou encaminha para uma pessoa. Se estiver válido, apresenta resumo e solicita a confirmação comercial.

O carrinho dá controle de quantidade ao cliente, mas não aplica as regras específicas da cesta por conta própria. Limites como “exatamente dois produtos deste tipo”, lista de produtos elegíveis por tamanho ou estoque precisam ser validados pelo servidor após a submissão. A FAQ do WhatsApp descreve o envio do carrinho como início do pedido; a confirmação do vendedor continua sendo uma etapa comercial.

### Dados e integração

GitHub permanece como fonte de verdade do novo projeto. Para que o WhatsApp mostre cartões e permita iniciar o carrinho, os produtos também precisam existir em um catálogo do Meta Commerce Manager vinculado à WABA/número usado pela Cloud API. Esse catálogo é uma cópia de distribuição para o WhatsApp, não um banco alternativo do projeto nem um uso de Supabase.

Cada produto deve ter ID estável no GitHub, correspondente ao product_retailer_id do catálogo Meta. O admin pode, numa etapa posterior, gerar uma exportação/sincronização revisável para esse catálogo. Nenhuma sincronização ou chamada à Meta foi realizada nesta pesquisa.

A primeira prova deve usar um catálogo e telefone de teste controlados e confirmar: renderização dos produtos, adição de itens, alteração de quantidade, envio do carrinho, recebimento do webhook e validação das regras da cesta. Também deve conferir como o carrinho se comporta quando a jornada envia mais de uma mensagem de produto. A Meta limita a mensagem multiproduto a 30 itens agrupados em seções; templates multiproduto podem organizar até 30 itens em até 10 seções. Listas interativas comuns têm até 10 linhas. Templates têm regras próprias de categoria, aprovação e envio.

### Recomendação de escopo

A recomendação preliminar de usar o carrinho nativo para resolver quantidades se aplica a compras livres cujo total seja a soma dos preços do catálogo. Depois de compreender a composição real da cesta SUCEDOAN12 — dez posições, quantidades padrão, substituição de marca, exclusão e preço-base com ajuste interno — essa recomendação deixa de ser adequada como jornada principal.

Para esta cesta, a hipótese principal passa a ser Flow dinâmico com endpoint privado: escolha de marca, seletor por lista de quantidades, zero para retirar o item, recálculo ao avançar e total final validado no servidor. O Flow não tem um controle de carrinho com botões +/−; se o controle visual +/− for prioritário, o catálogo/carrinho pode ser provado como alternativa, aceitando que o valor comercial final será recalculado e mostrado depois do envio do carrinho.

A análise específica, fórmula de preço, comparação de Meta e plataformas e sequência recomendada estão em [BASKET-ORDER-RESEARCH.md](BASKET-ORDER-RESEARCH.md). O adicional confidencial não deve ir para o repositório público nem para o JSON do Flow. Nenhuma implementação ou operação Meta foi feita.

## 9. Referências

### Meta e exemplos oficiais

- [WhatsApp Flows — visão geral](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows)
- [Meta — guia para implementar endpoint de Flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint)
- [Meta — referência de componentes](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components)
- [Meta — Flow API](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/flowsapi)
- [Meta — changelog de Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/changelogs)
- [Meta — changelog de componentes e ações](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/changelog/)
- [Meta — melhores práticas](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/bestpractices)
- [Repositório oficial WhatsApp-Flows-Tools](https://github.com/WhatsApp/WhatsApp-Flows-Tools)
- [Exemplo oficial Node.js de endpoint básico](https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/endpoint/nodejs/basic)
- [Exemplo oficial Node.js de endpoint para agendamento](https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/endpoint/nodejs/book-appointment)
- [Exemplo oficial de webhook para Flows](https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/webhook/nodejs/flows-webhook)
- [Coleção Meta Postman antiga, marcada como movida/depreciada](https://www.postman.com/meta/whatsapp-business-platform/collection/y5swede/moved-whatsapp-flows-api)

- [Meta — mensagens multiproduto](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/multi-product-messages/)
- [Meta — templates de mensagens multiproduto](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/mpm-template-messages)
- [Meta — respostas a mensagens de catálogo](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/receive-responses/)
- [Meta — webhook de pedido](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/order)
- [Meta — visão geral dos catálogos](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/catalogs-overview/)
- [Meta — mensagens interativas de lista](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages)
- [Meta — mensagens interativas de botões](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages)
- [WhatsApp Help Center — como fazer um pedido usando o carrinho](https://faq.whatsapp.com/5495780857144067/?cms_platform=iphone&locale=pt_BR)
- [Meta Newsroom — carrinhos no WhatsApp](https://about.fb.com/news/2020/12/making-it-easier-to-shop-on-whatsapp-with-carts/)

### Plataformas consultadas

- [Infobip — criar e enviar Flows](https://www.infobip.com/docs/whatsapp/whatsapp-flows/build-whatsapp-flows)
- [Infobip — estados e ciclo de vida](https://www.infobip.com/docs/whatsapp/whatsapp-flows/manage-whatsapp-flows)
- [Blip — extensão WhatsApp Flows (português)](https://help.blip.ai/hc/pt-br/articles/18613541808151--Extens%C3%A3o-Como-usar-a-extens%C3%A3o-WhatsApp-Flows-no-Blip)
- [WATI — criar e usar WhatsApp Flows](https://support.wati.io/en/articles/11463180-how-to-create-and-use-whatsapp-flows-in-wati)
- [Twilio — conteúdo nativo `whatsapp/flows`](https://www.twilio.com/docs/content/whatsapp-flows)
- [Gupshup — associação de canal e número à configuração](https://docs.gupshup.io/docs/feature-6-flow-feature)

Pesquisa consultada em 25/10/2026. Em divergência de nomenclatura ou capacidade, prevalecem o schema, o changelog e as respostas atuais da Meta.
