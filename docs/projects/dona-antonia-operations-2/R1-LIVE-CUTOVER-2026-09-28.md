# Operations 2.0 — R1 Live Cutover

Data: 2026-09-28

## Resultado

R1 executada em produção com política **future_only**.

Marco de corte:
- UTC: `2026-09-28T14:44:46.627499Z`
- Cuiabá: `2026-09-28 11:44:46 -03:00`

Tudo criado antes deste marco fica fora do novo fluxo automático.

## Runtime ativo

Supabase canônico: `ssbesxgaijknwsjbsbcz`.

`bling_hub_runtime_v2`:
- mode = `live`
- hub_enabled = `true`
- products_enabled = `true`
- stock_enabled = `true`
- customers_enabled = `true`
- orders_enabled = `true`
- webhooks_enabled = `true`
- fiscal_enabled = `false`
- ops2_stock_authority = `bling`
- ops2_direct_order_state_enabled = `true`
- ops2_ean_verified_sync_enabled = `true`

Cron:
- `bling-hub-v2-cycle`
- `*/2 * * * *`
- ativo

Edge Functions:
- `admin-products-live-v1` v50 ACTIVE
- `admin-service-intelligence-v1` v196 ACTIVE
- `storefront-v2` permanece ativo

## Pedido novo

Novo desenho produtivo:
1. checkout cria pedido canônico local como `storefront_received`;
2. pedido ainda não é enviado ao Bling antes da confirmação;
3. ao confirmar:
   - valida estoque vendável;
   - cria reserva local de concorrência;
   - garante cliente/produtos vinculados;
   - cria/atualiza pedido no Bling imediatamente;
   - coloca o pedido em `Aprovado / Separar`;
   - a reserva virtual passa a existir no Bling;
4. falha transitória de sincronização:
   - `sync_status=review_bling`;
   - abre `ops_attention`;
   - enfileira `sync_order` para retry automático no ciclo de 2 minutos;
   - worker, ao recuperar, atualiza `bling_order_id`, `bling_synced_at` e resolve a atenção;
5. separação não reduz `products.stock` quando a autoridade é Bling;
6. conferência EAN usa o fluxo `Verificado`;
7. saída física permanece no gate de expedição já homologado.

## Corte de histórico

Proteções executadas:
- 2.723 webhooks antigos em `held/received/retry` foram marcados `ignored` no corte;
- o worker R1 processa em tempo real apenas:
  - `order`
  - `stock`
  - `virtual_stock`
- produto e NF-e permanecem fora deste consumidor R1;
- teste deliberado com pedido pré-corte retornou:
  - HTTP 409
  - `pre_cutover_order_ignored`
  - `external_write=false`

Logo, a R1 não tenta corrigir, reenviar ou alterar pedidos antigos.

## Estoque

Fonte oficial:
- Bling = autoridade operacional de estoque;
- storefront/Admin leem `ops2_sellable_stock_v1.effective_sellable_stock`;
- no modo Bling, o valor vem do saldo virtual do depósito selecionado.

Reserva local:
- continua existindo para proteger concorrência entre confirmação local e materialização da reserva no Bling;
- não altera estoque físico;
- pedidos já sincronizados com Bling não são descontados uma segunda vez da disponibilidade local;
- horizonte de reserva ampliado para 48 horas.

Refresh inicial do corte:
- vínculos de produto analisados: 1.668;
- produtos ativos: 1.610;
- ativos prontos para Bling: 1.610/1.610;
- ativos com leitura fresca após refresh: 1.610/1.610;
- ativos sem leitura pronta: 0;
- ativos com espelho >24h: 0;
- refresh concluído em 2026-09-28;
- foram encontradas diferenças reais entre o antigo `products.stock` e o saldo virtual do Bling, justificando o cutover.

Smoke test storefront:
- produto de teste retornou HTTP 200;
- saldo exibido pelo storefront = 101;
- saldo virtual recém-lido no Bling = 101.

## Pedido real pós-corte — validação read-only

Foi detectado um pedido real criado após o corte, ainda aguardando confirmação.

Nenhuma escrita foi feita no Bling para esse pedido.

Preview de confirmação:
- `ready=true`
- `write_eligible=true`
- blockers = 0
- unresolved_products = 0
- itens resolvidos = 30
- cliente vinculado ao Bling = true
- total produtos = R$ 171,28
- outras despesas = R$ 3,91
- total comercial = R$ 175,19
- balances = true
- situação inicial prevista = `Aprovado / Separar`

Isso valida o payload real sem antecipar a confirmação humana.

## Webhooks e worker

Gates existentes antes do corte e revalidados:
- order rollout = `canary_passed`
- webhook gate = `real_delivery_verified`
- stock writer guard = `verified`
- physical stock gate = `verified`
- stock mirror event mode = `verified`

Worker manual após deploy final:
- HTTP 200
- 0 jobs pendentes
- 0 retries
- 0 falhas

Cron de 2 minutos:
- execuções observadas como `succeeded`.

Logs desde o corte:
- único 4xx/5xx nos serviços R1 = HTTP 409 do teste deliberado de pedido antigo;
- nenhum outro erro HTTP observado em:
  - `admin-products-live-v1`
  - `admin-service-intelligence-v1`
  - `storefront-v2`

## Advisors

Sem bloqueador novo introduzido pela R1.

Avisos preexistentes ainda abertos:
- tabelas server-only com RLS habilitado e sem policies;
- leaked password protection desativada;
- FK de `ops2_bling_orphan_product_reviews` sem índice;
- índices não utilizados.

Tratar em hardening separado; não altera o estado funcional da R1.

## Arquivos / commits principais da R1

- `0acd5d81` — early Bling order sync + leituras de estoque live
- `57e53d95` — correção sintática do bloco de separação
- `afb8921a` — gate de corte temporal para escrita de pedido
- `3c6811e8` — reservation model com autoridade Bling
- `eb236d91` — horizonte de reserva 48h
- `a48dd4dc` — webhook R1 limitado a order/stock/virtual_stock
- `90c8077a` — stock readiness pelo saldo vendável Bling
- `d074a69a` — refresh read-only de estoque permitido em live
- `77362ef2` — retry automático de pedido confirmado
- `42264ecf` — worker persiste recuperação no pedido canônico
- `7f25a3e7` — fechamento correto do refresh de estoque

SQL versionado:
- `supabase/sql/20260928_ops2_r1_live_stock_reservations.sql`
- `supabase/sql/20260928_ops2_r1_reservation_horizon.sql`

## Estado da R1

**CONCLUÍDA / LIVE.**

A próxima rodada não deve reabrir histórico pré-corte. Deve partir dos pedidos criados após `ops2_live_cutover_at` e observar o primeiro pedido confirmado real atravessar:
`confirmado -> Bling Aprovado/Separar -> EAN Verificado -> expedição/baixa física`.
