-- Dona Antônia — observabilidade da confirmação WhatsApp do checkout
-- 2026-10-01

create or replace view public.ops2_order_whatsapp_confirmation_v1
with (security_invoker=true)
as
select
  q.order_id,
  q.message_kind,
  q.status,
  q.delivery_mode,
  q.channel_origin,
  q.channel_phone_e164,
  q.attempt_count,
  q.external_message_id,
  q.last_error,
  q.created_at,
  q.sent_at,
  q.updated_at
from public.ops2_whatsapp_outbox_v1 q;

revoke all on public.ops2_order_whatsapp_confirmation_v1 from public,anon,authenticated;
grant select on public.ops2_order_whatsapp_confirmation_v1 to service_role;
