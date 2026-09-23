# Supabase Cleanup Inventory — Vitrine/Admin + Bling Hub V2

Atualizado em 2026-09-23.

## Regra

Nenhum objeto é removido apenas porque parece antigo ou porque o Advisor mostra baixo uso.

Classificação:
- **KEEP**: usado pelo runtime atual.
- **MIGRATE**: ainda usado, mas deve ser substituído.
- **DEPRECATE**: sem uso desejado, porém ainda possui dependência técnica/histórica.
- **DELETE**: pode ser removido somente após zero dependências, zero dados necessários e migration com RESTRICT.
- **ARCHIVE_DATA**: estrutura pode sair futuramente, mas dados têm valor histórico.

## KEEP — Hub V2 atual

- bling_hub_runtime_v2
- bling_hub_jobs_v2
- bling_hub_entity_links_v2
- bling_hub_audit_v2
- bling_hub_canary_allowlist_v2
- bling_hub_rate_limit_v2
- bling_webhook_inbox_v2
- fiscal_runtime_config
- order_fiscal_controls
- fiscal_issue_jobs
- get_bling_api_credentials_v1
- set_bling_api_refresh_token_v1
- bling_hub_readiness_v2
- enqueue_bling_hub_job_v2
- claim_bling_hub_jobs_v2
- finish_bling_hub_job_v2
- dispatch_bling_hub_cycle_v2
- claim_bling_hub_oauth_lock_v2
- release_bling_hub_oauth_lock_v2
- reserve_bling_hub_rate_slot_v2
- set_bling_hub_order_rollout_v2
- claim_bling_webhook_inbox_v2
- finish_bling_webhook_inbox_v2

## KEEP — histórico canônico Bling

Esses objetos ainda armazenam ou processam histórico importado do Bling e não devem ser apagados agora:

- bling_history_customer_backfill_queue
- bling_history_import_runs
- bling_history_import_runtime
- bling_history_reconciliation_issues
- bling_history_staging_items
- bling_history_staging_orders
- bling_history_status_policy
- funções begin/finish/stage/reconcile/promote do histórico Bling

Há dados reais nessas tabelas; qualquer limpeza futura exige política de retenção.

## DEPRECATE — filas Bling V1 congeladas

- bling_commands — 386 linhas aproximadas
- order_sync_jobs — 25 linhas aproximadas
- claim_bling_commands
- claim_bling_commands_by_types
- finish_bling_command
- claim_order_sync_jobs
- finish_order_sync_job
- build_bling_order_draft
- queue_order_for_bling
- queue_bling_order_backoffice_v1
- queue_bling_order_homologation_v1
- scripts/workflows writer V1

Motivo:
- não fazem parte do novo runtime;
- ainda existem referências técnicas e dados pendentes;
- legacy_queues_frozen=true;
- devem permanecer congelados até o primeiro pedido V2 real passar e a migração ser reconciliada.

## DEPRECATE — estruturas vazias ainda dependentes

### bling_order_homologation_allowlist
- 0 linhas.
- Ainda referenciada por claim_order_sync_jobs e queue_bling_order_homologation_v1.
- Não apagar ainda.

### bling_product_binding_events
- 0 linhas.
- Ainda referenciada por bind_bling_product_id_v1.
- Não apagar ainda.

## MAKE — PRESERVAR, NÃO USAR NO RUNTIME NOVO

Não apagar nesta fase, por decisão do usuário.

Artefatos encontrados:
- whatsapp-ingest-make-v1
- system_secrets.make_whatsapp_ingest
- Vault dona_antonia_whatsapp_outbound_make_webhook
- whatsapp_accounts.make_connection_id
- automation_usage.make_operations
- limites/configs Make em automation_config
- arquivos legados com hook.*.make.com
- blueprints e cenários documentados

Verificação do runtime novo:
- vitrine/index.html: sem URL Make
- vitrine/admin/index.html: sem URL Make
- vitrine-admin-v1: sem URL Make
- simple-storefront-v1: sem URL Make
- admin-service-intelligence-v1: sem URL Make

Portanto, Vitrine/Admin ↔ Bling V2 opera sem Make.

## DELETE já concluído com segurança

A fundação duplicada bling_integration_* criada durante consolidação foi removida porque:
- tinha 0 jobs;
- tinha 0 estados operacionais;
- não era a fundação canônica;
- foi removida usando RESTRICT;
- bling_hub_* V2 existente foi preservado.

## Próxima janela de limpeza

Somente depois de:
1. primeiro pedido V2 real sincronizado com sucesso;
2. observação do fluxo de estoque;
3. nenhum uso das filas V1 por uma janela definida;
4. reconciliação dos 330/386 comandos e 25 jobs legados;
5. webhooks/fiscal estabilizados;
6. busca GitHub + pg_depend + cron + Edge Function sem referência.

Então:
- migrar dados históricos necessários;
- remover funções V1;
- remover tabelas V1 com RESTRICT;
- remover secrets/colunas Make apenas numa rodada separada e somente quando o usuário autorizar apagar esses artefatos do Supabase.
