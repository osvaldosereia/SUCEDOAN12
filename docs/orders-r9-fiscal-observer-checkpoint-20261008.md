# R09 — Observador fiscal com fila segura e consulta read-only ao Bling

Data: 08/10/2026 · Dona Antônia · [Plano #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · [PR draft #981](https://github.com/osvaldosereia/SUCEDOAN12/pull/981)

## Decisão arquitetural

**Não criar um segundo emissor de NF-e.** `dispatch_fiscal_jobs` já existe na produção e possui unicidade `(order_id, fiscal_version)`, `max_attempts=1` e gatilho que exige ID NF-e e chave de 44 dígitos antes de marcar `authorized`. Também existe `fiscal_issue_jobs` legado: não usar as duas filas simultaneamente.

O problema de produção não é só enfileirar: depois de uma interrupção de rede, não sabemos se o Bling aceitou uma criação de documento. **Nova tentativa automática de POST sem consulta pode emitir nota duplicada.**

A R09 acrescenta uma **fila separada exclusivamente de observação** e um worker que nunca emite ou autoriza. O resultado é um comprovante de GET por pedido para R08/R10.

## Auditoria do código anterior

- `blingHubVitrineDispatchFiscalPreview` consulta Bling, mas chama `check_order_dispatch_fiscal_gate_v1`, que pode inserir `order_fiscal_controls`. **Não é efetivamente read-only.**
- `blingHubVitrineDispatchFiscalReconcile` identifica NF-e por `numeroLoja`, mas também atualiza `dispatch_fiscal_jobs`, `order_fiscal_controls` e o canário fiscal. **Não deve ser utilizado como observador sem escrita.**
- A função de autorização `mark_order_dispatch_fiscal_authorized_v1` grava estado autorizado; R09 **não a chama**.
- O processo anterior para obter token Bling pode atualizar credenciais OAuth internas; o novo observador evita **gravações comerciais/fiscais externas** (`POST/PUT /nfe`, `POST/PUT /pedidos/vendas`), mas não promete zero mutações de infraestrutura OAuth.

## Código entregue em branch isolada

1. `supabase/sql/orders-r9-fiscal-observation-contract-v1.sql` (**draft, não migration**): tabela privada `order_fiscal_r9_observations_v1` e RPCs service-only para enfileirar, descobrir em lote, reivindicar com `FOR UPDATE SKIP LOCKED` e finalizar com comprovante. Só entra após conclusão física + R06 congelada + R07 `verified` + link Bling exato `VITRINE-{UUID}`. Um registro por pedido. Limite de seis GETs, lease de dois minutos, próxima checagem após trinta minutos em caso de incerteza; eventual lease vencido permite **outra leitura**, nunca repetir POST de nota. `status=observed_no_invoice`, `invoice_found`, `uncertain` ou `review_required`.
2. `supabase/functions/_shared/order-fiscal-r9-observer-v1.mjs`: valida projeção da venda remota: UUID original, número externo imutável, Bling ID, total, linhas separados por produto/quantidade/preço e falta excluída. Classifica zero, uma ou múltiplas notas; **não considera `invoice_found` equivalente a SEFAZ autorizada**.
3. `admin-service-intelligence-v1`: ação interna `fiscal_r9_observe_readonly`. Consulta o pedido `GET /pedidos/vendas/{id}`, pesquisa a NF-e por `numeroLoja` e, se houver exatamente uma, lê `GET /nfe/{id}`. Não executa as funções antigas com gravação de estado fiscal. Dados inconsistentes tornam-se `conflict`; timeout torna-se `uncertain`. Sem dados pessoais em logs do observador.
4. `supabase/functions/orders-r9-fiscal-observer-v1/index.ts`: serviço autenticado por chave interna `R9_FISCAL_OBSERVER_RUN_KEY`, desligado por padrão via `R9_FISCAL_OBSERVER_ENABLED=false`. Faz `seed -> claim -> GET -> finish` em lote pequeno; nenhum cron/monitoramento foi criado ou ativado nesta rodada.
5. `admin-products-live-v1`: o preflight R08, quando habilitado, consulta `order_fiscal_r9_observations_v1`. Aceita somente o registro `observed_no_invoice` como evidência potencial de Bling; o próprio R08 continua verificando ID, hash e **frescor máximo de cinco minutos**. Observação vencida, nota existente, venda divergente ou erro bloqueiam; CFOP/CST/CSOSN e regras fiscais ainda devem ser aprovados.

## Testes

- Workflow [`orders-r9-fiscal-observer-ci.yml`](https://github.com/osvaldosereia/SUCEDOAN12/blob/agent/orders-r9-fiscal-observer-20261008/.github/workflows/orders-r9-fiscal-observer-ci.yml), PostgreSQL 17 efêmero, Node 22, dados sintéticos.
- Reaproveita funções de separação reais extraídas na R02 e os manifestos R06 e intents R07. Testa permissões `anon/authenticated`, fila por `order_id`, dedupe, dois workers simultâneos, lease vencido e token antigo, timeout, evidência falsa, classificações de 0/1/múltiplas notas.
- Executa regressões R07/R08, incluindo a nova conexão entre evidência R09 e pré-validação.
- Mesmo com CI verde, **não prova que a Meta, Bling ou SEFAZ reais funcionem**; nenhuma chamada externa é feita no CI.

## Bloqueios para produção

- R02 clone canônico; merges em ordem R03–R08; validação de todas as Edge Functions; templates Meta aprovados; regras tributárias de saída e IBS/CBS vigentes.
- Criar migrations pelo CLI e ensaiar rollback; revisar permissões `service_role`, RLS, configuração de segredos, sem expô-los ao navegador.
- Exigir apenas HTTP GET externo e reconciliação de todos os vínculos existentes antes de liberar qualquer emissão em R10. Não interpretar texto “Autorizada” como comprovação SEFAZ sem chave de 44 dígitos, código e retorno válidos.
- Revisar intervalos/frescor: observações `observed_no_invoice` são terminais por segurança e expiram para o preflight após cinco minutos. R10 deverá oferecer rearmamento controlado **só para nova leitura** antes da emissão.
- **Sem deploy, migração, cron, Bling real, NF-e, alteração de estoque, pagamentos, entrega ou mensagens a clientes.**

## Próxima rodada

**R10**: processador fiscal exatamente uma vez sobre a fila `dispatch_fiscal_jobs`, verificar o resultado pela SEFAZ e tratar `ambiguous/authorized/rejected` com prova; nunca liberar expedição antes da autorização e nunca repetir POST após timeout sem GET e validação.
