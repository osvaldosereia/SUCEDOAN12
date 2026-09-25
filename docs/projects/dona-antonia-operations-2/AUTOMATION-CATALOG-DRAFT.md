# Dona Antônia Operations 2.0 — Catálogo de Automações (DRAFT)

> Análise; nenhuma automação deve ser ativada a partir deste documento.
> Última atualização: 2026-09-25.

## Princípio
Cada automação precisa declarar:
- gatilho;
- pré-condições;
- ação;
- sistema executor;
- idempotência;
- evidência;
- tratamento de falha;
- necessidade de aprovação;
- evento no ledger.

## Catálogo inicial

| Automação | Gatilho | Executor preferido | Humano |
|---|---|---|---|
| Resumo de pedido ao cliente | pedido criado | PapoAI/WhatsApp | não |
| Confirmar pedido | resposta inequívoca do cliente | integração PapoAI -> motor de pedido | só exceção |
| Cancelar pedido pré-separação | cancelamento inequívoco | motor de pedido | só exceção |
| Criar/atualizar pedido Bling | pedido canônico/status | Bling API/MCP | não |
| Reservar estoque | situação Aprovado | Bling | não |
| Imprimir picking 85mm | Aprovado | print bridge/QZ | não |
| Reimpressão | solicitação | print bridge/QZ | operador |
| Alertar impressão falha | erro de impressão | Control Tower | não |
| Follow-up confirmação | timeout | PapoAI | não até limite |
| Marcar separado | conclusão física | Admin tablet | sim |
| Abrir problema | exceção física | Admin tablet | sim |
| Conferir EAN | item físico | Bling Checkout | sim |
| Finalizar checkout | todos itens conferidos | Bling | automático se config permitir |
| Lançar estoque | Verificado | Bling Transition Manager | não |
| Lote FEFO | baixa | Bling | não |
| Gerar/autorizar fiscal | gate homologado | Bling | ideal automático; exceções humanas |
| Imprimir DANFE/etiqueta | fiscal/checkout | Bling + QZ | não |
| Montar rota sugerida | pedidos prontos | Dona Antônia | não |
| Confirmar entrega | ato físico | Entregador | sim |
| Registrar recebimento | ato físico | Entregador | sim |
| Atualizar financeiro | recebimento confirmado | Bling | não |
| Fechamento do pedido | todos gates | sistema | não |
| XML CNPJ recebido | Bling/SEFAZ | Bling | não |
| Conciliação segura produto | XML | Bling/regra DA | não |
| Conversão conhecida | XML | regra DA | não |
| Conversão ambígua | XML | Control Tower | supervisor |
| Conta a pagar CNPJ | entrada homologada | Bling | não |
| XML CPF | upload | DA staging | revisão quando necessário |
| Conta a pagar CPF | qualquer | bloqueado | nunca automática |
| Vencimento/lote | evento/rotina | Bling + regra DA | não |
| Oferta automática | faixa validade | regra DA | não se já homologada |
| Alerta integração | falha | Control Tower | não |
| Relatório diário | horário/evento | Control Tower/IA | não |
| Sugestão de compra | estoque/vendas | IA | aprovar compra |
| Pedido de compra | aprovação | Bling | supervisor/owner conforme valor |

## Estado-alvo
A automação não será medida pela quantidade de "robôs".
Será medida por:
- cliques evitados;
- erros evitados;
- tempo de ciclo;
- exceções por 100 pedidos;
- ações humanas realmente necessárias.

Objetivo:
**happy path quase totalmente automático; humanos tratam mundo físico e exceções.**
