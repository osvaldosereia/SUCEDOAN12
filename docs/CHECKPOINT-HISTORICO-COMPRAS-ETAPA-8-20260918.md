# Checkpoint — Histórico de Compras — Etapa 8

Data: 18/09/2026  
Status: **CONCLUÍDA V1**

## O que foi implementado

A importação histórica do Bling foi refeita com arquitetura Supabase First.

Componentes principais:

- staging de pedidos e itens;
- reconciliação de clientes;
- reconciliação de produtos;
- política explícita de status do Bling;
- idempotência por `bling_order_id`;
- fila de inconsistências;
- promoção controlada para `orders + order_items`;
- credenciais server-side no Supabase Vault;
- Edge Function `bling-history-import-v1`;
- Edge Function de descoberta de situações;
- trava contra execuções concorrentes;
- lotes pequenos e rate limit compatível com a API;
- promoção desligada por padrão.

## Credenciais

As credenciais antigas foram transferidas para o Supabase Vault com bootstrap único.

O workflow temporário usado apenas para a migração das credenciais foi removido após concluir a operação.

O health check do importador confirmou:

- client id: disponível;
- client secret: disponível;
- refresh token: disponível;
- origem: Vault;
- Make: não utilizado.

## Situações do Bling

Política atual validada:

- situação 6 — **Em aberto** → `ignored`;
- situação 9 — compra concluída/atendida → `delivered`.

Pedidos `Em aberto` permanecem apenas no staging e não contaminam o histórico de compras concluídas.

As rotas de consulta de situações do Bling retornaram 403 por escopo da aplicação. Isso não impediu a importação de pedidos; o mapeamento usado foi preservado explicitamente na tabela de política.

## Resultado útil importado

Foram promovidos **27 pedidos concluídos** do Bling para a fonte canônica:

- 27 pedidos;
- 21 clientes distintos;
- 484 itens históricos;
- 441 itens vinculados ao produto atual;
- 43 itens preservados somente como snapshot histórico;
- 0 pedidos sem cliente;
- 0 `bling_order_id` duplicado;
- 0 divergências nos resumos dos clientes.

Os itens antigos sem produto atual continuam aparecendo no histórico pelo snapshot, mas não entram no ranking de produto recorrente até existir vínculo seguro.

## Cobertura por cliente

Após a importação:

- 505 clientes na base;
- 31 clientes com histórico de compra;
- 6 clientes com duas ou mais compras;
- resumos de compra divergentes: **0**.

## Histórico antigo sem cliente atribuível

A importação encontrou grande volume de vendas antigas feitas em cliente genérico.

Esses pedidos foram preservados no staging, mas não foram ligados artificialmente a clientes:

- 2025: 55 compras concluídas com cliente genérico;
- amostras/importações de 2024 também mostraram padrão de cliente genérico;
- pedidos genéricos ficam `ignored`.

Decisão: não usar aproximação por nome para tentar adivinhar o comprador.

## Pedidos Em aberto

Foram lidos pedidos recentes com situação 6 / Em aberto e cliente conhecido.

Eles ficam no staging e **não contam como compra concluída**. Essa regra evita transformar pedidos pendentes em histórico comercial efetivo.

## Segurança final da etapa

Ao encerrar a rodada:

- `enabled=false`;
- `fetch_enabled=false`;
- `promotion_enabled=false`.

O importador fica parado por padrão e só deve ser reativado para novas janelas controladas.

## Próximo passo

**Etapa 9 — Segmentação comercial derivada**

Criar segmentos objetivos a partir do histórico já consolidado, inicialmente apenas para Admin e personalização do Comprar.
