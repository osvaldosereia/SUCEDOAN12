# Comprar — Visual e Checkout Design

## Objetivo

Refinar o Comprar da Dona Antônia para ficar visualmente mais limpo, com menos interferência, fotos maiores e navegação mais óbvia; adicionar detalhe de produto ao toque; redesenhar o fechamento do pedido para confirmar endereço e pagamento antes de enviar o resumo ao WhatsApp; e garantir que o pedido seja salvo integralmente e possa ser consultado no Admin oficial.

## Princípios visuais

- Manter identidade Dona Antônia: verde escuro, branco e logo real.
- Usar Take App apenas como referência de limpeza, hierarquia e respiro, sem copiar identidade ou estrutura integral.
- Produto deve ser o foco visual: foto > nome > preço > quantidade.
- Reduzir bordas, fundos cinza, sombras e card dentro de card.
- Aumentar espaço em branco e legibilidade.
- Chat/Ana continua disponível, mas não deve competir visualmente com a compra.
- Mobile-first; desktop mantém a mesma linguagem com maior largura útil.

## Cabeçalho e navegação

- Substituir o círculo “DA” pela logo real da Dona Antônia.
- Manter topo compacto, com nome da loja e status curto.
- Manter as entradas principais: Cestas Básicas, Ofertas, Para Você e Para Casa.
- A seção ativa precisa ser evidente sem excesso de contorno.
- Reduzir mensagens intermediárias da Ana entre ações de compra; mensagens só quando agregarem orientação.

## Listas de produtos

- Todas as listas de produtos devem dar mais espaço à foto.
- No mobile, usar grade de 2 colunas para listas extensas de produtos.
- Em Ofertas, Para Você, Para Casa, busca e seleção de extras, usar o mesmo componente visual de produto.
- Cada card deve exibir apenas:
  - foto grande;
  - nome curto;
  - preço;
  - controle rápido de quantidade.
- Metadados secundários só aparecem no detalhe do produto.
- O botão + adiciona rapidamente sem abrir detalhe.
- Tocar na foto ou no nome abre o detalhe do produto.

## Detalhe do produto

- No celular, abrir como bottom sheet/modal sobre a tela atual; no desktop, dialog centralizado.
- Não navegar para outra página e não perder posição da lista.
- Exibir:
  - foto grande em destaque;
  - nome completo;
  - preço;
  - marca/volume quando disponíveis;
  - descrição curta quando disponível;
  - quantidade com − / +;
  - ação de adicionar/atualizar.
- Fechar por X, toque fora ou gesto/ação de voltar compatível com navegador.
- O estado da quantidade do detalhe deve refletir o carrinho e vice-versa.

## Cestas

- Manter cestas como produtos de maior destaque visual.
- Aumentar a imagem das cestas e reduzir molduras ao redor.
- Ao abrir composição da cesta, mostrar produtos internos com imagens maiores e menos elementos decorativos.
- Ver composição continua sendo uma leitura; escolher a cesta continua sendo uma ação separada.

## Barra inferior e ajuda

- Priorizar uma única barra fixa de pedido, mostrando quantidade de itens, total e ação de ver/finalizar pedido.
- A caixa de mensagem da Ana não deve ocupar permanentemente a mesma prioridade visual do carrinho durante a navegação de produtos.
- Manter um acesso claro para pedir ajuda/conversar com Ana quando necessário.

## Checkout final

O fechamento deve ser linear, rápido e impedir envio incompleto ao WhatsApp.

### 1. Identificação

- Cliente informa o WhatsApp.
- Se cadastro conhecido exigir confirmação de identidade, abrir o WhatsApp diretamente no mesmo contexto de navegação, sem target=_blank.
- Ao retornar ao Comprar, verificar automaticamente a confirmação e continuar.

### 2. Endereço

Para cliente conhecido:

- Mostrar endereço salvo em card simples e legível.
- Ações principais:
  - “Entregar aqui”
  - “Trocar endereço”
- Se houver mais de um endereço, mostrar seletor simples com todos os endereços ativos.
- Nenhum endereço deve vir silenciosamente confirmado; o cliente precisa confirmar qual será usado nesta entrega.

Ao trocar ou cadastrar endereço:

- Abrir formulário preenchido quando estiver editando um endereço existente.
- Permitir usar localização para preencher dados, mantendo conferência manual.
- Antes de salvar, mostrar duas opções reais:
  - “Substituir este endereço”
  - “Adicionar como outro endereço”
- “Substituir” atualiza o registro selecionado.
- “Adicionar” cria novo registro e mantém os demais ativos.
- O backend deve preservar múltiplos endereços e controlar qual é o padrão.

### 3. Forma de pagamento

- Exibir somente depois de o endereço estar confirmado.
- Opções:
  - PIX
  - Cartão de crédito
  - Alimentação / Refeição
  - Dinheiro
- A opção selecionada deve ter estado visual inequívoco.
- Não permitir concluir sem forma de pagamento.

### 4. Resumo final

Antes de enviar ao WhatsApp, mostrar resumo compacto com:

- endereço confirmado;
- forma de pagamento confirmada;
- total do pedido;
- cesta e quantidade de produtos de forma resumida.

Botão final:

**Confirmar e enviar no WhatsApp**

O botão só fica ativo quando endereço e pagamento estiverem confirmados.

## Persistência integral do pedido

Antes de qualquer tentativa de abrir o WhatsApp, o pedido precisa estar persistido de forma completa e idempotente no banco.

O registro operacional deve permitir reconstruir o pedido sem depender da mensagem do WhatsApp e deve conter, direta ou indiretamente por snapshots/itens relacionados:

- ID interno e número legível do pedido;
- data/hora de criação e confirmação;
- origem `shopping_room`/Comprar;
- cliente: ID, nome, WhatsApp, CPF/CNPJ quando houver e snapshot dos dados usados na compra;
- endereço de entrega completo confirmado, incluindo localização/locator quando fornecida;
- forma de pagamento confirmada;
- cesta escolhida, quando houver;
- todos os produtos, com product_id, SKU quando houver, nome snapshot, quantidade, preço unitário, total da linha e origem do item (cesta/alteração/extra);
- subtotal/fiscal subtotal, outras despesas, desconto e total final;
- IDs de carrinho, conversa e sessão quando disponíveis;
- status operacional e status de integração;
- dados suficientes para o Admin mostrar alterações da cesta e produtos extras.

A operação de confirmação deve ser idempotente: repetir a abertura do WhatsApp ou tocar no fallback não pode gerar um segundo pedido.

## Admin oficial

O Admin atual em `/admin/` é anterior ao Admin V3. A versão mais nova deve se tornar o Admin oficial no caminho `/admin/`.

- O Admin oficial precisa ter a área **Pedidos**.
- Pedidos originados no Comprar devem aparecer junto dos demais pedidos suportados, com filtro de origem/status quando necessário.
- A lista deve mostrar pelo menos: número do pedido, data, cliente/telefone, total, pagamento e status.
- Ao abrir um pedido, o Admin deve mostrar todos os dados persistidos: cliente, endereço, pagamento, cesta, itens, alterações, extras, valores e IDs operacionais úteis.
- O Admin deve ler da mesma fonte de verdade (`orders` + `order_items` e snapshots relacionados), não de uma cópia criada apenas para a interface.
- Durante a promoção, `/admin-v3/` deve continuar funcionando como caminho de compatibilidade, mas `/admin/` passa a ser o endereço oficial.

## Abertura do WhatsApp

- O pedido deve ser salvo primeiro.
- Depois da resposta de sucesso da API, abrir o WhatsApp uma única vez.
- Remover target=_blank dos caminhos de confirmação.
- Remover redirecionamento automático atrasado por MutationObserver/timer como mecanismo principal.
- Em mobile, preferir deep link `whatsapp://send` com telefone e texto; em desktop, usar WhatsApp Web.
- Manter fallback visível “Abrir WhatsApp” se o redirecionamento não tirar o usuário da página.
- Nunca criar pedido duplicado quando o usuário tocar novamente no fallback.
- A mensagem final deve continuar incluindo cesta, alterações, extras, valores, endereço e pagamento.

## Dados e backend de endereços

O comportamento atual de `room_save_address` não cobre substituição real. Será necessário oferecer operações explícitas para:

- adicionar endereço;
- substituir endereço existente por ID;
- definir endereço padrão;
- manter múltiplos endereços ativos.

O checkout deve consumir IDs de endereço já presentes em `room_checkout_preview` e enviar ao backend a intenção de salvar: `replace` ou `add`.

## Estrutura de implementação

- Evitar aumentar ainda mais `chat-light-v2.js` e `chat-checkout-quantity-v1.js` com responsabilidades desconexas.
- Criar módulo focado para detalhe/grade de produtos.
- Criar módulo focado para checkout final e abertura do WhatsApp, reaproveitando APIs existentes.
- Alterar funções de endereço no Supabase de forma compatível com sessões existentes.
- Manter os fluxos atuais de carrinho e composição de cesta.
- Evoluir o Admin V3 somente no necessário para Pedidos e promovê-lo a `/admin/` ao final, sem redesenhar outros módulos administrativos.

## Estados e erros

- Se imagem falhar, manter fallback visual atual.
- Se detalhe do produto falhar, card rápido continua funcional.
- Se geolocalização falhar, permitir preencher manualmente.
- Se WhatsApp não abrir, manter pedido salvo e mostrar fallback manual.
- Se salvar/substituir endereço falhar, não avançar para pagamento como se estivesse confirmado.
- Se forma de pagamento não estiver selecionada, bloquear o botão final com mensagem curta no próprio checkout.
- Se a persistência integral do pedido falhar, não abrir o WhatsApp nem exibir o pedido como confirmado.

## Critérios de sucesso

- Fotos visualmente maiores em todas as listas de produtos.
- Menos interferência visual e menos camadas de caixas.
- Clique em produto abre detalhe sem sair da compra.
- + continua sendo adição rápida.
- Cliente recorrente com endereço correto conclui em três ações principais: confirmar endereço, escolher pagamento, confirmar/enviar.
- Cliente pode substituir um endereço existente ou adicionar um segundo endereço de verdade.
- Pedido completo é salvo antes do WhatsApp e pode ser aberto no Admin oficial.
- `/admin/` representa a versão administrativa mais nova e contém a área de Pedidos.
- WhatsApp abre uma única vez, com mensagem pronta e sem voltar automaticamente para o Comprar por causa de um segundo redirecionamento.
- Testes automatizados cobrem produto, endereço, pagamento, persistência do pedido, Admin e WhatsApp.

## Fora de escopo

- Não alterar identidade visual da marca.
- Não refazer módulos do Admin que não sejam necessários para Pedidos e para a promoção do Admin V3 a `/admin/`.
- Não alterar Bling nesta etapa.
- Não criar novo sistema de chat/IA.
- Não alterar regras comerciais de preço/estoque/cestas além do necessário para refletir o estado atual no novo visual.
