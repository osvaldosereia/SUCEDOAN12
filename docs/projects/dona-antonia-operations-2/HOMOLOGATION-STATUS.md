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


## Execução registrada — 2026-09-25

### Concluído
- branch de homologação criada e integrada ao `main`;
- migration `ops2_foundation_v1` aplicada no Supabase;
- migration `ops2_foundation_api_v1` aplicada no Supabase;
- tabelas `ops_events`, `ops_attention`, `ops_approvals` criadas com RLS;
- helpers idempotentes de evento, atenção e aprovação criados;
- resumo leve da Control Tower criado;
- cron `bling-hub-v2-cycle` pausado porque `hub_enabled=false`;
- cron `fiscal-ai-autonomous-worker-v1` pausado porque o runtime fiscal está `off`;
- cron diário de XML mantido;
- `admin-products-live-v1` atualizado para v14;
- aba `Hoje` evoluída para `Central`;
- painel `Precisa de você` ligado à fila real de `ops_attention`;
- três pendências iniciais registradas:
  - permissão Bling para Situações/Módulos;
  - endpoint PapoAI legado ainda configurado externamente;
  - localização física de produtos incompleta.

### Pull requests
- PR #547 — Fase 0 — merged;
- PR #548 — Control Tower / atenção — merged.

### Sem mudança ainda
- fluxo de criação/aprovação de pedidos;
- reserva oficial no Bling;
- webhooks Bling;
- PapoAI novo;
- estoque oficial do site;
- fiscal;
- pagamento;
- rota;
- balanço oficial no Bling.

Esses domínios continuam no fluxo atual até passarem pela respectiva POC.

## Próximo gate
**Bling — Situações/Módulos + reserva + webhooks.**

O runtime atual continua marcando `situacoes/modulos` como `scope_missing` (HTTP 403). Antes de ativar o workflow automático de pedidos, precisamos homologar essa permissão e provar:
1. leitura das situações;
2. atualização de situação;
3. situação `Aguardando confirmação`;
4. situação `Aprovado / Separar`;
5. reserva somente após aprovação;
6. webhook de atualização;
7. reconciliação sem polling.


## OAuth Bling preparado — 2026-09-25

### Concluído
- PR #551 integrado ao `main`;
- fluxo Owner -> Reconectar Bling -> autorização Bling -> callback -> Admin preparado;
- callback reutiliza `admin-service-intelligence-v1`;
- nenhum novo Edge Function foi criado;
- state OAuth possui hash e expiração;
- refresh token continua armazenado apenas pelo cofre/RPC existente;
- `admin-service-intelligence-v1` implantado em v135;
- `admin-products-live-v1` implantado em v17;
- runbook `BLING-HOMOLOGATION-RUNBOOK.md` criado;
- runtime Bling está em `mode=homologation`, mas `hub_enabled=false` e `webhooks_enabled=false`.

### Restrição encontrada
O projeto Supabase atingiu o limite atual de Edge Functions. Em vez de aumentar plano ou criar mais uma função, o callback OAuth foi consolidado dentro da função administrativa existente.

Essa decisão segue o princípio do Operations 2.0: menos funções e responsabilidades claras.

### Gate humano Bling
Agora existe uma etapa externa inevitável no painel do Bling:
1. adicionar os escopos de Situações/Módulos/Transições ao aplicativo Dona Antônia;
2. configurar/salvar o redirect OAuth para `admin-service-intelligence-v1`;
3. salvar o aplicativo;
4. no Vitrine/Admin > Bling técnico, usar **Reconectar Bling**;
5. voltar à Central e usar **Testar novamente**.

O Bling revoga a autorização anterior quando os escopos do aplicativo são alterados, portanto a reautorização é necessária.

### Não ativar ainda
Mesmo depois da reautorização:
- não ativar `hub_enabled`;
- não ativar `webhooks_enabled`;
- não mover pedidos para o novo fluxo;
até passarem os testes de catálogo de situações, reserva e webhook.
