# Dona Antônia Operations 2.0 — IMPLEMENTATION ROADMAP

> Aprovado para implantação segura em 2026-09-25. Executar por homologação, shadow/canary e rollback; não fazer big-bang.

## Fase 0 — Homologações
- contador;
- Bling;
- PapoAI;
- hardware.

## Fase 1 — Fundações
- perfis/segurança;
- source-of-truth;
- ledger mínimo;
- event bus/webhooks;
- bindings Bling;
- health.

## Fase 2 — Pedido multicanal
- motor único;
- site;
- venda manual;
- PapoAI draft;
- confirmação;
- versão/revisão.

## Fase 3 — Bling early-order
- Aguardando confirmação;
- Aprovado;
- reserva;
- status mapping;
- webhooks.

## Fase 4 — Separação
- picking 85 mm;
- QR;
- tablet;
- Checkout Bling;
- Verificado.

## Fase 5 — Estoque
- saldo virtual;
- webhooks;
- balanço;
- Geral/Quarentena;
- lotes;
- avaria/perda.

## Fase 6 — Compras
- SEFAZ/Bling;
- Check-in;
- DUN;
- XML CPF;
- devolução fornecedor.

## Fase 7 — Fiscal/financeiro
- NF-e;
- DANFE;
- entrega domiciliar;
- pagamentos;
- split;
- refunds.

## Fase 8 — Rota/entrega
- pins;
- roteirização;
- entregador;
- reentrega;
- retorno.

## Fase 9 — Control Tower
- cards;
- attention;
- approvals;
- timeline;
- copiloto.

## Fase 10 — Shadow/Canary
- observar;
- 1 pedido;
- pequeno lote;
- cutover.

## Fase 11 — Cleanup
- remover legado;
- desligar crons inúteis;
- remover funções 410;
- remover tabelas sem uso;
- consolidar documentação.

## Regra
Cada fase precisa de:
- POC;
- teste;
- rollback;
- observabilidade;
- aprovação para avançar.


## Estado de implantação — 2026-09-25
Já iniciados/concluídos parcialmente:
- Fase 1: foundation, ledger, attention, Control Tower;
- Fase 2: motor canônico multicanal + venda manual WhatsApp;
- Fase 3: shadow readiness + OAuth preparado; reserva oficial Bling bloqueada por escopo de Situações;
- Fase 4: fila de picking 85 mm preparada; agente físico ainda não homologado;
- Fase 10: shadow/canary em uso como estratégia de implantação.

Em POC:
- PapoAI capture-only para descobrir o payload real.

Bloqueios externos:
- reautorização do aplicativo Bling para Situações/Módulos/Transições;
- hardware de impressão;
- homologação fiscal/contador antes de automação fiscal definitiva.
