# Comprar Clean Refactor — Design

## Objetivo

Refatorar o front-end público do Comprar para eliminar conflitos entre scripts, remover comportamentos sobrepostos e garantir um único fluxo previsível para cestas, produtos, carrinho, checkout e ajuda, preservando as APIs e dados atuais do Supabase.

O resultado deve parecer um sistema escrito uma única vez: um único estado de carrinho, um único caminho por ação e nenhum script corrigindo outro script depois que a interface já foi renderizada.

## Escopo

Incluído:

- fluxo de escolha e edição prévia de cestas;
- inclusão da cesta no carrinho;
- abertura automática da etapa 2 de produtos após escolher a cesta;
- grade de produtos, busca, categorias e subcategorias;
- controles de quantidade de produtos adicionais;
- detalhe de produto;
- botão Ver pedido / Finalizar pedido;
- checkout, identificação, endereço, pagamento e conclusão;
- ajuda simples com texto, áudio e foto;
- modo de teste do Admin V3;
- limpeza de scripts e estilos legados não utilizados;
- testes de regressão do fluxo público e mobile.

Fora do escopo:

- mudança de schema no Supabase;
- alteração de regras comerciais de preço, estoque ou limites;
- mudança de endpoints públicos sem necessidade comprovada;
- redesign completo da identidade visual do Comprar;
- expansão da IA do atendimento.

## Problema atual

O Comprar é composto por múltiplos scripts que se interceptam ou alteram o DOM depois da renderização. Há sobrescritas sucessivas de `window.fetch`, `MutationObserver` globais, múltiplos caminhos para adicionar produtos e scripts de correção que dependem da ordem de carregamento.

Isso cria sintomas como:

- `+` de produto sem efeito ou com estado inconsistente;
- Ver pedido / Finalizar pedido aparentemente travando;
- Ajuda interferindo na compra;
- comportamento diferente conforme a tela foi aberta;
- risco de corrida entre sincronização otimista e resposta do backend;
- dificuldade de saber qual arquivo é a fonte real de uma regra.

## Princípios obrigatórios

1. Nenhum módulo comercial pode sobrescrever `window.fetch`.
2. Nenhum módulo comercial pode usar `MutationObserver` global para descobrir ou corrigir componentes depois de renderizados.
3. Cada botão deve ter um único handler responsável pela ação.
4. O carrinho deve ter uma única representação em memória.
5. Atualizações de quantidade devem bloquear apenas o produto afetado, nunca a página toda.
6. O front deve consumir as APIs existentes por funções explícitas, sem interceptadores globais.
7. A Ajuda não pode alterar cesta, produto ou carrinho.
8. Código legado só será removido depois de busca de referências no repositório.
9. O Comprar atual só será substituído quando o novo fluxo passar pelos testes obrigatórios.
10. O modo `admin_test=1` deve continuar impedindo a criação de pedido real.

## Arquitetura proposta

### 1. `comprar/app.js`

Controlador central da aplicação.

Responsabilidades:

- ler token da sala;
- inicializar sessão;
- manter o estado compartilhado;
- expor cliente HTTP único para as APIs;
- atualizar barra do pedido;
- controlar navegação entre etapas;
- centralizar mensagens de erro e toasts;
- coordenar módulos sem duplicar regras de domínio.

Estado mínimo compartilhado:

```js
{
  session,
  customer,
  baskets,
  selectedBasket,
  cart,
  checkout,
  payment,
  productFilters,
  pendingProductSyncs
}
```

### 2. `comprar/baskets.js`

Responsabilidades:

- listar cestas;
- abrir composição sem alterar carrinho;
- editar quantidades na prévia respeitando min/max/editável;
- recalcular visualmente o valor prévio;
- voltar às cestas sem salvar;
- confirmar uma cesta;
- aplicar as quantidades escolhidas;
- renderizar a cesta escolhida com botão Finalizar pedido.

Fluxo obrigatório:

1. `Ver produtos` abre composição editável.
2. Alterações ainda não entram no carrinho.
3. `Voltar às cestas` descarta a prévia.
4. `Escolher esta cesta` cria a cesta no carrinho e aplica as quantidades escolhidas.
5. Após sucesso, a cesta escolhida permanece visível.
6. A página rola apenas o necessário para deixar o botão `Finalizar pedido` visível logo acima da etapa 2.
7. A etapa `2 · Adicionar mais produtos` abre automaticamente.

### 3. `comprar/products.js`

Responsabilidades:

- selecionar Para Você / Para Casa / Ofertas;
- carregar filtros;
- renderizar busca;
- renderizar categorias e subcategorias;
- carregar e paginar produtos;
- renderizar cartões;
- abrir detalhe de produto;
- alterar quantidades adicionais;
- sincronizar cada produto de forma independente.

Regras visuais:

- busca + linha principal de categorias ficam `position: sticky` no topo da área de produtos;
- subcategorias ficam em segunda linha sticky;
- chips de subcategoria são menores, com menor altura, padding e peso visual;
- a grade rola por baixo do cabeçalho de filtros;
- trocar filtro cancela visualmente o resultado anterior e ignora respostas antigas.

Regra de sincronização de quantidade:

- clique em `+` ou `−` altera imediatamente a quantidade visual;
- apenas o cartão do produto entra em estado de salvamento;
- mudanças rápidas do mesmo produto são consolidadas em sequência;
- produtos diferentes podem sincronizar em paralelo;
- em erro, apenas aquele produto volta à última quantidade confirmada;
- o total do carrinho deve refletir o último estado confirmado ou otimista consistente;
- nenhuma ação pode desabilitar toda a página.

### 4. `comprar/checkout.js`

Responsabilidades:

- abrir `Ver pedido` / `Finalizar pedido`;
- obter `checkout_preview`;
- renderizar identificação;
- localizar cliente por WhatsApp;
- confirmação de cadastro quando exigida;
- cadastro de cliente novo;
- endereços salvos e novo endereço;
- geolocalização quando solicitada;
- forma de pagamento;
- confirmação do pedido;
- construção/uso do retorno ao WhatsApp conforme regras existentes.

O checkout não poderá depender de observar o DOM nem de interceptar respostas de outros módulos.

`Ver pedido` deve executar uma única sequência explícita:

1. verificar se há carrinho válido;
2. aguardar somente sincronizações de produto realmente pendentes;
3. chamar `checkout_preview`;
4. renderizar a etapa de checkout;
5. em erro, liberar o botão e mostrar mensagem.

### 5. `comprar/help.js`

Ajuda simples.

Responsabilidades exclusivas:

- abrir/fechar o compositor;
- texto;
- áudio;
- foto;
- fechar com Escape;
- ocultar durante checkout quando necessário.

Não pode:

- listar cestas;
- listar produtos;
- chamar `start_basket`;
- chamar `set_quantity`;
- modificar o carrinho.

### 6. `comprar/styles.css`

Consolidar os estilos realmente usados pelo novo Comprar.

Objetivos:

- reduzir cascatas de override;
- remover CSS órfão;
- manter compatibilidade mobile;
- preservar identidade visual já aprovada;
- documentar blocos por componente.

## Compatibilidade com Admin V3

O modo de teste do Admin deve continuar disponível, mas isolado do fluxo comercial.

Regras:

- código de teste só entra em ação quando `admin_test=1` e a página está em iframe autorizado;
- nenhuma sobrescrita global de `fetch` deve permanecer como mecanismo de teste;
- o cliente HTTP central do app deve aceitar um adaptador de transporte para `confirm_order` em modo de teste;
- no modo normal, usa transporte comercial direto;
- no modo teste, `confirm_order` é enviado ao endpoint de simulação autenticado;
- a UI de sucesso deve indicar simulação concluída e nunca abrir WhatsApp de pedido real.

## Migração e limpeza de arquivos

Arquivos atualmente ativos que terão sua lógica absorvida e depois serão retirados do carregamento:

- `chat-light-v2.js`
- `chat-checkout-quantity-v1.js`
- `checkout-final-v2.js`
- `checkout-message-context-v1.js`
- `phone-retry-v1.js`
- `product-detail-v1.js`
- `storefront-visual-v2.js`
- `chat-helper-menu.js`

Arquivos CSS equivalentes serão consolidados conforme necessidade.

Arquivos antigos existentes no diretório, como `chat-light.js`, `chat-light.css`, `room-v2.css`, `style.css`, `sales-intelligence.js`, `sales-intelligence.css` e `search-entry.js`, só poderão ser apagados depois de uma busca de referências em todo o repositório confirmar ausência de consumidores ativos.

## Fluxo final do usuário

### Entrada

- usuário abre Comprar;
- sessão é criada ou reaberta;
- estado existente do carrinho é restaurado;
- barra do pedido reflete o carrinho atual.

### Cestas

- usuário abre Cestas Básicas;
- escolhe `Ver produtos`;
- edita a composição;
- escolhe a cesta;
- cesta entra no carrinho;
- composição escolhida permanece visível;
- botão `Finalizar pedido` permanece visível;
- etapa 2 abre automaticamente logo abaixo.

### Produtos adicionais

Estrutura visual esperada:

```text
[ resumo da cesta escolhida ]
[ Finalizar pedido ]

2 · Adicionar mais produtos
[ Para Você ] [ Para Casa ] [ Ofertas ]

[ Buscar produto __________________ ]
[ Todos ] [ Categoria A ] [ Categoria B ] ...
[ todos ] [ subcategoria 1 ] [ subcategoria 2 ] ...
---------------------------------------------------
[ grade de produtos rolável ]
```

Busca/categorias/subcategorias permanecem no topo da área enquanto os produtos rolam.

### Carrinho / Ver pedido

- `+` e `−` funcionam imediatamente;
- barra do pedido atualiza sem bloquear a tela;
- `Ver pedido` abre checkout sempre que o carrinho for válido;
- em falha de rede, o botão volta ao estado normal e permite nova tentativa.

### Ajuda

- botão Ajuda apenas expande o compositor;
- cliente pode escrever, enviar áudio ou foto;
- Ajuda não cria outro catálogo paralelo.

## Concorrência e prevenção de travamentos

### Produtos

Cada produto terá um estado local de sincronização:

```js
{
  desiredQuantity,
  confirmedQuantity,
  syncing
}
```

O loop de sincronização lê sempre `desiredQuantity` mais recente e envia somente o necessário. Ao concluir uma chamada, verifica se o usuário já alterou novamente. Não usa recursão não aguardada e não bloqueia o restante da interface.

### Requisições de listagem

Cada carregamento de produtos recebe um identificador de geração. Respostas de uma geração antiga são descartadas se o usuário já mudou filtro, busca ou categoria.

### Checkout

O botão de checkout possui estado `busy` local com `try/finally`. Nenhum erro pode deixá-lo permanentemente desabilitado.

## Tratamento de erros

- erros de API devem ser apresentados em mensagem curta e acionável;
- falha de um produto não cancela a seleção de outros;
- falha ao abrir checkout preserva o carrinho;
- falha de filtro mantém a interface navegável;
- falha de imagem usa fallback visual;
- falha de geolocalização mantém endereço manual disponível;
- erros inesperados devem ser registrados no console com contexto da ação, sem expor dados sensíveis.

## Testes obrigatórios antes da substituição

1. abrir nova sessão;
2. reabrir sessão existente;
3. listar cestas;
4. abrir composição sem alterar carrinho;
5. editar quantidades na prévia;
6. voltar sem salvar;
7. escolher cesta com quantidades alteradas;
8. confirmar abertura automática da etapa 2;
9. confirmar Finalizar pedido visível acima da etapa 2;
10. abrir Para Você;
11. abrir Para Casa;
12. abrir Ofertas;
13. busca de produto;
14. categorias;
15. subcategorias;
16. sticky de busca/filtros;
17. `+` de produto;
18. `−` de produto;
19. múltiplos cliques rápidos no mesmo produto;
20. cliques simultâneos em produtos diferentes;
21. trocar categoria durante carregamento;
22. abrir e fechar detalhe de produto;
23. Ver pedido;
24. Ajuda;
25. mensagem de texto;
26. áudio;
27. foto;
28. cliente existente;
29. cliente novo;
30. confirmação de cadastro quando exigida;
31. endereço salvo;
32. novo endereço;
33. geolocalização indisponível;
34. forma de pagamento;
35. confirmar pedido;
36. modo Admin V3 de teste sem pedido real;
37. recarregar página com pedido em andamento;
38. erro de rede em produto;
39. erro de rede em checkout;
40. clique duplo em botões críticos;
41. layout mobile;
42. raiz do site usando o mesmo Comprar sem versão divergente.

## Critério de conclusão

A refatoração só será considerada concluída quando:

- os testes do novo fluxo estiverem verdes;
- os workflows existentes relevantes estiverem verdes;
- não houver `window.fetch =` em módulos comerciais do Comprar;
- não houver `MutationObserver` global em módulos comerciais do Comprar;
- o menu paralelo de ajuda tiver sido removido;
- `+`, Ver pedido e Ajuda funcionarem sem travamento;
- o novo fluxo estiver ativo em `/comprar` e na raiz que o reutiliza;
- arquivos legados sem referência tiverem sido removidos com segurança;
- o modo de teste do Admin V3 continuar funcional.
