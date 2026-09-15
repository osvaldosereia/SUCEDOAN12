# Design — Admin canônico em /admin e perguntas rápidas no Chat Comprar

Data: 2026-09-15

## Objetivo

Consolidar definitivamente o administrativo da Dona Antônia em `https://www.donaantonia.com.br/admin/` e remover a ideia de versões paralelas como “Admin V3”. Ao mesmo tempo, melhorar o módulo de ajuda do Chat Comprar com perguntas rápidas em chips dentro da conversa, mantendo o composer de texto, áudio e foto aberto.

## Decisões aprovadas

1. `/admin/` é o único Admin oficial e atual.
2. O nome visual passa a ser apenas **Admin**. Nenhuma tela operacional deve se apresentar como “Admin V3”.
3. `/admin-v3/` deixa de ser origem de novas funções e passa a existir apenas como compatibilidade temporária para links antigos.
4. Toda função administrativa atual e ativa deve ser acessível por `/admin/`, com navegação visível quando for um recurso destinado ao operador.
5. O Chat Comprar continua com ajuda por texto, áudio e foto.
6. Ao abrir **Ajuda**, o chat mostra uma mensagem curta da Ana e chips de perguntas rápidas dentro da própria conversa.
7. Os chips não substituem o composer e não usam IA. A IA permanece restrita a texto livre ou mídia que precise ser interpretada.

## Diagnóstico atual

Hoje `admin/index.html` já funciona como a porta principal do Admin, porém ainda carrega CSS e módulos diretamente de `/admin-v3/`. Isso significa que `/admin/` ainda não é uma aplicação independente.

A tela de Atendimento também está fisicamente em `admin-v3/atendimento.html` e se identifica visualmente como “Admin V3”. O menu já controla o fluxo do Chat Comprar por meio de `admin-chat-menu-v1`, e a configuração pública é lida por `shopping-chat-menu-v1` a partir de `shopping_chat_helper_config`.

O esquema atual do menu já suporta os tipos `baskets`, `offers`, `products`, `payment`, `delivery`, `profile` e `text`. Portanto, a primeira versão das perguntas rápidas pode reaproveitar essa configuração, evitando criar um segundo sistema de configuração.

## Arquitetura escolhida

### 1. Admin único

`/admin/` será a fonte canônica de HTML, CSS, JavaScript e subpáginas administrativas. Os arquivos que hoje são necessários ao Admin e vivem em `/admin-v3/` serão migrados para `/admin/` com imports e links internos corrigidos.

A migração deve ser incremental e testável: primeiro copiar/mover os recursos necessários para `/admin/`, depois trocar todas as referências do Admin para os caminhos novos e, somente após validação, reduzir `/admin-v3/` a páginas de compatibilidade.

Não será criado outro Admin paralelo.

### 2. Compatibilidade de /admin-v3

Links antigos não devem quebrar imediatamente. As entradas públicas antigas de `/admin-v3/` devem encaminhar para equivalentes em `/admin/`.

Exemplos:
- `/admin-v3/` → `/admin/`
- `/admin-v3/atendimento.html` → `/admin/atendimento.html`
- `/admin-v3/nomes-produtos-v3.html` → equivalente em `/admin/`
- `/admin-v3/imagens-ia.html` → equivalente em `/admin/`

A compatibilidade é somente de navegação. O código ativo não continuará evoluindo dentro de `/admin-v3/`.

### 3. Inventário e visibilidade de funções

Durante a migração deve ser produzido um inventário dos recursos administrativos atuais.

Critério: todo recurso de uso operacional que esteja ativo deve possuir:
- um caminho sob `/admin/`;
- um acesso visível no menu ou em uma seção clara do dashboard;
- um título sem “V3”;
- dependências locais de `/admin/`, exceto APIs/Edge Functions que não são caminhos de interface.

Recursos condicionais por feature flag podem continuar ocultos quando a flag estiver desligada. Se estiverem ligados, devem aparecer na navegação. Nenhum módulo ativo deve ficar apenas montado em background sem um caminho de uso compreensível.

A primeira revisão deve cobrir, no mínimo, os recursos hoje já expostos ou carregados pelo Admin: Início, Comprar, Cestas, Produtos, Nomes dos produtos, Imagens IA, Categorias, Pedidos, Clientes, Atendimento, Balanço rápido, além dos módulos condicionais de operações, logística e automações quando habilitados.

### 4. Backend e nomes internos

Esta consolidação é de interface e organização de front-end. Edge Functions existentes com nomes legados, como `admin-v3-api`, não precisam ser renomeadas nesta entrega se estiverem estáveis e não aparecerem para o usuário.

Renomear APIs internas sem necessidade aumentaria risco e não melhora a experiência. A regra é: **sem V3 na experiência do usuário; compatibilidade interna pode ser mantida quando segura**.

## Atendimento em /admin

A tela atual de Atendimento será migrada para `/admin/atendimento.html`.

Ela continuará com três áreas principais:
- **Fluxo do Chat**
- **Respostas inteligentes**
- **Testar**

O cabeçalho e links devem apontar para `/admin/`, nunca para `/admin-v3/`.

### Organização do Fluxo do Chat

A configuração deve deixar clara a diferença entre compra e ajuda.

#### Atalhos comerciais

Cestas, Ofertas e Produtos pertencem ao fluxo comercial principal do Comprar. Eles não devem aparecer como perguntas de ajuda apenas porque existem no mesmo objeto de configuração.

#### Perguntas rápidas

A área antes chamada genericamente de “Menu de ajuda” passa a ser apresentada ao operador como **Perguntas rápidas do cliente**.

Tipos informativos como pagamento, entrega, cadastro e textos personalizados podem aparecer como chips de ajuda. O operador continua podendo:
- ativar/desativar;
- mudar a ordem;
- alterar o texto do chip;
- editar a resposta;
- adicionar perguntas de texto personalizadas.

A primeira versão deve reutilizar `shopping_chat_helper_config` e `admin-chat-menu-v1`, sem criar uma segunda tabela de perguntas.

## Chat Comprar — experiência de ajuda

### Abertura

Ao tocar em **Ajuda**, o composer é aberto e permanece disponível. Na conversa, a Ana insere uma única mensagem contextual, por exemplo:

> Posso te ajudar com alguma dúvida?

Logo abaixo da mensagem aparece um bloco de chips de perguntas rápidas.

Exemplos de chips:
- Formas de pagamento
- Entregas
- Alterar cesta
- Meu cadastro
- Área de entrega
- Contato

A lista real é controlada pelo Admin.

### Layout dos chips

Os chips ficam no fluxo da conversa, não presos ao rodapé.

No celular:
- largura conforme o texto;
- organização responsiva em duas ou mais linhas curtas;
- espaçamento discreto;
- sem transformar a ajuda em uma grade pesada;
- limite visual inicial para evitar excesso de opções.

Se houver opções demais, o chat pode mostrar as principais e um chip **Outras dúvidas** para reabrir o conjunto completo.

### Comportamento ao tocar

1. A escolha do chip pode aparecer como uma pequena decisão do cliente no histórico.
2. O conjunto de chips recolhe.
3. A resposta configurada aparece como mensagem da Ana.
4. O composer continua aberto.
5. Após a resposta, aparece uma ação discreta **Outras dúvidas** para mostrar os chips novamente.

Cliques em chips são determinísticos e não chamam IA.

### Texto, áudio e foto

O composer continua oferecendo:
- texto;
- áudio;
- foto.

Enviar texto livre, áudio ou foto segue o fluxo inteligente atual. A ajuda não fecha automaticamente depois de cada resposta; ela só fecha quando o cliente escolher fechar ou quando o checkout exigir ocultá-la.

## Regras para os chips

1. Não duplicar Cestas, Ofertas e Produtos dentro do bloco de perguntas rápidas.
2. Mostrar apenas itens ativos e permitidos pela configuração de runtime.
3. Nunca mostrar chip sem resposta funcional.
4. Não chamar IA ao clicar.
5. Não interromper carrinho, cesta escolhida ou estado do pedido.
6. Não criar pedido nem alterar itens do carrinho a partir de uma pergunta informativa.
7. Quando o checkout estiver ativo, manter a regra atual de esconder a ajuda para evitar distração.

## Dados e APIs

### Leitura pública

`shopping-chat-menu-v1` continua sendo a fonte pública da configuração de ajuda. A resposta já é sanitizada e limitada aos tipos permitidos.

O front-end deve filtrar os itens usados como perguntas rápidas para excluir os atalhos comerciais `baskets`, `offers` e `products`.

### Escrita administrativa

`admin-chat-menu-v1` continua sendo a API de leitura e gravação do fluxo. A interface do Admin muda a apresentação, não o contrato persistido, salvo se um problema real de dados for descoberto durante a implementação.

### Respostas

Para `payment`, `delivery`, `profile` e `text`, o front-end deve usar a resposta determinística configurada/permitida pelo fluxo atual. Se uma resposta estiver vazia ou indisponível, o chip não deve ser exibido como opção pronta.

## Migração de caminhos

A implementação deve procurar e corrigir referências de interface para `/admin-v3/` em:
- HTML do Admin;
- CSS e módulos JS carregados pelo Admin;
- links de retorno entre subpáginas;
- testes automatizados;
- documentação operacional que descreve a URL atual.

Referências históricas em documentos antigos podem permanecer como histórico, desde que não sejam usadas como instrução atual de operação.

## Segurança e compatibilidade

- Não alterar as regras de autenticação atuais sem necessidade.
- Não tornar páginas protegidas públicas durante a migração.
- Preservar o modo de teste do Chat Comprar que não cria pedido real.
- Preservar APIs de pedidos, clientes, produtos e cestas já em produção.
- Não remover `/admin-v3/` abruptamente antes de validar redirects/compatibilidade.

## Testes

A implementação deve adicionar ou atualizar testes para garantir:

1. `admin/index.html` não depende de assets de `/admin-v3/`.
2. `/admin/atendimento.html` existe e não contém marca visual “Admin V3”.
3. links internos do Admin apontam para `/admin/`.
4. toda função operacional habilitada possui entrada navegável no Admin.
5. `/admin-v3/` encaminha para `/admin/` sem manter uma segunda aplicação ativa.
6. abrir Ajuda mostra prompt + chips + composer.
7. chips de perguntas não incluem Cestas, Ofertas ou Produtos.
8. tocar em chip gera resposta determinística sem IA.
9. composer continua aberto após resposta de chip.
10. **Outras dúvidas** reabre os chips.
11. texto, áudio e foto continuam funcionando.
12. checkout continua escondendo a ajuda.
13. Admin test mode continua sem criar pedido real.

## Critérios de aceite

A entrega está concluída quando:

- `www.donaantonia.com.br/admin/` é a única versão administrativa apresentada ao operador;
- nenhuma função atual de uso operacional exige navegar para `/admin-v3/`;
- nenhuma tela atual mostra “Admin V3” como produto/versão;
- o Admin é auto-contido em `/admin/` no front-end;
- links antigos de `/admin-v3/` não causam quebra de navegação;
- Atendimento está disponível em `/admin/atendimento.html`;
- o operador configura perguntas rápidas diretamente no Admin;
- o cliente abre Ajuda e vê chips organizados dentro da conversa enquanto o composer de texto/áudio/foto permanece aberto;
- respostas por chip não usam IA;
- testes principais do Comprar e do Admin permanecem verdes.

## Fora de escopo desta entrega

- renomear Edge Functions internas apenas por conterem “v3” no nome;
- redesenhar novamente todo o visual do Admin;
- criar analytics de cliques nas perguntas rápidas;
- reordenar perguntas automaticamente por frequência de uso;
- substituir o sistema atual de IA ou de atendimento livre.
