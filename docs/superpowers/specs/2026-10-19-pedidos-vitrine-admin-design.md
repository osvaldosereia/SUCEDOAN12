# Pedidos do Vitrine Admin: fluxo simples

**Status:** desenho aprovado em conversa; aguardando revisão desta especificação antes da implementação.

## Objetivo

Deixar a sessão Pedidos simples de entender e operar. A navegação principal acompanha o caminho real do pedido, com quatro abas no máximo: **Novo**, **Separar agora**, **Pronto para entrega** e **Entregue**.

## Fluxo operacional

1. Pedido recebido e ainda não confirmado aparece em **Novo**.
2. Ao confirmar o pedido, ele aparece automaticamente em **Separar agora**. A tela deixa de exigir inclusão manual em uma fila para que o pedido confirmado apareça nessa etapa.
3. Enquanto a separação estiver atribuída ou em andamento, o pedido continua em **Separar agora**. Os controles existentes de responsável e conferência por item permanecem.
4. Ao concluir a separação, o pedido aparece em **Pronto para entrega**. A NF-e continua seguindo o processo atual de sincronização/emissão/autorização pelo Bling. O estado fiscal fica visível no pedido e a ação de saída para entrega só fica disponível quando a autorização fiscal existente permitir.
5. Ao confirmar a entrega, o pedido aparece em **Entregue**.

Pedidos cancelados não ganham uma quinta aba. Eles devem continuar localizáveis pela busca global e identificados claramente como cancelados.

## Interface

- Mostrar somente as quatro abas acima na navegação principal, no desktop e no celular.
- Usar a aba **Novo** como entrada padrão.
- Fazer a busca localizar pedidos em qualquer etapa, inclusive cancelados, sem exigir a troca de aba.
- Manter cartões compactos, com identificador do pedido, cliente, telefone, data, total, situação e a próxima ação operacional evidente.
- Dar destaque a uma ação principal por situação. Manter acesso ao detalhe e às ações secundárias necessárias, sem remover recursos de operação.
- Preservar o fluxo atual de detalhe, atendimento, chat e WhatsApp; esta especificação não altera seu comportamento.

## Integrações e regras preservadas

- Preservar a conexão, os endpoints, os payloads e a sincronização com o Bling.
- Preservar o fluxo atual de NF-e e seus bloqueios de autorização antes da expedição.
- Preservar atribuição de separador, conferência de itens, faltas, totais, idempotência e confirmação de entrega.
- Não alterar schema, migrations, RPCs, Edge Functions, regras comerciais ou dados de produção.
- Não publicar, implantar ou mesclar a branch durante este trabalho.

## Critérios de aceite

1. A lista apresenta exatamente as abas **Novo**, **Separar agora**, **Pronto para entrega** e **Entregue**.
2. Um pedido recebido aparece em **Novo**; confirmá-lo o move para **Separar agora** sem inclusão manual em fila.
3. Um pedido permanece em **Separar agora** durante a separação e só muda após a conclusão confirmada pelo backend.
4. A conclusão da separação o move para **Pronto para entrega**, sem liberar despacho antes do gate fiscal vigente.
5. A confirmação de entrega o move para **Entregue**.
6. A busca encontra um pedido cancelado em qualquer aba e mostra sua situação real.
7. A sincronização com Bling, o ciclo de NF-e, atendimento/chat e WhatsApp mantêm os contratos atuais.
8. Os contratos de UI, ciclo do pedido, separação, fiscal e integração permanecem cobertos por testes, incluindo a correção do teste que não carrega o provider extraído `orders/card-view.js`.

## Fora de escopo

- Mudanças em Supabase, Bling, emissão fiscal, atendimento, chat ou WhatsApp.
- Redesenho de expedição, roteirização ou cadastro de pedidos.
- Remoção de APIs/RPCs legadas da fila manual nesta rodada; a tela deixa de depender da seleção manual, mas a limpeza de backend exige revisão separada.
