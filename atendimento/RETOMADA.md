# RETOMADA — Atendimento Dona Antônia

Atualizado em 06/09/2026.

## Decisão vigente

Projeto **novo** dentro de `SUCEDOAN12/atendimento`. Não usar como base o fluxo antigo do site, Firebase nem cenários antigos do Make.

Fluxo-alvo:

PapoAI/WhatsApp → carrossel da cesta → `/atendimento` → cliente escolhe em grade → edita itens → envia pelo WhatsApp → PapoAI envia categorias/produtos → cliente adiciona avulsos no mesmo pedido → finaliza → CPF → Make novo → Bling.

## Regras comerciais importantes

- Cesta básica tem **preço fixo/predefinido**.
- O preço da cesta **não é a soma pública dos itens individuais**.
- A diferença é custo/margem operacional e deve ficar oculta.
- No editor da cesta, mostrar apenas **foto grande da cesta, nome, valor da cesta, nome dos produtos e quantidade**.
- Não mostrar SKU, código, preço unitário ou subtotal individual nos itens da cesta.
- Produtos avulsos podem mostrar foto, nome e preço.

## Arquitetura

- **PapoAI:** conversa, IA, CRM, funil, templates oficiais, WhatsApp Flow, automações e handoff.
- **Site `/atendimento`:** grade de cestas, editor de cesta e catálogo visual de produtos avulsos.
- **Admin `/atendimento/admin`:** gestão do site montador, cestas, ofertas, links dos carrosséis e validações.
- **Bling:** fonte oficial de produtos, SKU, preços, estoque, contatos/clientes e pedidos.
- **Make:** somente ponte em tempo real para o fechamento do pedido.
- **Firebase:** não usar neste projeto.

## Implementado

### Site público

- topbar com logo da Dona Antônia (`/img/logoantonia5.png`);
- tela inicial em grade de 2 colunas com as cestas;
- cards de cesta com foto quadrada grande, nome e valor;
- tela de edição com foto grande quadrada da cesta;
- lista de produtos da cesta com nome e quantidade;
- botões `−` e `+` para aumentar/diminuir/remover;
- preço unitário da cesta oculto por item;
- cálculo interno usando preço-base da cesta + variações por alteração;
- tela de categorias/produtos avulsos em grade;
- produtos avulsos com foto, nome, preço e controle de quantidade;
- carrinho único no `localStorage`;
- botão fixo no rodapé para enviar/finalizar pelo WhatsApp;
- mensagem final com cesta, itens, adicionais e total;
- nenhum Firebase;
- nenhuma credencial no frontend.

### Catálogo atual

`data/catalogo.json` foi ajustado para versão 2 com:

- cestas reais encontradas em `dados-loja.json`;
- imagens de cesta já usadas no projeto;
- `priceBase` para preço fixo da cesta;
- `unitPrice` interno para recalcular variações, sem exibir ao cliente;
- ofertas demonstrativas para validar o fluxo de produtos avulsos.

Ainda existem alguns nomes genéricos em itens das cestas. Próxima etapa: resolver nomes reais a partir do catálogo/produtos do Bling ou dados existentes do repositório.

## Segurança

O repositório é público. Não colocar tokens, API Keys, PAT, CPF, endereços ou dados de clientes no GitHub.

## Próximo passo recomendado

1. Resolver nomes reais dos SKUs das cestas.
2. Ajustar o Admin para `priceBase`, `image`, `unitPrice` interno e ocultação de preços da cesta.
3. Criar sincronização nova Bling → catálogo do site + PapoAI Produtos.
4. Criar cenário Make novo e mínimo somente para fechamento: CPF → localizar/criar contato → revalidar itens/preço/estoque → criar pedido de venda → devolver número do pedido.
