# Roadmap de implementação — Admin WhatsApp com dados no GitHub

Projeto: WhatsApp Atendimento GitHub — SUCEDOAN12
Branch de trabalho: project/whatsapp-atendimento-github-20261025
Base inicial: main em a9ae61f44321e93e99ef93e15a014253a202e35e
Atualizado: 25/10/2026 (America/Cuiaba)

## Regras de execução

- Cada rodada deve produzir um resultado pequeno, revisável e utilizável.
- Todo trabalho de código futuro começa nesta branch e dentro de projetos/whatsapp-atendimento-github/. Documentação do projeto fica em docs/projects/whatsapp-atendimento-github/.
- Não alterar main, o site público, Vitrine Admin, catálogo de produção, banco operacional ou configurações existentes.
- Não usar Supabase como banco de produtos/cestas. O escopo atual permite consulta server-side ao cadastro de clientes/endereço; não gravar pedidos nem alterar schema de produção antes da revisão do contrato existente.
- Não criar senha própria para o admin.
- Não publicar site/admin nem alterar Flow Meta enquanto isso não for uma etapa planejada e autorizada.
- Nenhum segredo ou dado de cliente pode ser salvo em JSON versionado ou JavaScript entregue ao navegador.
- A funcionalidade final deve ser comparada com os componentes e contratos oficiais atuais da Meta.

## Rodada 0 — Início e isolamento

Estado: concluída nesta data.

- [x] Localizar o repositório SUCEDOAN12, confirmar que main é usado pelo site/Admin existentes e registrar o HEAD.
- [x] Conferir especificações de Flow já presentes para não confundir o escopo.
- [x] Criar a branch própria, sem alterar main.
- [x] Registrar decisões, limites, estado atual e instrução de retomada em HANDOFF.md.
- [ ] O código da aplicação ainda não começou.
- [ ] A branch ainda não foi publicada nem implantada.

## Rodada 0.5 — Pesquisa do configurador de Flows

Estado: concluída em 25/10/2026. Pesquisa Meta e comparação de padrões de Blip, Infobip, WATI, Twilio e Gupshup registrada em FLOW-RESEARCH.md.

- [x] Distinguir Flow estático de dinâmico e registrar por que preço e total de cesta exigem validação em endpoint.
- [x] Documentar ciclo Draft/Published, preview, validação, teste e retorno ao atendimento.
- [x] Definir recomendações de interface: wizard guiado, modo JSON avançado, status separado por canal e publicação manual.
- [x] Registrar limites de segurança, endpoint HTTPS privado, imagens/quantidades e necessidade de prova no schema e em WhatsApp real.
- [ ] Nenhum runtime, integração Meta, Flow, produto, cesta ou tela foi criado nesta rodada.

Saída: pesquisa técnica e requisitos iniciais revisáveis em docs/projects/whatsapp-atendimento-github/FLOW-RESEARCH.md.

## Rodada 0.6 — Alternativa nativa para produtos e quantidades

Estado: pesquisa inicial revisada após detalhar as regras da cesta. Flow dinâmico é a jornada principal recomendada; prova em número controlado pendente. Análise em BASKET-ORDER-RESEARCH.md.

- [x] Comparar Flow com mensagens de catálogo/produtos, carrinho nativo, listas e botões da Meta.
- [x] Registrar que catálogo/carrinho permite alterar e remover itens, mas calcula uma estimativa a partir dos produtos e preços do catálogo.
- [x] Identificar que a cesta SUCEDOAN12 exige preço-base próprio, alternativas de marca, quantidade por posição e ajuste interno não itemizado; carrinho sozinho não aplica essa fórmula.
- [x] Recomendar Flow dinâmico com endpoint para validar escolhas e recalcular o total; Flow não oferece controle nativo +/−, então a prova usará seleção de quantidade por lista.
- [x] Definir GitHub como fonte dos produtos/composição e manter o ajuste comercial confidencial fora do repositório público.
- [ ] Com exportação das cestas em mãos, validar num número controlado: quantidade por item, pedido no webhook, regra da cesta, preço e comportamento entre mensagens.
- [ ] Escolher entre carrinho, Flow ou combinação somente após a prova.
- [ ] Nenhum catálogo foi sincronizado e nenhuma chamada Meta foi feita.

## Rodada 0.7 — Decisão técnica para a cesta econômica

Estado: pesquisa concluída em 25/10/2026; implementação pendente. Relatório completo em BASKET-ORDER-RESEARCH.md.

- [x] Comparar catálogo/carrinho, Flow dinâmico, mensagens de lista/botões e recursos de respond.io, Infobip, WATI e Blip.
- [x] Definir Flow dinâmico como hipótese principal, pois o endpoint calcula o preço-base + ajuste interno + produtos/marcas/quantidades escolhidos.
- [x] Definir catálogo/carrinho como alternativa para compra livre; total estimado do carrinho não representa sozinho o preço personalizado da cesta.
- [ ] Após obter composição atual, validar marca, quantity selector, zero para remover, imagens, atualização do total por etapa, preço final e webhook nos dois números.
- [ ] Decidir privadamente o valor/ajuste interno de cada tamanho e confirmar o que o cliente verá antes de confirmar.

## Rodada 1 — Levantamento da cesta e plano de importação

Estado: bloqueada aguardando exportação bruta. A inspeção encontrou somente um CSV de 15 combinações preparado para catálogo Meta; ele não contém as relações completas de cestas/produtos/quantidades e não será usado como importação. A tela de composição usa o backend atual, que não foi chamado.

Objetivo: trazer apenas os produtos usados nas cestas atuais por exportação do Vitrine Admin/arquivo estruturado, sem usar Supabase como fonte do catálogo.

- Inspecionar o caminho disponível no Vitrine Admin para exportar tamanhos, tipos, produtos relacionados, quantidades e ordem.
- Preferir exportação já oferecida pelo admin ou arquivo que o usuário possa baixar do admin.
- Inventariar cada cesta e cada referência de produto antes de criar os arquivos de destino.
- Deduplicar por identificador estável do produto; usar SKU/GTIN como conferência quando presentes. Não deduplicar apenas por semelhança de nome.
- Produzir um manifesto de importação com contagem de cestas, relações e produtos únicos, e marcar referências sem correspondência.
- Confirmar que nenhum produto fora das composições das cestas entrou no conjunto.
- Se não houver um caminho de exportação no Vitrine Admin, documentar o bloqueio e solicitar um CSV/JSON exportado. Não substituir por leitura Supabase.

Saída: inventário revisado e manifestação de importação antes de gravar o catálogo inicial.

## Rodada 2 — Modelo de dados e carga inicial versionada

Objetivo: estabelecer o catálogo mínimo independente e reproduzível.

- Criar produtos e cestas em documentos JSON separados, com schema_version.
- Usar IDs estáveis; guardar preço em centavos; representar valores opcionais como nulos; validar links de imagem.
- Produtos entram apenas quando referenciados por uma cesta importada.
- Guardar composição e regra comercial na cesta, não duplicar produto por tamanho.
- Manter ordem explícita de tamanhos, tipos e produtos elegíveis.
- Registrar fonte e referência de origem para rastrear a importação, sem guardar dados pessoais.
- Definir política de atualização para que uma mudança futura no Flow não altere silenciosamente dados comerciais.

Saída: arquivos de dados pequenos, legíveis, com validação de estrutura e comparação com o manifesto.

## Rodada 3 — Admin de produtos e cestas

Objetivo: entregar a primeira interface administrativa simples.

Cadastro de produtos:
- Lista pesquisável, estado ativo/inativo e formulário objetivo.
- Campos mínimos confirmados após a rodada de importação: nome, marca, preço, imagem e identificador.
- Mostrar claramente que esses produtos compõem cestas; não reintroduzir o catálogo completo do site.

Editor de cestas:
- Gerir tamanhos de cesta.
- Gerir tipos de produtos da cesta e produtos elegíveis por tipo.
- Definir quantidade/limite para cada tipo em cada tamanho.
- Definir ordem de exibição e, quando permitido, selecionar mais de um produto do mesmo tipo com quantidades separadas.
- Mostrar prévia e preço mínimo / “A partir de” com base nos produtos configurados.
- Permitir revisar mudanças antes de persistir os arquivos.

Persistência e acesso:
- Não colocar credencial de escrita no cliente web.
- Admin sem senha própria não significa permissão de escrita anônima no GitHub.
- Até ser definido um fluxo de gravação seguro com a identidade GitHub autorizada, trabalhar em preview/local ou somente leitura. O arquivo JSON continua sendo a fonte de verdade do GitHub.

Saída: interface revisável, ligada ao catálogo/cestas versionados sem afetar a aplicação atual.

## Rodada 4 — Configurador de WhatsApp Flow

Estado: pesquisa de Flow e composição de cesta documentadas; Flow dinâmico é a hipótese principal. Implementação aguarda exportação e prova em número controlado. Detalhes em FLOW-RESEARCH.md e BASKET-ORDER-RESEARCH.md.

Objetivo: permitir seleção de marca, quantidade e remoção dentro do WhatsApp, com total calculado pela regra comercial da cesta e validado no servidor.

- Manter configuração independente para os dois números; finais 0975 e 1018 são apenas referências até confirmar WABA ID e phone number ID.
- Começar pela lista/botões de tamanho e abrir um Flow dinâmico associado à revisão da cesta.
- Em cada posição, oferecer marcas permitidas, imagem/preço conforme suporte validado, quantidade por lista com valor padrão e zero para retirar.
- Configurar nome, categoria, telas, navegação e referência explícita à revisão da cesta.
- Manter o catálogo/carrinho como hipótese secundária caso a prova mostre que o cliente prefere a edição nativa e aceite receber o preço personalizado após enviar o carrinho.
- Usar wizard guiado como caminho principal e editor JSON avançado opcional; cada bloco deve mapear para componente oficial.
- Validar JSON contra schema e componentes Meta; apontar erro por tela/campo.
- Oferecer prévia, teste em número controlado e publicação manual, com Draft/Published e saúde do endpoint por canal.
- A Meta documenta imagens em opções de listas (limite atual: 100 KB por imagem de opção); validar assets e renderização em WhatsApp real antes de prometer fotos.
- A ação update_data (Flow JSON v6.0+) pode atualizar o estado da tela após interações sem chamar o servidor; provar se o total pode ser exibido corretamente quando seleção e quantidade mudam.
- Provar seleção de marca e quantidade por lista dentro do Flow, com quantidade zero para remover item.
- Fazer o endpoint recalcular preço após cada avanço e devolver o novo total na tela seguinte; validar novamente na conclusão.
- Não prometer atualização a cada toque nem controle +/− no Flow antes de prova oficial em aparelho.
- A tela pode dar feedback via update_data, mas o total final deve ser recalculado/validado no servidor pelo endpoint HTTPS isolado previsto para a rodada 5.
- Nenhuma publicação ou mensagem a cliente nesta rodada.

Saída: Flow JSON versionado com regras da cesta, preço atualizado e webhook conferidos em canal controlado. A publicação permanece separada e manual.

## Rodada 5 — Runtime dinâmico e consulta de cliente

Recomendação técnica: usar uma Edge Function nova e isolada no projeto Supabase existente como candidata principal ao endpoint HTTPS/Data Exchange e webhook, pois agora há autorização para consultar cliente/endereço pelo backend. A função lê a revisão de produto/cesta no GitHub e não usa Supabase como banco do catálogo. Não alterar nem publicar função existente durante esta rodada.

Objetivo: preparar o runtime privado da jornada, sem alterar a operação atual.

- GitHub Pages e arquivos JSON servem a interface e a fonte versionada, mas não executam a troca criptografada da Meta nem protegem segredos.
- Usar o flow_token para associar a sessão ao remetente e canal; manter o token opaco e curto.
- Reutilizar o resolvedor canônico de cliente após revisar código, permissões e comportamento em telefones ausentes/ambíguos.
- Buscar no GitHub uma revisão identificável e imutável de produtos/cestas; manter cache curto por revisão para atender o prazo da Meta.
- Calcular valores no servidor; validar payload, remetente, canal, revisão, preço, quantidades e disponibilidade.
- Manter chave privada, token Meta e chave Supabase exclusivamente em segredos do servidor; nunca os enviar ao navegador.
- Não escrever em papoai_order_drafts_v2 ou orders até confirmar qual serviço/RPC mantém as regras e efeitos atuais de criação do pedido.
- Responder ao endpoint dentro do limite documentado pela Meta (10 segundos), com logs sem PII.

Saída: contrato e ambiente isolado revisados. Nenhuma função existente alterada e nenhum dado de cliente ou pedido escrito.

## Rodada 6 — Resumo, confirmação e criação do pedido

Objetivo: fazer o Flow retornar à conversa com um resumo legível e criar o pedido somente após confirmação explícita.

- A conclusão do Flow gera um evento para o webhook; o backend recalcula total e disponibilidade antes de montar o resumo.
- Enviar ao mesmo chat uma mensagem com nomes dos produtos e quantidades, sem preços unitários; mostrar total final, pagamento, nome e endereço.
- Incluir os botões oficiais Confirmar pedido, Editar pedido e Cancelar; só Confirmar pedido autoriza a criação do pedido.
- Reprocessamento do webhook ou clique repetido não pode criar pedidos duplicados.
- Se preço ou disponibilidade tiver mudado, enviar resumo atualizado e solicitar nova confirmação.
- Auditar a integração com papoai_order_drafts_v2 e orders; usar o serviço de pedido atual e não inserir diretamente em tabela.
- Editar reabre o mesmo rascunho; cancelar/expirar fecha a sessão sem gerar pedido.
- Não registrar nem enviar ao GitHub dados pessoais de cliente.

Saída: fluxo de confirmação ponta a ponta validado no ambiente isolado, sem alteração de pedidos de clientes reais.

## Rodada 7 — Homologação Meta e piloto controlado

Objetivo: confirmar funcionamento dos dois canais antes de abrir atendimento.

- Validar o Flow pelo mecanismo oficial da Meta e corrigir todas as rejeições.
- Confirmar endpoint e chave pública por número, mantendo chaves privadas somente no runtime seguro.
- Verificar a jornada com telefone de teste controlado, nunca com lista de clientes.
- Conferir seleção da cesta, quantidades, imagens quando suportadas, total calculado, resumo e retorno estruturado.
- Distinguir claramente resposta de teste, resposta de cliente, pedido e confirmação; nenhuma operação comercial deve ocorrer implicitamente por enviar Flow.
- Registrar evidências, versão aprovada, riscos conhecidos e plano de retorno.
- Publicar ou habilitar canal somente após aprovação explícita dessa etapa.

Saída: homologação real em ambiente de teste; cliente só entra depois de uma decisão separada.

## Critérios globais de qualidade

- Produção permanece intacta durante todas as rodadas.
- Produtos e cestas têm uma fonte de verdade única no GitHub para este novo projeto.
- A migração inclui apenas produtos referenciados e é rastreável.
- Identificadores, dinheiro, limites e ordem não dependem de nomes visuais frágeis.
- As gravações têm validação antes de gerar commit e deixam histórico legível.
- O navegador nunca recebe segredos de Meta ou credenciais de gravação.
- Cada número Meta usa mapeamento independente e explícito.
- Tela, JSON e endpoint usam a mesma versão aprovada dos dados.
- Nenhuma funcionalidade é descrita como ao vivo, dinâmica, validada ou publicada sem evidência observável.

## Decisões pendentes que bloqueiam fases posteriores

1. Obter exportação estruturada de produtos/cestas do Vitrine Admin; o CSV de 15 combinações não basta.
2. Definir persistência GitHub sem senha própria e sem token de escrita no navegador.
3. Revisar e identificar o resolvedor de cliente/endereço existente, o matching por E.164 e o fallback em caso de cadastro ausente/ambíguo.
4. Confirmar Edge Function isolada como runtime e acesso permitido ao resolvedor de cliente.
5. Confirmar IDs oficiais de WABA e phone number para os dois canais.
6. Confirmar regra de preço-base e ajuste interno por tamanho, mantendo o valor interno fora do GitHub público e do Flow JSON.
7. Identificar a fonte de estoque/indisponibilidade e o serviço canônico de criação de pedido.
8. Validar marca, fotos, cinco opções de quantidade, retirada, pré-preenchimento, pagamento, resumo sem preço unitário e botão de confirmação em número controlado.
9. Testar repetição de eventos, edição, cancelamento e confirmação nos dois canais.

## Registro do andamento

- 2026-10-25 — R0 concluída. Repo/branch reconhecidos; branch isolada criada; HANDOFF preparado. Nenhum código, importação, chamada Meta ou deploy executados.

- 2026-10-25 — Pesquisa de Flow concluída: Meta + Blip, Infobip, WATI, Twilio e Gupshup; requisitos e pendências registrados em FLOW-RESEARCH.md. Nenhuma integração Meta ou infraestrutura criada.

- 2026-10-25 — Pré-verificação R1: exportação de 15 combinações identificada, mas insuficiente para a migração; aguardando CSV/JSON com tamanhos, tipos, produtos, quantidades por cesta e ordem. Nenhum dado importado.

- 2026-10-25 — Pesquisa de alternativa Meta concluída: carrinho nativo de catálogo/produtos recomendado para provar seleção de quantidade; produtos precisam de catálogo Meta vinculado, e regras de cesta serão validadas no webhook contra a revisão GitHub. Flow permanece opcional até o teste.

- 2026-10-25 — Pesquisa específica da cesta: Flow dinâmico recomendado para marca/quantidade/remoção com preço-base e ajuste interno calculados no endpoint; carrinho Meta permanece opção de UX, mas seu total estimado não é o preço comercial completo da cesta.


- 2026-10-25 — Desenho de checkout atualizado por orientação do usuário: produtos e cestas permanecem no GitHub; cadastro de cliente/endereço pode ser consultado pelo backend Supabase; resumo com total, pagamento e dados confirmados chega como mensagem interativa no chat; pedido só é criado após o botão Confirmar pedido. Inspeção limitada a schema, sem dados pessoais ou escrita. Especificação em ORDER-FLOW-CHECKOUT-DESIGN.md.


## Atualização de pesquisa e escopo — 25/10/2026

Esta seção substitui decisões anteriores que aguardavam exportação manual e passa a ser a referência mais recente. O código não foi alterado e a importação ainda não aconteceu.

### Recorte do catálogo confirmado

A consulta somente de leitura da configuração atual basket_admin_* encontrou cinco cestas/tamanhos ativos ligados a produtos e 61 IDs de produto distintos entre as opções. Contagem de opções por cesta: Econômica 24, Mini 55, Pequena 60, Média 60, Grande 60. O resultado não é a soma das linhas; as opções repetem entre tamanhos. Todas as 61 referências têm image_url WebP preenchido; 59 apontam para Supabase Storage e 2 para GitHub Raw. A verificação ainda não confirmou disponibilidade HTTP, dimensão ou qualidade visual.

Usar essa configuração atual como fonte de migração, e não apenas o modelo histórico basket_template_items, que revelou 29 produtos e não contempla todas as opções cadastradas para escolha de marca.

### Imagens

O helper do Flow em whatsapp-1018-basket-flow-v1/images.mjs limita imagem a 27 KB e, para Supabase Storage, redimensiona para 240×190 WebP qualidade 60. Para URLs GitHub Raw, o arquivo precisa chegar pré-otimizado. A carga da nova base deve criar thumbnails no diretório isolado do projeto, com commit SHA, bytes, dimensão e hash documentados, e revisão visual no WhatsApp.

### Admin de pedidos e Bling

O escopo foi ampliado para incluir gestor de pedidos no novo Admin: recebidos, separação/faltas, acompanhamento e solicitação/recuperação de NF-e, expedição e Concluído. O estado Concluído deve corresponder à conclusão operacional após entrega e registro do pagamento, seguindo os gates do Vitrine Admin.

A pesquisa confirmou que o backend atual, sobretudo admin-products-live-v1 e admin-service-intelligence-v1, implementa esses estágios e a integração Bling. Também confirmou uma incompatibilidade importante: o criador canônico ainda consulta public.products para validar produto, preço e estoque; o snapshot fiscal usa product_id para encontrar SKU/GTIN/nome. A nova entrada precisa de um adaptador de snapshot GitHub e identificação aceita pelo Bling. Não espelhar o catálogo inteiro nem chamar o criador antigo sem provar o contrato.

### Segurança

O repositório SUCEDOAN12 está público. Produtos e fotos versionados são públicos; ajuste interno, tokens, chaves e dados pessoais não podem ser commitados. A configuração privada do ajuste fica somente no servidor. “Sem senha própria” não significa gravação anônima: catálogo e operações de pedidos exigem sessão/cargo existente ou identidade GitHub/SSO com autorização server-side.

### Plano vigente

A execução detalhada, com rodadas, critérios de aceite, limites e instrução inicial para Work Luna Max, está em [IMPLEMENTATION-PLAN-LUNA-MAX.md](IMPLEMENTATION-PLAN-LUNA-MAX.md). A próxima ação é a Rodada 0 de compatibilidade do pedido/estoque/Bling e autenticação, antes de construir telas de Flow ou pedido. Os materiais de pesquisa estão em [ORDER-ADMIN-AND-IMAGE-RESEARCH.md](ORDER-ADMIN-AND-IMAGE-RESEARCH.md).


## Decisão vigente — projeto greenfield — 25/10/2026

Orientação mais recente do usuário: fazer o novo Admin e suas integrações do zero, com código, estrutura, estados e modelo de pedido próprios. A leitura do Vitrine Admin foi pesquisa de regras, dados e requisitos; seus módulos, endpoints, RPCs e esquema de pedidos não serão dependências do novo sistema. O cadastro de clientes/endereço é consultado no Supabase; o catálogo de produtos/cestas/imagens fica no GitHub; pedidos usarão modelo transacional novo e isolado. Meta e Bling terão conectores novos, seguindo APIs oficiais e credenciais guardadas no servidor.

Esta decisão supersede qualquer sugestão anterior deste roadmap de reutilizar as APIs, tabelas ou o motor operacional do Vitrine. A versão executável e atualizada está em IMPLEMENTATION-PLAN-LUNA-MAX.md. Nenhum código foi alterado nesta rodada.
