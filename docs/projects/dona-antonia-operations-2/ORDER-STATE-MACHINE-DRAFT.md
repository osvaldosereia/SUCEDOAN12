# Dona Antônia Operations 2.0 — Estado Canônico do Pedido (DRAFT)

> Modelo analítico; nomes ainda podem mudar.

## Objetivo
Ter um fluxo de negócio simples para o Admin, mesmo que Bling possua estados técnicos próprios.

## Estados principais
1. `draft` — rascunho WhatsApp/manual ainda não é venda.
2. `awaiting_customer_confirmation` — pedido completo aguardando o cliente.
3. `approved` — cliente confirmou.
4. `picking` — separação física.
5. `picked` — funcionário terminou a separação.
6. `checking` — conferência.
7. `verified` — conferido sem divergência.
8. `fiscal_pending` — quando aplicável conforme fluxo homologado.
9. `ready_to_dispatch` — apto à rota.
10. `out_for_delivery`.
11. `delivered_pending_settlement` — se pagamento/fechamento ainda não foi concluído.
12. `completed`.
13. `cancelled`.
14. `exception` — estado auxiliar, com reason e previous_state.

## Regra
A interface de funcionário traduz isso para poucas palavras:
- Aguardando
- Separar
- Conferir
- Pronto
- Entregar
- Problema

## Transições que devem ser automáticas
- confirmação WhatsApp -> approved;
- approved -> reserva + impressão;
- conferência completa -> verified;
- verified -> automações Bling homologadas;
- fiscal/documentos OK -> ready_to_dispatch;
- entrega + pagamento OK -> completed.

## Transições humanas inevitáveis
- picking -> picked;
- checking físico;
- out_for_delivery -> entregue/não entregue;
- registro do pagamento real;
- resolução de exception.

## Exceção não apaga estado
Quando um problema ocorre, registrar:
- previous_state;
- exception_type;
- blocking=true/false;
- opened_at;
- owner_role;
- resolution;
- resolved_at.

Assim o sistema sabe exatamente para onde retornar depois da correção.
