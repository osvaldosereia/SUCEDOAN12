# Comprar — Visual e Checkout Design

## Objetivo

Refinar o Comprar da Dona Antônia para ficar visualmente mais limpo, com menos interferência, fotos maiores e navegação mais óbvia; adicionar detalhe de produto ao toque; e redesenhar o fechamento do pedido para confirmar endereço e pagamento antes de enviar o resumo ao WhatsApp.

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

## Estados e erros

- Se imagem falhar, manter fallback visual atual.
- Se detalhe do produto falhar, card rápido continua funcional.
- Se geolocalização falhar, permitir preencher manualmente.
- Se WhatsApp não abrir, manter pedido salvo e mostrar fallback manual.
- Se salvar/substituir endereço falhar, não avançar para pagamento como se estivesse confirmado.
- Se forma de pagamento não estiver selecionada, bloquear o botão final com mensagem curta no próprio checkout.

## Critérios de sucesso

- Fotos visualmente maiores em todas as listas de produtos.
- Menos interferência visual e menos camadas de caixas.
- Clique em produto abre detalhe sem sair da compra.
- + continua sendo adição rápida.
- Cliente recorrente com endereço correto conclui em três ações principais: confirmar endereço, escolher pagamento, confirmar/enviar.
- Cliente pode substituir um endereço existente ou adicionar um segundo endereço de verdade.
- WhatsApp abre uma única vez, com mensagem pronta e sem voltar automaticamente para o Comprar por causa de um segundo redirecionamento.
- Pedido já está persistido antes da tentativa de abrir WhatsApp.
- Testes automatizados cobrem produto, endereço, pagamento e WhatsApp.

## Fora de escopo

- Não alterar identidade visual da marca.
- Não refazer Admin V3.
- Não alterar Bling nesta etapa.
- Não criar novo sistema de chat/IA.
- Não alterar regras comerciais de preço/estoque/cestas além do necessário para refletir o estado atual no novo visual.
