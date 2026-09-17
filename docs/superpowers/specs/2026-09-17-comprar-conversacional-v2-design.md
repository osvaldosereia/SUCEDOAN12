# Comprar Conversacional V2 — Design

Data: 2026-09-17
Status: aprovado em conversa

## Objetivo

Transformar o Comprar em uma experiência realmente conversacional, preservando carrinho, estoque, cestas, checkout e persistência atuais. O cliente deve sentir uma sequência de atendimento semelhante a uma conversa: Ana fala, cliente escolhe, a escolha aparece como mensagem do cliente e somente então a próxima ferramenta é apresentada.

## Princípio central

**Ana fala → respostas rápidas → decisão do cliente vira balão → pequena cadência → próxima fala/ferramenta.**

A interface nunca deve executar várias decisões comerciais ao mesmo tempo.

## Regras de UX

1. Uma decisão principal por turno.
2. Respostas rápidas desaparecem depois da escolha.
3. Decisões semânticas viram balões do cliente; filtros, busca, +/−, scroll e “Ver mais” continuam silenciosos.
4. Ferramentas grandes recolhem quando a decisão termina.
5. Nenhuma oferta aparece automaticamente dentro da revisão do pedido.
6. Checkout não contém upsell.
7. O sistema não espera artificialmente 2 segundos; usa atraso curto configurável de 450–850 ms para mensagens determinísticas e o tempo real quando há busca remota.
8. Operações de carrinho e checkout permanecem determinísticas; nenhuma IA decide preço, estoque, pagamento ou persistência.
9. Mobile-first com mais respiro vertical, largura confortável de bolhas e sem elementos flutuantes cobrindo conteúdo.

## Fluxo após escolher uma cesta

1. Cliente toca “Quero esta cesta”.
2. A ação vira balão do cliente: “Quero <nome da cesta>”.
3. Composição grande é recolhida.
4. Ana confirma: “Pronto! Sua cesta já está no pedido.”
5. Resumo compacto da cesta é mostrado.
6. Ana pergunta: “Quer acrescentar alguma coisa antes de eu fechar?”
7. Respostas rápidas:
   - “Ver 6 ofertas de hoje”
   - “Procurar outros produtos”
   - “Não, revisar meu pedido”
8. Nenhum card aparece antes dessa escolha.

## Ofertas permissionadas

Quando o cliente escolher “Ver 6 ofertas de hoje”:

- a escolha vira balão do cliente;
- Ana mostra uma frase curta;
- carregar até 6 produtos realmente em oferta;
- produto deve estar ativo, vendável, com estoque e `offer_price < price`;
- não repetir item já presente no carrinho;
- cards aparecem como ferramenta anexa à conversa;
- após adicionar, o cliente pode continuar comprando ou revisar o pedido;
- se não houver ofertas válidas, Ana informa isso e apresenta as opções “Procurar outros produtos” / “Revisar meu pedido”.

Não existe segundo upsell automático na revisão.

## Produtos

“Procurar outros produtos” abre a ferramenta existente de produtos. A navegação Para Você / Para Casa / Ofertas e filtros continuam funcionando. O ato de abrir a seção entra como decisão semântica; filtros internos não entram na timeline.

## Revisão do pedido

Ao escolher “Revisar meu pedido” ou tocar na barra “Ver pedido”:

- Ana diz “Confira seu pedido antes de finalizar.”;
- mostrar cesta, extras e total;
- não carregar upsell;
- ações: “Alterar pedido” e “Finalizar pedido”.

## Checkout conversacional

O checkout continua usando os mesmos endpoints, mas a apresentação é progressiva:

### Identificação
- Ana pede WhatsApp com DDD.
- Ao continuar, a resposta entra como balão do cliente mascarado/legível, sem expor dados além do necessário.

### Cliente encontrado
- Ana confirma que encontrou o cadastro.
- Se houver endereço salvo, pergunta se pode usar aquele endereço.
- respostas rápidas: “Sim, usar este endereço” / “Usar outro endereço”.
- somente se necessário abrir campos de endereço.

### Cliente novo ou outro endereço
- mostrar formulário de dados/endereço em um bloco único, mas somente nesse turno.
- depois de continuar, recolher o bloco em resumo compacto.

### Pagamento
- Ana pergunta “Como você prefere pagar na entrega?”
- respostas rápidas: PIX, Cartão de crédito, Alimentação/refeição, Dinheiro.
- escolha vira balão do cliente.

### Confirmação
- mostrar endereço, pagamento e total;
- única ação principal: “Confirmar pedido”.
- backend permanece: salvar cliente → salvar endereço → salvar pagamento → confirmar pedido → abrir WhatsApp somente após persistência.

## Cadência e typing

Criar helper de conversa para:

- bloquear respostas rápidas enquanto um turno está sendo processado;
- exibir indicador “Ana está digitando…”;
- atraso padrão aleatório entre 450 e 850 ms apenas para mensagens locais;
- remover indicador antes da mensagem;
- permitir `delay=0` em retomadas/restores.

## Estado conversacional

Adicionar estado leve no front, sem nova tabela:

- `busy`: existe turno em processamento;
- `lastPrompt`: prompt atual;
- `offersSeen`: ofertas já apresentadas;
- `postBasketResolved`: decisão pós-cesta já tomada;
- `checkoutStep`: identification | address | payment | confirmation | success.

O estado comercial real continua sendo o carrinho/checkout do backend.

## Arquivos

- `comprar/conversation.js`: helpers de turno, typing e respostas rápidas.
- `comprar/baskets.js`: pós-cesta passa a aguardar escolha explícita.
- `comprar/upsell.js`: vira ferramenta de ofertas permissionadas; remove disparos automáticos.
- `comprar/app.js`: revisão não chama upsell; integra revisão com respostas conversacionais.
- `comprar/checkout.js`: checkout progressivo por turnos.
- `comprar/styles.css`: bolhas, quick replies, typing, respiro e blocos progressivos.
- `comprar/index.html`: carrega módulo novo e versiona assets.
- `scripts/test-comprar-conversation-v2.mjs`: contratos do novo fluxo.

## Critérios de aceitação

1. Confirmar cesta não abre ofertas nem produtos automaticamente.
2. Após cesta existe pergunta com 3 respostas rápidas.
3. Escolha do cliente aparece no lado direito antes da próxima fala da Ana.
4. Ofertas só aparecem após consentimento explícito.
5. Revisão do pedido nunca chama upsell.
6. Checkout não contém upsell.
7. Pagamento é uma pergunta separada do formulário de endereço.
8. Blocos concluídos são recolhidos ou substituídos por resumo compacto.
9. Barra fixa e ajuda não cobrem respostas rápidas no mobile.
10. Testes de contrato existentes continuam passando.
11. Backend e Supabase permanecem inalterados nesta rodada.