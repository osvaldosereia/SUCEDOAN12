# Admin V3 + Vitrine V3 — Design

## Objetivo

Criar uma nova experiência simples e rápida para a Dona Antônia, mantendo os dados e a operação existentes no Supabase. A Vitrine V3 será apenas um apoio ao atendimento por WhatsApp, não uma loja completa. O Admin V3 será o painel de controle dessa vitrine e da operação básica relacionada.

## Princípios

- Reaproveitar Supabase, produtos, clientes, cestas, estoque e pedidos existentes.
- Construir Admin V3 e Vitrine V3 em caminhos separados dos atuais até aprovação final.
- Não transformar a Vitrine em e-commerce completo.
- Visual neutro: branco, cinza, preto e azul para ações.
- Evitar decoração, gradientes, cards excessivos e textos explicativos desnecessários.
- Priorizar velocidade, legibilidade e uso fácil em celular/tablet.
- Nada de texto pequeno no Admin: corpo 16–18 px, títulos 22–28 px, campos e botões grandes.

## Vitrine V3

### Função

Servir como catálogo auxiliar para o cliente escolher cestas e produtos e depois continuar o atendimento pelo WhatsApp.

### Tela inicial

- Cabeçalho compacto com Dona Antônia e botão `Pedido`.
- Busca de produtos em destaque.
- Cestas básicas como principal conteúdo da home.
- Atalhos simples de categorias em chips ou botões horizontais.
- Bloco opcional de ofertas/destaques controlado pelo Admin.
- Barra fixa no celular para abrir o pedido quando houver itens.

### Navegação de produtos

Não usar o fluxo atual de selecionar várias seções e depois abrir vários blocos vazios.

Fluxo recomendado:

1. Cliente toca em uma categoria.
2. A lista daquela categoria aparece imediatamente.
3. Exibir 12 produtos por lote.
4. Próximo lote pode ser pré-carregado silenciosamente perto do fim da lista.
5. O cliente escolhe `Mostrar mais` quando quiser continuar.
6. Trocar de categoria substitui a lista atual, sem criar uma página enorme.

### Produto

Cada produto deve usar uma linha compacta:

- foto quadrada pequena;
- nome;
- embalagem/marca quando útil;
- preço;
- botão `Adicionar` ou controle `− quantidade +`.

Imagens usam lazy loading.

### Busca

- Busca por nome a partir de 2–3 caracteres.
- Debounce aproximado de 250 ms.
- Cancelar requisição anterior quando o usuário continuar digitando.
- Resultado em lotes, sem carregar o catálogo inteiro.

### Desempenho e cache

Criar uma camada pública de catálogo separada da criação de pedidos.

- Índice inicial pequeno com categorias, cestas, ofertas/destaques e dados mínimos de navegação.
- Categoria carregada somente quando acessada.
- Cache local curto para categorias já abertas.
- Estratégia stale-while-revalidate: mostrar dados recentes já armazenados e atualizar em segundo plano.
- Respostas públicas do catálogo podem ter cache curto de 2–5 minutos.
- Imagens com cache longo.
- Criação do pedido continua sem cache e valida preço/estoque no servidor antes de persistir.

### Pedido e WhatsApp

- Carrinho simples chamado `Pedido`.
- Cliente informa telefone no fechamento.
- Pedido é persistido no backend antes de abrir o WhatsApp.
- Backend continua sendo a fonte de verdade para preço, disponibilidade e estoque.
- Não adicionar pagamento online, login de cliente ou checkout complexo nesta versão.

## Admin V3

### Estrutura principal

Menu simples:

- Início
- Vitrine
- Cestas
- Produtos
- Categorias
- Pedidos
- Clientes
- Balanço rápido

### Legibilidade

- Texto normal: 16–18 px.
- Títulos principais: 22–28 px.
- Botões com altura confortável e área de toque grande.
- Inputs altos e claros.
- Contraste forte.
- Evitar informações secundárias em fonte pequena.
- Layout responsivo para desktop, tablet e celular.

### Início

Resumo operacional curto:

- produtos ativos;
- produtos sem foto;
- produtos sem estoque;
- cestas ativas;
- ofertas ativas;
- pedidos recentes.

Sem dashboards complexos nesta fase.

### Vitrine

Controlar o que aparece na Vitrine V3:

- categorias visíveis;
- ordem das categorias;
- cestas em destaque;
- produtos em destaque;
- ofertas;
- ordem dos elementos principais da home.

Alterações simples devem refletir na vitrine após salvar, sem etapa separada de publicação.

### Cestas

- foto;
- nome;
- preço;
- composição;
- ordem;
- ativo/inativo;
- destaque;
- botão `Ver na vitrine`.

### Produtos

Tabela/lista rápida com:

- foto pequena;
- nome;
- preço;
- estoque;
- categoria;
- ativo/inativo;
- oferta;
- edição rápida quando segura.

Busca por nome ou EAN e filtros básicos.

### Categorias

- criar;
- renomear;
- ativar/desativar;
- ordenar;
- escolher se aparece na home da Vitrine.

### Pedidos

- listar pedidos vindos da Vitrine;
- ver itens, total, telefone e status;
- abrir WhatsApp do cliente;
- não transformar o Admin em ERP nesta versão.

### Clientes

Cadastro simples com os campos já existentes necessários à operação, incluindo telefone e endereço. Não adicionar histórico de compras importado do Bling nesta fase.

### Balanço rápido

Manter o fluxo rápido separado, apenas acessível por atalho no Admin V3. Não misturar a lógica de leitura rápida com a edição comum de produtos.

## Arquitetura

### Frontend

- Nova pasta `vitrine-v3/`.
- Nova pasta `admin-v3/`.
- JavaScript modular simples, sem framework novo nesta fase.
- Reutilizar componentes/utilidades existentes apenas quando não carregarem complexidade do V2.

### Backend

- Reutilizar o Supabase e RPCs atuais de pedidos quando adequados.
- Criar uma interface de catálogo V3 focada em leitura rápida e cacheável.
- Manter a criação de pedidos separada e sem cache.
- Não expor service role no navegador.

### Compatibilidade

- `/vitrine-v2/` e `/admin/` permanecem intactos enquanto V3 é construída.
- Novos caminhos: `/vitrine-v3/` e `/admin-v3/`.
- Substituição dos caminhos atuais só depois de teste e aprovação.

## Critérios de aceite

### Vitrine

- Home abre rapidamente e sem carregar catálogo inteiro.
- Cestas aparecem primeiro.
- Categoria abre sem mostrar placeholders de outras categorias.
- Primeiros 12 produtos aparecem por categoria.
- `Mostrar mais` funciona sem recarregar a página.
- Busca responde rapidamente e cancela chamadas obsoletas.
- Pedido persiste antes de abrir WhatsApp.
- Visual neutro e simples.

### Admin

- Todas as telas principais usam texto legível, sem fonte pequena.
- É possível controlar categorias, destaques, cestas e produtos da Vitrine.
- Produtos e cestas podem ser ativados/desativados e ordenados.
- Há acesso simples a pedidos, clientes e balanço rápido.
- Nenhuma alteração quebra Admin/Vitrine V2 durante a construção.

## Fora de escopo nesta fase

- pagamento online;
- login de cliente;
- programa de fidelidade;
- ERP completo;
- automações de marketing;
- histórico de compras do Bling;
- redesign do balanço rápido;
- troca do banco de dados.
