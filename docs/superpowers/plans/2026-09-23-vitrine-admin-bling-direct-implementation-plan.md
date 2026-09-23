# Plano de Implementação — Vitrine/Admin + Bling direto, sem Make no runtime

**Data:** 2026-09-23
**Status:** aprovado para execução
**Regra adicional:** não apagar nada no Make nesta fase.

## Princípios de execução

- Nenhuma escrita externa no Bling durante a Fase A.
- Make permanece intacto; apenas deixa de ser parte da arquitetura nova.
- Filas antigas Bling ficam isoladas antes de qualquer worker novo.
- Supabase antigo só será limpo depois de prova de não uso.
- Cada fase deve terminar com testes, advisor e rollback claro.
- O `vitrine/admin` será a superfície operacional; segredos nunca irão ao navegador.

## Fase A — Fundação e isolamento (executar primeiro)

### A1. Snapshot e classificação das filas legadas
- Inventariar `bling_commands` e `order_sync_jobs`.
- Criar marca explícita de geração/legado sem executar jobs.
- Criar uma nova fila versionada para o Hub V2.
- Criar read model de status de integração.
- Não tocar em comandos legados.

### A2. Runtime config V2
Criar `bling_integration_runtime_v2` com kill switches independentes:
- master_enabled
- reads_enabled
- product_writes_enabled
- stock_writes_enabled
- customer_writes_enabled
- order_writes_enabled
- webhook_enabled
- fiscal_enabled
- invoice_issue_enabled
- homologation_only

Padrão inicial:
- master_enabled=false
- reads_enabled=true
- demais writes=false
- homologation_only=true

### A3. Fila V2
Criar `bling_integration_jobs_v2`:
- id
- entity_type
- entity_id
- operation
- idempotency_key
- payload_version
- payload
- status
- attempt_count
- max_attempts
- not_before
- locked_by
- locked_until
- correlation_id
- provider_id
- response_summary
- last_error
- created_at
- updated_at
- completed_at

Estados:
- pending
- processing
- synced
- retry
- review_required
- failed
- cancelled

Índice único por idempotency_key.

### A4. Read model V2
Criar `bling_integration_state_v2`:
- entity_type
- entity_id
- local_version
- desired_operation
- sync_status
- bling_id
- last_attempt_at
- last_success_at
- last_error
- needs_action
- metadata

Chave composta `entity_type + entity_id`.

### A5. OAuth/health server-side
Criar Edge Function `bling-hub-v2` com ações inicialmente somente read-only:
- health
- oauth_status
- product_lookup_by_gtin
- contact_lookup_by_document
- order_lookup_by_external_key
- deposit_list
- business_unit_list
- order_status_list
- fiscal_readiness

Nenhuma ação write exposta na Fase A.

### A6. Token storage e lock
- Reutilizar secrets Bling já existentes no Vault.
- Não duplicar segredos.
- Criar lock server-side para refresh token.
- Registrar somente metadata segura do refresh, nunca token em log.
- Se o token atual não puder ser validado sem refresh, retornar estado de configuração sem alterar Bling.

### A7. Throttle global
Criar `bling_rate_limit_v2` / RPC de lease global:
- máximo conservador <= 2 req/s na primeira homologação;
- respeitar 429 / Retry-After;
- limite compartilhado por todos os domínios.

### A8. Admin — painel Bling inicial
No `vitrine/admin`, adicionar aba/área `Bling` somente leitura mostrando:
- Conexão
- OAuth
- Modo homologação
- Escritas bloqueadas
- Filas V2
- Filas legadas isoladas
- Produtos sem vínculo
- Clientes sem vínculo
- Pedidos sem vínculo
- Fiscal OFF
- Make: `Legado — não usado pelo novo runtime`

Sem botão de escrita na Fase A.

## Fase B — Produtos e estoque

### B1. Reconciliação read-only
- cruzar 1.670 produtos Vitrine com Bling por GTIN exato;
- classificar matched / missing / ambiguous;
- salvar somente IDs externos confirmados;
- nenhum produto novo criado automaticamente.

### B2. Produto update
- ao salvar produto no Vitrine, enqueue `product_update`;
- writer server-side no Hub;
- preservar campos fiscais do Bling não administrados;
- NCM/tributação tratados conforme payload atual.

### B3. Produto create
- ação explícita no admin;
- somente item sem match;
- preview antes de enviar;
- canário individual.

### B4. Estoque
- saldo absoluto do qxst é fonte operacional;
- balanço/separação/cancelamento geram `stock_set`;
- coalescer pendências por produto;
- canário por 1 produto.

## Fase C — Clientes

- usar clientes do ssbes;
- vínculo por bling_contact_id; depois CPF/CNPJ exato;
- create/update assíncrono;
- endereço e dados fiscais;
- status no admin.

## Fase D — Pedidos

- primeira separação materializa pedido para o Bling;
- exige cliente + produtos vinculados + total consistente;
- idempotency key baseada no UUID Vitrine;
- cestas desmembradas em componentes;
- diferença comercial em desconto/outras despesas;
- cancelamento e alteração controlados.

## Fase E — Webhooks

- endpoint dedicado;
- assinatura HMAC;
- inbox idempotente;
- processamento assíncrono;
- eventos de produto, estoque, pedido e fiscal;
- proteção anti-loop.

## Fase F — Fiscal

- leitura de configuração fiscal;
- readiness;
- preview;
- botão manual Emitir nota;
- homologação canário;
- depois autorização automatizável.

## Fase G — Make zero no código/runtime

**Não apagar Make na plataforma nesta fase sem solicitação futura.**

- remover dependências ativas do código;
- migrar adapters necessários;
- remover secrets/colunas Make do Supabase somente quando não usados;
- manter documentação histórica;
- deixar cenários Make existentes intocados na conta.

## Fase H — Limpeza Supabase

- inventário completo;
- classificar KEEP/MIGRATE/DEPRECATE/DELETE/ARCHIVE_DATA;
- remover apenas objetos DELETE comprovados;
- migrations sem CASCADE;
- regressão total após cada grupo;
- advisors finais.

## Critérios de conclusão da Fase A

- nenhuma escrita no Bling;
- filas antigas não podem ser executadas pelo Hub V2;
- fila/read model V2 criados;
- runtime V2 com writes OFF;
- Edge Hub V2 read-only;
- painel Bling no admin;
- testes/CI;
- advisors sem alerta novo crítico;
- documentação de rollback.
