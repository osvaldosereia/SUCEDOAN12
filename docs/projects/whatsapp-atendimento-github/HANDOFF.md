# Handoff — Admin WhatsApp com cestas no GitHub e operação no Supabase

Atualizado em 26/10/2026 (America/Cuiaba).

> **Decisão vigente mais recente (26/10/2026):** o usuário determinou que produtos, estoque e imagens venham do Supabase. O novo Admin/Flow consulta apenas produtos referenciados nas configurações de cestas; saldo oficial é `public.ops2_loose_sellable_stock_v1.effective_sellable_stock`; imagens vêm de `public.products.image_url` e do bucket `product-images`. Pedidos confirmados criam reserva idempotente no schema privado deste projeto. O Admin não altera o saldo físico nem cria uma cópia de catálogo. GitHub mantém as cestas e os rascunhos Flow. Esta decisão substitui todas as referências históricas neste HANDOFF a produtos/imagens/estoque/baixa no GitHub.

## Estado verificado em 26/10/2026

O Admin estático está publicado em `https://donaantonia.com.br/whatsapp-admin/`; a autenticação usa link de e-mail Supabase, sem senha própria ou criação de conta, e valida o proprietário ativo. GitHub OAuth permanece desabilitado porque não é usado pelo login. As cinco Edge Functions greenfield estão ativas: `whatsapp-admin-api` v3 (`d1bd4fb6a353b723ce0fead5242bcbcd78ae6406c0777f267a39937fb8975c6b`), `whatsapp-flow-runtime` v3 (`2dc52c9a9ffc7a2da10d29a5772e994162d2748abc504cd2bf17fc83309ae395`), `whatsapp-checkout-webhook` v1, `whatsapp-meta-order-router` v1 e `whatsapp-outbox-worker` v1. Quatro migrations do projeto estão aplicadas.

O novo checkout e o roteador Meta estão implantados, mas o callback da Meta continua apontando para o serviço ANA existente: nenhum evento foi redirecionado nem atendimento existente alterado. A fila estava vazia antes da implantação do worker; nenhum envio, Flow, pedido ou NF-e real ocorreu. O worker só despacha mensagens quando `META_OUTBOX_SENDER_ENABLED` é explicitamente `true`. A chave de payload e o segredo interno de dispatch agora derivam, com HKDF e contextos separados, do segredo Meta já existente quando secrets explícitos próprios não estão configurados; não são necessários os nomes novos `META_OUTBOX_ENCRYPTION_KEY` e `META_OUTBOX_DISPATCH_SECRET` para o caminho padrão. Registros antigos continuam identificados como chave explícita/legada.

Bloqueios operacionais restantes: configurar as credenciais server-side do GitHub App (`GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_PRIVATE_KEY`) para salvar cestas/rascunhos na branch; fazer revisão isolada e autorização específica antes de trocar o callback Meta; configurar a chave pública do endpoint em cada número; publicar e vincular os Flows de ambos os números; manter o envio real fechado até homologar números/destinatários. A chave privada existente do 1018 agora pode atender o 0975 quando não houver uma chave própria para esse canal, sem cadastrar outro secret. Os secrets existentes nunca foram copiados para arquivos ou exibidos no chat. A integração Bling utiliza a conexão server-side já ativa no projeto; nenhuma escrita Bling ocorreu.

## Objetivo do projeto

Criar um admin novo e independente para preparar a operação de cestas básicas pelo WhatsApp. O admin terá um cadastro simples de produtos, um editor de cestas inspirado no Vitrine Admin e um configurador de WhatsApp Flows da Meta para os dois números da Dona Antônia.

A meta de produto é evoluir o atendimento para que o cliente escolha e personalize a cesta dentro do WhatsApp, reduzindo a dependência do site público. A entrega será feita em etapas, com limites claros entre este projeto e a operação que já está no ar.

## Escopo autorizado e decisões atuais

- O projeto fica separado dentro do repositório osvaldosereia/SUCEDOAN12, em diretório próprio, com branch própria.
- Decisão vigente: produtos, imagens e estoque usam o Supabase existente; o Admin consulta apenas os produtos associados às cestas e imagens pelo campo/bucket existente. GitHub mantém as composições das cestas e rascunhos Flow. Clientes/endereço continuam no Supabase. Não copiar dados pessoais para arquivos públicos.
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

## Continuação — barreira server-side para respostas humanas (26/10/2026)

A revisão somente de leitura da Edge Function ativa `admin-whatsapp-ops-v1` (versão 39, importada do commit GitHub `13d10dfcaa925340b0ce17011498cb6a502572fa`) e do SQL ativo encontrado no commit `74180257cfcee7b985611ccfa1e4aa9791fab665` confirmou que o enfileiramento `ops2_admin_attendance_enqueue_text_v3` verifica conversa/canal, janela de 24 horas, habilitação e homologação do canal, provedor, incerteza Meta e limite de frequência, mas não consulta o modo da conversa. Antes desta revisão, a API nova validava a conversa e o canal, deixando o modo humano apenas como condição da interface.

A função local `whatsapp-admin-api` agora consulta o snapshot server-side antes de encaminhar `send_text` e responde `409` se a conversa não estiver em `human` ou `human_copilot`, ou se `send_capability.enabled` não for explicitamente `true`. O envio continua passando pelo serviço ANA existente, que revalida atomicamente janela, habilitação/homologação, provedor, incerteza e limite. O contrato ativo não valida atomicamente o modo junto ao enfileiramento; permanece uma pequena janela de concorrência caso o modo seja alterado entre a leitura do snapshot e a aceitação do envio. Eliminar essa janela exige atualizar e homologar o contrato server-side de enfileiramento; isso não foi feito nem aplicado nesta rodada.

Verificações: `pnpm build` passou (`tsc --noEmit` e Vite); `git diff --check` passou, com aviso de conversão LF/CRLF do checkout. Nenhum teste automatizado foi criado/executado. Nenhum segredo foi lido, migration aplicada, função implantada, Flow publicado, mensagem enviada ou operação Meta/Bling escrita.

## Revisão incremental — atribuição do operador no atendimento (26/10/2026)

A auditoria read-only do SQL Supabase confirmou que o RPC `ops2_admin_attendance_takeover_v1` grava o operador responsável e impede a tomada de uma conversa já atribuída em modo `human`. A resposta de `ops2_admin_attendance_conversation_v1` omite esse ID; já `ops2_admin_attendance_enqueue_text_v3` não verifica a atribuição antes de enfileirar. Sem nova proteção, outro administrador ativo poderia tentar enviar por uma conversa atendida por uma pessoa diferente.

A API local agora consulta, server-side e por ID da conversa + canal, somente `mode` e `assigned_admin_user_id`. Envia ao navegador apenas o estado sanitizado `current`, `other` ou `unassigned`; o UUID do operador fica no servidor. O envio exige modo `human`/`human_copilot`, canal habilitado para envio e atribuição ao operador autenticado. A interface desabilita a resposta quando a conversa não pertence ao operador, oferece assumir quando não há responsável e pede confirmação antes de transferir uma conversa que aparece atribuída a outra pessoa. O RPC ANA existente continua responsável pelas alterações de atribuição e pela fila de envio.

Limite restante: a consulta de modo/atribuição e o RPC de enfileiramento são operações separadas. A API nova bloqueia tentativas diretas sem atribuição, mas ainda há uma janela de concorrência se outra sessão alterar o responsável depois da leitura e antes da aceitação. Fechar essa janela requer um contrato de enfileiramento que verifique modo e responsável atomicamente; não foi alterado nem aplicado.

A referência de autenticação Supabase confirma que a identidade autenticada segue no token de sessão enviado ao backend: [integração de Edge Functions com Auth](https://supabase.com/docs/guides/functions/auth-legacy-jwt). Código e RPC ativos foram consultados somente para leitura; nenhum dado de cliente ou valor de segredo foi lido. `pnpm build` passou (TypeScript e Vite), `git diff --check` passou com os avisos conhecidos de conversão LF/CRLF. Nenhum teste automatizado foi criado/executado, função implantada, migration aplicada, mensagem enviada ou chamada Meta/Bling escrita.

## Continuação da Rodada 7 — prévia protegida de anexos na Central (26/10/2026)

A Central WhatsApp agora mostra prévias sob demanda para imagens, áudio e vídeo e oferece download para documentos. A rota exige sessão autorizada, canal válido e que o identificador da mensagem esteja no histórico carregado da conversa. O servidor aceita apenas MIME conhecidos, verifica que a URL assinada veio do próprio Supabase, confirma o MIME real, limita o download a 32 MB e responde com `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`. O navegador recebe bytes e cria um `blob:` local; a URL assinada não é exposta à página. Os objetos Blob são revogados ao trocar conversa/canal, sair da sessão ou vencer o prazo informado.

A referência atual do Supabase informa que URLs assinadas de Storage são acessíveis a quem as possui durante sua validade e que a expiração do token e o cache CDN são prazos independentes ([guia oficial de entrega de arquivos](https://supabase.com/docs/guides/storage/serving/downloads), [cache CDN de arquivos assinados](https://supabase.com/docs/guides/storage/cdn/smart-cdn)). A ação existente do serviço ANA ainda pode preparar um cache privado do arquivo por até 30 dias quando o operador solicita a prévia; a interface não solicita nem baixa anexos automaticamente.

`pnpm build` passou (TypeScript e Vite) e `git diff --check` passou. Nenhum teste automatizado foi criado ou executado. Esta rodada não chamou APIs de mídia, não acessou conversa real, não enviou mensagem, publicou Flow, aplicou migration nem implantou função. Limite conhecido: anexos acima de 32 MB precisam ser baixados por outro processo operacional; a prévia do Admin os recusa para evitar consumo excessivo de memória.

### Revisão incremental — transmissão de anexos em fluxo (26/10/2026)

A referência oficial atual informa o limite de 256 MB de memória por Edge Function e recomenda transmitir arquivos em fluxo em vez de carregar o arquivo inteiro na memória ([limites de Edge Functions](https://supabase.com/docs/guides/functions/limits)). O proxy do Admin e a leitura do navegador agora usam `TransformStream`, contam os bytes enquanto processam e interrompem anexos acima de 32 MB. A mudança remove as cópias completas intermediárias de chunks e buffers; MIME allowlist, sessão, verificação de origem, `no-store` e revogação do `blob:` continuam em vigor.

A lista read-only do Supabase confirma `admin-whatsapp-ops-v1` ACTIVE v39; o código ativo obtido pela referência GitHub mostra que `action=media` pode criar cache privado para a mensagem. A interface chama essa ação somente quando o operador pede “Ver anexo”. Não invoquei a rota, não baixei mídias, não consultei conversa pessoal, não fiz gravação no Supabase, envio Meta/Bling, deploy, migration ou publicação de Flow.

`pnpm build` passou (`tsc --noEmit` e Vite); `git diff --check` passou. Nenhum teste automatizado foi criado ou executado. A pesquisa do changelog atual filtrada para Edge Functions não mostrou alteração breaking aplicável à transmissão HTTP usada aqui.

## Continuação local — catálogo fiscal e integridade das imagens (26/10/2026)

A consulta somente leitura a `public.products` no projeto Supabase `ssbesxgaijknwsjbsbcz` foi limitada aos quatro produtos então listados em `catalog/import-report.json`. Café Brasileiro 250 g e Close Up 70 g têm GTIN e ID Bling, mas `sku` é nulo na fonte; Personal 20 m e Superian 12 rolos têm SKU/GTIN, mas o ID Bling é nulo. Não converti GTIN em SKU nem inventei vínculo fiscal. A checagem posterior de `bling_hub_entity_links_v2` e `bling_hub_jobs_v2` confirmou os IDs dos dois primeiros; `product_identifiers` só registra os GTINs dos quatro. Nenhum vínculo foi encontrado para Personal/Superian.

A mesma consulta mostrou diferenças atuais entre `stock` do Supabase e `stockQuantity` do GitHub em três produtos consultados (Close Up: 300/296; Personal: 3/0; Superian: 2/0). O GitHub continua sendo o saldo operacional do novo projeto; não sincronizei nem sobrescrevi esses valores usando a base de referência. Café permanece em 4 nas duas fontes.

Uma revisão do payload ativo do Vitrine corrigiu a regra local: a venda envia `produto: { id }` e omite `codigo` quando não há SKU (`codigo: sku || undefined`). Assim, SKU é opcional quando o ID Bling está confirmado; apenas a falta do ID Bling bloqueia o produto. O Flow novo oferece produtos ativos com saldo positivo e ID Bling, o runtime recusa seleção direta sem esse ID e a cotação rejeita quantidade positiva sem vínculo. O item do pedido guarda SKU como `null` quando a origem não o informa e o payload fiscal omite `codigo`. “Não quero esse produto” continua disponível.

A consulta read-only às tabelas de vínculo encontrou IDs confirmados para Café/Close Up. Para Personal/Superian não há vínculo nos registros lidos; a tabela `public.bling_history_staging_items` citada por um caminho antigo não existe no schema atual. Não acionei o reconciliador do Vitrine: apesar do nome `readonly`, ele também grava vínculos e auditoria no Supabase. O catálogo GitHub e o relatório agora consideram SKU opcional e listam somente os dois IDs Bling ainda ausentes. `scripts/prepare_catalog.py` aplica a mesma regra.

Auditoria pontual dos assets, sem alterar arquivos: 61 produtos, 61 entradas únicas no manifesto e 61 imagens existentes; hashes e tamanhos conferem com o manifesto, dimensões continuam 240×190 e nenhuma excede 27 KB. Total versionado: 207.436 bytes; maior arquivo: 6.920 bytes.

A documentação oficial do Bling consultada descreve a API REST/OAuth e o recurso de leitura de produtos. O changelog atual do Supabase indica que a mudança de exposição automática em 30/10 se aplica a tabelas novas no schema público; o projeto mantém os dados operacionais no schema privado. Nenhuma incompatibilidade desta alteração local foi identificada.


Verificação: `pnpm build` passou, incluindo `tsc --noEmit` e o bundle Vite; `git diff --check` passou, com apenas avisos já conhecidos de conversão LF/CRLF no checkout. Nenhum teste automatizado foi criado/executado. Não houve escrita no Supabase/GitHub remoto/Bling/Meta, chamada de API operacional, migration aplicada, deploy, Flow publicado ou mensagem enviada. A pendência fiscal restante é obter IDs Bling verificados para Personal/Superian antes de oferecer esses itens quando voltarem a ter saldo positivo. `supabase/.temp/` continua intocado e não deve ser commitado.

### Busca adicional read-only — IDs Bling de Personal e Superian (26/10/2026)

Foram consultadas somente as linhas dos dois produtos pendentes em `product_fiscal_evidence`, `product_fiscal_catalog_scan_v1`, `ops2_catalog_product_parity_reviews`, `ops2_bling_orphan_product_reviews`, `bling_hub_jobs_v2`, `bling_hub_entity_links_v2`, `bling_product_binding_events` e `product_identifiers`. Não há evidência fiscal Bling, revisão de paridade, produto órfão, job de produto, vínculo ou evento de binding para os GTINs `7896110010731` e `7898901374626`; o scan registra zero evidências Bling para ambos. `product_identifiers` contém somente o GTIN já conhecido.

Não invoquei `blingHubReconcileProductsReadonly`: a implementação consultada faz GET no catálogo Bling, mas também grava vínculos e auditoria no Supabase. Não foi encontrada uma ferramenta de GET Bling que mantenha a consulta sem essas gravações. Portanto, os dois IDs continuam sem comprovação; nenhum ID foi inferido a partir de GTIN ou nome. Os produtos seguem fora do Flow enquanto não tiverem ID e saldo GitHub positivo.

A pesquisa oficial desta rodada confirmou que a mudança do Supabase em 30/10/2026 trata da exposição automática de novas tabelas no schema `public`; as novas tabelas deste projeto permanecem no schema privado `whatsapp_atendimento` ([changelog oficial](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)). Nenhuma migration ou alteração de grants foi necessária nesta rodada.

### Consulta local de vínculo Bling por GTIN (26/10/2026)

O editor de produtos ganhou uma consulta server-side opcional por GTIN/EAN. A API aceita apenas UUID de produto existente, lê o GTIN da revisão atual no GitHub, recusa GTIN inválido ou produto já vinculado, chama somente `GET /produtos?gtins[]=...` e devolve ID, nome e SKU sanitizados. O operador precisa conferir o resultado e selecionar o candidato; isso apenas preenche a prévia local. A gravação do vínculo segue a revisão normal do catálogo GitHub com o conflito otimista existente. Nenhum ID é inferido do nome ou SKU.

A referência oficial do Bling documenta `gtins[]` como filtro GTIN/EAN de `GET /produtos` desde 18/11/2025 ([changelog oficial](https://developer.bling.com.br/changelogs)). `BLING_PRODUCT_LOOKUP_ENABLED` e `BLING_OAUTH_ENABLED` permanecem `false` por padrão. A rota exige a sessão GitHub autorizada do Admin. A consulta real não foi chamada, pois as credenciais e a conta operacional não foram habilitadas nesta rodada; Personal 20 m e Superian 12 rolos continuam sem IDs verificados. Nenhuma migration, chamada Bling/Meta, deploy, mensagem ou publicação de Flow ocorreu. `pnpm build` e `git diff --check` passaram; não houve criação ou execução de testes automatizados.

## Autorização para concluir e estado operacional — 26/10/2026

O usuário autorizou prosseguir com as mudanças necessárias no GitHub e Supabase para colocar este Admin em funcionamento. Essa autorização substitui a antiga instrução de não implantar/aplicar migrations durante o desenvolvimento. Continua proibido expor valores secretos; publicar Flow ou enviar mensagens exige que a jornada esteja pronta e autorização operacional explícita. Nenhuma publicação ou mensagem foi feita nesta atualização.

### Já aplicado no Supabase

No projeto ativo `ssbesxgaijknwsjbsbcz`, foram aplicadas as migrations novas do diretório `projetos/whatsapp-atendimento-github/supabase/migrations/`:

- `20261026002149_whatsapp_flow_sessions.sql`
- `20261026004500_whatsapp_checkout.sql`
- `20261026005000_order_operations_bling.sql`
- `20261026040544_whatsapp_atendimento_channel_flow_bindings.sql`

A conferência SQL identificou as 14 tabelas privadas em `whatsapp_atendimento` e `public.whatsapp_flow_sessions`. Todas têm RLS; `anon` e `authenticated` não têm SELECT, e `service_role` tem SELECT. O advisor de segurança lista “RLS enabled, no policy” para essas tabelas, consistente com o isolamento esperado: são tabelas privadas com acesso apenas do backend; não se deve abrir políticas públicas para remover esse aviso. O projeto já tem muitos avisos históricos de segurança não relacionados; não foram alterados.

### Bloqueios de entrada em operação confirmados

1. **Login do Admin:** o botão GitHub do preview recebeu `Unsupported provider: provider is not enabled` do Supabase Auth. A conta/conector Codex consegue consultar banco e repositório, mas isso não habilita OAuth de operadores. O Auth exige um GitHub OAuth App com Client ID/Secret e callback registrado, além de redirects autorizados. Nenhum conector disponível nesta sessão administra esse provider/redirect nem o cofre de secrets; o dashboard aberto estava sem sessão. O preview agora explica o bloqueio em linguagem direta.
2. **Autorização de escrita no GitHub:** `whatsapp-admin-api` exige allowlist/origem e `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_PRIVATE_KEY`; o checkout exige a credencial GitHub App para reduzir estoque. Esses nomes não aparecem no runtime existente e não estão configurados pelo `.env.local` (que contém apenas URL/chave pública Supabase). Não usar PAT no navegador ou no chat.
3. **Flow 0975:** o código aceita o segredo Meta existente `META_WHATSAPP_APP_SECRET`, token `META_WHATSAPP_ACCESS_TOKEN`, versão `META_WHATSAPP_GRAPH_VERSION` e IDs de canais resolvidos por `public.whatsapp_accounts`. A fonte ativa confirma `DA_FLOW_1018_RSA_PKCS8`; não há evidência de chave privada do Flow 0975 no runtime. Não se leram valores de secrets.
4. **Entrega do pedido:** o webhook `whatsapp-checkout-webhook` trata callbacks Meta `nfm_reply`, mas o callback Meta atualmente configurado é `whatsapp-meta-webhook-v1`; não há ponte para o webhook novo. Sem essa integração, o cliente pode concluir o Flow sem que o pedido novo seja persistido.
5. **Endpoints:** nenhuma das quatro Edge Functions novas (`whatsapp-admin-api`, `whatsapp-flow-runtime`, `whatsapp-checkout-webhook`, `whatsapp-outbox-worker`) está implantada. O worker de envio permanece desligado. Implantar endpoints sem os segredos e sem o roteamento acima deixaria uma jornada incompleta, então não foi feito nesta atualização.

### Mudanças locais desta atualização

`supabase/functions/_shared/meta-config.ts` centraliza os aliases dos nomes de Meta já existentes e a resolução dos canais 0975/1018; Admin API, Flow runtime, webhook e outbox usam esse adaptador. O preview diferencia o login GitHub do acesso do conector e explica o que falta para liberar escrita. `pnpm build` (TypeScript e Vite) e `git diff --check` passaram nesta atualização. Não foram executados testes automatizados.

### Próximas ações, em ordem de bloqueio

1. Criar/configurar GitHub OAuth App e ativá-lo em Supabase Auth, com callback e redirects corretos; colocar usuário autorizado na allowlist.
2. Configurar GitHub App com permissões mínimas em `osvaldosereia/SUCEDOAN12` e carregar os três segredos somente no cofre server-side. Confirmar presença sem imprimir valores.
3. Gerar/carregar chave PKCS#8 do Flow 0975; confirmar as duas chaves/canais e credenciais Meta no runtime.
4. Implantar as quatro funções novas e verificar `/health`/contrato assinado sem enviar mensagens. Integrar o callback `nfm_reply` no caminho ativo da Meta sem substituir a operação ANA dos demais eventos.
5. Fazer login real, validar fila dos dois canais e rodar um pedido controlado: confirmar baixa única no GitHub, venda após separação, reconciliação e NF-e no Bling. Manter estoque negativo permitido para venda fiscal e manter outbox desligada até validar canal e destinatário.
6. Validar Flow JSON/imagens nos dois números e só então publicar/vincular cada Flow; verificar chegada do pedido no Admin e na conversa.

O projeto ainda **não aceita pedidos reais**. O próximo avanço que não depende do operador é terminar a revisão/deploy isolado das Edge Functions, mas o fluxo de cliente continuará bloqueado até OAuth/GitHub App, chave 0975 e o roteamento do callback serem resolvidos.

## Rodada — roteador de webhook isolado (26/10/2026)

Esta nota atualiza o bloqueio anterior: o roteamento agora está programado localmente, mas ainda não implantado nem selecionado no callback Meta.

### Revisão de referência ativa

Foi consultado somente o código implantado de `whatsapp-meta-webhook-v1` no projeto `ssbesxgaijknwsjbsbcz`; não foram consultados clientes, mensagens reais nem valores de secrets. A função normaliza mensagens interativas e o helper ANA lê o texto de `nfm_reply`, grava no histórico e pode enfileirar ANA. Ela não cria o pedido do checkout novo nem valida as sessões dele. O roteador separado é necessário para conectar o Flow novo sem substituir o serviço existente.

### Implementação local

- Criada `supabase/functions/whatsapp-meta-order-router/index.ts`, com `verify_jwt = false` apenas para entrada de webhook Meta. POST exige assinatura HMAC válida, limita corpo a 1 MB e repassa o payload filtrado com nova assinatura aos handlers que validam novamente.
- GET do protocolo Meta é relayed à função ANA ativa para reutilizar o token de verificação já configurado; não foi criado outro token obrigatório para o callback.
- Mensagens conversacionais e status de entregas antigas permanecem no handler ANA. Status são encaminhados ao checkout somente quando o `wamid` consta no outbox novo.
- Respostas `nfm_reply` só entram no checkout quando o hash do `flow_token` corresponde a uma sessão criada por este projeto, no mesmo canal e telefone. Respostas de Flow antigo seguem para ANA.
- A seleção de cesta e botões novos usam prefixo próprio (`wa-gh-*`), impedindo que interações antigas com IDs genéricos sejam capturadas. As intenções textuais foram estreitadas para início de compra, evitando interceptar frases gerais como “quero falar com atendente” ou “cadê meu pedido”.
- `supabase/functions/_shared/checkout-routing.ts` mantém essa classificação alinhada entre roteador e checkout. `tsconfig.json` inclui o roteador no type-check e `supabase/config.toml` registra a verificação JWT desligada para o webhook assinado.

### Verificação e estado

`pnpm build` passou, incluindo `tsc --noEmit` e Vite; permanece o alerta de chunk JavaScript acima de 500 KB. `git diff --check` passou com avisos de conversão LF/CRLF. Nenhum teste automatizado foi criado/executado. O `supabase/.temp/` fora da pasta do projeto permaneceu fora do staging.

O código está pronto para revisão local, mas deploy/cutover exigem confirmação server-side de `SUPABASE_DB_URL`, segredo Meta compartilhado, existência dos endpoints destinos e callback configurável. O projeto ainda tem bloqueios independentes: OAuth GitHub do Supabase desabilitado, allowlist/origens e GitHub App ausentes no runtime, chave Flow 0975 não localizada. O preflight não confirmou essas dependências, então não foi feito deploy nem mudança do callback. Nenhum Flow foi publicado, nenhuma mensagem enviada e nenhuma escrita Meta/Bling ocorreu.

Fontes Supabase consultadas: [autenticação de Edge Functions](https://supabase.com/docs/guides/functions/auth) e [cabeçalhos de autenticação](https://supabase.com/docs/guides/functions/auth-headers), sobre webhooks externos com verificação da assinatura do provedor no handler.

Commit da ponte local: `c96dc6f` (`feat: route basket checkout webhooks safely`), enviado para `project/whatsapp-atendimento-github-20261025`.

## Paridade funcional — canais 0975 e 1018 (26/10/2026)

Orientação do usuário: Flow idêntico nos dois números e os mesmos recursos do Admin. A conferência local encontrou um gerador de Flow compartilhado (`generateBasketFlow`) ligado ao mesmo catálogo GitHub; o JSON gerado não recebe o canal como entrada, portanto usa as mesmas telas, produtos, quantidades e regras. Os dois arquivos de rascunho inicial são iguais salvo pelo campo de identificação do canal (`channel`). O runtime e os módulos de atendimento, pedidos e catálogo expõem ambos os canais sem feature gate específico por número.

O Admin precisa manter separado somente o que pertence à conta/canal: número/WABA, Flow Meta ID, status, chave de criptografia e vínculo publicado. A tela de Flows agora explica que o conteúdo é igual e que essas credenciais/vínculos são por número. Não reutilizar chave privada de um canal no outro por suposição. `DA_FLOW_1018_RSA_PKCS8` foi observado no runtime; uma chave correspondente ao 0975 ainda não foi confirmada. Isso bloqueia criptografar/publicar/homologar o canal 0975, mas não justifica remover recurso ou tela do Admin.

Nenhum Flow foi criado, alterado ou publicado na Meta nesta etapa. A interface e o plano agora declaram a paridade do conteúdo entre 0975 e 1018. `pnpm build` (TypeScript e Vite) e `git diff --check` passaram; não foram criados ou executados testes automatizados. O commit `23a569d` foi enviado à branch do projeto. A rotina continua sem envio a clientes.

## Registro central de canais — paridade 0975/1018 (26/10/2026)

Para impedir que uma das linhas ganhe uma restrição funcional diferente, criei `src/domain/channels.ts` como fonte única da lista/tipo dos canais. Atendimento, Flow, pedidos, outbox, chaves Meta, filtro de contas, runtime e rotas do Admin/Edge Functions agora usam esse contrato. A derivação pelo telefone e pelo `whatsapp_accounts.slug` também é compartilhada; os handlers não mantêm mais listas TypeScript independentes de 0975/1018.

A mudança mantém todo o conjunto de telas e regras disponível aos dois números. Ela não unifica credenciais: IDs Meta, WABA, chaves de Flow e vínculos de publicação continuam isolados por canal. Nenhuma tabela ou sistema externo foi alterado. O Flow 0975 ainda precisa de chave privada própria no runtime para ativar criptografia e publicação.

Verificações locais: `pnpm build` passou (`tsc --noEmit` e Vite; alerta existente de bundle acima de 500 KB); `git diff --check` passou com avisos LF/CRLF. Não criei nem executei testes automatizados. O commit `aed3bbe` foi enviado à branch do projeto; nada foi implantado, publicado ou enviado a clientes.

## Rodada — sincronização dos rascunhos Flow (26/10/2026)

A auditoria de paridade encontrou que a tela gerava conteúdo idêntico, mas o endpoint gravava apenas `channel-0975.json` ou `channel-1018.json`. Uma edição podia deixar o outro canal com rascunho antigo. O endpoint agora valida os documentos dos dois canais e salva ambos na mesma árvore e no mesmo commit GitHub, compartilhando a lista de rascunhos e preservando o campo de canal de cada arquivo. As chaves, contas, IDs e vínculos Meta continuam separados.

A tela de revisão agora informa que a gravação afeta os dois arquivos. Após resposta de sucesso, o Admin atualiza os dois documentos com o snapshot sincronizado. Isso torna a paridade uma regra de persistência, não apenas uma consequência do mesmo gerador. Nenhum dado Meta, Flow publicado ou mensagem de cliente foi alterado.

Verificação: `pnpm build` passou (`tsc --noEmit` e Vite; permanece o aviso de bundle >500 KB) e `git diff --check` passou com avisos LF/CRLF. Não foram criados nem executados testes automatizados. O commit `4d414af` foi enviado à branch do projeto. Sem deploy ou escrita externa no Supabase/Meta/Bling.

## Preflight operacional read-only — funções e secrets (26/10/2026)

O conector Supabase confirmou que o projeto `ssbesxgaijknwsjbsbcz` está ativo. A listagem read-only de Edge Functions encontrou os handlers antigos `whatsapp-flow-data-exchange-v1` (v76), `whatsapp-meta-webhook-v1` (v30) e `whatsapp-1018-basket-flow-v1` (v7); os endpoints novos `whatsapp-admin-api`, `whatsapp-flow-runtime`, `whatsapp-checkout-webhook`, `whatsapp-outbox-worker` e `whatsapp-meta-order-router` não estão implantados. Não foram lidos dados de cliente nem código de produção nesta consulta.

O host não tem CLI Supabase global e o conector não oferece listagem/configuração do cofre de secrets nem do provider OAuth. A CLI oficial `supabase` 2.122.0 foi executada via `pnpm dlx`; `secrets list --project-ref ssbesxgaijknwsjbsbcz` retornou `AccessTokenRequiredError` porque falta `SUPABASE_ACCESS_TOKEN`. A documentação oficial descreve `supabase secrets list` como a forma de listar secrets do projeto ([referência CLI](https://supabase.com/docs/reference/cli/supabase-secrets-list)); nenhum nome ou valor de secret foi obtido. A GitHub CLI também não está instalada, então não foi possível listar nomes de secrets Actions. Logo, a presença de credenciais exigidas para um deploy seguro continua não confirmada. Nenhuma função foi implantada ou sobrescrita.

A anotação intermediária de estoque em `ROUND-7-OUTBOX-PLAN.md` foi marcada como supersedida: a fonte operacional do saldo permanece `stockQuantity` no catálogo GitHub, e o webhook faz baixa idempotente ao confirmar. O runtime novo lê o saldo da revisão GitHub. Isso corrige a documentação para refletir a orientação mais recente do usuário.

Uma checagem adicional de ferramenta `pnpm dlx deno --version` falhou no postinstall do pacote npm `deno` por falta do pacote opcional `@deno/win32-x64/package.json`. A última verificação válida de código segue sendo `pnpm build` (`tsc --noEmit` + Vite); não há ainda verificação própria do Deno Edge Runtime. Ativação continua dependente de provider OAuth/redirect, GitHub App e allowlist/secrets, chave do Flow 0975, roteamento Meta e homologação Bling. Nada foi publicado, enviado a clientes ou gravado em Meta/Bling.

## Revisão local da baixa de estoque e venda Bling (26/10/2026)

A leitura do código do checkout confirmou a baixa idempotente esperada: o saldo em `products.json` e um marcador opaco derivado do ID do rascunho entram na mesma árvore/commit GitHub. Repetição da confirmação encontra o marcador e não baixa novamente; conflito ao avançar o ref tenta reler o HEAD e recalcular. O pedido e o estado do rascunho são gravados na transação Supabase, então, se ela reverter depois do commit GitHub, a nova entrega retoma sem duplicar a baixa.

A revisão do pré-flight Bling confirmou que a venda exige separação concluída, itens conferidos, contato vinculado e total reconciliado; não há bloqueio por saldo local positivo no caminho de criação da venda/NF-e. Isso conserva a regra do usuário para saldo negativo. Revisão estática apenas, sem testes automatizados, alteração de dados, deploy ou chamada a serviço externo.

## Preflight de acesso ao Dashboard — 26/10/2026

Na continuação para ativar o projeto, o Admin local respondeu e carregou a lista versionada de produtos e cestas, mas permaneceu em prévia: o link OAuth retornou `Unsupported provider: provider is not enabled`. A navegação ao Dashboard de autenticação do projeto `ssbesxgaijknwsjbsbcz` redirecionou à tela Supabase de login; portanto, esta sessão não tem uma sessão do Dashboard para habilitar o provider. Não houve tentativa de criar conta, credencial, chave, secret ou alterar configuração.

Criei [ATIVACAO-ADMIN.md](ATIVACAO-ADMIN.md) com o callback GitHub verificado, allowlist local e os cadastros mínimos necessários. A documentação oficial consultada confirma que o OAuth App precisa do callback `https://<project-ref>.supabase.co/auth/v1/callback` e que a URL de retorno do Admin deve ser permitida em **Authentication → URL Configuration**. O endereço de produção do Admin ainda não foi escolhido/publicado, então não foi inventado um domínio para o OAuth.

Esta sessão não possui conector para gravar provider OAuth/secrets, criar GitHub App ou configurar Meta. `pnpm build` não foi executado porque só houve atualização documental; `git diff --check` será executado antes do commit. Nenhuma migration, função ou Flow foi publicado; nenhuma mensagem ou escrita Bling/Meta foi feita. Próxima ação humana indispensável: entrar no Dashboard Supabase como operador autorizado; a criação de OAuth/GitHub App e chaves persistentes requer confirmação imediata no momento da ação pela política da skill `computer-use`.

## Revisão pré-ativação — callbacks e roteamento (26/10/2026)

Uma revisão estática da branch não encontrou problemas críticos e apontou três falhas importantes no caminho de ativação. Corrigi-as localmente:

- `whatsapp-admin-api` agora desliga a verificação JWT do gateway para permitir o retorno OAuth do Bling, que vem de um redirecionamento externo sem JWT Supabase. O callback exige estado OAuth aleatório, de uso único e com expiração; todas as demais rotas continuam passando por `authorize()` e pela allowlist GitHub.
- O roteador só desvia `nfm_reply` para o checkout quando a sessão pertence ao canal e telefone e ainda está válida e não revogada. Se a consulta privada falhar ou a sessão estiver vencida, a mensagem segue para ANA e o evento não fica preso em retentativas de 502.
- O início do checkout exige uma frase explícita sobre comprar/montar uma cesta e um Flow publicado/vinculado ao número. Mensagens genéricas como “cesta”, “pedido” ou “quero comprar” continuam no histórico ANA; falha ao verificar o vínculo também deixa a mensagem na rota ANA.
- Status Meta que cheguem enquanto há envio novo sem WAMID persistido são encaminhados ao checkout e à ANA. O checkout guarda o status temporariamente e o worker o reconcilia quando grava o WAMID. Durante essa janela, outros WAMIDs do mesmo canal também podem gerar registros pendentes; eles expiram em 30 minutos e não alteram pedidos sem correspondência.

`pnpm build` passou (`tsc --noEmit` e Vite); permanece o aviso de bundle JavaScript de 618 KB. `git diff --check` passou, com os avisos locais de LF/CRLF do Windows. Não foi criado/executado teste automatizado. O roteamento ainda não foi implantado nem ligado ao callback Meta. As cinco funções novas continuam sem deploy; OAuth GitHub do Admin, GitHub App/allowlist/secrets e chave privada Flow 0975 seguem sem configuração confirmada. Não houve mensagem real, publicação de Flow, escrita Bling/Meta ou teste de venda/NF-e.

Preflight Supabase somente para leitura nesta rodada: nenhuma das cinco funções novas aparece na lista ativa. O projeto registra as quatro migrations deste projeto (`20261026120040`, `20261026120043`, `20261026120046`, `20261026120049`).

## Esclarecimento de hospedagem confirmado pelo usuário (26/10/2026)

O novo Admin fica no GitHub; o Supabase não hospeda a interface. O Supabase fornece Auth, dados de clientes e Edge Functions. `https://ssbesxgaijknwsjbsbcz.supabase.co/auth/v1/callback` é somente o callback técnico de OAuth. Não pedir ao usuário que escolha hospedagem no Supabase. Esta decisão já constava no HANDOFF, mas faltava destaque no roteiro de ativação e eu não apliquei a anotação ao responder; a inconsistência foi corrigida em `ATIVACAO-ADMIN.md` e no plano greenfield. Manter esta separação como fonte de verdade nas próximas rodadas.

## Publicação isolada do Admin (26/10/2026)

Configurei `.github/workflows/whatsapp-atendimento-github-publish.yml` na branch do projeto para compilar com Node 22 e publicar somente o conteúdo estático em `whatsapp-admin/` na `main`, pelo mecanismo já usado pelo domínio `donaantonia.com.br`. O endereço é `https://donaantonia.com.br/whatsapp-admin/`. A compilação roda sem permissão de escrita; apenas o job que copia esse diretório recebe `contents:write`. A ação publicou o caminho isolado com sucesso; a URL retornou HTTP 200.

`projetos/whatsapp-atendimento-github/index.html` inclui `noindex,nofollow` para manter o Admin fora de resultados de busca. O workflow leva somente a chave Supabase publicável para o bundle do navegador; nenhum segredo de servidor é gravado ou impresso. A etapa de publicação usa `rsync --delete` limitada ao diretório `whatsapp-admin/`, preservando o site raiz, `/site1/`, `/admin1/` e `/vitrine/`; faz até três tentativas caso outro deploy avance a `main` ao mesmo tempo.

Verificação local desta rodada: `pnpm build` passou (`tsc --noEmit` + Vite); persiste o alerta de chunk JavaScript acima de 500 KB. `git diff --cached --check` passou antes do commit de publicação `661f4b718`. A GitHub Action [40331576769](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/40331576769) terminou com `success` nos jobs de build e publish; confirmei HTTP 200 para a página e para o bundle JavaScript, o título do Admin e a meta `noindex,nofollow`. O preflight read-only atual listou 147 Edge Functions existentes e confirmou que nenhuma das cinco funções novas está implantada. Nenhum teste automatizado foi criado/executado. A interface está publicada, mas o Admin ainda não é operacional: OAuth GitHub do Supabase, Edge Functions novas, GitHub App/secrets/allowlist e chave própria do Flow 0975 continuam bloqueios concretos. O botão de login seguirá indisponível até habilitar o provider OAuth. Nenhum Flow ou mensagem foi enviado.

O conector Supabase disponível nesta sessão tem operação para deploy de Edge Functions, mas não permite consultar/gravar o cofre de secrets nem configurar providers Auth. Os nomes de runtime necessários foram inventariados na fonte local; a presença no projeto não pode ser confirmada via ferramenta. Não implantei as funções sem esse preflight. A aba atual de OAuth retorna `Unsupported provider: provider is not enabled`, e a navegação ao Dashboard exige sessão do operador. A skill `computer-use` proíbe automatizar a autenticação; o bloqueio manual concreto é entrar no Dashboard Supabase, habilitar o provider GitHub e configurar as credenciais/URLs. Depois disso, continuo o deploy e a validação das funções sem pedir novamente autorização geral.

## Diagnóstico do acesso e primeira função ativa — 26/10/2026

A tela mostrada pelo usuário juntava três requisitos como se fossem um único login: OAuth GitHub, sessão do Admin e autorização de gravar no catálogo. Essa leitura estava errada para o novo projeto. O Vitrine usa sessão Supabase e valida `public.admin_users`; o login do Admin novo foi alinhado a isso. Não é necessário habilitar GitHub OAuth para entrar no Admin.

O Supabase Auth agora aceita link de acesso por e-mail, sem senha própria e com `shouldCreateUser: false`. A autorização do servidor exige sessão Supabase válida e a conta vinculada a um proprietário ativo em `public.admin_users`. O provider Email está ativo e os redirects exatos de produção (`https://donaantonia.com.br/whatsapp-admin/`) e desenvolvimento (`http://127.0.0.1:5173/` e `http://localhost:5173/`) foram allowlisted; o Site URL global ficou intacto. Não lemos nem repetimos endereço de cliente.

A mudança do login foi publicada pelo workflow [40335760933](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/40335760933), conclusão `success`, no commit `e6d8dcbb5821c692ce080eac9b72aa8d9f3c8bcc`. O site e o bundle responderam HTTP 200; o bundle publicado contém `signInWithOtp` e `shouldCreateUser: false`.

A primeira tentativa de deploy da API nova foi recusada pelo empacotador Deno: imports locais sem `.ts` eram aceitos pelo build web, mas não resolvidos no runtime. Corrigi somente as extensões locais em `src/domain/flow-runtime.ts`, `flows.ts` e `outbox.ts`; `pnpm build` e `git diff --check` passaram. Não houve mudança de contrato ou regra comercial.

Foi implantada somente a nova Edge Function `whatsapp-admin-api`, versão 1 (`verify_jwt=false` no gateway porque as rotas administrativas verificam a sessão e o proprietário dentro do handler; o retorno OAuth de Bling usa estado de uso único). A lista do projeto agora contém 148 funções e somente esta função nova do projeto. Um GET sem sessão para `/attendance/accounts`, com origem de produção permitida, retornou 401 “Entre com o e-mail da sua conta administrativa”, confirmando que o endpoint está ativo e protegido sem retornar dados. A função poderá servir catálogo público, validar o operador e encaminhar as ações da Central aos endpoints ANA existentes.

### Estado de credenciais separado por finalidade

- **Login:** GitHub OAuth do Supabase não é necessário. O usuário entra pelo link enviado ao e-mail já vinculado à conta proprietária ativa.
- **Ler catálogo:** o repositório é público; a API pode fazer leitura sem credencial GitHub.
- **Gravar catálogo/rascunho Flow e baixar estoque:** a lista de secrets do runtime Supabase não tem credenciais do GitHub App (`GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_PRIVATE_KEY`). O Vitrine não usa GitHub como banco de produto, por isso as credenciais de leitura/operação dele não fornecem por si só um GitHub App com escrita nesta branch. O código agora falha fechado até as credenciais server-side serem configuradas.
- **Meta:** os nomes dos secrets Meta compartilhados e da chave 1018 estavam presentes no runtime; nenhum valor foi exibido. A chave do Flow 0975 não estava cadastrada. Isso é independente do login e do deploy da Admin API.

### Próxima execução

1. O operador usa “Entrar sem senha” em `https://donaantonia.com.br/whatsapp-admin/` e abre o link recebido no e-mail da conta Supabase já cadastrada; esse é o único passo imediato para validar a sessão real na tela.
2. Para gravar o catálogo no GitHub, adicionar/instalar um GitHub App com permissão Contents mínima para esta branch e configurar seus três secrets no runtime Supabase. O token de uma sessão Codex/GitHub e a autorização do Vitrine não podem ser reaproveitados como segredo server-side.
3. `whatsapp-flow-runtime` v1 está ativo e verifica HMAC/criptografia no próprio handler. Implantar `whatsapp-checkout-webhook` e `whatsapp-meta-order-router` após configurar GitHub App e revisar suas dependências; manter o roteador fora do callback ativo até verificar isoladamente a preservação ANA. `whatsapp-outbox-worker` permanece pendente e desligado até haver autorização operacional para mensagens controladas.
4. Conseguir a chave privada própria do Flow 0975, testar os dois canais com números controlados e só então preparar a ativação com autorização operacional.

Nenhum Flow foi publicado, callback Meta foi alterado, mensagem foi enviada, pedido/NF-e foi criado ou escrita Bling executada. `supabase/.temp/` segue fora do staging.


## Limpeza final das mensagens de acesso — 26/10/2026

A captura do usuário também revelou duas frases antigas na Central: “Entre com a conta GitHub” e o status vermelho “Sem permissão para gravar”. A primeira continuava em attendance-panel.ts; o segundo confundia login Supabase com a capacidade de gravar no GitHub. Atualizei o texto para informar a conta administrativa Supabase, o status para “Acesso não validado” quando a sessão não pode ser confirmada e o aviso para separar a sessão do requisito de GitHub App. O código da interface não exige GitHub OAuth.

A alteração foi compilada com pnpm build e passou git diff --check; busca pontual não encontrou as frases antigas no código da interface. Commit c34d4f40a enviado à branch. A Action 40337143085 terminou com sucesso; a página e o bundle atualizados respondem HTTP 200. O bundle contém o login por e-mail e a validação de proprietário ativo, sem as mensagens antigas de GitHub OAuth ou “Sem permissão para gravar”.


## Rodada — ativação isolada do Flow runtime (26/10/2026)

Preflight somente leitura: `whatsapp-flow-runtime` não existia na lista de funções. A última conferência de nomes de secrets confirmou a app secret Meta compartilhada e a chave própria do canal 1018; a chave do 0975 permanece ausente. O runtime do Supabase fornece as variáveis padrão de URL, chave API e conexão PostgreSQL. A função verifica assinatura HMAC e decifra o protocolo Data Exchange no próprio handler. `verify_jwt=false` é necessário para a chamada assinada pela Meta; nenhuma tela ou webhook foi configurado para apontar para ela.

A função nova foi implantada em `ssbesxgaijknwsjbsbcz` como `whatsapp-flow-runtime` versão 1, id `3dca2aea-eed0-42f9-803a-8e0a02a1a3ec`, bundle SHA-256 `20a626ce16e07401fb160e602889899e63ddbe1872cb7ff0afc568389cf1604c`. O deploy empacotou seis arquivos locais, sem valores secretos. A listagem pós-deploy retornou 149 funções no projeto, com `whatsapp-admin-api` v1 e `whatsapp-flow-runtime` v1 ativas. Não invoquei endpoint, publiquei Flow, alterei callback, enviei mensagem, li dados de cliente ou escrevi na Meta/Bling.

`pnpm build` (`tsc --noEmit` e Vite) e `git diff --check` passaram. O alerta conhecido do bundle >500 KB permanece; nenhum teste automatizado foi criado ou executado. `README.md` e este HANDOFF agora refletem dois deploys novos, sem as afirmações antigas de que nenhum estava ativo. O código de origem já estava na branch; esta rodada altera somente documentação.

Próximos bloqueios: obter credenciais GitHub App no runtime Supabase para gravação/baixa idempotente; implantar checkout e roteador após esse preflight; preservar ANA sem trocar callback até revisão específica; obter chave Flow do 0975; e validar a jornada controlada de pedido e NF-e. O worker de mensagens permanece desligado e nenhum Flow foi publicado.


## Acesso por e-mail e simplificação da tela de Flow — 26/10/2026

O usuário informou que não recebeu o link e pediu reenvio. Enviei novamente a solicitação de magic link ao Supabase Auth para a conta administrativa que já aparece autenticada na captura do Admin, com `create_user=false` e retorno para `https://donaantonia.com.br/whatsapp-admin/`. O endpoint aceitou a solicitação (HTTP 200); isso confirma o aceite do Auth, não a entrega na caixa postal. Ação imediata do operador: conferir Entrada e Spam. Se a mensagem não chegar, o próximo diagnóstico é a entrega/configuração SMTP do projeto Supabase; nenhuma senha ou conta foi criada.

A tela de Flows foi reorganizada para uma única configuração da cesta e uma única ação que sincroniza os rascunhos de 0975 e 1018. A prévia ficou em coluna única com seletores de produto e quantidade largos; o JSON técnico e a configuração operacional da Meta agora ficam recolhidos. Dentro da área Meta, a seleção do canal afeta somente conta, chave, Flow ID, publicação e vínculo daquele número, sem reiniciar nem duplicar a configuração compartilhada. A gravação continua sincronizando os dois documentos GitHub no mesmo commit.

A revisão de UX consultou os guias oficiais de Manychat (editor linear e mapa de automação) e Twilio Studio (um Flow pode atender vários números, com publicação explícita); apenas padrões de organização foram usados como referência. A mudança não copiou código ou UI. Fonte e decisões: [FLOW-RESEARCH.md](FLOW-RESEARCH.md).

Verificação local: `pnpm build` passou (`tsc --noEmit` e Vite; alerta anterior de bundle acima de 500 KB permanece) e `git diff --check` passou, com aviso de conversão LF/CRLF do Git no Windows. Nenhum teste automatizado foi criado ou executado. Os pushes Git locais foram recusados pelo GitHub com erro HTTP 500; os seis arquivos revisados foram então gravados na branch pelo conector, no commit `7ffe561e2ae7d9c8cf645d63e369f373d198d992`. A GitHub Action [40340182847](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/40340182847) concluiu build e publicação com sucesso. A URL de produção respondeu HTTP 200; sem cache, o bundle contém o título `Flow de pedidos`, o botão `Salvar para os dois números` e a área recolhida `Conexão com a Meta`. O cache HTTP ainda pode servir o HTML antigo por algum tempo; se a aba permanecer desatualizada, recarregue sem cache (Ctrl+F5). Nenhuma chamada de escrita à Meta, publicação de Flow, mensagem a cliente, deploy de função ou escrita Bling ocorreu. `supabase/.temp/` permanece fora do staging.


## Conferência dos nomes dos secrets enviados pelo operador — 26/10/2026

As capturas mostram os nomes `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_GRAPH_VERSION`, `META_WHATSAPP_VERIFY_TOKEN`, `DA_FLOW_1018_RSA_PKCS8` e `DA_FLOW_1018_RSA_PKCS8.pem`. Não copiei nem registrei valores. Os três aliases Meta compartilhados e a chave do Flow 1018 coincidem com aliases aceitos pelo runtime. A chave `.pem` não substitui a variável sem sufixo, que já está presente.

Identifiquei uma divergência na validação do webhook de checkout: o código lia apenas `META_WEBHOOK_VERIFY_TOKEN`, enquanto o ambiente existente usa `META_WHATSAPP_VERIFY_TOKEN`. Ajustei a leitura para aceitar os dois nomes, mantendo o primeiro como prioridade. `pnpm build` e `git diff --check` passaram; o build do frontend não compila Edge Functions e Deno não está instalado neste ambiente. Nenhum teste automatizado foi criado ou executado; a função ainda não foi implantada com essa alteração.

Os nomes abaixo não aparecem nas capturas e precisam ser conferidos/adicionados no Supabase para as respectivas etapas: `DA_FLOW_0975_RSA_PKCS8`; `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_PRIVATE_KEY`; `META_OUTBOX_ENCRYPTION_KEY`; e, para habilitar o worker de mensagens depois do preflight, `META_OUTBOX_DISPATCH_SECRET` mais `META_OUTBOX_SENDER_ENABLED=true`. O runtime também aceita aliases de chaves Flow `META_FLOW_PRIVATE_KEY_<canal>` e Meta `META_ACCESS_TOKEN_<canal>`, `META_GRAPH_API_VERSION`, `META_APP_SECRET`. Conferir apenas os nomes; nunca colar valores no chat ou em arquivos. **Não pedir credenciais `BLING_*` para venda/NF-e:** a integração compartilhada já fornece os tokens.

O ajuste do alias foi enviado à branch `project/whatsapp-atendimento-github-20261025` no commit `f99c86035`; o push local foi concluído. Este commit atualiza o código-fonte, mas não implanta a Edge Function. `deno` não está instalado aqui; a função ainda precisa de type-check/deploy pelo ambiente Supabase após o preflight de secrets. `supabase/.temp/` segue fora do staging.


## Correção — reaproveitamento da conexão Bling existente — 26/10/2026

Revisei a integração existente no Vitrine Admin e a nova API. O Vitrine obtém `client_id`, `client_secret` e `refresh_token` do provedor privado do Supabase por `get_bling_api_credentials_v1`, protegendo a rotação com `claim_bling_hub_oauth_lock_v2` / `release_bling_hub_oauth_lock_v2` e persistindo o token rotacionado por `set_bling_api_refresh_token_v1`. A nova API já usa esse mesmo provedor compartilhado para venda, reconciliação, NF-e e despacho; não precisa duplicar as credenciais Bling em secrets `BLING_*`.

Nesta rodada, alinhei também a consulta de produto por GTIN à conexão compartilhada e removi a cópia local de leitura/renovação de token que deixara o build com referência obsoleta. A busca continua protegida pela sessão autorizada do Admin e faz apenas GET ao Bling. Os endpoints OAuth autônomos antigos permanecem desabilitados sem `BLING_OAUTH_ENABLED`; não são necessários para a conexão compartilhada nem devem ser configurados para operar venda/NF-e.

O Admin compila (`pnpm build`, incluindo `tsc --noEmit` e Vite); a advertência de bundle acima de 500 KB permanece. `git diff --check` passou; somente o aviso conhecido de LF/CRLF do Windows foi emitido. Nenhum teste automatizado foi criado/executado, nenhum pedido/NF-e foi enviado e nenhuma escrita Bling/Meta ocorreu. A função não foi implantada nesta rodada; o ajuste está apenas na branch após o commit. O único segredo Bling específico novo deixa de ser requisito. O bloqueio de gravação GitHub continua sendo credencial de escrita do repositório, distinta do acesso Supabase usado pelo Vitrine.

O ajuste e esta correção foram enviados juntos à branch em `4ae058f61754afc73439c4de208a28b18c3510f9`. Não implantar `whatsapp-admin-api` até o preflight server-side de escrita GitHub; as operações de Bling usarão o provedor compartilhado já ativo.


## Ajuste de fonte do catálogo pedido pelo usuário — 26/10/2026

O usuário cancelou o banco de produtos GitHub e determinou que o estoque válido e as imagens sejam sempre consultados do Supabase, na mesma fonte do Vitrine Admin. O novo Admin/Flow consulta `public.products` apenas pelos UUIDs presentes em `catalog/baskets.json`, obtém disponibilidade em `public.ops2_loose_sellable_stock_v1.effective_sellable_stock` e URLs da coluna `image_url`/bucket `product-images`. Reservas de pedidos deste projeto reduzem a disponibilidade até a etapa fiscal; o código não atualiza `public.products.stock` nem tabelas/funções do Vitrine. O repositório mantém somente cestas e rascunhos Flow. A chave GitHub App, quando configurada, continua necessária para salvar esses arquivos, não para ler produto/estoque/foto.

Na branch local desta rodada, o runtime Flow, checkout e API administrativa leem produtos/estoque por UUID diretamente do Supabase; produtos fora das cestas configuradas não entram no catálogo do novo Admin. As fotos existentes são lidas de `products.image_url`; as novas fotos são convertidas no navegador para WebP 240×190 até 27 KB e armazenadas em `product-images`. A revisão do catálogo inclui metadados do produto Supabase e hash da configuração GitHub, sem incluir o saldo dinâmico. O editor altera apenas produtos já associados às cestas e não grava estoque.

Foram removidos do projeto os três JSON/manifests, o importador e as 61 miniaturas locais de produto, além do helper que baixava estoque via GitHub. Leitura de arquivos públicos do repositório agora é anônima; o GitHub App só é solicitado quando uma gravação muda as cestas ou os rascunhos Flow. O build estático passou em `pnpm build` (`tsc --noEmit` + Vite) e `git diff --check`; Deno e Supabase CLI não estão instalados localmente.

O preflight read-only no projeto `ssbesxgaijknwsjbsbcz` confirmou que os 61 IDs únicos das cestas existem em `public.products`, todos têm URL de imagem e linha em `ops2_loose_sellable_stock_v1`, e o bucket público `product-images` está presente. As funções ativas foram atualizadas pelo deploy oficial do Supabase: `whatsapp-admin-api` v2 (`77ada1bbee265ba265912ad32b59f898fac04d22d9c2731ba401d68b1d768b52`) e `whatsapp-flow-runtime` v2 (`bedadd17c8d2caff965cca6d1f4462dbc3974bf4534c5525e5d0a098b329e90d`). Ambas mantêm `verify_jwt=false` porque a própria API valida sessão/assinatura no handler; nenhum contrato de autorização foi removido. A interface atualizada foi publicada em `https://donaantonia.com.br/whatsapp-admin/`: a GitHub Action `40359522669` terminou `success`, e o HTML servido no `main/whatsapp-admin/index.html` aponta para o asset novo `index-LnXD2BJ8.js`. Nenhum teste automatizado foi criado ou executado. Nenhuma Flow foi publicada, mensagem enviada, escrita Bling/Meta feita, NF-e emitida, callback alterado ou dado do Vitrine atualizado. `supabase/.temp/` permanece fora do commit.

## Rodada ampla — fila segura e endpoints de checkout — 26/10/2026

Removi duas configurações manuais desnecessárias do caminho padrão da outbox. O helper `_shared/outbox-crypto.ts` deriva, com HKDF-SHA-256 e contextos separados, a chave AES-GCM do payload e o segredo bearer do worker a partir do segredo Meta server-side já usado pelo webhook. Secrets explícitos próprios continuam aceitos; cada payload gravado identifica o formato da chave no campo `payload_iv`, e registros antigos continuam exigindo a chave explícita original. O helper não retorna nem registra valores secretos. O gate `META_OUTBOX_SENDER_ENABLED` continua obrigatório para qualquer despacho.

Trade-off operacional: a chave derivada acompanha a rotação do segredo Meta. Drene a outbox antes de rotacionar esse segredo ou use uma chave explícita persistente para itens ainda pendentes.

Preflight somente leitura confirmou que o schema e as tabelas privadas de checkout/outbox, as sessões e a view de saldo existem. A fila estava vazia. As cinco Edge Functions estão ativas: `whatsapp-admin-api` v2 SHA `77ada1bbee265ba265912ad32b59f898fac04d22d9c2731ba401d68b1d768b52`; `whatsapp-flow-runtime` v2 SHA `bedadd17c8d2caff965cca6d1f4462dbc3974bf4534c5525e5d0a098b329e90d`; `whatsapp-checkout-webhook` v1 SHA `8f4e4408f0d9a0ed8e5a51adde9efd673f4edc20f273f140323990cac261e6eb`; `whatsapp-meta-order-router` v1 SHA `b236251563503a8f0d67a2956f884075976bfd29e1788c7a683599076fc9cd90`; `whatsapp-outbox-worker` v1 SHA `0ee0895b5082c77675d199b26643c974c9b55ad443c138ceb9475f072e1e39b8`.

`pnpm build` passou (TypeScript e Vite; JavaScript 411,36 KB, gzip 96,84 KB). As implantações Supabase dos três endpoints novos concluíram sem erro de compilação. A fila retornou zero mensagens antes do deploy. Nenhuma Flow foi publicada, mensagem real enviada, venda/NF-e criada, escrita Bling/Meta, callback trocado, nem tabela/dado/função ANA do Vitrine alterada. O callback continua no ANA existente.

Dependências para operar: secrets GitHub App para salvar cestas/rascunhos na branch; confirmar chave Flow do 0975; revisão/autorização separada para apontar callback Meta ao roteador; publicar e vincular Flows; homologar os dois números antes de abrir o gate de envio. Secrets dedicados de criptografia/dispatch da outbox não são mais pré-requisito do caminho padrão.

Código e handoff desta rodada estão na branch em `15d21cf29953d48840141496c81d5cfde3e7d15d` (`feat(whatsapp): reuse server secret for outbox security`).

## Rodada 9 — simplificar chave de Flow para os dois números — 26/10/2026

Consulta somente de configuração no Supabase confirmou que os canais 0975 e 1018 estão ativos e usam WABAs diferentes; nenhum ID de conta, número completo ou dado pessoal foi retornado. A coleção oficial Meta configura a criptografia pelo recurso `/{Phone-Number-ID}/whatsapp_business_encryption` ([referência Meta no Postman](https://www.postman.com/meta/whatsapp-business-platform/request/p9in1an/set-encryption-public-key)).

Para evitar solicitar um segredo duplicado, `flowPrivateKey("0975")` agora prioriza uma chave própria do 0975 e, se ausente, reutiliza a chave 1018 já existente no runtime. O Admin explica essa regra. Ao configurar o endpoint, a chave pública correspondente é registrada para o phone number selecionado. A reutilização do mesmo par em dois WABAs é uma inferência operacional baseada no endpoint específico por número e precisa ser validada pela releitura de `encryptionConfigured` após configuração. Não houve chamada POST à Meta nesta rodada. O risco é compartilhar entre os canais o impacto de uma eventual exposição da chave privada; uma chave própria do 0975 continua aceita e tem prioridade.

O preflight remoto confirmou as cinco funções deste projeto ativas nas versões anotadas acima. Nenhum Flow foi publicado ou vinculado, o callback Meta não foi alterado e não houve envio real, escrita Bling ou emissão fiscal. Pendências: credenciais GitHub App para salvar arquivos de cestas/Flow; após revisão operacional, registrar a chave pública para cada número; revisão específica da ponte/callback; publicar/vincular os Flows e homologar canais e pedido/NF-e. `pnpm build` e `git diff --check` passaram. O código e a explicação de UI estão no commit `2d5bf5e25f212a33bcc2525ddf989ef1d8c4e813`; o Admin foi publicado com sucesso pela Action `40365115483`. A tentativa de deploy pelo GitHub Actions comprovou que o secret `SUPABASE_ACCESS_TOKEN` está preenchido, mas está inválido: o CLI recebeu HTTP 401 `Invalid access token` antes de implantar qualquer função. Removi a workflow temporária para não deixar uma automação de deploy que falha repetidamente e publiquei as versões v3 diretamente pela conexão Supabase autorizada. Não li nem revelei o valor do token.

## Regra de execução atualizada — 26/10/2026

O usuário interrompeu as rodadas automáticas: não agendar nem reativar automações periódicas. A prioridade é concluir e ativar o projeto em sequência, sem repetir diagnóstico e sem parar após apenas listar bloqueios. Usar as conexões remotas de GitHub e Supabase para consultar, alterar e implantar o que estiver autorizado; não tratar preview isolado ou arquivos na máquina do usuário como o Admin publicado. Usar o Vitrine apenas para localizar integrações e credenciais server-side já existentes, sem copiar sua implementação nem solicitar novamente credenciais que já estão disponíveis no ambiente correto. Fazer ações concretas e seguras em cada turno; registrar no HANDOFF resultado, hash e a próxima dependência operacional exata. Não publicar Flow, enviar mensagens reais, mudar callback Meta, escrever no Bling ou emitir NF-e sem autorização específica já registrada.

## Continuação focada — validação de credenciais e execução remota (26/10/2026)

Leitura de fonte remota confirmou que a Edge Function existente do Vitrine para Meta Flows usa `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_GRAPH_VERSION`, `META_WHATSAPP_APP_SECRET` e `DA_FLOW_1018_RSA_PKCS8`, e que o helper chama `/{phone-number-id}/whatsapp_business_encryption` para consultar/registrar a chave pública. A nova `whatsapp-admin-api` usa os aliases Meta compartilhados e possui rotas autenticadas próprias para o mesmo recurso; portanto, não cadastrar cópias desses secrets. A função nova está ativa junto das outras quatro (`whatsapp-flow-runtime`, `whatsapp-checkout-webhook`, `whatsapp-meta-order-router`, `whatsapp-outbox-worker`). A verificação consultou nomes/código, nunca valores de secrets nem dados pessoais.

O bloqueio para concluir agora é de execução autenticada, não de implementação nem de credenciais Meta: os conectores disponíveis permitem consultar/deployar as funções, mas não invocar a rota da API usando a sessão owner já iniciada no Admin. O usuário autorizou registrar a chave pública para 0975 e 1018; esse ato ainda não foi realizado. A tela publicada oferece status/configuração por canal e deve ser usada com a sessão Admin existente. As rodadas automáticas permanecem pausadas conforme pedido; não as reativar.

## Correção de execução e login no Admin — 26/10/2026

O usuário determinou que o trabalho de código seja feito diretamente no GitHub/Supabase, sem editar o checkout da máquina. Esta rodada atualizou `src/admin/main.ts` e `src/admin/flows-panel.ts` diretamente na branch. O Admin agora diz corretamente que a conta Supabase existente é reutilizada; o link de e-mail serve somente para iniciar uma sessão quando não há sessão ativa. A seção Meta esclarece que token/chaves existentes permanecem no servidor e que registrar a chave pública não publica o Flow. Regra de atendimento: se o e-mail do operador já aparece no cabeçalho e há botão Sair, não enviar outro magic link; a sessão já está ativa. O envio anterior de link foi desnecessário por eu não ter conferido esse estado.

Commits de código: `3dd5d552240d68a0a260e89f52706e5472e3e5ed` e `213ca599ab283451fd4354eb7e7e6dc38441d58e`. O workflow GitHub `Publish WhatsApp Atendimento Admin` executou os builds e publicou os dois commits com sucesso (runs `40372897964` e `40372917424`). O `whatsapp-admin/index.html` do `main` agora referencia `assets/index-x4meayBC.js`, e a leitura remota do asset confirmou as três mensagens atualizadas. Nenhum arquivo foi editado localmente, nenhum magic link novo foi enviado, nenhuma credencial foi lida e nenhuma operação Meta ocorreu.

A autenticação continua sendo a sessão Supabase já existente porque as rotas administrativas protegem leituras e escritas; isso não exige novo login enquanto essa sessão permanece ativa. O projeto segue sem rodadas periódicas. Próxima ação técnica autorizada: usar no painel publicado a sessão existente para consultar/configurar a chave pública Meta individualmente nos dois números; não publicar Flow ou enviar mensagens.
