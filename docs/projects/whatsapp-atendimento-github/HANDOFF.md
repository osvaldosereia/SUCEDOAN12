# Handoff — Admin de Atendimento WhatsApp com dados no GitHub

Atualizado em 25/10/2026 (America/Cuiaba).

## Objetivo do projeto

Criar um admin novo e independente para preparar a operação de cestas básicas pelo WhatsApp. O admin terá um cadastro simples de produtos, um editor de cestas inspirado no Vitrine Admin e um configurador de WhatsApp Flows da Meta para os dois números da Dona Antônia.

A meta de produto é evoluir o atendimento para que o cliente escolha e personalize a cesta dentro do WhatsApp, reduzindo a dependência do site público. A entrega será feita em etapas, com limites claros entre este projeto e a operação que já está no ar.

## Escopo autorizado e decisões atuais

- O projeto fica separado dentro do repositório osvaldosereia/SUCEDOAN12, em diretório próprio, com branch própria.
- Para este projeto, produtos, cestas e definições de Flow terão sua fonte versionada no GitHub. Não usar Supabase nesta fase, nem para banco, leitura ou escrita.
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

A documentação oficial da Meta descreve a troca de dados de Flows como uma chamada criptografada a um endpoint HTTPS que processa a solicitação e devolve resposta criptografada. GitHub Pages entrega arquivos estáticos e não executa esse endpoint. Portanto, dados dinâmicos, validação durante o Flow e preço atualizado exigirão um runtime HTTP fora do Supabase. A escolha desse runtime permanece em aberto.

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

Esse modelo é uma proposta de engenharia inicial, ainda não implementada. Ajustar campos somente depois de inspecionar a estrutura atual de cesta no Vitrine Admin e a exportação disponível sem Supabase.

## Identidade e modo de atuação para futuras conversas

Atue como Codex, colaborador técnico e programador sênior especializado em sistemas web e e-commerce. Priorize arquitetura modular, simples de operar, leve, validada, auditável e preparada para evolução. Antes de alterar arquivos, diferencie este projeto dos sistemas em produção e leia este handoff e o roadmap. Trabalhe em rodadas pequenas e concluídas, explique o que mudou e como foi verificado, não invente estados de Meta/GitHub, não exponha segredos e não peça confirmação repetidamente quando a ação já estiver autorizada. Respeite a instrução atual do projeto de não usar Supabase nem senha própria.

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
- Nenhum acesso ao Supabase foi feito nesta iniciativa.
- Nenhuma operação de criação, validação, publicação ou envio foi feita na Meta.
- Nenhuma mudança foi feita no main nem no deploy do site.

## Próxima ação

Continuar pela rodada 1 do roadmap: obter exportação estruturada das cestas e produtos referenciados pelo Vitrine Admin sem usar Supabase. Depois da coleta, provar o Flow dinâmico para marca/quantidade/remoção e cálculo do total pelo endpoint. Provar carrinho nativo só como alternativa se o negócio aceitar o total personalizado após o envio do carrinho. Fechar também a forma segura de gravação GitHub e o runtime HTTPS fora do Supabase antes de qualquer integração dinâmica. Inspecionar qualquer arquivo antes de normalizar os dados. Se não houver exportação pelo admin, solicitar CSV/JSON apropriado sem substituir esse passo por uma consulta Supabase.

## Instrução para retomar em uma nova conversa

Abra primeiro HANDOFF.md, IMPLEMENTATION-ROADMAP.md e FLOW-RESEARCH.md em docs/projects/whatsapp-atendimento-github/ na branch project/whatsapp-atendimento-github-20261025 do repositório osvaldosereia/SUCEDOAN12. Continue na próxima ação registrada. Mantenha o projeto separado, não toque em main nem no site/admin em produção, não use Supabase, não crie senha própria e não publique nem envie mensagens pela Meta. Antes de iniciar o código do admin, resolva a coleta de dados de cestas e documente o mecanismo seguro de persistência GitHub.

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

A pesquisa técnica e a comparação de sistemas estão em FLOW-RESEARCH.md. O padrão recomendado combina editor guiado, validação de schema, preview, teste em WhatsApp, versionamento e publicação manual separada por número. A Meta oferece update_data para atualização da tela após interações e imagens em opções de listas. O cálculo imediato do total e a seleção múltipla com quantidades independentes precisam de protótipo. O total final exige validação no endpoint HTTPS fora do Supabase. O runtime e o meio seguro de gravação no GitHub ainda não foram escolhidos.

Nenhuma chamada à API Meta, publicação, envio de Flow ou criação de endpoint foi feita durante a pesquisa.

## Verificação da exportação de cestas — 25/10/2026

A inspeção do código encontrou a ação downloadMetaCatalog em vitrine/admin/whatsapp-lab/lab.js. Ela exporta um CSV de 15 combinações de cesta preparado para importação manual de catálogo na Meta. Esse arquivo não é a exportação bruta das cestas, tipos, produtos relacionados, quantidades e ordem necessária para esta migração. Não usar esse CSV como fonte do novo catálogo.

O código do Vitrine Admin carrega composições pelo módulo vitrine/admin/basket-admin-api.js e por serviços existentes vinculados ao backend atual. Nenhuma chamada a esse backend foi feita nesta iniciativa, conforme a restrição de não usar Supabase. A exportação adequada continua pendente; o próximo passo é obter o arquivo estruturado pelo próprio painel, se essa opção existir, ou receber CSV/JSON com o formato listado no Roadmap.
