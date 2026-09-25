-- Pause business/event automation while the Supabase architecture is reviewed.
-- Keep integrity, audit and guard triggers enabled.

alter table public.ai_jobs disable trigger ai_job_event_dispatch_v3;
alter table public.outbound_jobs disable trigger outbound_jobs_whatsapp_event_dispatch;
alter table public.orders disable trigger trg_queue_order_for_bling;
alter table public.orders disable trigger trg_queue_order_outbound_job;

comment on trigger ai_job_event_dispatch_v3 on public.ai_jobs is
  'PAUSED 2026-09-21: automatic worker dispatch suspended pending architecture review.';
comment on trigger outbound_jobs_whatsapp_event_dispatch on public.outbound_jobs is
  'PAUSED 2026-09-21: automatic WhatsApp dispatch suspended pending architecture review.';
comment on trigger trg_queue_order_for_bling on public.orders is
  'PAUSED 2026-09-21: automatic Bling queueing suspended pending architecture review.';
comment on trigger trg_queue_order_outbound_job on public.orders is
  'PAUSED 2026-09-21: automatic order outbound queueing suspended pending architecture review.';
