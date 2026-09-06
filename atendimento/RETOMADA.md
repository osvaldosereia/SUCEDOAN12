# RETOMADA — Atendimento Dona Antônia

Atualizado em 06/09/2026.

## Decisão vigente

Projeto **novo** dentro de `SUCEDOAN12/atendimento`. Não usar como base o fluxo antigo do site, Firebase nem cenários antigos do Make.

Fluxo-alvo:

PapoAI/WhatsApp → automação/template oficial Meta → site `/atendimento` → cliente escolhe cesta ou seção → monta pedido → envia/finaliza pelo WhatsApp → PapoAI → CPF → Make novo → Bling.

O `/atendimento` agora é tratado como o site principal do atendimento. A logo do topo deve voltar para `./`, e não para o site institucional antigo.

## Estratégia PapoAI + templates Meta + Make

O PapoAI é a camada principal de conversa, IA, funil, CRM, templates oficiais da Meta, automações e handoff humano.

Como o PapoAI já consegue usar automações com templates oficiais da Meta, a regra é:

1. **Template/WhatsApp oficial:** usar automações do PapoAI.
2. **Conversa, dúvidas e condução:** usar IA do PapoAI.
3. **Montagem visual do pedido:** usar o site `/atendimento`.
4. **Fechamento operacional:** usar Make somente quando o pedido estiver pronto para validar CPF/cliente/endereço/itens/preço/estoque e criar pedido no Bling.

Não colocar webhook do Make diretamente no frontend público, porque o repositório é público e isso expõe endpoint/segredo. O caminho seguro do MVP é:

Cliente monta pedido no site → site envia mensagem estruturada no WhatsApp → PapoAI identifica `FINALIZAR PEDIDO` ou pedido de cesta → automação do PapoAI chama o Make → Make valida no Bling e devolve a resposta/encaminha para atendimento.

Futuramente, se for necessário finalizar sem depender da leitura da conversa, criar uma camada server-side/proxy segura, por exemplo Cloud Run, para receber o carrinho e chamar Make/Bling sem expor segredo no navegador.

## Carrossel oficial do PapoAI

Todos os cartões do carrossel devem manter os mesmos componentes:

- texto do cartão curto;
- botão 1 com texto `Ver produtos`;
- ação `Abrir link`;
- link para a seção do site.

Usar **6 categorias oficiais**:

1. Cestas Básicas → `/atendimento/?secao=cestas`
2. Ofertas → `/atendimento/?secao=ofertas`
3. Mercearia → `/atendimento/?secao=mercearia`
4. Lavanderia e Limpeza → `/atendimento/?secao=limpeza`
5. Higiene e Beleza → `/atendimento/?secao=higiene`
6. Utilidades e Pets → `/atendimento/?secao=utilidades`

Não usar `Bebidas` como categoria separada agora. Os produtos serão reclassificados depois dentro das categorias oficiais, principalmente Mercearia ou outra seção que o usuário definir.

Links completos ficam em `data/papoai-links.json`.

Existe também a página interna de grade de categorias:

`/atendimento/?secao=categorias`

Ela mostra as categorias em 2 colunas para navegação dentro do site.

## Regras comerciais importantes

- Cesta básica tem **preço fixo/predefinido**.
- O preço da cesta **não é a soma pública dos itens individuais**.
- A diferença é custo/margem operacional e deve ficar oculta.
- Alterações na composição usam internamente o preço unitário do produto apenas para calcular a diferença sobre o preço-base da cesta.
- No editor da cesta, mostrar apenas **foto grande da cesta, nome, valor da cesta, nome dos produtos e quantidade**.
- Não mostrar SKU, código, preço unitário ou subtotal individual nos itens da cesta.
- Produtos avulsos mostram foto, nome e preço.

## UX vigente

### Página inicial / menu

- `/atendimento/` é a tela principal do atendimento;
- a logo do topo aponta para `./`;
- a página inicial mostra cards de menu com **ícones** em vez de fotos;
- cada card de menu tem fundo colorido diferente;
- categorias oficiais em 2 colunas;
- chip selecionado usa cor de destaque;
- busca com texto mais intuitivo: `Buscar cestas, ofertas e produtos`.

### Cestas Básicas

- primeira tela de cestas: grade **sempre com 2 colunas**;
- card: foto quadrada, nome e preço da cesta;
- ao abrir: foto quadrada grande da cesta;
- abaixo: nome de cada produto + quantidade + botões `−` e `+`;
- sem foto individual dos itens da cesta;
- botão final: `Enviar cesta`.

### Categorias e produtos avulsos

- existe uma tela `Categorias` em grade **sempre com 2 colunas**;
- cada categoria abre sua própria grade de produtos;
- categorias oficiais: Cestas Básicas, Ofertas, Mercearia, Lavanderia e Limpeza, Higiene e Beleza, Utilidades e Pets;
- cards de produtos sempre com os mesmos componentes: foto, nome, preço e botão `Adicionar`;
- depois de adicionar, controle `− quantidade +`;
- navegação entre as seções por chips no topo;
- cesta personalizada e produtos avulsos permanecem no mesmo carrinho;
- botão final: `Finalizar pedido`.

## Arquitetura

- **PapoAI:** conversa, IA, CRM, funil, templates oficiais, WhatsApp Flow, automações e handoff.
- **Site `/atendimento`:** escolha visual, personalização de cesta e produtos avulsos.
- **Admin `/atendimento/admin`:** gestão do site, links para PapoAI, regras comerciais e integrações.
- **Bling:** fonte oficial de produtos, SKU, preços, estoque, contatos/clientes e pedidos.
- **GitHub Actions:** sincronização barata Bling → site + PapoAI Produtos.
- **Make:** ponte em tempo real somente para fechamento do pedido e operações que exigem Bling na hora.
- **Firebase:** não usar neste projeto.

## Implementado

- topbar com logo Dona Antônia (`/img/logoantonia5.png`);
- logo ajustada para voltar ao início do atendimento (`./`);
- home `/atendimento/` como menu principal;
- cards de menu com ícones e fundos coloridos diferentes;
- busca mais intuitiva;
- chip ativo com cor de destaque;
- grade de cestas em 2 colunas;
- grade de categorias em 2 colunas;
- fotos reais das cestas vindas do cadastro existente;
- composição real das cestas carregada de `site/produtos-cesta-basica.json`;
- nomes/preços dos componentes resolvidos usando `site/produtos-home.json` quando disponível;
- carregamento parcial: cestas abrem mesmo se produtos avulsos estiverem indisponíveis;
- foto grande da cesta no editor;
- nome + quantidade nos itens sem preço individual;
- cálculo por preço-base da cesta + diferença das alterações;
- produtos avulsos em 2 colunas com foto, nome, preço e adicionar;
- 6 categorias oficiais: Cestas Básicas, Ofertas, Mercearia, Lavanderia e Limpeza, Higiene e Beleza, Utilidades e Pets;
- carrinho único em `localStorage`;
- mensagem do WhatsApp inicia com `Nome da cesta — PADRÃO` ou `Nome da cesta — ALTERADA`;
- quando houver alteração, a mensagem separa `PRODUTOS ALTERADOS` e `PRODUTOS RETIRADOS`;
- mensagem `FINALIZAR PEDIDO` ao finalizar pelos catálogos de produtos;
- nenhuma credencial no frontend;
- nenhum Firebase.

## Dados atuais

O runtime novo usa **somente os dados** existentes do SUCEDOAN12, não a lógica antiga:

- `site/produtos-cesta-basica.json` → cestas, preços-base, imagens e composição;
- `site/produtos-home.json` → produtos, nomes, preços, imagens, categorias e ofertas.

Próxima evolução: esses arquivos serão gerados/atualizados pela nova sincronização Bling → GitHub Actions. Depois a mesma rotina também atualizará o catálogo de Produtos do PapoAI.

## Segurança

O repositório é público. Não colocar tokens, API Keys, PAT, webhooks do Make, CPF, endereços ou dados de clientes no GitHub.

## Próximos passos

1. Ajustar o Admin para refletir a nova estrutura e os 6 links do carrossel.
2. Criar sincronização nova Bling → catálogo do atendimento.
3. Criar sincronização Bling → PapoAI Produtos via `/api/v1/products/sync`.
4. Configurar no PapoAI automação para template oficial da Meta quando houver gatilho de catálogo/menu/cestas.
5. Criar cenário Make novo e mínimo para fechamento: receber payload do PapoAI → CPF → localizar/criar contato → confirmar endereço → revalidar itens/preço/estoque → criar pedido de venda → devolver número do pedido.
