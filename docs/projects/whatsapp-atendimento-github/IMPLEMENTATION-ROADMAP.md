# Roadmap de implementação — Admin WhatsApp com dados no GitHub

Projeto: WhatsApp Atendimento GitHub — SUCEDOAN12
Branch de trabalho: project/whatsapp-atendimento-github-20261025
Base inicial: main em a9ae61f44321e93e99ef93e15a014253a202e35e
Atualizado: 25/10/2026 (America/Cuiaba)

## Regras de execução

- Cada rodada deve produzir um resultado pequeno, revisável e utilizável.
- Todo trabalho de código futuro começa nesta branch e dentro de projetos/whatsapp-atendimento-github/. Documentação do projeto fica em docs/projects/whatsapp-atendimento-github/.
- Não alterar main, o site público, Vitrine Admin, catálogo de produção, banco operacional ou configurações existentes.
- Não usar Supabase nesta iniciativa.
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
- [x] Registrar limites de segurança, runtime externo ao Supabase e imagens/quantidades que ainda exigem prova no schema e em WhatsApp real.
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

Objetivo: trazer apenas os produtos usados nas cestas atuais, sem consultar Supabase.

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
- A tela pode dar feedback imediato via update_data, mas o total final deve ser recalculado/validado no servidor pelo endpoint HTTPS externo ao Supabase na rodada 5.
- Nenhuma publicação ou mensagem a cliente nesta rodada.

Saída: Flow JSON versionado com regras da cesta, preço atualizado e webhook conferidos em canal controlado. A publicação permanece separada e manual.

## Rodada 5 — Runtime dinâmico sem Supabase

Recomendação técnica: manter o admin/editor e os dados comerciais no GitHub; usar um runtime HTTPS externo ao Supabase para receber webhooks de pedido, validar quantidades/preços e enviar mensagens pela Cloud API. Implementar Data Exchange criptografado somente se a decisão final mantiver Flow dinâmico. Nenhum fornecedor foi escolhido.

Objetivo: decidir e implementar a parte de servidor necessária para usar os dados atuais durante o Flow.

- GitHub Pages e arquivos JSON podem servir uma prévia e leitura pública, mas não executam a troca criptografada de dados do Flow nem protegem token Meta.
- Escolher uma função/serviço HTTPS fora do Supabase que possa: receber e validar webhooks Meta; consultar a versão aprovada de produtos/cestas; conferir quantidades e preços no servidor; enviar mensagens pela Cloud API; e manter credenciais no servidor. Se Flow dinâmico for mantido, também validar e descriptografar Data Exchange e responder de forma criptografada.
- Não selecionar hospedagem nem registrar credenciais antes de avaliar custo, disponibilidade, manutenção e adequação ao fluxo.
- Definir uma versão de dados publicada e imutável para que o Flow não misture preços/composições durante uma sessão.
- Falhas de configuração ou criptografia devem bloquear a transação com erro claro e sem aceitar preço enviado pelo cliente.
- A fase permanece bloqueada até existir runtime aprovado e endpoint HTTPS acessível.

Saída: arquitetura de runtime sem Supabase documentada e um ambiente de teste isolado, sem clientes.

## Rodada 6 — Homologação Meta e piloto controlado

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

1. Como obter uma exportação das cestas pelo Vitrine Admin sem Supabase.
2. Como salvar no GitHub sem senha própria e sem expor token de escrita no navegador.
3. Qual runtime HTTP fora do Supabase atenderá Data Exchange e operações Meta.
4. Quais são os IDs oficiais de WABA e telefone para os dois canais.
5. Confirmar a fórmula do preço-base e o ajuste interno por tamanho, mantendo o ajuste confidencial fora do GitHub público e do Flow JSON.
6. Em número controlado, validar a jornada Flow por posição: marca, imagens, lista de quantidade, zero para remover, total após cada avanço e retorno do webhook.
7. Confirmar se cada posição permite uma marca ou se a cesta admite dividir quantidade entre várias marcas; prototipar a segunda opção separadamente.
8. Testar nos dois números e manter o endpoint como autoridade de preço/composição. Provar catálogo/carrinho apenas se a experiência de quantity control for priorizada sobre atualização contínua do total.

## Registro do andamento

- 2026-10-25 — R0 concluída. Repo/branch reconhecidos; branch isolada criada; HANDOFF preparado. Nenhum código, importação, consulta Supabase, chamada Meta ou deploy executados.

- 2026-10-25 — Pesquisa de Flow concluída: Meta + Blip, Infobip, WATI, Twilio e Gupshup; requisitos e pendências registrados em FLOW-RESEARCH.md. Nenhuma integração Meta ou infraestrutura criada.

- 2026-10-25 — Pré-verificação R1: exportação de 15 combinações identificada, mas insuficiente para a migração; aguardando CSV/JSON com tamanhos, tipos, produtos, quantidades por cesta e ordem. Nenhum dado importado.

- 2026-10-25 — Pesquisa de alternativa Meta concluída: carrinho nativo de catálogo/produtos recomendado para provar seleção de quantidade; produtos precisam de catálogo Meta vinculado, e regras de cesta serão validadas no webhook contra a revisão GitHub. Flow permanece opcional até o teste.

- 2026-10-25 — Pesquisa específica da cesta: Flow dinâmico recomendado para marca/quantidade/remoção com preço-base e ajuste interno calculados no endpoint; carrinho Meta permanece opção de UX, mas seu total estimado não é o preço comercial completo da cesta.
