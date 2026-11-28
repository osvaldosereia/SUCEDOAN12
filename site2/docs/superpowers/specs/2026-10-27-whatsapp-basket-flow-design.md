# Flow de cesta básica no WhatsApp — desenho funcional

**Status:** contrato e Flow JSON candidato local para uma tela por posição; Validator e homologação visual individual nos dois números ainda são pendentes.

## Intenção

Permitir que o cliente monte uma cesta básica no WhatsApp com uma etapa simples por categoria/posição: ver as alternativas com foto e preço, escolher uma, informar a quantidade de `0` a `6` e tocar em **Próximo**. Ao final escolhe pagamento, confirma o cadastro/endereço encontrado ou informa dados novos, revisa itens e total geral, e conclui o Flow. Essa conclusão cria apenas uma intenção pendente; o pedido operacional só nasce depois da confirmação explícita enviada à conversa.

## Requisitos fixos do projeto

- Cada posição configurada na cesta tem uma tela lógica de escolha e mantém sua ordem, mesmo quando a quantidade escolhida é zero.
- As quantidades permitidas são `0`, `1`, `2`, `3`, `4`, `5` e `6`. Zero retira aquela posição do pedido final.
- Ao voltar para editar uma posição, a quantidade continua selecionada enquanto o produto for o mesmo. Se trocar de produto, a quantidade volta vazia e precisa ser escolhida de novo; isso evita carregar por engano a quantidade do item anterior.
- Toda alternativa exibida precisa ter foto válida; uma foto ausente/inválida bloqueia o Flow da cesta inteira. A imagem precisa aparecer no WhatsApp, não basta existir no payload ou no Supabase.
- Mostrar o preço de cada alternativa na escolha para apoiar a decisão. No resumo final mostrar somente nome, quantidade e total geral; não discriminar preços individuais nem o adicional oculto do combo.
- O valor total é calculado em centavos pelo backend a partir do snapshot da cesta. O preço no Flow é informativo; o servidor recalcula novamente antes da confirmação comercial.
- Identificar cliente pelo E.164 confiável associado à sessão e ao cadastro. Não inferir identidade por nome nem converter BSUID/identificador opaco em telefone.
- Cliente encontrado: exibir o nome e pedir confirmação explícita de um endereço ativo, ou permitir cadastrar outro. Cliente novo: coletar nome e endereço. Não gravar cliente/endereço no cadastro canônico antes da confirmação final do pedido.
- Se a consulta falhar ou divergir para um cliente já associado à sessão (`customer_mode="review"`), interromper checkout e encaminhar para revisão humana; nunca reinterpretar esse caso como cliente novo.
- Exigir pelo menos uma posição com quantidade maior que zero antes de abrir pagamento. Se todas estiverem zeradas, continuar na última posição e pedir escolha de produto.
- Concluir o Flow não confirma compra, não reserva estoque, não cria pedido, não emite nota e não chama o Bling.
- Cada conclusão de Flow e cada carrinho nativo Meta são pedidos separados, sem agrupamento por conversa ou tempo. O pedido de Catálogo posterior não altera nem completa este Flow.

## Abordagens e decisão de implementação

1. **Uma tela dinâmica por posição com `RadioButtonsGroup` fotográfico + seletor de quantidade — escolhida.** A referência oficial confirma `image` Base64 e `alt-text` nas opções do `RadioButtonsGroup` desde Flow JSON 5.0. Isso corresponde ao pedido original: escolher produto e quantidade na mesma tela e tocar em **Próximo**, sem repetir as posições como telas de lista e quantidade. Cada posição é carregada dinamicamente do snapshot do servidor.
2. **`NavigationList` e uma tela de quantidade por posição.** A referência oficial também confirma imagens em `NavigationList`, mas essa abordagem exige um toque adicional por posição e não corresponde à tela única pedida. Mantida somente como contingência caso o Flow Validator rejeite a combinação de radio group com seletor de quantidade.
3. **Flow estático diferente para cada cesta.** Descartada porque mudanças no catálogo exigiriam editar/publicar muitos arquivos e os moldes têm tamanhos diferentes. O Admin e o Data Endpoint continuam fornecendo alternativas/posições dinamicamente.

### Evidência oficial da Meta e versões

Fontes primárias verificadas em 27/10/2026: [referência Flow JSON](https://developers.facebook.com/docs/whatsapp/flows/reference/flowjson), [componentes Flow](https://developers.facebook.com/docs/whatsapp/flows/reference/components), [changelog e versões suportadas](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/changelogs#currently-supported-versions), [implementação do Flow Endpoint e assinatura do token](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint#enhanced-endpoint-security), [ferramentas e exemplos oficiais da Meta](https://github.com/WhatsApp/WhatsApp-Flows-Tools).

- O componente `RadioButtonsGroup` declara opções com `id`, `title`, `description`, `enabled`, `image` (Base64) e `alt-text` a partir do Flow JSON 5.0; o JSON 7.3 suporta isso. O preço unitário aparece em `description`; custo, UUID e ajuste oculto não aparecem.
- Ao trocar a alternativa, o radio group usa `on-select-action` com `data_exchange` para limpar imediatamente a quantidade. O servidor também compara `initial_product_id` no clique de **Próximo** como proteção de fallback. O repositório oficial [WhatsApp Flows Tools](https://github.com/WhatsApp/WhatsApp-Flows-Tools/issues/1) demonstra `on-select-action`/`data_exchange` em componente de seleção; a validação da propriedade exata em `RadioButtonsGroup` 7.3 fica pendente do Validator oficial porque a referência de componentes retornou HTTP 429 nesta consulta.
- `NavigationList` também aceita `start.image` Base64; a Meta documenta limite de 100 KB por imagem nessa lista e alerta que WebP não é suportado no iOS anterior ao 14. Para `RadioButtonsGroup`, o trecho consultado não especifica um limite de imagem equivalente; o Validator e a inspeção visual continuam obrigatórios. O serializador local reduz imagens para aproximadamente 46 KB antes de Base64.
- A referência oficial de Flow JSON usa `version="7.3"` com `data_api_version="3.0"` e descreve `3.0` como a versão atual do canal. O changelog define Data API `4.0` como requisito para habilitar a assinatura opcional `flow_token_signature` em Flow JSON `7.3+`. Portanto, o artefato candidato usa Flow JSON `7.3`/Data API `3.0`, que corresponde ao protocolo explícito do endpoint; Data API `4.0` fica como evolução separada para confirmar por Builder/Validator e por WABA antes de ativar a assinatura. O endpoint confere o `body.version` com o `data_api_version` persistido na sessão.
- A Meta documenta `flow_token_signature` como JWT HS256 opcional, enviado apenas com JSON `7.3+` e Data API `4.0+`. O endpoint local verifica assinatura e igualdade do `flow_token` sempre que esse campo chega, usando o App Secret escolhido pela conta. A autenticação de plataforma descrita pela Meta é aplicada do lado dela; esta verificação de token é defesa adicional.

## Sequência de telas e ações

### 1. `BASKET_PRODUCT` — produto e quantidade da posição atual

- Cabeçalho com `position_label` e indicador `position_index + 1` de `position_count`.
- Um `Form` contém `RadioButtonsGroup` (`name="selected_product_id"`) com as alternativas ativas da posição. Cada opção mostra imagem Base64, `alt-text`, nome e preço em `description`; não expõe UUID, custo nem ajuste oculto.
- Abaixo aparece um `Dropdown` (`name="selected_quantity"`) com `0`, `1`, `2`, `3`, `4`, `5`, `6`, seguido do `Footer` **Próximo**. A quantidade é obrigatória; `0` retira a posição.
- Produto e quantidade iniciam sem valor selecionado para evitar adicionar por engano o primeiro produto ou uma quantidade implícita.
- **Próximo** envia `component_action="next"`, posição, produto, quantidade e seleções anteriores. O servidor valida produto/posição e quantidade contra o snapshot imutável.
- Para a próxima posição, retornar `BASKET_PRODUCT` com novas alternativas/fotos. Depois da última, retornar `PAYMENT` somente se ao menos uma quantidade for positiva.
- Se toda a cesta estiver zerada, permanecer na posição atual, mostrar “Escolha pelo menos um produto para continuar” e não avançar.
- **Voltar** retorna à posição anterior e restaura o produto/quantidade já guardados no `selected_items`. A primeira posição não oferece retorno interno.
- Se qualquer imagem falhar ou exceder limites aceitos, bloquear a cesta; não enviar opção sem foto. Não registrar conteúdo Base64 nos logs.

### 2. `PAYMENT`

- Exibir seleção única obrigatória dentre `pix`, `cash`, `debit_card`, `credit_card`, `food_card` e `meal_card`, com rótulos em português.
- Continuar chama `component_action="continue"` e encaminha seleções imutáveis e método escolhido ao endpoint.
- Voltar retorna à última posição da cesta e preserva quantidades.

### 3. `CUSTOMER_ADDRESS` — cliente encontrado com endereço ativo

- A sessão carrega a associação de cliente resolvida pelo E.164. A tela não recebe telefone bruto nem tenta fazer uma segunda associação pelo nome.
- Se a projeção não puder carregar um cliente que a sessão já associou, a tela mostra revisão humana e não oferece fluxo de novo cadastro para esse cliente.
- A tela só é exibida para cliente identificado com pelo menos um endereço ativo. Mostra o nome e uma lista de endereços ativos; se houver um padrão único ou um único endereço, ele aparece pré-selecionado para a pessoa confirmar tocando em **Continuar**. Se houver mais de uma opção sem padrão inequívoco, nenhuma é escolhida automaticamente.
- A lista oferece também “Cadastrar outro endereço”; essa opção abre `CUSTOMER_NEW_ADDRESS`. Selecionar um endereço salvo chama `component_action="review_order"`; o backend relê o cadastro e exige que o ID pertença ao cliente da sessão e continue ativo.
- Nenhum dado de cadastro/endereço é persistido nessa etapa.

### 4. `CUSTOMER_NEW_ADDRESS` — novo cliente ou endereço alternativo

- Cliente novo ou cliente existente sem endereço ativo chega diretamente a esta tela depois do pagamento. Cliente existente com endereço pode chegar aqui ao selecionar “Cadastrar outro endereço”.
- Campos: nome completo, rua/logradouro, número, complemento opcional, bairro, cidade, UF de 2 letras, CEP e referência opcional. Para cliente conhecido, o nome canônico é pré-preenchido e desabilitado; para cliente novo, o nome é obrigatório e editável.
- O endpoint usa a sessão como autoridade para cliente existente; nunca aceita um `customer_id` do formulário. Para cliente novo, valida nome e endereço completos. Strings vazias são usadas nos valores inicialmente não preenchidos; complemento/referência vazios são normalizados para ausência no intake.
- Continuar chama `component_action="review_order"` com as seleções, pagamento, nome e objeto `new_address`. O endpoint valida novamente e retorna `ORDER_REVIEW`. Ainda não grava cadastro nem endereço.

### 5. `CUSTOMER_REVIEW` — interrupção por identidade inconsistente

- Mostrar texto curto de que o cadastro não pôde ser confirmado e direcionar o cliente a responder na conversa para atendimento humano.
- A tela não oferece campos para criar/substituir o cadastro identificado e não permite avançar para revisão de compra.
- O botão terminal `complete` envia um marcador explícito `request_human_review` e o `flow_session_id`. O intake reconhece essa variante, exige token/sessão/canal/remetente correspondentes e grava somente uma intent `needs_review` ligada à conversa; não exige nem persiste dados novos de cliente/endereço.
- Essa submissão não cria cliente/endereço, cotação, pedido, reserva, cobrança ou emissão fiscal. A projeção do Atendimento classifica a intent como `customer_review` e explica que nenhum pedido ou endereço novo foi criado. O processamento comum de confirmação não recebe intents nesse status.

### 6. `ORDER_REVIEW` — tela terminal do Flow

- Exibir produtos com quantidade positiva, quantidade por linha, forma de pagamento, endereço completo para conferência e total geral. Quantidade zero não aparece. Não exibir preço individual.
- O endpoint calcula o total com os preços do snapshot e o ajuste oculto aplicável, em centavos; Flow JSON só apresenta o rótulo total formatado.
- A ação final é `complete`, não `data_exchange`. A resposta Meta `nfm_reply` é recebida pelo webhook. Concluir significa “solicitar este pedido”, ainda sem criar `orders`.
- O intake valida sessão/canal/conversa e correlação (`flow_token`/mensagem do Flow), persiste uma intenção Flow própria e dispara uma mensagem de confirmação explícita na conversa com produtos, quantidades e total geral sem preços individuais.
- Só o clique válido no botão de confirmação do cliente revalida cadastro/endereço, preço e estoque e cria o pedido canônico uma vez, na fila de produção/separação.

## Contrato dinâmico e compatibilidade

- Screens usados pelo endpoint: `BASKET_PRODUCT`, `PAYMENT`, `CUSTOMER_ADDRESS`, `CUSTOMER_NEW_ADDRESS`, `CUSTOMER_REVIEW`, `ORDER_REVIEW`.
- `INIT` retorna `BASKET_PRODUCT` da primeira posição. **Próximo** grava a seleção validada e retorna `BASKET_PRODUCT` para a posição seguinte ou `PAYMENT`; pagamento continua para endereço salvo, endereço novo ou revisão humana; endereço salvo pode abrir novo endereço ou revisão; endereço novo retorna revisão.
- O contrato de `BASKET_PRODUCT` inclui `position_index:number`, `position_number:number`, `position_count:number`, `position_progress_label:string`, `position_label:string`, `product_options:Array<{id,title,description,enabled,image,alt-text}>`, `quantity_options:Array<{id,title,enabled}>`, `selected_product_id:string`, `initial_product_id:string`, `selected_quantity:string`, `selected_items:Array<{position_id,product_id,quantity:number}>` e `selection_error:string`. No primeiro carregamento, produto e quantidade ficam sem seleção; ao voltar, o endpoint preenche a escolha guardada. Trocar o produto limpa a quantidade e exige nova escolha.
- O Flow JSON declara tipos e `__example__` para todo campo de tela dinâmica. `CUSTOMER_NEW_ADDRESS` usa strings vazias para nome/campos opcionais não preenchidos e devolve objeto de endereço com propriedades string; `ORDER_REVIEW` usa IDs como string vazia e um objeto `new_address` vazio quando o cliente confirmou endereço salvo. O intake converte esses sentinelas em ausência e rejeita qualquer combinação ambígua.
- O modelo de rotas declara `BASKET_PRODUCT → PAYMENT`, `PAYMENT → CUSTOMER_ADDRESS | CUSTOMER_NEW_ADDRESS | CUSTOMER_REVIEW`, `CUSTOMER_ADDRESS → CUSTOMER_NEW_ADDRESS | ORDER_REVIEW` e `CUSTOMER_NEW_ADDRESS → ORDER_REVIEW`; os dois screens finais são terminais. O endpoint pode responder `BASKET_PRODUCT` para atualizar a etapa de produto seguinte sem trocar o screen ID. A aceitação desta atualização do mesmo screen precisa ser confirmada pelo Validator/Builder.
- Cada `screen.data` declara todos os campos dinâmicos com tipos compatíveis e exemplos `__example__`; arrays de objetos declaram `items.type="object"` e `properties`. Respostas do Data Endpoint seguem `{screen,data}`; não incluem `version` no objeto de resposta.
- O serializador local limita imagens para aproximadamente 46 KB antes de Base64; esse limite não substitui validação Meta nem inspeção em dispositivos.
- O `flow_token` é correlator aleatório gerado pelo servidor; somente hash fica persistido. Não é senha, não aparece na UI nem nos logs.
- `flow_schema_version`, `data_api_version` e `flow_message_version` vêm do binding verificado da conta publicada. O histórico V2 continua apenas pista. O candidato local usa Data API 3.0 e não depende da assinatura opcional; o endpoint valida `flow_token_signature` HS256 caso chegue. Ativar Data API 4.0 exige validar primeiro o par JSON/API e as respostas em cada WABA.
- O Flow JSON candidato local está em `supabase/flows/basket-order-v1.json`, usa JSON 7.3/Data API 3.0 e é alinhado à Edge Function/intake. Ele ainda não foi aceito pelo Flow Validator nem inspecionado visualmente. A combinação de versões, resposta dinâmica no mesmo screen de produto, opções com foto, limites de payload e renderização devem ser validados em cada WABA separadamente. A referência oficial Meta vigente e o Validator, não espelhos de terceiros nem o código histórico, definem a versão publicável.

## Recuperação e segurança

- Falha de imagem, lista de opções vazia, preço indisponível, endereço inconsistente, versão divergente ou sessão inválida bloqueia o passo sem inventar dados.
- Dados financeiros e IDs de produtos vêm do snapshot do servidor. O cliente só controla identificadores e quantidade que o backend verifica dentro da posição correspondente.
- Timeout/erro no envio inicia estado `needs_review`; não reenviar às cegas. O fluxo comercial não expira, mas a sessão técnica Meta pode expirar e precisa ser refeita com preço/estoque recalculados antes da confirmação.
- A confirmação comercial sempre produz um pedido separado de qualquer carrinho Meta recebido depois. A janela de 24 horas controla o envio de mensagens livres, não a união nem a validade comercial do pedido.

## Gates antes de publicar

1. Produzir o JSON 7.3/Data API 3.0 candidato, declarar todos os tipos/exemplos, rotas e payloads e alinhar os formulários à Edge Function.
2. Em cada WABA, criar um recurso `DRAFT` e enviar o arquivo com `POST /{FLOW-ID}/assets` como multipart (`file`, `name=flow.json`, `asset_type=FLOW_JSON`). Guardar o `flow_id` separado por WABA; corrigir a fonte local até `validation_errors` ficar vazio e reler status, versões, saúde e preview. Não publicar nessa etapa. O candidato é JSON 7.3/Data API 3.0/Message Version 3; considerar Data API 4.0 apenas como mudança isolada para a assinatura opcional `flow_token_signature`.
3. Ensaiar visualmente, sem publicar para clientes, os dois números/WABAs com múltiplas alternativas fotografadas: carregamento das fotos, texto/preço, seletor `0–6`, avanço/retorno, pagamento, cliente existente/novo, endereço, resumo e conclusão.
4. Confirmar que `nfm_reply.response_json` associa `flow_token`, sessão, conta, telefone e mensagem de origem nos dois números. Se faltar correlação confiável, não criar intenção nem pedido.
5. Só depois da homologação permitir binding e envio gradual. Não publicar diretamente do candidato local.

## Estado atual e limites

- A Edge Function local está alinhada para `INIT → BASKET_PRODUCT` com foto em cada opção, quantidade na mesma tela, avanço/retorno por posição, validação contra snapshot, quantidades `0–6` e bloqueio de cesta toda zerada. O Flow JSON greenfield existe como candidato local não publicado, com telas de produto, pagamento, endereço salvo/novo, revisão humana e revisão do pedido.
- A referência oficial confirma `RadioButtonsGroup.image` em opções dinâmicas desde versão 5.0 e `NavigationList` desde 6.2. Isso encerra a dúvida sobre suporte a foto, mas não valida o JSON específico nem sua renderização nos dois WABAs.
- O intake local reconhece `CUSTOMER_REVIEW`, correlaciona sessão/canal e persiste `customer_review_requested` como `needs_review`, sem cotação ou confirmação; o Atendimento diferencia esse registro de um pedido. A publicação continua bloqueada pela ausência de validação oficial e ensaio visual, embora o JSON candidato já exista localmente.
- A configuração de bindings está vazia nas tabelas legadas consultadas; IDs, versão, endpoint e publicação devem ser lidos e verificados por WABA antes do binding greenfield.
- A migration foundation e as Edge Functions greenfield seguem somente locais. Nenhuma DDL remota, publicação, mensagem ou escrita no Bling ocorreu.

## Abordagem de execução

Validar o Flow JSON candidato 7.3/Data API 3.0 no Validator, confirmar se resposta dinâmica no mesmo screen é aceita, conferir fotos e formulários nos dois WABAs, e manter Data API 4.0 como alteração isolada caso se decida habilitar assinatura opcional. Não declarar o candidato como válido nem habilitar envio antes dessas evidências. Manter pedidos Flow e Catálogo isolados no intake existente.
