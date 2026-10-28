# Design: pedidos combinados no WhatsApp

**Status:** proposta curta aguardando aprovação  
**Data:** 2026-10-28

## Intenção

A aba **Pedidos · 28h** deve encontrar tanto pedidos originados no site quanto compras combinadas diretamente no WhatsApp, sem tratar uma simples consulta como venda.

## Estado atual

Pedidos do site são associados à conversa pelo vínculo direto, telefone ou cliente. Para pedidos sem registro no site, o filtro ainda depende de poucas palavras na mensagem. O botão **+ / −** permite inclusão e exclusão manual por conversa.

## Objetivos e limites

- Identificar automaticamente pedidos diretos com sinais claros de compra e exibir a origem como **Pedido pelo WhatsApp**.
- Manter dúvidas sobre preço, estoque e disponibilidade fora da classificação automática.
- Preservar a inclusão e exclusão manual existentes para casos que a regra não reconheça.
- A classificação não cria pedido no cadastro, não envia mensagem e não cria nota no Bling.

## Abordagens consideradas

| Caminho | Vantagem | Limite |
| --- | --- | --- |
| Ampliar palavras-chave | Rápido de ajustar | Pode confundir perguntas com vendas |
| Regra conservadora com contexto | Automatiza sinais claros e reduz falsos positivos | Pode deixar uma venda implícita para revisão |
| Confirmação manual em toda conversa | Mais controle | Depende de alguém marcar cada conversa |

## Proposta de critério

Usar uma regra determinística no servidor. Marcar como pedido direto quando houver uma confirmação explícita de compra e algum detalhe da transação — produto/quantidade, pagamento ou combinação de entrega/retirada — dentro da conversa recente. Uma pergunta isolada de preço ou disponibilidade não basta. Casos ambíguos continuam disponíveis para inclusão manual.

A aba reúne pedidos do site e pedidos diretos, mantendo uma indicação visual de origem. O período segue as últimas 28 horas.

## Aprovação pendente

O critério acima é a recomendação padrão desta análise; ainda não foi confirmado pelo usuário. Depois da aprovação, preparar o plano de implementação antes de alterar o código.
