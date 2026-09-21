# Supabase Only — Execution Log

## 2026-09-21 — Rodada 1

- criada branch `supabase-only-admin-migration-20260921`;
- auditados Supabase, Storage, pg_cron, advisors, tabelas, funções e dependências Firebase;
- aplicado backfill seguro de localização/fonte de imagem já existente no Supabase;
- 9/9 pg_cron pausados por `cron.alter_job(..., active => false)`;
- gatilhos `ai_job_event_dispatch_v3`, `outbound_jobs_whatsapp_event_dispatch`, `trg_queue_order_for_bling` e `trg_queue_order_outbound_job` desabilitados;
- `automation_config` global colocado em OFF;
- atendimento automático simples, Agent Core e automação de imagens colocados em OFF;
- gatilhos de integridade/auditoria mantidos ativos;
- Balanço rápido e inventory-fast sem fallback Firebase na branch;
- workers de imagem Grid18 e individual convertidos para fontes Supabase/cache histórico, sem autoridade live Firebase;
- criada API `admin-products-live-v1` consolidada/autenticada para catálogo, lookup, taxonomia, criação e edição;
- criado cliente seguro `admin/admin-secure-api-v1.js`;
- Validades convertida para Supabase autenticado;
- documentação e CI anti-regressão iniciados;
- próximas execuções: R2, R3 e R4 agendadas de hora em hora.
