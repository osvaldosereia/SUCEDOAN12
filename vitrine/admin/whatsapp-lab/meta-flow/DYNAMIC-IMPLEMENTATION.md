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

## Gestão pelo Vitrine Admin

A branch de continuação adiciona a área **Marketing → Flows Meta** ao Admin, reaproveitando a sessão de atendimento já autenticada e o token Meta armazenado no servidor em `admin-whatsapp-templates-v1`. A área fica fixada à conta `dona-antonia-1018`; não oferece seletor de número, não usa o 0975 e não tem ação de envio.

Pela própria tela, um perfil proprietário pode criar rascunhos, enviar o JSON e consultar a validação oficial, configurar o endpoint fixo, registrar na Meta a chave pública derivada no servidor, publicar depois das verificações e excluir somente rascunhos. A publicação exige confirmação explícita e o backend bloqueia a ação se o Flow não estiver em DRAFT, se não houver relatório oficial sem erros, se o endpoint não corresponder à URL configurada, se a chave não estiver registrada ou se faltarem segredos do endpoint. O token e a chave privada nunca são enviados ao navegador.

A implementação usa a permissão `whatsapp_business_management` da conexão Meta existente. Se a Meta negar uma operação por escopo, a tela apresenta o código sanitizado; não cria uma segunda conexão nem troca de integração. Os segredos de execução continuam sendo configurados no ambiente seguro do Supabase, fora da tela web.

**Disponibilidade:** este código está em uma branch de trabalho. A tela passa a operar depois do merge e da implantação autorizada do código atualizado de `admin-whatsapp-templates-v1`. O endpoint dinâmico ainda precisa de implantação autorizada no Supabase. Não foi feita operação ao vivo na Meta nesta etapa.

## Arquivos
- `vitrine/admin/whatsapp-lab/meta-flow/flow-dynamic-v1.json` — Flow JSON 7.3 / Data API 3.0
- `supabase/functions/whatsapp-1018-basket-flow-v1/index.ts` — envelope e chamadas de consulta
- `supabase/functions/whatsapp-1018-basket-flow-v1/engine.mjs` — máquina de estados e cotação
- `supabase/functions/whatsapp-1018-basket-flow-v1/crypto.mjs` — criptografia e HMAC
- `scripts/test-whatsapp-1018-flow-dynamic.mjs` — rotas 14–30, assinatura, criptografia, webhook e leitura da solicitação no Lab
- `vitrine/admin/whatsapp-lab/reply-parser.mjs` — valida e interpreta a resposta `nfm_reply` somente na conversa interna 1018 → 8360

Os `__example__` do JSON são placeholders neutros para a prévia do Flow Builder. Preços, nomes de produtos e marcas usados em execução vêm do endpoint e do catálogo Supabase; o arquivo não fixa valores comerciais.

## Requisitos **antes** de enviar à Meta
1. Depois do merge e da implantação autorizada do endpoint autenticado do Admin, abrir **Marketing → Flows Meta** e validar o JSON enviado pelo próprio gerenciador. A validação local não substitui as regras oficiais de componentes, referências dinâmicas e rotas; corrigir todos os erros retornados pela Meta antes de publicar.
2. Gerar chave privada RSA de 2048 bits em formato **PKCS#8 sem criptografia do arquivo** e configurá-la com os segredos abaixo no ambiente seguro do Supabase. O gerenciador deriva e registra a chave pública na Meta pela conexão existente; a chave privada **nunca** deve ser commitada nem exibida no navegador.
3. Configurar os seguintes segredos somente no ambiente de execução seguro da Edge Function:
   - `DA_FLOW_1018_RSA_PKCS8` — chave PEM privada do endpoint;
   - `DA_FLOW_1018_META_APP_SECRET` — segredo do aplicativo associado ao canal 1018 para verificar assinatura de chamadas;
   - `DA_FLOW_1018_SESSION_SECRET` — chave aleatória com no mínimo 32 caracteres para assinar tokens e estados;
4. Implantar `whatsapp-1018-basket-flow-v1` e a versão atualizada de `admin-whatsapp-templates-v1` **somente por mecanismo permitido**, já que uma tentativa anterior de implantação foi bloqueada por segurança. Não usar alternativa para contornar esse bloqueio.
5. Preparar a emissão de `flow_token` assinado por backend autenticado e restrito ao número de teste final 8360. Sem esse emissor de sessão, o endpoint recusa todas as sessões, como previsto.
6. Criar o rascunho, enviar `flow-dynamic-v1.json`, registrar o endpoint HTTPS e consultar os erros da Meta pela área **Flows Meta** do Vitrine Admin, usando a conexão já configurada. A conexão precisa ter a permissão `whatsapp_business_management`.
7. O webhook Meta existente persiste `nfm_reply`. O Flow envia ao retorno apenas o resumo comercial, sem o estado assinado da sessão; o Laboratório WhatsApp mostra a solicitação da conversa interna 1018 → 8360 para conferência humana. Não cria pedido. Ainda é necessário homologar o retorno num aparelho real.
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
Não fazer deploy nem publicar o Flow enquanto faltarem validação oficial Meta, endpoint e chaves configurados com segurança, proteção de sessão e teste real de ponta a ponta no 1018 → 8360. A solicitação no Lab exige conferência manual de produtos, preço e estoque; concluir o Flow não cria pedido. Testes de CI não equivalem à aprovação da Meta.

## Fontes técnicas
- Meta oficial: https://developers.facebook.com/docs/whatsapp/flows
- Exemplo de criptografia: https://github.com/WhatsApp/WhatsApp-Flows-Tools
- Meta APIs: https://www.postman.com/meta/whatsapp-business-platform/overview
