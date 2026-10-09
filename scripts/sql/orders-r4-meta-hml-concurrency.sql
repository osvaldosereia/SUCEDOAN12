-- Synthetic-only concurrency test setup. All rows fictitious and ephemeral.
\set ON_ERROR_STOP on
-- Reopen the synthetic 0975 order to race TWO distinct verified button events.
DELETE FROM public.order_meta_confirmations_v1
 WHERE order_id='10000000-0000-4000-8000-000000000001';
UPDATE public.orders SET confirmed_at=NULL
 WHERE id='10000000-0000-4000-8000-000000000001';
INSERT INTO public.whatsapp_messages_v1(
  id,conversation_id,whatsapp_account_id,direction,message_type,provider,
  provider_message_id,sender_kind,received_at,metadata)
SELECT '40000000-0000-4000-8000-000000000007'::uuid,
  conversation_id,whatsapp_account_id,direction,message_type,provider,
  'wamid.SYNTHETIC_INBOUND_SECOND_0975',sender_kind,now(),metadata
FROM public.whatsapp_messages_v1
WHERE id='40000000-0000-4000-8000-000000000001';
SELECT 'PASS: prepared second independently identified callback' AS result;
