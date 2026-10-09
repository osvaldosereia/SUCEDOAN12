# R11 — Segurança da custódia física e saída de rotas (09/10/2026)

**Projeto:** Dona Antônia · [plano #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · **base:** [R02–R10 integrada #1016](https://github.com/osvaldosereia/SUCEDOAN12/pull/1016) · **branch:** `agent/orders-r11-route-custody-fiscal-guard-20261009`.

## Defeito observado na auditoria da produção (somente SELECT)

A autorização fiscal do fluxo novo é aplicada ao `orders.status` pela proposta R10, e a função `ops4_start_dispatch_v1` do runtime legado verifica `order_fiscal_controls` e o controle de baixa de estoque. Porém a logística atual também grava estados independentes em:

- `ops_delivery_stops.loaded_at` e `custody_confirmed_at` pela RPC real `smart_delivery_confirm_loading_v1`;
- `ops_delivery_stops.status` pela RPC real `ops_sync_delivery_stop_v1`;
- `ops_delivery_runs.status='dispatched'` pelo planejador/gestão de rotas.

O gatilho R10 somente em `orders` **não basta para bloquear mudanças diretas nessas tabelas**. Isso permite uma rota parecer carregada/despachada mesmo quando seu pedido ainda não possui NF-e autorizada. O CI R11 demonstra esse caminho antes do patch, em transação revertida.

## Solução proposta (SQL DRAFT; não aplicar direto)

`supabase/sql/orders-r11-delivery-custody-fiscal-guard-review-v1.sql`:

1. `ops2_r11_has_dispatch_proof_v1(uuid)`: para os pedidos cadastrados na R07 exige `R07.status=verified`, autorização R10 coerente com o mesmo `bling_order_id`, `bling_invoice_id`, chave de acesso, `cStat 100/150`, `dispatch_fiscal_jobs.status=authorized` e `order_fiscal_controls.status=authorized`. Para pedidos **sem** inscrição na R07, preserva a política fiscal legada existente.
2. Gatilho antes de `INSERT/UPDATE` em `ops_delivery_stops`: impede mudar status para `out_for_delivery/delivered`, confirmar carregamento ou custódia, se faltar prova.
3. Gatilho antes de `UPDATE status='dispatched'` em `ops_delivery_runs`: bloqueia qualquer rota contendo paradas **não canceladas/não fracassadas** de pedidos R07 sem autorização fiscal. Permite planejar/atribuir o veículo e o motorista antecipadamente; só a saída física é bloqueada.
4. A correção não cria um segundo serviço fiscal e não altera o fluxo de pagamento, estoque ou envio WhatsApp. Executa sempre após os contratos R07/R09/R10, com permissões reduzidas para as funções internas.

## Provas em laboratório

- `scripts/sql/orders-r11-fiscal-delivery-fixture.sql`: cria três rotas fictícias no **mesmo PostgreSQL 17** do checkout real R02 e dos recibos sintéticos R03–R10: cesta com comprovante R10 fictício, molde `R07 uncertain` e rota mista.
- `scripts/sql/orders-r11-real-logistics-rpcs.sql`: definições canônicas `smart_delivery_confirm_loading_v1` e `ops_sync_delivery_stop_v1`, obtidas por `pg_get_functiondef` exclusivamente leitura.
- `scripts/sql/orders-r11-delivery-unguarded-baseline.sql`: comprova que o molde sem NF-e pode ser marcado como carregado/despachado pelas tabelas da logística antigas (o teste faz `ROLLBACK`).
- `scripts/sql/orders-r11-delivery-custody-assertions.sql`: com o gatilho R11, prova que o carregamento via RPC, a atribuição de custódia, o sync de status, o INSERT de parada já liberada e o despacho da rota mista são bloqueados. A rota cuja cesta tem comprovante R10 sintético carrega e despacha; retirando a parada sem nota, o restante pode seguir. Replay do carregamento autorizado é idempotente e não duplica prova fiscal.
- `.github/workflows/orders-r2-r7-bling-chain-ci.yml`: regressão conjunta do **checkout real → número semanal → botão Meta sintético → separação R06 → Bling R07 simulado → R08 bloqueado → observador R09 → autorização SEFAZ R10 fictícia → carga/rotas R11**. Não faz HTTP Meta/Bling/SEFAZ.

## Limitações fundamentais e critérios de publicação

- O comprovante R10 do laboratório é **fictício**. A R11 não libera SEFAZ real nem executa rota externa. Nenhuma carga real foi iniciada.
- O SQL R11 é um **draft separado**, não foi aplicado via migration. Revisar triggers, RLS, permissões service-role, concorrência com Smart Delivery, driver/mobile, roteirização e alterações diretas por APIs antes de produção.
- O R10 em produção não está implantado e a geração automática de NF-e continua bloqueada até validação fiscal de saída (CFOP, CSOSN/CST, NCM/CEST, regras MT e IBS/CBS aplicáveis).
- Validar com o contador, Bling e ambiente fiscal homologado antes de converter a rota em ação real. Reproduzir a sequência em staging canônico com cenário de dois motoristas, devoluções e pagamentos na entrega.
- Continuar R12–R14 com Admin, relatórios de pendências, rotas/pagamento, segurança e implantação canário com rollback.

**Nenhum merge em main, migration Supabase, deploy de Edge, agendamento novo, pedido, estoque, NF-e, SEFAZ, WhatsApp ou rota real foi modificado.**
