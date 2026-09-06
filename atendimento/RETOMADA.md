# RETOMADA — Atendimento Dona Antônia

Atualizado em 06/09/2026.

## Decisão vigente

Projeto **novo** dentro de `SUCEDOAN12/atendimento`. Não usar como base o fluxo antigo do site, Firebase nem cenários antigos do Make.

Fluxo-alvo:

PapoAI/WhatsApp → carrossel oficial Meta → site `/atendimento` → cliente escolhe cesta ou seção → monta pedido → envia/finaliza pelo WhatsApp → PapoAI → CPF → Make novo → Bling.

## Carrossel oficial do PapoAI

Usar 6 entradas:

1. Cestas Básicas → `/atendimento/?secao=cestas`
2. Ofertas → `/atendimento/?secao=ofertas`
3. Mercearia → `/atendimento/?secao=mercearia`
4. Lavanderia e Limpeza → `/atendimento/?secao=limpeza`
5. Higiene e Beleza → `/atendimento/?secao=higiene`
6. Utilidades e Pets → `/atendimento/?secao=utilidades`

Links completos ficam em `data/papoai-links.json`.

## Regras comerciais importantes

- Cesta básica tem **preço fixo/predefinido**.
- O preço da cesta **não é a soma pública dos itens individuais**.
- A diferença é custo/margem operacional e deve ficar oculta.
- Alterações na composição usam internamente o preço unitário do produto apenas para calcular a diferença sobre o preço-base da cesta.
- No editor da cesta, mostrar apenas **foto grande da cesta, nome, valor da cesta, nome dos produtos e quantidade**.
- Não mostrar SKU, código, preço unitário ou subtotal individual nos itens da cesta.
- Produtos avulsos mostram foto, nome e preço.

## UX vigente

### Cestas Básicas

- primeira tela: grade **sempre com 2 colunas**;
- card: foto quadrada, nome e preço da cesta;
- ao abrir: foto quadrada grande da cesta;
- abaixo: nome de cada produto + quantidade + botões `−` e `+`;
- sem foto individual dos itens da cesta;
- botão final: `Enviar cesta`.

### Produtos avulsos

- Ofertas, Mercearia, Lavanderia e Limpeza, Higiene e Beleza e Utilidades e Pets;
- grade **sempre com 2 colunas**;
- card: foto, nome, preço e botão `Adicionar`;
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
- grade de cestas em 2 colunas;
- fotos reais das cestas vindas do cadastro existente;
- composição real das cestas carregada de `site/produtos-cesta-basica.json`;
- nomes/preços dos componentes resolvidos usando `site/produtos-home.json`;
- foto grande da cesta no editor;
- nome + quantidade nos itens sem preço individual;
- cálculo por preço-base da cesta + diferença das alterações;
- produtos avulsos em 2 colunas com foto, nome, preço e adicionar;
- seções Ofertas, Mercearia, Lavanderia e Limpeza, Higiene e Beleza e Utilidades e Pets;
- carrinho único em `localStorage`;
- mensagem `CESTA PERSONALIZADA` ao enviar uma cesta;
- mensagem `FINALIZAR PEDIDO` ao finalizar pelos catálogos de produtos;
- nenhuma credencial no frontend;
- nenhum Firebase.

## Dados atuais

O runtime novo usa **somente os dados** existentes do SUCEDOAN12, não a lógica antiga:

- `site/produtos-cesta-basica.json` → cestas, preços-base, imagens e composição;
- `site/produtos-home.json` → produtos, nomes, preços, imagens, categorias e ofertas.

Próxima evolução: esses arquivos serão gerados/atualizados pela nova sincronização Bling → GitHub Actions. Depois a mesma rotina também atualizará o catálogo de Produtos do PapoAI.

## Segurança

O repositório é público. Não colocar tokens, API Keys, PAT, CPF, endereços ou dados de clientes no GitHub.

## Próximos passos

1. Ajustar o Admin para refletir a nova estrutura e os 6 links do carrossel.
2. Criar sincronização nova Bling → catálogo do atendimento.
3. Criar sincronização Bling → PapoAI Produtos via `/api/v1/products/sync`.
4. Criar cenário Make novo e mínimo: CPF → localizar/criar contato → confirmar endereço → revalidar itens/preço/estoque → criar pedido de venda → devolver número do pedido.
