# Supabase — Estado de pausa das automações

Checkpoint: 2026-09-21
Projeto: `ssbesxgaijknwsjbsbcz`

## Regra operacional

Enquanto a migração Supabase-only estiver em R1–R4, nenhuma automação autônoma deve ser religada para teste.

Operações manuais do Admin continuam permitidas. Gatilhos de integridade, auditoria, constraints e updated_at permanecem ativos.

## Estado verificado em produção

- `cron.job active=true`: 0
- `ai_jobs` em pending/queued/processing: 0
- `outbound_jobs` em pending/processing: 0
- `automation_workflows` habilitados/execution_mode diferente de off/kill switch desligado: 0
- `product_image_automation_settings.is_enabled=true`: 0
- `automation_config.automation_enabled`: false
- `automation_config.ai_enabled`: false
- `automation_config.outbound_enabled`: false
- WhatsApp inbound/auto reply/release: off
- Bling order sync automático: off
- Agent Core: off
- Service Simple IA: off

## Gatilhos de despacho explicitamente desabilitados

- `public.ai_jobs.ai_job_event_dispatch_v3`
- `public.outbound_jobs.outbound_jobs_whatsapp_event_dispatch`
- `public.orders.trg_queue_order_for_bling`
- `public.orders.trg_queue_order_outbound_job`

## Histórico preservado

Os jobs pg_cron não foram apagados; apenas desativados.

Um outbound job antigo preso em `processing` foi marcado como `cancelled` com motivo de pausa. Nenhum histórico foi apagado.

## Migrations de pausa aplicadas

- `pause_all_pg_cron_jobs_v1`
- `pause_business_dispatch_triggers_v1`
- `pause_all_autonomous_runtime_v1`

## Regra para reativação futura

Cada automação deverá ser reavaliada individualmente por:
1. necessidade real;
2. custo;
3. frequência adequada;
4. duplicação com outro fluxo;
5. segurança e idempotência;
6. observabilidade;
7. autorização explícita para retorno.

Não reativar tudo em bloco.
