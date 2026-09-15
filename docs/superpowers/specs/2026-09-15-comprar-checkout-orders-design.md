# Design — Checkout simples, WhatsApp confiável e Pedidos básicos

## Objetivo

Simplificar o fechamento do Comprar para funcionar dentro do próprio chat, reduzir interrupções no fluxo e garantir que o pedido seja persistido antes de qualquer tentativa de abrir o WhatsApp.

O fluxo aprovado é:

1. cliente escolhe cesta/produtos;
2. cliente digita o telefone;
3. o sistema consulta o cadastro no Supabase;
4. se encontrar, mostra no próprio chat os dados necessários em campos editáveis, nunca CPF;
5. se não encontrar, mostra os mesmos campos vazios para novo cadastro;
6. na mesma tela o cliente escolhe a forma de pagamento;
7. um único botão **Confirmar e enviar pedido** salva cadastro/endereço quando necessário, grava o pedido completo, confirma que ele existe e então abre o WhatsApp da empresa `55 65 99815-0975` com a mensagem pronta;
8. o Admin lê exatamente o mesmo pedido persistido em `orders`/`order_items`.

## Escopo

### 1. Grade de produtos sem carregamento automático

`comprar/products.js` deixa de observar o scroll para carregar novas páginas.

Comportamento:

- a primeira página continua carregando normalmente;
- quando `has_more=true`, aparece um botão **Ver mais** abaixo da grade;
- somente o clique em **Ver mais** chama a próxima página;
- enquanto carrega, apenas o botão fica ocupado;
- filtros, busca, categorias e subcategorias continuam reiniciando a paginação e carregando a primeira página;
- nenhuma rolagem da conversa dispara consulta de produtos.

Não haverá `IntersectionObserver`, `scroll` listener ou outro carregamento implícito.

### 2. Consulta de cliente no próprio checkout

`shopping-chat-customer-v1` continuará sendo a fronteira server-side da consulta por telefone, mas o retorno web passa a ser um perfil sanitizado próprio para checkout.

Quando o telefone for encontrado, o endpoint pode retornar somente:

- `customer_id` interno;
- nome;
- telefone;
- endereços salvos necessários ao checkout;
- identificadores técnicos de endereço indispensáveis para editar/substituir.

O endpoint **não retorna CPF/CNPJ** ao navegador e o front nunca renderiza esse dado.

A consulta mantém proteção contra abuso, inclusive limite de tentativas por sessão. A etapa intermediária de verificação pelo WhatsApp (`verification_required`) deixa de fazer parte do checkout web do Comprar.

Quando o telefone não for encontrado, a mesma interface é usada para cadastrar o cliente sem trocar de fluxo.

### 3. Um único cartão editável de fechamento

`comprar/checkout.js` passa a apresentar, depois da busca do telefone, um único bloco de confirmação com:

- Nome;
- WhatsApp;
- Rua;
- Número;
- Bairro;
- Complemento;
- Referência;
- Cidade;
- UF;
- CEP;
- formas de pagamento.

Todos os campos de cadastro/endereço necessários ficam editáveis na própria tela.

Formas de pagamento:

- PIX;
- Cartão de crédito;
- Alimentação / refeição;
- Dinheiro.

O CPF não aparece nesse cartão.

Se o cliente existente tiver mais de um endereço, o checkout pode mostrar os endereços salvos para seleção, mas ao escolher um deles os campos editáveis devem refletir aquele endereço na mesma tela.

### 4. Salvamento no clique final

O botão passa a se chamar **Confirmar e enviar pedido**.

No clique, o sistema executa uma única sequência coordenada:

1. validar nome, telefone, endereço e pagamento;
2. criar cliente quando novo ou atualizar somente os dados permitidos quando existente;
3. salvar/adicionar/substituir endereço quando houve alteração;
4. salvar forma de pagamento na sessão;
5. chamar a confirmação idempotente do pedido;
6. exigir retorno com `order_id` e/ou `order_number` válidos;
7. considerar o pedido concluído somente depois de existir em `orders` e seus itens em `order_items`;
8. montar a URL final do WhatsApp;
9. entregar a navegação para o WhatsApp.

Qualquer falha antes do passo 7 mantém o usuário no chat e **não abre o WhatsApp**.

Repetir o botão depois de o pedido ter sido salvo reaproveita o mesmo pedido e nunca chama `confirm_order` novamente.

## Persistência e Admin

A fonte de verdade continua sendo:

- `orders`;
- `order_items`;
- snapshots e identificadores já usados pelo fluxo `shopping_room`.

O pedido deve conter, no mínimo:

- `order_number`;
- `source='shopping_room'`;
- cliente e telefone;
- endereço confirmado completo;
- `payment_method`;
- cesta quando houver;
- todos os itens com quantidade, preço e origem;
- subtotal/fiscal/outros/discount/total conforme regras atuais;
- `cart_id`, `catalog_session_id` e demais IDs disponíveis;
- status e `sync_status`.

O Admin não cria uma segunda fonte de pedidos. `admin-orders-comprar-v1` continua lendo `orders`/`order_items`.

### Tela básica de Pedidos

`admin-v3/pedidos.html`, `admin-v3/pedidos-v2.js` e o CSS relacionado serão simplificados/melhorados para o uso imediato.

Lista inicial:

- Pedido;
- Data/hora;
- Cliente;
- Telefone;
- Total;
- Pagamento;
- Status;
- botão **Ver pedido**.

Detalhe:

- cliente;
- telefone;
- endereço;
- pagamento;
- cesta;
- produtos da cesta;
- produtos extras;
- quantidades;
- valores;
- status;
- IDs operacionais em seção secundária.

A lista deve ordenar os mais recentes primeiro e ter atualização manual. Recursos avançados de produção, entrega, fiscal e edição de status ficam fora deste escopo.

## WhatsApp final

Destino oficial: `https://wa.me/5565998150975`.

A mensagem final deve incluir:

- número do pedido;
- nome;
- WhatsApp do cliente;
- endereço completo;
- referência/complemento/CEP quando houver;
- forma de pagamento;
- itens e quantidades;
- total final.

CPF/CNPJ não será incluído na mensagem.

### Handoff confiável

O problema atual ocorre depois de uma operação assíncrona: o pedido é salvo e então o código tenta trocar a página para `wa.me`, mas em alguns navegadores móveis a navegação pode falhar ou devolver o usuário ao chat.

O novo fluxo terá um único controlador de handoff e nenhuma navegação concorrente. No clique final, o front reserva a possibilidade de abertura do WhatsApp a partir do gesto do usuário; depois que a persistência termina com sucesso, essa mesma tentativa é direcionada para a URL final `wa.me`. Se o navegador impedir a abertura automática, a tela permanece em sucesso com um link real **Abrir WhatsApp** usando a URL já montada.

Não haverá:

- `setTimeout` de redirecionamento;
- segundo redirecionamento automático;
- esquema `whatsapp://`;
- recriação de pedido no fallback;
- retorno automático para etapas anteriores do chat.

O fluxo em `admin_test=1` nunca abrirá WhatsApp nem criará pedido real.

## Backend e compatibilidade

Preferência: reutilizar RPCs e tabelas atuais. Nova migration só será criada se for indispensável para atualizar de forma segura cadastro/endereço ou para preservar idempotência; não haverá mudança de schema apenas por conveniência.

Funções envolvidas:

- `shopping-chat-customer-v1` — lookup sanitizado e cadastro/edição necessária ao checkout;
- `shopping-checkout-v2` — persistência de endereço quando aplicável;
- `shopping-chat-v1` — pagamento e confirmação final;
- `admin-orders-comprar-v1` — leitura do pedido no Admin.

## Segurança

A decisão de produto aprovada permite consultar nome/telefone/endereço a partir do telefone digitado no checkout. Para reduzir exposição:

- CPF/CNPJ nunca é retornado nessa consulta;
- somente campos necessários ao checkout são devolvidos;
- limite de tentativas por sessão permanece;
- resposta não inclui dados administrativos, Bling ou histórico de compras;
- nenhum segredo/service role vai para o navegador;
- funções server-side continuam usando service role apenas internamente.

A correção das tabelas do projeto que atualmente estão sem RLS é um item de segurança separado e não será misturado com este checkout sem revisão das políticas necessárias.

## Testes obrigatórios

Antes de integrar:

1. Produtos: rolagem não chama `loadMore`; botão **Ver mais** chama uma única nova página.
2. Lookup encontrado: retorna perfil sanitizado, sem `cpf_cnpj`/documento, e a UI mostra campos editáveis.
3. Lookup não encontrado: mesma UI permite cadastro novo.
4. Edição: alteração de endereço é persistida antes do pedido.
5. Pagamento: seleção é obrigatória e aparece em `orders.payment_method`.
6. Pedido: `confirm_order` cria um único pedido completo e itens correspondentes.
7. Admin: o pedido criado pelo Comprar aparece na lista e abre com os mesmos dados.
8. WhatsApp: URL final usa `5565998150975`, contém pedido/endereço/pagamento/itens/total e não contém CPF.
9. Fallback: tentar novamente abrir WhatsApp não cria segundo pedido.
10. Admin Test: `admin_test=1` continua sem pedido real e sem navegação externa.

## Critério de pronto

O trabalho só está pronto quando um teste controlado consegue percorrer telefone → dados editáveis → endereço → pagamento → confirmação, verificar o pedido persistido no Supabase/Admin e gerar a URL completa do WhatsApp sem duplicar o pedido.
