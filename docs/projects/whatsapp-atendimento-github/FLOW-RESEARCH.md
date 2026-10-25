# Pesquisa técnica — Configurador de WhatsApp Flows

Projeto: WhatsApp Atendimento GitHub — SUCEDOAN12  
Data da pesquisa: 25/10/2026  
Branch: \`project/whatsapp-atendimento-github-20261025\`  
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
- Flow dinâmico: conversa com um endpoint de dados HTTPS para inicializar telas, fornecer dados e responder a transições. É necessário para conferir preços e regras do servidor durante a jornada.
- A Meta recomenda não criar endpoint quando a jornada não precisa de troca dinâmica, pois um endpoint adiciona latência e operação. Para o caso desta cesta, porém, cálculo e validação de preço tornam o endpoint necessário na etapa transacional.

### 2.2 Protocolo e segurança do endpoint

O endpoint de Flow processa payloads criptografados e responde no formato criptografado definido pela Meta. Os exemplos oficiais mostram o uso de criptografia assimétrica para proteger a chave AES da sessão e AES-GCM para os dados do Flow. A implementação deve verificar os contratos atuais da Meta, distinguir erros de autenticação/assinatura de erros de descriptografia e validar o token de sessão antes de usar qualquer dado recebido.

O endpoint deve tratar, no mínimo:

- \`ping\`: verificação de disponibilidade do endpoint;
- \`INIT\`: abertura e carregamento da primeira tela;
- \`data_exchange\`: mudança de tela que precisa de dados ou validação do servidor;
- conclusão do Flow: retorno separado pelo webhook da Cloud API, normalmente em uma mensagem interativa com o resultado do Flow.

A conclusão do formulário não é o mesmo evento que a chamada de Data Exchange. O webhook precisa correlacionar a sessão pelo \`flow_token\`, processar submissões de forma idempotente e encaminhar a confirmação ao atendimento. Não confirmar pedido nem aceitar preço sem revalidar produto, quantidade, preço e versão da cesta no servidor.

As chaves privadas e tokens Meta devem existir apenas em um runtime de servidor/gerenciador de segredos. Não salvar segredos em JSON, no histórico Git, no Flow JSON, nos logs ou no bundle do navegador. Não registrar o conteúdo descriptografado da submissão em logs comuns.

### 2.3 Componentes e limites de interface

O catálogo oficial da Meta tem componentes de entrada e exibição, incluindo campos de texto, seleção única, seleção múltipla e imagem. O changelog oficial documenta o tipo numérico de \`TextInput\`. Isso dá base para prototipar seleção de produto e quantidade, mas não autoriza a inventar cartões, controles de quantidade +/- ou um carrossel de produto sem verificar a versão atual do schema.

Para a cesta, a interface deve testar a composição real destes elementos:

- uma categoria/tipo de produto por etapa, conforme a preferência já registrada;
- seleção única quando a regra permitir apenas um produto;
- seleção múltipla quando a cesta permitir mais de um item daquele tipo;
- campo numérico para quantidade, limitado e validado pelo servidor;
- resumo e total produzidos com os dados versionados e conferidos pelo endpoint.

A Meta documenta um componente \`Image\`. A documentação de fornecedores também descreve imagem em Flow dinâmico. O builder deverá validar o formato de \`src\`, a forma de inserir imagem estática ou vinculada a dados, os limites da versão atual e o comportamento no WhatsApp real antes de oferecer foto como requisito garantido. Não modelar um “card de produto” proprietário como componente Meta.

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
| Twilio | Distingue \`whatsapp/flows\` nativo da Meta do \`twilio/flows\` próprio; documenta envio por template, suporte a endpoint e \`flow_token\` por sessão | Gerar e administrar o Flow nativo Meta; usar identificador opaco por sessão e não confundir Flow JSON com construtor proprietário do BSP. |
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

A primeira prova de conceito deve responder duas perguntas antes de fechar a interface: se múltiplas opções do mesmo tipo com quantidades independentes cabem numa tela de uso simples; e se as imagens dinâmicas carregam com o contrato da Meta atual. Se não couberem bem, simplificar a primeira versão do Flow para uma escolha por tipo e encaminhar as exceções pelo atendimento conversacional.

### 4.3 Edição guiada e modo técnico

A tela principal deve usar blocos suportados e campos de negócio, em vez de oferecer um canvas genérico de arrastar qualquer coisa. Cada campo deve indicar seu componente Meta correspondente. Um modo JSON pode ajudar a revisar/importar/exportar e resolver detalhes avançados, com validação imediata e erros apontando caminho, tela e componente.

### 4.4 Governança por canal

- Tratar final 0975 e final 1018 como canais isolados. Não inferir IDs de Meta pelo número final.
- Associar WABA ID, phone number ID, Flow ID, primeira tela, versão Graph API e chave pública explicitamente a cada canal.
- Exigir um teste de ponta a ponta para cada número, pois uma configuração válida em um canal não comprova o outro.
- Mostrar o identificador e estado oficiais retornados pela Meta; gravar histórico de versões no GitHub, mas não assumir que o estado local equivale ao estado publicado da Meta.

## 5. Arquitetura recomendada para as restrições atuais

### GitHub

GitHub continua como fonte de verdade versionada para produtos, cestas, modelos e Flow JSON. Os arquivos devem incluir \`schema_version\`, IDs estáveis, preços em centavos e uma referência explícita à revisão aprovada da cesta. Catálogo publicado para o runtime deve ser uma versão identificável e imutável, para que uma sessão não misture preços de commits diferentes.

Como o repositório atual é público, só devem entrar nele dados de produto e configuração comercial que podem ser públicos. Não guardar conversa, contato, pedido, consentimento ou evento de cliente em arquivos versionados.

### Admin sem senha própria

Não criar senha própria atende à preferência atual. Mesmo assim, escrita GitHub requer autorização. Um site estático aberto pode ler e montar alterações, mas não deve escrever por meio de token incorporado no navegador. Até a estratégia de escrita ser aprovada, permitir preview e exportação; a persistência deve passar pela identidade GitHub ou por um servidor que assine a gravação.

### Runtime de Flow fora do Supabase

GitHub Pages pode servir o admin estático, mas não executa o endpoint criptografado da Meta. A cesta ao vivo precisa de um runtime HTTPS fora do Supabase, ainda a selecionar, que:

- implemente o contrato criptográfico oficial e validação das requisições;
- carregue apenas a versão publicada do catálogo/cesta;
- responda a \`ping\`, \`INIT\` e \`data_exchange\`;
- calcule total no servidor e não confie em valores do cliente;
- receba o webhook de conclusão, valide o evento e o correlacione com \`flow_token\`;
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

O repositório oficial \`WhatsApp/WhatsApp-Flows-Tools\` é a principal referência de implementação. Seus READMEs alertam que alguns exemplos de endpoint/webhook são apenas para prototipagem e não estão prontos para produção. Usar os exemplos para entender o protocolo e as formas dos eventos, substituindo em produção por tratamento de erros, validação, proteção de segredos, logs redigidos, idempotência, observabilidade e limites de dados adequados.

O exemplo de webhook demonstra também que o Flow é enviado pela API e que a resposta concluída é tratada no webhook; isso reforça a separação entre endpoint dinâmico e o processamento final pelo atendimento.

## 8. Pendências antes da implementação do configurador

1. Exportar do Vitrine Admin a composição completa das cestas. A exportação CSV encontrada no laboratório de catálogo não contém os vínculos e quantidades necessários; a migração continua bloqueada até receber CSV/JSON apropriado.
2. Definir escrita GitHub sem senha própria e sem token no navegador.
3. Escolher runtime HTTPS fora do Supabase para endpoint e webhook.
4. Confirmar WABA ID e phone number ID dos dois números, sem realizar chamada Meta nesta etapa.
5. Validar no Flow JSON atual o comportamento de imagem dinâmica e seleção múltipla com quantidade por produto.
6. Depois dessas dependências, converter esta pesquisa em design e plano de execução antes de iniciar integração Meta.

## 9. Referências

### Meta e exemplos oficiais

- [WhatsApp Flows — visão geral](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows)
- [Meta — guia para implementar endpoint de Flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint)
- [Meta — referência de componentes](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components)
- [Meta — Flow API](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/flowsapi)
- [Meta — changelog de Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/changelogs)
- [Meta — melhores práticas](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/bestpractices)
- [Repositório oficial WhatsApp-Flows-Tools](https://github.com/WhatsApp/WhatsApp-Flows-Tools)
- [Exemplo oficial Node.js de endpoint básico](https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/endpoint/nodejs/basic)
- [Exemplo oficial Node.js de endpoint para agendamento](https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/endpoint/nodejs/book-appointment)
- [Exemplo oficial de webhook para Flows](https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/webhook/nodejs/flows-webhook)
- [Coleção Meta Postman antiga, marcada como movida/depreciada](https://www.postman.com/meta/whatsapp-business-platform/collection/y5swede/moved-whatsapp-flows-api)

### Plataformas consultadas

- [Infobip — criar e enviar Flows](https://www.infobip.com/docs/whatsapp/whatsapp-flows/build-whatsapp-flows)
- [Infobip — estados e ciclo de vida](https://www.infobip.com/docs/whatsapp/whatsapp-flows/manage-whatsapp-flows)
- [Blip — extensão WhatsApp Flows (português)](https://help.blip.ai/hc/pt-br/articles/18613541808151--Extens%C3%A3o-Como-usar-a-extens%C3%A3o-WhatsApp-Flows-no-Blip)
- [WATI — criar e usar WhatsApp Flows](https://support.wati.io/en/articles/11463180-how-to-create-and-use-whatsapp-flows-in-wati)
- [Twilio — conteúdo nativo \`whatsapp/flows\`](https://www.twilio.com/docs/content/whatsapp-flows)
- [Gupshup — associação de canal e número à configuração](https://docs.gupshup.io/docs/feature-6-flow-feature)

Pesquisa consultada em 25/10/2026. Em divergência de nomenclatura ou capacidade, prevalecem o schema, o changelog e as respostas atuais da Meta.
