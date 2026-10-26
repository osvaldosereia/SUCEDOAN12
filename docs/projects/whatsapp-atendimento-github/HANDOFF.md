# Handoff — Admin de Atendimento WhatsApp com dados no GitHub

Atualizado em 25/10/2026 (America/Cuiaba).

## Objetivo do projeto

Criar um admin novo e independente para preparar a operação de cestas básicas pelo WhatsApp. O admin terá um cadastro simples de produtos, um editor de cestas inspirado no Vitrine Admin e um configurador de WhatsApp Flows da Meta para os dois números da Dona Antônia.

A meta de produto é evoluir o atendimento para que o cliente escolha e personalize a cesta dentro do WhatsApp, reduzindo a dependência do site público. A entrega será feita em etapas, com limites claros entre este projeto e a operação que já está no ar.

## Escopo autorizado e decisões atuais

- O projeto fica separado dentro do repositório osvaldosereia/SUCEDOAN12, em diretório próprio, com branch própria.
- Produtos e cestas deste projeto têm sua fonte versionada no GitHub; Supabase não será o banco de produtos. A orientação atual autoriza consultar o cadastro existente de clientes/endereço pelo backend. Não copiar dados pessoais para arquivos públicos e não alterar schema nem gravar pedidos em produção antes de revisar o contrato de integração.
- Importar somente os produtos que estiverem referenciados pelas composições de cestas existentes no Vitrine Admin. Não importar o catálogo inteiro.
- O cadastro de produtos deve ser simples e servir ao configurador de cestas.
- O configurador de cestas deve permitir tamanhos, tipos de produto, produtos disponíveis por tipo, quantidade por tamanho de cesta e ordem de apresentação.
- O Flow deverá ser configurado por número/canal Meta, sem misturar os dois números. A referência de contexto é os telefones terminados em 0975 e 1018; confirmar os identificadores oficiais de cada canal antes de qualquer operação Meta.
- Não criar senha própria de acesso ao admin neste início.
- Não gravar tokens Meta, chaves privadas, senhas, dados de clientes, mensagens ou pedidos em arquivos versionados.
- Não publicar Flow, enviar mensagem a cliente, implantar endpoint ou alterar sistema em produção nesta fase de planejamento.
- Toda interface de Flow deve usar apenas componentes e capacidades confirmados na especificação oficial atual da Meta. Não desenhar recursos fictícios.

## Contexto técnico verificado

- Repositório: osvaldosereia/SUCEDOAN12, público, branch principal main.
- HEAD verificado de main ao iniciar: a9ae61f44321e93e99ef93e15a014253a202e35e.
- O repositório também publica o site Dona Antônia e contém o Vitrine Admin e o Admin de catálogo. A raiz contém CNAME e o README descreve o sistema atual como produção.
- O README atual informa que o site e os admins existentes usam o Supabase canônico. Esta nova iniciativa é uma exceção explícita somente para o projeto novo; não alterar README, runtime, dados, configurações ou arquivos da aplicação atual para impor essa decisão.
- Branch criada para isolamento: project/whatsapp-atendimento-github-20261025. Ela parte do HEAD acima; não foi feito merge nem deploy.
- Há especificações e trabalho prévio de WhatsApp Flow no repositório. A especificação docs/superpowers/specs/2026-10-24-whatsapp-flow-admin-design.md descreve um gerenciador dentro do Vitrine Admin que reutiliza Supabase e limita operações ao canal 1018. O plano docs/superpowers/plans/2026-10-25-flow-ready-cestas-admin.md também prepara o Flow a partir da configuração do Vitrine Admin. Usar esses arquivos como contexto, não como arquitetura aprovada para este projeto.
- A PR #1406 é uma iniciativa distinta de Dona Antônia V2 para venda por WhatsApp Flow, em rascunho e com dependências Supabase. Não misturar nem mesclar esse trabalho automaticamente com o novo admin.

## Limites de arquitetura que precisam ser tratados

### GitHub como fonte de dados

Os registros de produtos, cestas e configurações podem ser arquivos JSON versionados no repositório, com IDs estáveis, schema versionado, validação e histórico de commits. GitHub é armazenamento de arquivos e histórico de mudanças, não banco transacional nem servidor da aplicação.

Como o repositório é público, os dados em arquivos públicos podem ser lidos por qualquer pessoa. Não colocar informação privada ou segredo nesses arquivos. Um admin sem senha ainda precisa de autorização GitHub para gravar mudanças na branch. Não embutir token de escrita no JavaScript do navegador. Até existir uma forma segura de gravar sem criar uma senha própria, manter a interface em preview/local ou somente leitura, e persistir alterações com fluxo GitHub autenticado.

### WhatsApp Flow dinâmico

A pesquisa de Flows está registrada em FLOW-RESEARCH.md, com fontes oficiais da Meta e comparação de Blip, Infobip, WATI, Twilio e Gupshup. Ela recomenda wizard guiado, JSON avançado opcional, validação/preview/teste antes de publicação e estados por canal.

A documentação da Meta exige um endpoint HTTPS acessível e criptografado para Data Exchange. Com a autorização atual para usar o cadastro de clientes, a recomendação é avaliar uma Edge Function nova e isolada no projeto Supabase existente: ela leria a revisão aprovada de produtos/cestas no GitHub e consultaria cliente/endereço pelo backend, sem usar Supabase como catálogo. Não alterar funções existentes nem publicar o endpoint antes de revisar o contrato, segredos e isolamento. GitHub Pages continua servindo apenas a parte estática.

A Meta também oferece update_data para atualizar dados da tela após uma interação sem navegar; listas podem exibir imagem de opção com limite atual documentado de 100 KB por imagem. O total ao mudar a seleção/quantidade ainda precisa de protótipo no Flow Builder e teste em WhatsApp real; o total final e o preço permanecem validados no endpoint de servidor. Não presumir atualização a cada tecla em campo numérico. Referências: https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint, https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components e https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/changelogs.

## Alternativa nativa para carrinho e quantidades

Pesquisa oficial da Meta/WhatsApp em 25/10/2026 identificou mensagens de catálogo/produtos da Cloud API e o carrinho do WhatsApp como a melhor hipótese para a seleção de produtos com quantidades por item. Mensagens multiproduto mostram até 30 produtos em seções; o cliente pode adicionar ao carrinho e enviar um pedido. A central de ajuda do WhatsApp descreve o ajuste da quantidade de cada item e a Meta documenta o webhook de pedido com os itens e suas quantidades.

A experiência deve ser comprovada por uma prova de ponta a ponta nos dois números antes de fechar a jornada. O carrinho nativo permite a escolha de quantidade, mas não conhece as regras de uma cesta SUCEDOAN12; o servidor deverá validar produtos, quantidades, composição e preço contra uma revisão do GitHub e pedir ajuste ou atendimento humano quando houver divergência.

GitHub continua como fonte de verdade. Para mostrar produtos e iniciar o carrinho, os itens selecionados também precisam estar no catálogo do Meta Commerce Manager vinculado à WABA usada pela Cloud API. Isso é uma cópia de distribuição para o WhatsApp e não usa Supabase. O Cloud API não mostra um ícone de carrinho persistente no cabeçalho da conversa; a experiência precisa começar por uma mensagem de catálogo/produto adequada.

Plano: depois de obter a exportação completa das cestas, avaliar a jornada nativa de catálogo/carrinho com um telefone controlado e comparar com Flow. Flow passa a ser opcional para dados estruturados complementares ou exceções. Nenhum produto foi sincronizado e nenhuma chamada/publicação Meta foi feita nesta pesquisa. Fontes e comparação detalhada estão em FLOW-RESEARCH.md.

## Parecer revisado após entender a composição da cesta

A análise específica está em BASKET-ORDER-RESEARCH.md. A cesta descrita tem preço-base comercial próprio: não é a soma simples das linhas do catálogo, pois existe um ajuste interno que não deve aparecer como item separado. O preço final precisa ser mostrado claramente antes da confirmação.

A recomendação principal passa a ser Flow dinâmico da Meta com endpoint de cálculo privado. O Flow pode oferecer escolha de marca e uma lista de quantidades, usando zero para retirar; o endpoint recalcula o total ao avançar e valida o pedido final. O Flow não tem controle nativo de quantidade com +/−. O carrinho do catálogo oferece essa UX e permite remover itens, mas mostra total estimado dos preços do catálogo e não conhece automaticamente a fórmula da cesta. Pode ser avaliado como alternativa se o preço final for informado depois que o cliente enviar o carrinho.

O ajuste interno confidencial não deve ser colocado nos arquivos do repositório público, no JSON do Flow ou no JavaScript do navegador; deve ficar no endpoint privado. Produtos e composição permanecem no GitHub. Nenhum código, catálogo ou endpoint foi criado nesta pesquisa.

## Experiência desejada para o Flow

Preservar as decisões já comunicadas pelo usuário, sempre conferindo o que a Meta realmente suporta:

1. Mostrar os tamanhos de cesta e o menor preço disponível / indicação “A partir de”.
2. Depois da escolha do tamanho, avançar por tipo de produto, uma etapa por vez.
3. Mostrar as opções de produtos com nome e preço individual; iniciar com a opção mais barata quando a regra comercial permitir.
4. Permitir mais de uma opção de produto quando o tipo da cesta permitir, com quantidade por produto.
5. Atualizar o total na tela quando a interação suportar; a Meta oferece update_data para mudanças de tela, mas validar cálculo/quantidades em protótipo e sempre recalcular o total final no servidor.
6. Encerrar com resumo claro antes da confirmação.

A Meta documenta imagens nas opções de listas (limite atual de 100 KB por imagem de opção) e a ação update_data para atualizar dados da tela após interações. Validar renderização, preseleção da opção mais barata, atualização imediata do total, quantidades independentes e limites em protótipo e WhatsApp real. Não presumir cartões ou controles +/- personalizados.

## Modelo inicial proposto

- products.json: somente produtos referenciados nas cestas importadas, com ID estável, nome, marca, preço em centavos, imagem/URL quando válida, unidade e situação.
- baskets.json: tamanhos, tipos/categorias de item, limite de quantidade por tipo/tamanho, produtos elegíveis e ordem.
- flows/: JSON de Flow por canal e versão, sem credenciais, com relação clara à configuração comercial versionada.
- schema_version em cada documento e validação automatizada antes de aceitar qualquer gravação.
- Os arquivos de produto e cesta não devem guardar clientes, pedidos, conversas, consentimentos ou dados transacionais.

Esse modelo é uma proposta de engenharia inicial, ainda não implementada. Ajustar campos somente depois de inspecionar a estrutura atual de cesta no Vitrine Admin e a exportação estruturada de produtos/cestas, sem consulta direta ao banco operacional para importar o catálogo.

## Identidade e modo de atuação para futuras conversas

Atue como Codex, colaborador técnico e programador sênior especializado em sistemas web e e-commerce. Priorize arquitetura modular, simples de operar, leve, validada, auditável e preparada para evolução. Antes de alterar arquivos, diferencie este projeto dos sistemas em produção e leia este handoff e o roadmap. Trabalhe em rodadas pequenas e concluídas, explique o que mudou e como foi verificado, não invente estados de Meta/GitHub, não exponha segredos e não peça confirmação repetidamente quando a ação já estiver autorizada. Produtos e cestas ficam no GitHub; o uso autorizado do Supabase nesta fase limita-se ao cadastro de clientes/endereço no servidor, sem segredos no navegador nem escrita em produção não revisada. Não criar senha própria do admin.

## Estado no encerramento deste kickoff

Concluído:
- Repositório e branch principal reconhecidos.
- Branch isolada criada a partir do main verificado.
- Especificações existentes de Flow consultadas para separar o trabalho novo das iniciativas existentes.
- Pesquisa técnica documentada em FLOW-RESEARCH.md: Meta, código oficial e práticas de Blip, Infobip, WATI, Twilio e Gupshup.
- Wizard com JSON avançado opcional, prévia/teste, estado por canal e publicação manual registrados como recomendação de produto.
- Limites de repositório público, persistência GitHub sem token no navegador e endpoint dinâmico fora de GitHub Pages registrados.

Ainda não feito:
- Nenhuma aplicação ou tela foi codificada.
- Nenhum dado de cesta/produto foi importado.
- Foi feita somente inspeção de schema do projeto Supabase: não foram lidas linhas de clientes/endereço e nenhuma tabela ou dado foi alterado.
- Nenhuma operação de criação, validação, publicação ou envio foi feita na Meta.
- Nenhuma mudança foi feita no main nem no deploy do site.

## Próxima ação histórica (substituída pelo plano greenfield)

O texto desta seção registrava a recomendação anterior ao projeto greenfield. A execução atual segue a seção “Estado e próxima ação para Work Luna Max” ao final do arquivo e a tabela vigente em IMPLEMENTATION-PLAN-LUNA-MAX.md.

## Instrução para retomar em uma nova conversa

Abra primeiro HANDOFF.md, IMPLEMENTATION-ROADMAP.md, FLOW-RESEARCH.md e ORDER-FLOW-CHECKOUT-DESIGN.md em docs/projects/whatsapp-atendimento-github/ na branch project/whatsapp-atendimento-github-20261025 de osvaldosereia/SUCEDOAN12. Mantenha produtos e cestas no GitHub; use o Supabase existente somente pelo backend para cliente/endereço conforme o desenho; não altere main, site/admin de produção, funções existentes, schema ou pedidos sem revisão do contrato. Não crie senha própria nem exponha token no navegador. Continue pela próxima rodada registrada. Não publique Flow nem envie mensagens reais durante desenvolvimento.

## Referências técnicas oficiais

- GitHub Pages não executa linguagens ou código de servidor: https://docs.github.com/articles/creating-project-pages-manually
- Autenticação da API REST do GitHub requer token com permissões adequadas: https://docs.github.com/rest/guides/getting-started-with-the-rest-api
- Meta WhatsApp Flows — endpoint de troca de dados: https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint
- Meta WhatsApp Flows — visão geral: https://developers.facebook.com/documentation/business-messaging/whatsapp/flows
- Meta WhatsApp Flows — Flow API: https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/flowsapi
- Meta WhatsApp Flows — referência de componentes: https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components
- Meta WhatsApp Flows — changelog: https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/changelogs
- Exemplos oficiais da Meta e aviso de que o endpoint de amostra é protótipo: https://github.com/WhatsApp/WhatsApp-Flows-Tools


## Pesquisa de atendimento por Flow — 25/10/2026

A pesquisa técnica e a comparação de sistemas estão em FLOW-RESEARCH.md. O padrão recomendado combina editor guiado simples, validação, prévia, teste e publicação manual separada por número. Para o checkout, a orientação atual recomenda endpoint HTTPS isolado no backend para Data Exchange, cálculo de preço e consulta do cadastro de cliente; produtos/cestas continuam em uma revisão imutável do GitHub. A jornada de resumo e confirmação está em ORDER-FLOW-CHECKOUT-DESIGN.md.

Nenhuma chamada à API Meta, publicação, envio de Flow ou criação de endpoint foi feita durante a pesquisa.

## Verificação da exportação de cestas — 25/10/2026

A inspeção do código encontrou a ação downloadMetaCatalog em vitrine/admin/whatsapp-lab/lab.js. Ela exporta um CSV de 15 combinações de cesta preparado para importação manual de catálogo na Meta. Esse arquivo não é a exportação bruta das cestas, tipos, produtos relacionados, quantidades e ordem necessária para esta migração. Não usar esse CSV como fonte do novo catálogo.

O código do Vitrine Admin carrega composições pelo módulo vitrine/admin/basket-admin-api.js e por serviços existentes vinculados ao backend atual. Nenhuma consulta ao backend foi feita para importar produtos/cestas. A inspeção posterior de Supabase foi limitada ao schema de clientes/endereço/pedidos; nenhuma linha pessoal foi consultada. A exportação de produtos/cestas continua pendente; obter o arquivo estruturado pelo próprio painel, se existir, ou receber CSV/JSON com o formato listado no Roadmap.


## Revisão do checkout e uso limitado do Supabase — 25/10/2026

A orientação mais recente do usuário autoriza aproveitar o cadastro de clientes existente, mantendo o catálogo e as cestas no GitHub. A inspeção somente de schema identificou customers, customer_phones, customer_addresses, papoai_order_drafts_v2 e orders no projeto “Dona Antônia”. Nenhuma linha pessoal foi lida ou alterada. A recomendação é pesquisar por telefone no backend, confirmar nome/endereço, coletar forma de pagamento no Flow e enviar um resumo sem preços unitários na conversa com os botões Confirmar pedido, Editar pedido e Cancelar. Só o primeiro botão confirma e encaminha um pedido. Detalhes, estados, proteções, fontes e gates estão em [ORDER-FLOW-CHECKOUT-DESIGN.md](ORDER-FLOW-CHECKOUT-DESIGN.md).


## Complemento de pesquisa — catálogo, imagens, pedidos e Bling — 25/10/2026

Este complemento é o estado mais recente e substitui a pendência antiga de obter um CSV manual antes de começar a migração. A pesquisa somente de leitura identificou a configuração atual em basket_admin_* no Supabase: cinco tamanhos ligados (Econômica, Mini, Pequena, Média e Grande), 61 produtos distintos como opções e 61 URLs de imagem WebP. São 59 URLs de Supabase Storage e 2 de GitHub Raw. As imagens ainda não foram baixadas ou avaliadas visualmente; não houve importação.

O SUCEDOAN12 é um repositório público. Produtos, cesta e imagens versionados ficarão visíveis publicamente. O ajuste comercial interno não pode ser gravado no repositório; deve permanecer em configuração privada do servidor. Nenhuma credencial ou dado pessoal pode ser incluído em commit.

O Vitrine Admin já oferece fila e detalhe de pedidos, separação por linha, faltas, sincronização com Bling, acompanhamento/solicitação de NF-e, gate de saída e conclusão com entrega/pagamento. A referência de operação é o código atual e as Edge Functions admin-products-live-v1/admin-service-intelligence-v1. Não copiar os módulos diretamente nem alterar a UI atual.

Gate técnico prioritário: o criador canônico atual consulta public.products para preço/estoque, e o snapshot fiscal consulta products para identidade SKU/GTIN/nome. A nova entrada precisa usar snapshot do catálogo GitHub sem tornar Supabase a fonte de produtos. Provar o contrato de linha do pedido, estoque e Bling antes de implementar as telas de pedido ou Flow.

A documentação detalhada está em:
- [Pesquisa de catálogo, imagens, pedidos e Bling](ORDER-ADMIN-AND-IMAGE-RESEARCH.md)
- [Plano de implementação para Work Luna Max](IMPLEMENTATION-PLAN-LUNA-MAX.md)

## Estado e próxima ação para Work Luna Max — 25/10/2026

Rodadas 0, 0.5–0.7, 1, 2 e 3 foram concluídas na branch `project/whatsapp-atendimento-github-20261025`. A Rodada 3 entrega somente rascunhos locais de Flow, JSON exportável e gravação opcional pela Admin API autenticada; não integra com Meta. A sequência vigente está em `IMPLEMENTATION-PLAN-LUNA-MAX.md`; o roadmap antigo conserva números históricos. Próximo passo: Rodada 4 — runtime de atendimento, com cotação server-side, protocolo criptografado e consulta autorizada de cliente, sem publicação ou mensagem real. Permanecem as restrições: não alterar main, site, Vitrine ou funções existentes; não publicar Flow e não enviar mensagem a cliente.


## Decisão de arquitetura atualizada pelo usuário — 25/10/2026

Construir o produto greenfield. A pesquisa do Vitrine Admin é apenas fonte de requisitos e dados; não reutilizar código, UI, tabelas, RPCs, backend ou estados operacionais antigos. O novo Admin, os conectores Meta/Bling e o fluxo de pedidos terão implementação e modelo de dados próprios. Supabase será consultado para cadastro/endereço do cliente; pedidos ficarão em um esquema novo e isolado. GitHub continua como fonte dos produtos, cestas e imagens. O SUCEDOAN12 é público, então ajustes internos e segredos ficam exclusivamente no servidor.

Esta decisão substitui qualquer texto anterior do handoff/roadmap que sugira reutilizar serviços ou o modelo de pedidos do Vitrine. O plano vigente é [IMPLEMENTATION-PLAN-LUNA-MAX.md](IMPLEMENTATION-PLAN-LUNA-MAX.md). Próxima ação: concluir a Rodada 3 do configurador e seguir para a Rodada 4 de runtime.


## Estado de execução — Rodada 4 concluída localmente

A branch `project/whatsapp-atendimento-github-20261025` contém a implementação local do runtime em `projetos/whatsapp-atendimento-github/`. A função verifica HMAC, decifra o protocolo Meta, fixa catálogo por commit, valida escolha e quantidade, calcula o total no servidor e prepara o lookup mínimo de cliente por telefone. O hash de sessão fica na tabela nova `public.whatsapp_flow_sessions`, protegida por RLS e grants restritos ao `service_role`; a migration foi criada mas não aplicada.

Build verificado com `pnpm build`. Deno não está instalado, portanto não houve `deno check`. Não houve leitura de registros, alteração Supabase, configuração de segredo, deploy, chamada Meta/Bling, publicação ou mensagem.

Limite para a continuação: os rascunhos JSON da Rodada 3 seguem `local-only` e não estão conectados ao endpoint. O runtime trabalha com telas lógicas por grupo; as cestas têm 13–25 grupos, então o layout/roteamento deve ser agrupado e validado no Flow Builder antes de ligar o endpoint. A sequência agora é Rodada 5 — webhook inbound, criação segura de sessão e confirmação/pedido idempotente, respeitando os gates da pesquisa e sem enviar mensagens reais.


## Estado de execução — Rodada 5 concluída localmente

A Rodada 5 adiciona `supabase/functions/whatsapp-checkout-webhook/`, a migration local `20261026004500_whatsapp_checkout.sql` e o plano `ROUND-5-CHECKOUT-PLAN.md`. O webhook valida o challenge e a assinatura Meta, restringe o canal por `phone_number_id`, registra entrada idempotente, emite sessão com token aleatório (somente hash na tabela de sessão) e grava payloads de saída cifrados numa outbox privada.

O payload final do Flow precisa corresponder a `contract_version: 1`; a Rodada 7 ainda precisa conectar e validar os rascunhos da Rodada 3 com esse contrato. Somente a ação de botão `confirm` pode inserir pedido/itens, usando snapshot imutável GitHub e transação. O modelo novo permanece isolado no schema `whatsapp_atendimento`; nenhuma tabela antiga de pedidos é usada.

`pnpm build` e `git diff --check` foram verificados. Deno CLI não está disponível. A migration não foi aplicada, o banco e os segredos não foram alterados, a outbox não tem consumidor e nenhuma mensagem, Flow ou chamada Meta foi enviada. Próxima rodada do plano: Rodada 6 — separação e integração Bling, precedida pela revisão do contrato fiscal do novo snapshot.


## Estado de execução — Rodada 6 local concluída

A branch `project/whatsapp-atendimento-github-20261025` agora contém fila autenticada de pedidos, detalhe por revisão, atribuição a operador, separação, substituto elegível no catálogo fixado e tratamento de falta com aceite/cancelamento inbound. Alterações usam revisão otimista e geram eventos de auditoria. A outbox continua cifrada e sem consumidor.

Concluir a separação cria `awaiting_invoice` e um `integration_jobs.create_sale` em `blocked`. A prévia read-only do Vitrine confirma que o pedido de venda usa o contato Bling já vinculado ao cliente e registra forma de pagamento em `observacoes`; forma financeira/vencimento pertencem a uma operação distinta. O projeto novo oferece vínculo de contato digitado e conferido manualmente, com sessão GitHub/allowlist, revisão otimista e auditoria. A conciliação comercial segue a referência: diferença positiva entre total e linhas entra em `outrasDespesas`; negativa, em `desconto`. OAuth e reconciliação permanecem desligados. A rota autenticada de reconciliação GET-only já persiste resultados idempotentes e redigidos, mas não houve request ao Bling. Criação de venda, NF-e, despacho e conclusão de entrega não estão implementados/homologados.

A migration `20261026005000_order_operations_bling.sql` foi criada pelo Supabase CLI e não aplicada. `SUPABASE_DB_URL` é lida somente pela Edge Function com prepared statements desabilitados. Não houve acesso a dados reais, mudança de schema Supabase, configuração de segredo, deploy, publicação Flow ou envio de mensagem. `pnpm build` passou; Deno CLI não está instalado e nenhum teste foi criado ou executado.

Especificação: [ROUND-6-ORDERS-BLING-PLAN.md](ROUND-6-ORDERS-BLING-PLAN.md). Este registro é histórico; o estado atual e os gates remanescentes estão na seção “Conclusão local da Rodada 6”.

## Continuação — OAuth Bling local

A Admin API agora possui `POST /integrations/bling/oauth/start` (sessão GitHub autorizada e allowlist) e `GET /integrations/bling/oauth/callback`. O início cria `state` aleatório de uso único e grava somente seu SHA-256; o callback troca o código pelo endpoint `https://api.bling.com.br/Api/v3/oauth/token` e guarda tokens cifrados com AES-GCM em `integration_credentials`. O callback não registra código, token ou corpo da resposta. `BLING_OAUTH_ENABLED` só aceita `true`; o `.env.example` mantém `false` e contém apenas placeholders.

Esse fluxo não foi iniciado e nenhuma conta foi conectada. O cliente API oferece somente GET; a rota de reconciliação o chama somente quando suas duas flags estão habilitadas. Ambas ficaram desligadas, então não houve request nem refresh. A regra de conciliação foi recuperada da prévia read-only já existente no Vitrine Admin e reimplementada neste projeto. O job continua bloqueado. Nenhuma publicação de Flow, deploy ou mensagem a cliente foi feita. Conferidos `pnpm build` e `git diff --check`; nenhum teste foi criado ou executado.

## Revisão ampla — minimização de dados da fila de pedidos

A API administrativa da fila foi ajustada para consultar somente os campos resumidos usados na listagem; ela não carrega nem devolve o snapshot inteiro. O detalhe também deixou de devolver `snapshot`, telefone e ID interno do cliente: agora inclui somente forma de pagamento, endereço necessário à operação, itens e estados do pedido. O endereço é exibido apenas depois que um operador autorizado abre um pedido específico. A interface continua sem exibir telefone.

Esta alteração é local na branch de desenvolvimento. O build e `git diff --check` são as verificações permitidas nesta rodada; nenhum teste foi criado ou executado. Não foram feitas chamadas Bling/Meta, nem aplicada migration, configurado segredo, feito deploy, publicada Flow ou enviada mensagem.

## Revisão do contrato atual do Bling

Consulta somente à referência/OpenAPI oficial em 25/10/2026 confirmou que `POST /pedidos/vendas` marca `contato`, `data`, `dataPrevista`, `dataSaida`, `itens` e `parcelas` como obrigatórios. O item exige `valorLista`, mas a propriedade não está definida no schema. Cada parcela exige vencimento, valor e `formaPagamento.id`; as datas têm descrições condicionais, sem indicar claramente como criar o pedido sem parcelas. A prévia local não contém datas previstas/saída nem um mapeamento entre pagamento WhatsApp e forma do Bling. O contrato permanece bloqueado até determinar a política e validar um payload em homologação controlada. Fonte: [referência oficial da API Bling](https://developer.bling.com.br/referencia).

A consulta foi apenas à documentação pública; não houve chamada à API, OAuth, leitura de dados da conta, POST, migration, deploy ou emissão fiscal.

## Continuação — reconciliação GET-only persistida

A Admin API agora oferece `POST /orders/{id}/bling-sale/reconcile`, protegido pela mesma sessão GitHub e allowlist. A operação exige pedido em `awaiting_invoice`, revisão atual, job `create_sale` bloqueado/desconhecido, vínculo Bling conferido e hash da prévia consistente. O GET externo só é possível com `BLING_SALE_RECONCILIATION_ENABLED=true` e `BLING_OAUTH_ENABLED=true`; ambos seguem `false` no exemplo de configuração.

Cada consulta usa uma chave idempotente persistida em `order_events`, além de um lease de cinco minutos contra concorrência. O resultado resumido é salvo em `integration_jobs.result_summary.reconciliation`; a operação principal mantém seu status e nunca é liberada para criar venda. O comparador falha fechado porque a prévia local ainda não tem datas previstas/saída nem parcelas. Não houve chamada Bling, configuração de segredos, aplicação de migration, deploy, publicação Flow ou envio de mensagem. Build e `git diff --check` passaram; nenhum teste foi criado ou executado. A continuação de negócio ainda depende de aprovar datas, pagamento/parcelas e validar o contrato fiscal em homologação controlada.

## Conclusão local da Rodada 6

A entrega local prevista para fila, separação, preflight, OAuth server-side desativado, prévia segura da venda e reconciliação autenticada GET-only está implementada. A reconciliação tem chave idempotente, lease, persistência redigida e falha fechada; ela não habilita a escrita `create_sale`. O critério local da Rodada 6 está concluído.

O sistema ainda não está pronto para operação. A referência/OpenAPI do Bling mantém dúvidas sobre datas, parcelas, `formaPagamento.id` e `valorLista`; ainda faltam decisão de negócio e homologação controlada para escrita da venda, além de NF-e, despacho e ligação dos Flows. Próximo passo: Rodada 7 para fechar esses gates. Até lá, flags ficam desligadas, migration não aplicada, sem conexão Bling, chamadas externas, deploy, Flow publicado ou mensagens enviadas. Nenhum teste foi criado ou executado, conforme a restrição do projeto.

## Rodada 7 — preflight local

A validação estática do catálogo encontrou um erro de formatação em `catalog/image-manifest.json`: os bytes finais continham a sequência literal `\n` depois do objeto JSON. O arquivo foi corrigido. A auditoria local confirmou 61 produtos, 61 entradas de manifesto, 61 referências distintas nas cestas ativas, cinco cestas com 13–25 grupos, e 9 arquivos JSON válidos no projeto. Os 61 arquivos de imagem existem dentro da pasta do projeto e correspondem ao caminho, SHA-256, tamanho declarado/limite, assinatura WebP e dimensões declaradas no manifesto.

O preflight não conclui a Rodada 7. Os rascunhos Flow ainda precisam ser ligados e validados contra o contrato do runtime; o Bling segue bloqueado até decisão de datas, parcelas e forma de pagamento, além de homologação controlada para venda, NF-e e saída. Não houve acesso a APIs ou dados operacionais, aplicação de migration, configuração de segredos, deploy, publicação Flow ou envio de mensagens.

### Contrato final do Flow — ajuste local

A tela `CUSTOMER_REVIEW` agora devolve o `flow_token` já validado para que a conclusão possa preencher o payload `contract_version: 1`. O webhook permite omitir `customer_id`: a identidade é resolvida novamente por telefone da mensagem/sessão, exigindo correspondência única verificada; se o ID for fornecido, é validado contra essa identidade. Assim o UUID interno não precisa ser enviado ao cliente. Build e `git diff --check` passaram; nenhum teste foi criado ou executado. O JSON do Flow ainda não foi conectado, e nenhum banco, segredo, API, deploy ou canal Meta foi alterado.

## Rodada 7 — Flow local ligado ao catálogo GitHub

A decisão mais recente do usuário define uma tela por tipo de produto, reutilizada pelo endpoint como `GROUP`, com **uma escolha de produto por tela**. A lista de produtos fica acima do seletor de quantidade. A opção final é sempre `Não quero esse produto`; escolhê-la retira o tipo da cesta. A quantidade disponível é de 1 a `min(6, saldo vendável atual do Supabase)`; produtos sem saldo ficam indisponíveis. O preview administrativo mostra somente a estrutura e não lê estoque.

Atualização vigente: o catálogo usa `schemaVersion: 3` e não tem campo de saldo. O Flow runtime consulta a view de saldo vendável e as reservas válidas no Supabase; o webhook revalida a quantidade antes de gravar o rascunho. O saldo não é reservado nem decrementado automaticamente; disponibilidade é dinâmica.

O Flow JSON local usa versão 7.3/Data Exchange 4.0 e o endpoint retorna a mesma tela `GROUP` para cada tipo antes de abrir `CUSTOMER_REVIEW`. O webhook valida a seleção contra a revisão do catálogo fixada pela sessão e enfileira a conclusão. A conclusão do Flow não confirma pedido. O webhook gera o resumo com Confirmar/Editar/Cancelar na outbox; o worker local só envia quando `META_OUTBOX_SENDER_ENABLED=true`, e a flag segue desligada. O Flow não cria cadastro do cliente; o Admin possui CRUD separado, e o checkout exige cliente ativo e endereço ativo únicos no Supabase.

O JSON e o endpoint estão conectados somente localmente. Continuam pendentes a validação do Flow Builder/Meta, renderização em aparelho, entrada manual dos saldos e o consumidor da outbox. Bling, venda, fiscal e saída permanecem bloqueados pelas decisões documentadas no plano. Não publicar Flow, implantar funções, aplicar migrations, enviar mensagens ou chamar Meta/Bling durante o desenvolvimento. Nenhum teste automatizado foi criado ou executado nesta rodada; build e `git diff --check` devem ser verificados no fechamento.

## Continuação da Rodada 7 — worker local da outbox

Foi adicionado `supabase/functions/whatsapp-outbox-worker/` e o helper server-side `supabase/functions/_shared/outbox-dispatch.ts`. O webhook e a ação de separação podem acordá-lo com `EdgeRuntime.waitUntil`, mas somente quando `META_OUTBOX_SENDER_ENABLED=true`. A configuração de exemplo deixa a flag `false`, não há credenciais reais e nenhum disparo foi feito. O worker exige um segredo máquina-a-máquina de pelo menos 32 caracteres, mantém os tokens Meta server-side e decifra cada payload somente em memória.

O worker processa no máximo cinco mensagens por lote e reivindica uma linha imediatamente antes do processamento, deixando as seguintes pendentes caso seja interrompido. Um disparo encadeia no máximo vinte invocações (cem mensagens); o restante aguarda o próximo evento. Valida tipo/canal/Flow ID e registra somente códigos curtos. Antes do POST, move cada linha de `pending` para `failed/delivery_unknown`; somente HTTP 2xx com ID de mensagem aceita pela Graph a move para `sent` (`sent` ainda não confirma entrega ou leitura no aparelho). Não há reenvio automático após timeout, resposta ambígua ou encerramento inesperado. Essa política prioriza evitar pedidos/mensagens duplicadas, mas a recuperação de mensagens incertas ainda depende de conferência manual; não há tela de reconciliação da outbox.

Build e `git diff --check` passaram. Nenhum teste foi criado ou executado, migration aplicada, segredo configurado, função implantada, Flow publicado ou mensagem enviada. Próximos gates da Rodada 7: cadastrar saldos reais no catálogo; homologar Flow/JSON e imagens em canal e aparelho de teste; aprovar as decisões fiscais/financeiras e homologar Bling. Antes de habilitar a flag em uma homologação, cancelar pendências acumuladas durante o período desligado e confirmar destinatários de teste. Não habilitar a flag de envio durante desenvolvimento.

## Continuação da Rodada 7 — acompanhamento read-only da outbox

A área Operação ganhou a aba `Mensagens`. A `GET /outbox` usa a sessão GitHub/allowlist existente e devolve contagens e os 50 registros recentes com canal, tipo, estado, horários e código curto de erro. Payload cifrado, telefone e chave de evento não são consultados nem devolvidos. Não há botão de reenviar ou cancelar; falha incerta orienta conferência manual no WhatsApp Manager. O aviso mostra somente se a flag do worker está ligada, sem afirmar que as credenciais sejam válidas ou que a mensagem foi entregue.

Não foi necessária migration. `pnpm build` e `git diff --check` passaram ao fechar. Nenhum teste foi criado/executado, nem houve consulta ao banco, configuração de segredo, deploy, chamada Meta, publicação Flow ou envio de mensagem.

## Atualização vigente — saldo vendável Supabase e canário WhatsApp (26/10/2026)

O usuário autorizou a leitura do estoque dos produtos das cestas no Supabase e um teste real WhatsApp do canal 1018 ao destinatário de homologação com final 8360. Os números completos não entram no repositório público. Os 61 IDs do catálogo GitHub correspondem aos 61 produtos do Vitrine. A fonte atual é a view `public.storefront_ean_sellable_stock_v1`, descontando reservas `reserved`/`allocated` ainda válidas de `public.vitrine_stock_reservations`, pela mesma precedência de saldo vendável observada no Vitrine. O código greenfield passa a consultar essa fonte somente server-side em cada tela e revalidar a seleção ao criar o rascunho. `products.json` usa `schemaVersion: 3` e não publica nem edita saldo. A consulta falha fechado; o fluxo não reserva nem decrementa estoque.

No snapshot consultado durante a rodada, 5 produtos estavam zerados e 7 tinham de 1 a 6 unidades; a disponibilidade é dinâmica e deve ser relida no atendimento. Nenhum saldo foi copiado para o GitHub.

O painel autenticado de canário confirmou canal 1018 homologado, modo humano e janela válida. Às 03:27 UTC de 26/10/2026, a Meta aceitou uma única lista interativa com cinco tamanhos/preços para o número final 8360. O registro confirmou `status=sent` e `provider_accepted=true`; isso comprova aceite da Graph API, não entrega/leitura no aparelho. A exceção foi limitada ao teste solicitado; nenhum Flow foi publicado e nenhuma NF-e foi emitida.

Não houve deploy de código novo, aplicação de migration ou chamada Bling. Para operação ainda faltam conferir a chegada no aparelho, homologar Flow/JSON/imagens na Meta, implantar as funções/migration próprias e fechar com homologação controlada as decisões de venda/NF-e no Bling. O Vitrine permanece apenas como referência; nenhum código ou esquema dele foi copiado.

## Correção de arquitetura e continuação — 26/10/2026

Esta seção substitui as referências anteriores a saldo Supabase em tempo real na Rodada 7. O usuário decidiu que estoque fica no próprio cadastro versionado do GitHub. Um snapshot do saldo vendável dos 61 produtos foi lido uma vez do Supabase e carregado em `catalog/products.json` versão 4. O runtime novo consulta somente a revisão GitHub; o Admin pode alterar o saldo. O Flow limita a quantidade a `1..min(6, max(0, stockQuantity))`, com `Não quero esse produto` sempre no fim da lista. Ao confirmar, o webhook baixa o saldo no GitHub com marcador opaco idempotente. Estoque negativo pode seguir para pedido e não deve ser usado como bloqueio da venda/NF-e no Bling.

O Flow Admin agora mantém vínculo privado por número na tabela nova `whatsapp_atendimento.channel_flow_bindings`. A tabela `public.ops2_meta_whatsapp_flow_bindings_v1` foi verificada e é restrita a `registration_flow`; ela não é reutilizada. O vínculo greenfield valida WABA, Flow publicado, erros Meta, endpoint e criptografia. O webhook compõe a mensagem a partir desse Flow e o worker confere o vínculo antes de enviar; `META_OUTBOX_SENDER_ENABLED` segue `false`. A migration `20261026040544_whatsapp_atendimento_channel_flow_bindings.sql` foi criada localmente e não aplicada.

Estado de código: estoque, clientes e Flow/admin por dois canais estão implementados localmente. `pnpm build` passou depois da integração do vínculo; ainda é preciso rodar `git diff --check` e revisar o diff completo. Não foram aplicadas migrations, configurados segredos, implantadas funções, chamadas Graph Meta, publicados Flows ou enviadas mensagens pelo sistema novo nesta continuação. O canário anterior foi enviado pelo Vitrine Admin sob autorização separada.

Gates restantes: rever saldos reais e imagens no aparelho; confirmar OAuth GitHub/allowlist/GitHub App e secrets; aplicar migrations e implantar funções em homologação; validar os Flows de ambos os números; e fechar o payload de venda, parcelas/datas, mapeamento de pagamento, NF-e, saída e tratamento de timeout no Bling. A escrita no Bling continua bloqueada no código local até esse contrato fiscal ser fechado e homologado. Nenhum envio, publicação ou geração de NF-e deve ocorrer no desenvolvimento.

### Confirmação de baixa de estoque — 26/10/2026

O usuário confirmou que o estoque GitHub deve ser reduzido quando o cliente confirma o pedido. A baixa usa um commit no branch do catálogo com marcador opaco por pedido, aceita saldo negativo e não deve bloquear a venda/NF-e no Bling. A compilação TypeScript/Vite passou e a auditoria local do catálogo confirmou 61 IDs únicos, 61 saldos inteiros e nenhum valor fora do contrato. `git diff --check` passou. A tentativa de obter Deno via `pnpm dlx` falhou por pacote opcional ausente (`@deno/win32-x64`), então as Edge Functions não tiveram type-check isolado nesta rodada. Nenhum teste automatizado foi criado ou executado; nenhuma migration foi aplicada, função implantada, Flow publicado, chamada Bling/Meta feita ou mensagem enviada pelo projeto novo.

## Rodada de continuidade — Central WhatsApp e fluxo Bling local (26/10/2026)

O Admin novo ganhou a Central de Atendimento para os números finais 0975 e 1018: seleção do canal, fila pesquisável, detalhe/histórico, assumir com humano, devolver para ANA e resposta manual. A integração passa por uma ponte autenticada server-side para os contratos operacionais já autorizados, encaminha a sessão do operador e conserva as verificações de papel, janela de atendimento e gate de envio existentes. A chave `service_role`, credenciais Meta e mensagens não são expostas ao navegador. Nenhum envio foi disparado nesta rodada.

A integração Bling foi ajustada para usar no servidor a conexão compartilhada do Vitrine/Supabase, com os RPCs de credenciais, lock de rotação, gravação do refresh token rotacionado e reserva de limite. Os valores de credenciais não foram consultados nem registrados. Ao concluir a separação, o código calcula o payload comercial e tenta criar a venda após uma busca exaustiva por `numeroLoja`; compara o detalhe antes de aceitar correspondência e verifica o pedido após escrita. Timeout ou ambiguidade fica em `unknown`, sem repetição cega. O estoque negativo nunca é bloqueio do Bling.

A NF-e só é solicitada após confirmação digitada `EMITIR_NFE`. Antes de gerar, a API procura uma nota já existente para a referência da venda; quando já existe ID fiscal, a ação apenas lê esse documento e nunca cria outro. O Admin mostra situação fiscal, número e link DANFE quando retornado pelo Bling. A aplicação não autoriza NF-e automaticamente, não envia e-mail fiscal e não tem fluxo de despacho/entrega ainda. A política observada no Vitrine deixa a emissão sob ação humana; isso foi preservado.

Verificação local nesta rodada: `pnpm build` passou (TypeScript e Vite) e `git diff --check` passou após a revisão das edições. Nenhum teste automatizado foi criado/executado. Não houve request Bling/Meta, configuração de segredos, migration aplicada, deploy, publicação de Flow ou envio de mensagem. A automação do projeto segue ativa a cada 30 minutos.

Próximas etapas concretas: (1) em janela operacional autorizada, implantar migrations/funções novas e conferir secrets por presença, sem mostrar valores; (2) validar login, canais ANA, permissões e histórico nos dois números; (3) testar venda/NF-e com um pedido controlado usando a conexão compartilhada e confirmar autorização/status no Bling; (4) validar Flows e imagens em aparelho; (5) concluir despacho/entrega/pagamento; (6) só então habilitar outbox em homologação com destinatário e janela acordados. Nenhuma dessas operações externas foi executada nesta rodada.

## Atualização — despacho e conclusão de entrega locais (26/10/2026)

Na branch `project/whatsapp-atendimento-github-20261025`, a tela do pedido agora permite registrar a saída apenas depois de uma consulta server-side atual da NF-e no Bling, com conferência do ID, da referência `numeroLoja` e da situação autorizada. O servidor também revalida separação, revisão e aceite pendente. Uma leitura fiscal divergente, sem autorização ou inconclusiva mantém o despacho bloqueado.

Depois de `out_for_delivery`, o operador escolhe a forma efetivamente recebida entre Pix, dinheiro, débito e crédito. A conclusão exige confirmação explícita, revisão atual e valor em centavos igual ao total do pedido; a transação grava `completed_at`, método/valor, job estável e evento único. A fila deixa de listar pedidos concluídos. Nenhuma mensagem de saída/entrega é criada na outbox; a conclusão também não lança baixa financeira no Bling.

A referência oficial do Bling explica que as situações de pedidos de venda são personalizadas por conta e recomenda descobri-las via módulos/transições. A configuração lida do Vitrine indica `status_updates_enabled=false`; por isso, este código não tenta mudar a situação comercial da venda ao registrar saída/entrega. A conclusão é registrada no novo modelo local; criar baixa financeira ou sincronização de situação no Bling requer contrato/configuração próprios. Fonte: [servidor MCP oficial do Bling](https://developer.bling.com.br/mcp-server).

A migration local `20261026005000_order_operations_bling.sql` agora permite o job `start_dispatch` e limita o método de pagamento a valores admitidos. Ela permanece sem aplicação. `pnpm build` passou (TypeScript e Vite) e `git diff --check` passou nesta revisão. Nenhum teste foi criado/executado; não houve consulta Bling real, escrita externa, alteração Supabase, deploy, publicação Flow ou mensagem enviada. O check fiscal será chamado somente depois de implantação/homologação deliberada.

Pendências externas que continuam após o fechamento local do fluxo de pedido: aplicar migrations e implantar funções em janela autorizada; verificar configuração por presença; homologar no Bling uma venda/NF-e e uma leitura fiscal para saída; validar Flow/imagens e canais em aparelhos; e habilitar outbox somente com destinatários/janela acordados. A automação permanece ativa a cada 30 minutos.

## Continuação da Rodada 7 — recibos de status da Cloud API (26/10/2026)

O worker agora guarda o `wamid` retornado pela Graph API na tabela privada da outbox e marca o aceite inicial como `accepted`. O webhook assinado processa callbacks `sent`, `delivered`, `read` e `failed`, guarda somente código numérico de erro e timestamp, e resolve eventos pelo par canal/ID. Como a Meta informa que notificações podem chegar fora de ordem, prevalece o timestamp do provedor; estados com o mesmo segundo usam a prioridade local `read > delivered > failed > sent`, para preservar evidência positiva mais forte. Se o callback chegar antes da gravação do aceite, o evento fica numa tabela privada temporária por até 30 minutos e é reaplicado quando o worker grava o ID. Webhooks contendo apenas status não acordam o worker.

A API do Admin devolve somente estado, timestamp e código numérico; não devolve `wamid`, telefone, conteúdo ou ciphertext. A aba Mensagens agora distingue aceite pela Graph, envio, entrega, leitura e falha reportada. Falhas externas continuam sem retry automático e sem ação de reenvio na tela.

A migration `20261026004500_whatsapp_checkout.sql` recebeu as colunas/constraints e a tabela temporária de status; continua apenas no checkout local, sem aplicação. A Meta confirma que callbacks podem chegar fora de ordem e recomenda usar o timestamp para determinar a cronologia ([documentação da Meta](https://www.postman.com/meta/whatsapp-business-platform/request/rgtfq23/message-status-update-notifications)). A consulta ao changelog atual do Supabase não encontrou breaking change aplicável ao schema privado desta migration; a mudança anunciada para exposição automática trata de tabelas no schema público.

Verificações locais: `pnpm build` passou; o `tsc --noEmit` desse comando inclui `src` e as quatro entradas de Edge Functions declaradas em `tsconfig.json` (Admin API, Flow runtime, checkout webhook e outbox worker), com seus imports locais. `git diff --check` também passou. Deno CLI não está disponível para a checagem específica do language server/runtime Deno; a documentação atual da Supabase confirma que o CLI usa o próprio Edge Runtime e que o Deno separado é opcional para LSP e ferramentas Deno ([ambiente oficial de desenvolvimento](https://supabase.com/docs/guides/functions/development-environment)). Nenhum teste automatizado foi criado/executado. Nenhuma migration foi aplicada, função implantada, credencial configurada, chamada Meta/Bling, mensagem enviada ou Flow publicado. A automação de 30 minutos permaneceu ativa.

### Revisão incremental — desempate de callbacks (26/10/2026)

Na revisão seguinte, o desempate para timestamps iguais no segundo foi ajustado para `read > delivered > failed > sent`: uma confirmação de leitura/entrega é evidência positiva mais forte que um callback contraditório de falha com o mesmo timestamp. O timestamp continua sendo o critério primário, conforme a referência oficial da Meta. O código ANA e o catálogo de schema do Supabase foram consultados somente para leitura; não foram lidas linhas pessoais nem alterados os sistemas existentes. O changelog atual do Supabase mantém a mudança de 30/10 sobre exposição automática no schema `public`; o schema novo `whatsapp_atendimento` continua privado.

`pnpm build` e `git diff --check` passaram nesta revisão. O Deno CLI continua indisponível para type-check isolado de Edge Functions; nenhum teste automatizado foi criado/executado. Nenhuma migration aplicada, função implantada, chamada Meta/Bling, mensagem enviada ou Flow publicado. A automação permaneceu ativa.

## Continuação da Rodada 7 — compatibilidade com chaves Edge Functions do Supabase (26/10/2026)

A auditoria encontrou uma incompatibilidade concreta com as chaves nomeadas atuais: o Admin só tentava `SUPABASE_PUBLISHABLE_KEY` ou o legado `SUPABASE_ANON_KEY`, e o acesso privilegiado do Bling dependia exclusivamente de `SUPABASE_SERVICE_ROLE_KEY`. O runtime atual também fornece `SUPABASE_PUBLISHABLE_KEYS` e `SUPABASE_SECRET_KEYS` como objetos JSON nomeados; chaves novas `sb_publishable_`/`sb_secret_` devem ser enviadas no header `apikey`, sem `Authorization: Bearer` para a chave em si. Referências oficiais: [variáveis de ambiente das Edge Functions](https://supabase.com/docs/guides/functions/secrets) e [migração às chaves publishable/secret](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

Foi criado `supabase/functions/_shared/supabase-api-keys.ts` para escolher a chave `default` ou uma única chave nomeada não ambígua, com fallback às variáveis legadas. Admin, Flow runtime e checkout webhook agora compartilham essa resolução. O conector Bling envia chaves `sb_secret_` somente em `apikey`, mantendo o bearer apenas para `service_role` legado. O `.env.example` deixou de sugerir cadastrar `SUPABASE_DB_URL` como secret (nome reservado/injetado pelo runtime) e passou a listar `WHATSAPP_FLOW_ENDPOINT_URI`.

`pnpm build` passou, incluindo o type-check das quatro entradas de Edge Functions, e `git diff --check` passou. Nenhum teste automatizado foi criado/executado, conforme o limite desta etapa. Não foram lidos valores de secrets, nem aplicadas migrations, configuradas variáveis, alterada produção, implantadas funções, publicadas Flows ou feitas chamadas/envios Meta ou Bling.

## Atualização — Flow JSON recomendado e assinatura de sessão Meta (26/10/2026)

A leitura atual da documentação oficial da Meta mostrou que Flow JSON 7.3 é a versão recomendada e Data API 4.0 adiciona as proteções de endpoint descritas no changelog. Para 7.3 + 4.0, o corpo de Data Exchange pode trazer `flow_token_signature`, um JWT HS256 assinado com o App Secret e contendo o `flow_token`. O gerador local foi atualizado para esses números. O endpoint responde usando a versão Data API recebida; verifica criptograficamente a assinatura e a igualdade do token sempre que o campo vier, mantendo compatibilidade com chamadas antigas 3.0 sem assinatura. A verificação obrigatória da assinatura de corpo Meta continua em vigor para toda chamada. Fontes oficiais: [changelog de WhatsApp Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/changelogs) e [guia oficial de endpoint](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint).

A documentação da Meta diz que a verificação da plataforma é automática e que a assinatura adicional de token é opcional para o negócio; este endpoint aproveita e valida a assinatura quando fornecida, sem quebrar Flows existentes na versão 3.0. A validação real do JSON e do JWT de ponta a ponta ainda requer Flow Builder/aparelho e continua pendente da homologação externa. `pnpm build` e `git diff --check` passaram; nenhum teste automatizado foi criado/executado. Nenhum Flow foi publicado, função implantada, migration aplicada, mensagem enviada ou chamada Meta/Bling realizada.

## Revisão — contrato de venda Bling no conector ativo (26/10/2026)

Para fechar a divergência da Rodada 6, consultei pela ferramenta Supabase somente de leitura a Edge Function ativa `admin-service-intelligence-v1` (versão 381), sem ler dados de clientes nem valores de secrets. A rotina ativa cria a venda depois da separação com contato, data, `numeroLoja`, totais, itens (`produto`, `codigo`, `descricao`, `quantidade`, `valor`), transporte/etiqueta e observações. Não envia `dataPrevista`, `dataSaida`, `parcelas` nem `valorLista`; conserva a forma de pagamento na observação e gera NF-e pela ação do pedido. A OpenAPI oficial do Bling ainda documenta esses campos como obrigatórios, então o comportamento foi confirmado como referência operacional do conector atual, não como homologação do projeto novo.

O payload candidato do projeto novo agora tem a mesma forma do corpo realmente enviado. O hash operacional não inclui campos que seriam descartados antes do POST. Também removi o validador duplicado que exigia datas/parcelas ausentes e fazia qualquer leitura parecer divergente; a reconciliação ativa e o helper legado agora usam uma única conferência dos campos enviados. `CONTRACTS.md` identifica as notas da etapa inicial e registra a divergência oficial, sem afirmar homologação.

Verificação local: `pnpm build` passou (`tsc --noEmit` e Vite); `git diff --check` passou. Não criei nem executei testes automatizados. Não chamei Bling/Meta, não enviei mensagens, não publiquei Flow, não apliquei migration e não fiz deploy. A pendência concreta é validar em homologação controlada a divergência entre o OpenAPI oficial e o fluxo do conector Bling já ativo; essa operação externa segue desabilitada durante o desenvolvimento.
