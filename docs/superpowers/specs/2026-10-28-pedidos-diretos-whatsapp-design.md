# Design: triagem automática de pedidos e interesses no WhatsApp

**Status:** aprovado pelo usuário; escopo ampliado a pedido do usuário  
**Data:** 2026-10-28

## Intenção

Ajudar o atendimento a priorizar conversas recentes, mostrando interesses e pedidos diretos sem exigir classificação precisa nem criar registros comerciais automaticamente.

## Estado atual

A aba **Pedidos · 28h** considera pedidos do site ligados por conversa, telefone ou cliente e sinais textuais limitados. Há controles **+ / −** para incluir ou excluir uma conversa manualmente.

## Objetivos

- Manter **Pedidos · 28h** para pedidos do site e pedidos combinados no WhatsApp.
- Criar **Interessados · 48h** para conversas recentes com sinais de interesse em produto, preço, disponibilidade, variantes, entrega/retirada ou intenção de compra.
- Considerar pedido como categoria prioritária: quando a conversa atingir sinais de compra direta, ela sai de **Interessados** e aparece em **Pedidos**.
- Mostrar a origem do pedido (site ou WhatsApp) e manter os controles manuais existentes.
- Recalcular as categorias ao trocar/atualizar a aba e automaticamente a cada 5 minutos enquanto a página estiver visível em uma das abas de CRM.

## Regra proposta

Uma regra determinística no servidor classifica interesse com alta cobertura, aceitando algum falso positivo para ajudar o atendimento. Pedido direto exige confirmação explícita de compra junto com detalhe de transação, como produto/quantidade, pagamento ou entrega/retirada. Pedido real recente do site também tem precedência. Dúvidas ambíguas podem ser ajustadas pelos controles manuais.

## Limites

A classificação é uma fila de atendimento, não um registro de venda. Não cria pedido, não envia mensagem, não cria nota no Bling, não usa modelo externo e não guarda cópia do texto das mensagens. As marcações automáticas são recalculadas a partir das mensagens recentes.

## Abordagens consideradas

| Caminho | Vantagem | Limite |
| --- | --- | --- |
| Ampliar palavras-chave igualmente para interesses e pedidos | Implementação rápida | Pode tratar pergunta como venda |
| Alta cobertura para interesse e regra mais estrita para pedido | Ajuda a encontrar leads e preserva precedência de pedidos | A aba de interesse terá falsos positivos |
| Confirmar tudo manualmente | Controle preciso | Não funciona como CRM automático |

A abordagem escolhida é a segunda, conforme a aprovação do usuário e a preferência explícita por uma ferramenta de apoio sem exigir alta precisão.
