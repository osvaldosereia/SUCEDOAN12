# Admin canônico e Ajuda por chips — Design

## Objetivo

Consolidar o administrativo atual da Dona Antônia em `https://donaantonia.com.br/admin/` e tornar `/admin-v3/` apenas uma rota legada de compatibilidade. Ao mesmo tempo, transformar o botão Ajuda do Chat Comprar em uma experiência conversacional com perguntas rápidas configuráveis pelo Admin, mantendo texto, áudio e foto disponíveis no mesmo módulo.

## Decisões aprovadas

1. `/admin/` é a única interface administrativa oficial.
2. `/admin-v3/` não é mais uma versão ativa; URLs legadas devem redirecionar para os equivalentes em `/admin/`.
3. Arquivos, páginas e links usados pelo Admin atual devem estar sob `/admin/`, sem o Admin canônico depender de caminhos `/admin-v3/...`.
4. O menu principal de `/admin/` deve expor as funções atuais que estão efetivamente em uso: Início, Comprar, Cestas, Produtos, Nomes dos produtos, Imagens IA, Categorias, Pedidos, Clientes, Atendimento e Balanço rápido. Recursos opcionais já existentes e habilitados por configuração continuam disponíveis no Admin sem criar uma segunda versão.
5. A página de Atendimento passa a existir em `/admin/atendimento.html` e usa os mesmos serviços de Supabase já existentes.
6. O bloco atualmente chamado “Menu de ajuda” no Atendimento passa a representar “Perguntas rápidas do cliente”. Cestas, Ofertas e Produtos não aparecem como perguntas de ajuda; essas ações continuam no fluxo comercial principal do Chat Comprar.
7. No Chat Comprar, clicar em `💬 Ajuda` abre o composer e adiciona na conversa uma mensagem curta da Ana seguida dos chips de perguntas configurados no Admin.
8. Os chips ficam dentro da conversa, com quebra em linhas no celular; não ficam fixos acima do teclado.
9. Ao tocar em um chip, a escolha aparece como decisão do cliente, os chips recolhem e a resposta configurada aparece imediatamente. O clique no chip não usa IA.
10. Depois da resposta aparece `Outras dúvidas`, que reabre os chips. O composer de texto/áudio/foto continua aberto até a pessoa fechar pelo `×`.
11. Só aparecem chips de ajuda com resposta determinística válida. Itens dinâmicos de compra (`baskets`, `offers`, `products`) são excluídos da área de perguntas rápidas.
12. Texto livre, áudio e foto continuam usando o caminho atual do Chat Comprar; a IA só pode entrar nos caminhos livres já previstos pelo sistema.
13. O modo `admin_test=1` continua seguro e não cria pedido real.

## Arquitetura

### Admin canônico

Os ativos do Admin atualmente mantidos em `admin-v3/` e necessários pelas páginas atuais serão copiados para `admin/`. `admin/index.html` passa a carregar apenas CSS e JavaScript locais de `/admin/`. As subpáginas atuais (`atendimento.html`, `imagens-ia.html`, `nomes-produtos-v3.html`) também passam a existir e operar diretamente em `/admin/`.

As páginas HTML legadas em `/admin-v3/` serão reduzidas a redirecionamentos compatíveis para `/admin/` ou para a subpágina equivalente. Os arquivos legados podem permanecer temporariamente para compatibilidade de histórico, mas nenhum caminho canônico, teste novo ou link de interface deve depender deles.

### Perguntas rápidas

A configuração continua armazenada em `shopping_chat_helper_config` e administrada por `admin-chat-menu-v1`; o endpoint público continua sendo `shopping-chat-menu-v1`.

`comprar/help.js` passa a buscar a configuração pública quando Ajuda é aberta. Ele filtra os itens permitidos para perguntas de atendimento e monta um bloco conversacional próprio. O fluxo de clique é inteiramente determinístico usando `response_text` retornado pelo endpoint público.

Nenhuma alteração de schema é necessária para esta primeira versão.

## Estados de UI

- Ajuda fechada: botão `💬 Ajuda` visível; composer recolhido.
- Ajuda aberta: composer aberto; uma única mensagem de ajuda e chips visíveis na conversa.
- Chip selecionado: chips atuais são removidos; decisão do cliente e resposta da Ana são adicionadas; `Outras dúvidas` aparece logo após a resposta; composer permanece aberto.
- `Outras dúvidas`: insere novamente a mensagem curta + chips sem duplicar blocos antigos ativos.
- Checkout: comportamento existente continua escondendo a Ajuda.

## Tratamento de falhas

Se a configuração de perguntas não carregar, o composer abre normalmente e o cliente ainda pode escrever, enviar áudio ou foto. Falha de configuração nunca bloqueia a compra.

Itens sem `response_text` ou tipos de compra são ignorados silenciosamente na área de perguntas rápidas. O Admin continua permitindo editar, ordenar, ativar e desativar as perguntas válidas.

## Testes

- Contrato garantindo que `/admin/index.html` não referencia `/admin-v3/`.
- Contrato garantindo que páginas canônicas de Atendimento, Imagens IA e Nomes existem em `/admin/`.
- Contrato garantindo que links principais do Admin apontam para `/admin/...`.
- Contrato garantindo redirecionamento das páginas HTML legadas de `/admin-v3/`.
- Teste do Chat Comprar garantindo busca em `menuApi`, filtro dos tipos de compra, resposta por `response_text`, `Outras dúvidas` e composer mantido aberto.
- Testes existentes de Comprar, Admin e modo de teste continuam verdes.

## Fora de escopo

- Remover fisicamente todo o histórico de arquivos de `admin-v3/`.
- Criar IA nova para perguntas rápidas.
- Reordenar perguntas automaticamente por métricas de uso.
- Alterar regras comerciais, pagamento, checkout ou persistência de pedidos.
