CREATE OR REPLACE FUNCTION public.site_order_whatsapp_notice_status_v1(p_order_ids uuid[])
RETURNS TABLE (
  order_id uuid,
  stage text,
  status text,
  error_code text,
  channel_origin text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  WITH requested_orders AS (
    SELECT DISTINCT request.order_id
    FROM unnest(coalesce(p_order_ids, '{}'::uuid[])) AS request(order_id)
    JOIN public.orders AS storefront_order ON storefront_order.id = request.order_id
    WHERE storefront_order.source IN ('vitrine', 'storefront_v2')
    LIMIT 200
  ),
  notice_rows AS (
    SELECT
      outbox.order_id,
      'received'::text AS stage,
      outbox.status AS local_status,
      outbox.last_error AS local_error,
      outbox.whatsapp_account_id,
      outbox.external_message_id,
      outbox.channel_origin,
      outbox.created_at
    FROM public.ops2_whatsapp_outbox_v1 AS outbox
    JOIN requested_orders AS requested ON requested.order_id = outbox.order_id
    WHERE outbox.recipient_kind = 'customer'
      AND outbox.message_kind = 'order_received'

    UNION ALL

    SELECT
      notification.order_id,
      'separation'::text AS stage,
      notification.status AS local_status,
      notification.last_error AS local_error,
      notification.whatsapp_account_id,
      notification.provider_message_id AS external_message_id,
      notification.channel_origin,
      notification.created_at
    FROM public.order_separation_customer_notifications_v1 AS notification
    JOIN requested_orders AS requested ON requested.order_id = notification.order_id

    UNION ALL

    SELECT
      completion.order_id,
      'separation'::text AS stage,
      coalesce(nullif(completion.metadata #>> '{customer_notification,status}', ''), 'unrecorded') AS local_status,
      completion.metadata #>> '{customer_notification,error}' AS local_error,
      storefront_order.whatsapp_account_id,
      NULL::text AS external_message_id,
      right(regexp_replace(coalesce(account.phone_e164, ''), '[^0-9]', '', 'g'), 4) AS channel_origin,
      completion.completed_at AS created_at
    FROM public.order_separation_completions_v1 AS completion
    JOIN requested_orders AS requested ON requested.order_id = completion.order_id
    JOIN public.orders AS storefront_order ON storefront_order.id = completion.order_id
    LEFT JOIN public.whatsapp_accounts AS account ON account.id = storefront_order.whatsapp_account_id
    WHERE completion.completed_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.order_separation_customer_notifications_v1 AS notification
        WHERE notification.order_id = completion.order_id
      )

    UNION ALL

    SELECT
      storefront_order.id AS order_id,
      'received'::text AS stage,
      'unrecorded'::text AS local_status,
      NULL::text AS local_error,
      storefront_order.whatsapp_account_id,
      NULL::text AS external_message_id,
      right(regexp_replace(coalesce(account.phone_e164, ''), '[^0-9]', '', 'g'), 4) AS channel_origin,
      storefront_order.created_at
    FROM public.orders AS storefront_order
    JOIN requested_orders AS requested ON requested.order_id = storefront_order.id
    LEFT JOIN public.whatsapp_accounts AS account ON account.id = storefront_order.whatsapp_account_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.ops2_whatsapp_outbox_v1 AS outbox
      WHERE outbox.order_id = storefront_order.id
        AND outbox.recipient_kind = 'customer'
        AND outbox.message_kind = 'order_received'
    )
  )
  SELECT
    notice.order_id,
    notice.stage,
    CASE
      WHEN message.status_current = 'read' OR provider_status.status = 'read' THEN 'read'
      WHEN message.status_current = 'delivered' OR provider_status.status = 'delivered' THEN 'delivered'
      WHEN message.status_current = 'failed' OR provider_status.status = 'failed' THEN 'failed'
      WHEN message.status_current = 'cancelled' OR provider_status.status = 'cancelled' THEN 'failed'
      WHEN message.status_current = 'accepted' OR provider_status.status = 'accepted' THEN 'awaiting_delivery'
      WHEN message.status_current = 'sent' OR provider_status.status = 'sent' THEN 'awaiting_delivery'
      WHEN notice.local_status IN ('sending', 'failed', 'retry', 'pending', 'suppressed', 'uncertain', 'unrecorded') THEN notice.local_status
      ELSE coalesce(notice.local_status, 'unrecorded')
    END::text AS status,
    CASE
      WHEN (message.status_current = 'failed' OR provider_status.status = 'failed')
        AND provider_status.error_code ~ '^[0-9]{1,10}$' THEN provider_status.error_code
      WHEN notice.local_error ~ '^meta_[a-z_]{1,60}$' THEN notice.local_error
      WHEN message.status_current = 'failed' OR provider_status.status = 'failed' THEN 'send_failed'
      ELSE NULL
    END::text AS error_code,
    notice.channel_origin::text
  FROM notice_rows AS notice
  LEFT JOIN public.whatsapp_messages_v1 AS message
    ON message.whatsapp_account_id = notice.whatsapp_account_id
    AND message.provider = 'meta'
    AND message.provider_message_id = notice.external_message_id
  LEFT JOIN LATERAL (
    SELECT event.status, event.error_code
    FROM public.whatsapp_message_status_events_v1 AS event
    WHERE event.message_id = message.id
      AND event.provider = 'meta'
    ORDER BY
      CASE event.status
        WHEN 'read' THEN 6
        WHEN 'delivered' THEN 5
        WHEN 'failed' THEN 4
        WHEN 'cancelled' THEN 4
        WHEN 'sent' THEN 3
        WHEN 'accepted' THEN 2
        ELSE 1
      END DESC,
      event.occurred_at DESC,
      event.received_at DESC
    LIMIT 1
  ) AS provider_status ON true;
$function$;

REVOKE ALL ON FUNCTION public.site_order_whatsapp_notice_status_v1(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_order_whatsapp_notice_status_v1(uuid[]) TO service_role;
