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

O Flow JSON local usa versão 6.0/Data Exchange 3.0 e o endpoint retorna a mesma tela `GROUP` para cada tipo antes de abrir `CUSTOMER_REVIEW`. O webhook valida a seleção contra a revisão do catálogo fixada pela sessão e enfileira a conclusão. A conclusão do Flow não confirma pedido. A mensagem posterior com Confirmar/Editar/Cancelar não é entregue nesta implementação porque ainda não há consumidor da outbox. Novo cadastro de cliente/endereço não é criado: a consulta Supabase exige cliente ativo, único e endereço ativo.

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
