# Dona Antônia · WhatsApp Flows dinâmicos · Rodada 1 (canal 1018)

**Estado:** código DRAFT no GitHub. Não há Flow ID criado/validado pela Meta, nem endpoint implantado. Não integra pedidos, não altera estoque nem envia mensagens.

## Escopo desenvolvido
- Escolha de 5 tamanhos lendo `home_size_cards` do `storefront-v2`.
- Consulta dos preços **atuais** das 3 combinações do tamanho escolhido via `basket?basket_id=UUID@N&lightweight=1`.
- Edição por produto, com `Dropdown` de marcas/produtos (`basket_mold_options_batch`) e quantidade 0–10; 0 retira.
- Até 30 posições em 4 telas de 8 itens, compatível com 14–27 posições que existem hoje. A máquina de navegação pode ir ao resumo após a 2ª, 3ª ou 4ª tela conforme a quantidade real de posições.
- Cálculo final via `basket_mold_quote` com as posições e SKUs validados. Mostra total da cesta e apenas nomes e quantidades dos itens da cesta, sem preços individuais.
- Endpoint separado `whatsapp-1018-basket-flow-v1`: Meta Data Exchange criptografado (RSA-OAEP + AES-GCM), validação `X-Hub-Signature-256`, sessão assinada e com validade, acesso restrito ao teste 1018 → 8360.
- Sem escrita em banco, sem checkout, sem criação de pedido, sem alteração de ANA, webhook comercial ou listas antigas.

## Arquivos
- `vitrine/admin/whatsapp-lab/meta-flow/flow-dynamic-v1.json` — Flow JSON 7.3 / Data API 3.0
- `supabase/functions/whatsapp-1018-basket-flow-v1/index.ts` — envelope e chamadas de consulta
- `supabase/functions/whatsapp-1018-basket-flow-v1/engine.mjs` — máquina de estados e cotação
- `supabase/functions/whatsapp-1018-basket-flow-v1/crypto.mjs` — criptografia e HMAC
- `scripts/test-whatsapp-1018-flow-dynamic.mjs` — rotas para 14–30 itens, alterações, assinatura e criptografia

Os `__example__` do JSON são placeholders neutros para a prévia do Flow Builder. Preços, nomes de produtos e marcas usados em execução vêm do endpoint e do catálogo Supabase; o arquivo não fixa valores comerciais.

## Requisitos **antes** de enviar à Meta
1. Validar o JSON no **Flow Builder/Graph API**: a validação local não substitui as regras oficiais de componentes, referências dinâmicas e rotas. Somente depois corrigir quaisquer alertas retornados pela Meta.
2. Gerar chave privada RSA de 2048 bits em formato **PKCS#8 sem criptografia do arquivo** e cadastrar a chave pública no número da Meta, através de procedimento seguro. A chave privada **nunca** deve ser commitada.
3. Configurar os seguintes segredos somente no ambiente de execução seguro da Edge Function:
   - `DA_FLOW_1018_RSA_PKCS8` — chave PEM privada do endpoint;
   - `DA_FLOW_1018_META_APP_SECRET` — segredo do aplicativo associado ao canal 1018 para verificar assinatura de chamadas;
   - `DA_FLOW_1018_SESSION_SECRET` — chave aleatória com no mínimo 32 caracteres para assinar tokens e estados;
4. Implantar a função **somente por mecanismo permitido**, já que uma tentativa anterior de implantar outra função no Supabase foi bloqueada por segurança. Não usar alternativa para contornar esse bloqueio.
5. Preparar a emissão de `flow_token` assinado por backend autenticado e restrito ao número de teste final 8360. Sem esse emissor de sessão, o endpoint recusa todas as sessões, como previsto.
6. Criar draft via Graph API Meta `POST /{WABA_ID}/flows` (permissão `whatsapp_business_management`), subir `flow-dynamic-v1.json`, registrar endpoint HTTPS, consultar os erros da Meta e validar retorno de `ping` e das telas.
7. Homologar `nfm_reply` no webhook oficial e criar apenas uma **solicitação para atendimento** no Admin depois de todos os controles. O botão de resumo atual diz “Concluir teste”, **não cria pedido**.
8. Criar o envio `interactive.flow` exclusivamente do 1018 ao 8360; só expandir para clientes após homologação manual.


## Revisão do contrato de navegação — 24/10/2026
- O Flow original tinha 13 arestas de roteamento e excedia o limite de 10 ramos da Meta; a revisão reduziu para **8** (TAMANHO → COMBINACAO → quatro telas de itens, com caminhos declarados para o resumo), mantendo o contrato dinâmico.
- IDs de telas de edição usam apenas letras e sublinhados: `ITENS_UM` até `ITENS_QUATRO`. Cada tela permite até 8 posições; `ITENS_DOIS` e `ITENS_TRES` também declaram o caminho para `RESUMO`.
- A verificação inclui os limites de rotas, os caminhos condicionais e cestas entre 14 e 30 posições, inclusive os pontos em que a tela seguinte muda.
- **Ainda é preciso validar o JSON oficialmente pela Meta**, sobretudo componentes dinâmicos e referências de dados. Essa revisão não concede homologação, não implanta endpoint e não cria/publica Flow.

## Limitações assumidas para este piloto
- Os mockups gerados com design personalizado **não representam a aparência exata** dos controles nativos do WhatsApp Flow. O arquivo utiliza controles oficiais de `RadioButtonsGroup` e `Dropdown`.
- A tela inicial não mostra os 15 preços de uma vez: os 3 valores reais são buscados após selecionar o tamanho, para evitar 15 cotações simultâneas no primeiro carregamento.
- As fotos dos produtos ainda não estão incorporadas ao Flow. Os dropdowns mostram nomes; incluir fotos exige formatos e limites da Meta, otimização de tamanho e testes oficiais.
- Produtos extras, calendário de entrega, confirmação do cliente, pagamento, criação do pedido e integração automática com a ANA **não fazem parte desta rodada**.
- Quantidade máxima por produto na UI: 10. O motor oficial aceita mais, porém nenhum valor acima de 10 é permitido neste piloto.
- A sessão expira, estoque e preço podem variar entre telas; por isso há cotação ao final e um pedido real ainda requer revalidação e confirmação.

## Regra de publicação
Não fazer deploy nem publicar o Flow enquanto faltarem assinatura Meta, endpoint, chave pública, proteção de sessão, integração de `nfm_reply` e testes em aparelho real. Não confundir testes de CI com aprovação da Meta.

## Fontes técnicas
- Meta oficial: https://developers.facebook.com/docs/whatsapp/flows
- Exemplo de criptografia: https://github.com/WhatsApp/WhatsApp-Flows-Tools
- Meta APIs: https://www.postman.com/meta/whatsapp-business-platform/overview
