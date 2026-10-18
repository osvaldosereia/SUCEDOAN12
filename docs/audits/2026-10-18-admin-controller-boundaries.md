# Mapa de fronteiras dos controladores — Vitrine Admin

## Objetivo
Definir a sequência segura para extrair controladores do `vitrine/admin/index.html` sem alterar o fluxo operacional.

## Dependências identificadas
| Domínio | Funções-chave | Dependências/risco |
|---|---|---|
| Pedidos | `orderProblemReasons`, `orderIssueMatch`, `orderOperationalPriority`, `orderNextAction`, `orderFilterMatch`, `openOrder` | `state.orders`, snapshots, histórico, pagamento e estoque; alto |
| Separação | `openOrderSeparationSheet` | Reserva/consumo de estoque, estados do pedido e conferência; crítico |
| Fiscal | `loadCurrentOrderFiscal` | Bling, gates NF-e e autorização; crítico |
| Inventário | `renderBalance`, `handleBalanceScan` | Leitura de EAN, contagem e ajuste de estoque; alto |
| Entregas | `printDelivery`, `openPrint` | Dados do pedido e janela de impressão; médio |
| Navegação | `start`, `setTab` | Deep links, parâmetros, navegação e inicialização; alto |

## Critérios de extração
1. Primeiro mover funções puras de classificação, mantendo a assinatura e as strings originais.
2. Passar dependências de estado, acesso a rede e DOM explicitamente ao módulo, evitando globals implícitas.
3. Não mover mutações de pedido/estoque/fiscal sem testes de transição de estados e concorrência.
4. Manter fluxos WhatsApp existentes; a eliminação da vitrine externa pertence a uma etapa funcional separada.
5. Homologar com pedidos de teste: Novo → Confirmado → Separar Agora → Separado/Faltou → Pronto → Entrega → Fiscal.
6. Nunca alterar simultaneamente o contrato de RPC, a interface e a lógica de estoque.

## Próxima implementação sugerida
Extrair `orderProblemReasons`, `orderIssueMatch`, `orderOperationalPriority`, `orderNextAction` e `orderFilterMatch` como um módulo de leitura com dependências injetadas, acompanhado por fixtures para estados de pedidos e exceções. Não realizar essa extração antes de validar os testes de caracterização.

## Reversibilidade
Todas as alterações seguem em PRs draft encadeados. Reverter o merge da entrega correspondente caso o carregamento, a separação, o Bling ou a emissão fiscal apresentem regressões.
