# Dona Antônia Operations 2.0 — Homologação / Implantação

> Início autorizado em 2026-09-25.
> Branch de trabalho: `ops2/homologacao-implantacao`.

## Política desta fase
- sem big-bang;
- alterações pequenas e reversíveis;
- preservar pedidos antigos;
- Bling como ERP;
- webhooks/eventos em vez de polling;
- nenhuma limpeza destrutiva antes do cutover;
- cada etapa com validação e rollback.

## Fase 0 — iniciada
1. baseline do runtime capturado;
2. branch isolada criada;
3. fundação da Control Tower preparada;
4. remover desperdício de crons fisicamente ativos mas logicamente desligados;
5. validar fundação no Supabase;
6. começar homologação Bling: situações, reserva, webhooks e Checkout.

## Baseline encontrado
- Bling Hub: `hub_enabled=false`;
- Bling webhooks: `webhooks_enabled=false`;
- cron Hub ainda ativo a cada 2 minutos;
- fiscal runtime: `enabled=false`, `execution_mode=off`;
- cron fiscal AI ainda ativo a cada 1 minuto;
- XML compras diário permanece necessário.

Decisão:
- pausar os dois crons ociosos;
- manter XML diário;
- não remover funções/tabelas ainda.

## Foundation v1
Novas estruturas não destrutivas:
- `ops_events`;
- `ops_attention`;
- `ops_approvals`.

RLS habilitado sem acesso direto do cliente. Uso inicialmente somente por backend/service role.
