-- R12 follow-up: include template/recipient in idempotency and enforce the daily budget.

create index whatsapp_utility_messages_account_created
  on da_next.whatsapp_utility_messages (provider_account, created_at);

create or replace function da_next.enqueue_whatsapp_utility_for_order(
  p_order_id uuid,
  p_event_type text,
  p_order_version integer
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  v_setting da_next.whatsapp_utility_settings;
  v_template da_next.whatsapp_utility_templates;
  v_order da_next.orders;
  v_message_id uuid;
  v_key text;
  v_daily_count integer;
begin
  select * into v_setting
  from da_next.whatsapp_utility_settings
  where enabled and daily_budget > 0
  order by is_default desc, provider_account
  limit 1;
  if not found then return; end if;

  select count(*)::integer into v_daily_count
  from da_next.whatsapp_utility_messages
  where provider_account = v_setting.provider_account
    and created_at >= date_trunc('day', now());
  if v_daily_count >= v_setting.daily_budget then return; end if;

  select * into v_template
  from da_next.whatsapp_utility_templates
  where provider_account = v_setting.provider_account
    and event_type = p_event_type
    and active
    and approval_status = 'APROVADO';
  if not found then return; end if;

  select * into v_order from da_next.orders where id = p_order_id;
  if not found then return; end if;
  v_key := 'whatsapp-utility:' || p_order_id || ':' || p_event_type || ':'
    || v_template.revision || ':' || v_order.customer_phone_snapshot || ':'
    || v_setting.provider_account;

  insert into da_next.whatsapp_utility_messages (
    order_id, template_id, provider_account, event_type, phone_snapshot,
    delivery_status, attempts, max_attempts, next_attempt_at, idempotency_key
  ) values (
    v_order.id, v_template.id, v_setting.provider_account, p_event_type,
    v_order.customer_phone_snapshot, 'NA_FILA', 0, 3, now(), v_key
  ) on conflict (idempotency_key) do nothing
  returning id into v_message_id;

  if v_message_id is null then return; end if;
  insert into da_next.integration_outbox (
    aggregate_type, aggregate_id, aggregate_version, event_type, idempotency_key, payload
  ) values (
    'ORDER', v_order.id, p_order_version, 'WhatsAppUtilityQueued', v_key,
    jsonb_build_object(
      'messageId', v_message_id,
      'providerAccount', v_setting.provider_account,
      'templateName', v_template.template_name,
      'eventType', p_event_type,
      'templateRevision', v_template.revision,
      'recipient', v_order.customer_phone_snapshot
    )
  ) on conflict (idempotency_key) do nothing;
end;
$function$;
