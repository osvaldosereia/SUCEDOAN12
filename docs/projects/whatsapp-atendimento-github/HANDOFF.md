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

Flow estático não deve ser descrito como se consultasse dados ao vivo. A Meta documenta o componente Image, mas o vínculo dinâmico e a experiência de múltiplas opções com quantidades independentes precisam ser provados no schema atual e em WhatsApp real. A referência oficial do endpoint está em https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint e dos componentes em https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components.

## Experiência desejada para o Flow

Preservar as decisões já comunicadas pelo usuário, sempre conferindo o que a Meta realmente suporta:

1. Mostrar os tamanhos de cesta e o menor preço disponível / indicação “A partir de”.
2. Depois da escolha do tamanho, avançar por tipo de produto, uma etapa por vez.
3. Mostrar as opções de produtos com nome e preço individual; iniciar com a opção mais barata quando a regra comercial permitir.
4. Permitir mais de uma opção de produto quando o tipo da cesta permitir, com quantidade por produto.
5. Atualizar o total enquanto o cliente personaliza a cesta, quando suportado pelo contrato real do Flow.
6. Encerrar com resumo claro antes da confirmação.

A Meta documenta um componente Image; confirmar o formato de imagem, ligação dinâmica e limites vigentes antes de prometer fotos. Não presumir cartões, carrosséis ou controles +/- personalizados. Para múltiplas escolhas com quantidades próprias, validar primeiro a combinação de seleção múltipla, campo numérico, regras de navegação e endpoint.

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

Continuar pela rodada 1 do roadmap: obter exportação estruturada das cestas e produtos referenciados pelo Vitrine Admin sem usar Supabase. A pesquisa de Flows já está documentada; depois da coleta, fechar o design do admin e resolver a forma segura de gravação GitHub e o runtime HTTPS fora do Supabase antes da integração dinâmica. Inspecionar qualquer arquivo antes de normalizar os dados. Se não houver exportação pelo admin, solicitar CSV/JSON apropriado sem substituir esse passo por uma consulta Supabase.

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

A pesquisa técnica e a comparação de sistemas estão em FLOW-RESEARCH.md. O padrão recomendado combina editor guiado, validação de schema, preview, teste em WhatsApp, versionamento e publicação manual separada por número. A Meta oferece Flow estático e dinâmico; a cesta com preço e total confiáveis exige endpoint HTTPS fora do Supabase, mantendo chave privada/token no servidor. O runtime e o meio seguro de gravação no GitHub ainda não foram escolhidos. Imagens têm componente oficial, mas o vínculo dinâmico e a seleção múltipla com quantidade individual continuam como verificações obrigatórias antes do escopo final do Flow.

Nenhuma chamada à API Meta, publicação, envio de Flow ou criação de endpoint foi feita durante a pesquisa.

## Verificação da exportação de cestas — 25/10/2026

A inspeção do código encontrou a ação downloadMetaCatalog em vitrine/admin/whatsapp-lab/lab.js. Ela exporta um CSV de 15 combinações de cesta preparado para importação manual de catálogo na Meta. Esse arquivo não é a exportação bruta das cestas, tipos, produtos relacionados, quantidades e ordem necessária para esta migração. Não usar esse CSV como fonte do novo catálogo.

O código do Vitrine Admin carrega composições pelo módulo vitrine/admin/basket-admin-api.js e por serviços existentes vinculados ao backend atual. Nenhuma chamada a esse backend foi feita nesta iniciativa, conforme a restrição de não usar Supabase. A exportação adequada continua pendente; o próximo passo é obter o arquivo estruturado pelo próprio painel, se essa opção existir, ou receber CSV/JSON com o formato listado no Roadmap.
